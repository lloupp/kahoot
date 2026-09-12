import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HostSession } from "./HostSession";
import { getSocket } from "../api/socket";
import { createFakeSocket } from "../test/fakeSocket";

vi.mock("../api/socket", () => ({ getSocket: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "host-token" }) }));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderHostSession(pin = "123456") {
  return render(
    <MemoryRouter initialEntries={[`/host/${pin}`]}>
      <Routes>
        <Route path="/host/:pin" element={<HostSession />} />
      </Routes>
    </MemoryRouter>,
  );
}

const lobbyPayload = { pin: "123456", quizTitle: "Geo Quiz", players: [{ id: "p1", name: "Alice", connected: true }] };
const question = {
  id: "q1",
  text: "Capital of France?",
  imageUrl: null,
  timeLimitMs: 20000,
  choices: [
    { id: "c1", text: "Paris" },
    { id: "c2", text: "Berlin" },
  ],
};
const questionStart = { questionIndex: 0, totalQuestions: 2, question, startedAt: Date.now(), endsAt: Date.now() + 20000 };

describe("HostSession page", () => {
  let socket: ReturnType<typeof createFakeSocket>;

  beforeEach(() => {
    socket = createFakeSocket();
    vi.mocked(getSocket).mockReturnValue(socket as any);
    mockNavigate.mockReset();
  });

  it("joins as host on mount and renders the lobby with the PIN and players", async () => {
    socket.respondTo("host:join", {
      ok: true,
      data: { phase: "lobby", quizTitle: "Geo Quiz", lobby: lobbyPayload, question: null, reveal: null, leaderboard: null, podium: null },
    });
    renderHostSession("123456");

    expect(await screen.findByText("123456")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(socket.emit).toHaveBeenCalledWith("host:join", { pin: "123456", token: "host-token" }, expect.any(Function));
  });

  it("shows an error screen when the join is rejected (e.g. not this session's host)", async () => {
    socket.respondTo("host:join", { ok: false, error: "You are not the host of this session", code: "FORBIDDEN" });
    renderHostSession();
    expect(await screen.findByRole("alert")).toHaveTextContent(/not the host/i);
  });

  it("resumes directly into the question screen on a reload mid-question (the host-reload-deadlock regression)", async () => {
    // This is the exact bug from an earlier round: host:join used to return
    // only {phase, lobby}, so a reloaded host had no question to render and
    // the game was stuck. The ack must carry the full snapshot.
    socket.respondTo("host:join", {
      ok: true,
      data: { phase: "question", quizTitle: "Geo Quiz", lobby: lobbyPayload, question: questionStart, reveal: null, leaderboard: null, podium: null },
    });
    renderHostSession();

    expect(await screen.findByText("Capital of France?")).toBeInTheDocument();
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip to results/i })).toBeInTheDocument();
  });

  it("resumes directly into the leaderboard screen on a reload mid-leaderboard", async () => {
    const leaderboard = { questionIndex: 0, totalQuestions: 2, players: [{ id: "p1", name: "Alice", totalScore: 900, rank: 1 }] };
    socket.respondTo("host:join", {
      ok: true,
      data: { phase: "leaderboard", quizTitle: "Geo Quiz", lobby: lobbyPayload, question: null, reveal: null, leaderboard, podium: null },
    });
    renderHostSession();

    expect(await screen.findByText("Leaderboard")).toBeInTheDocument();
    expect(screen.getByText(/#1 Alice/)).toBeInTheDocument();
  });

  it("disables Start game until at least one connected player has joined", async () => {
    socket.respondTo("host:join", {
      ok: true,
      data: { phase: "lobby", quizTitle: "Geo Quiz", lobby: { ...lobbyPayload, players: [] }, question: null, reveal: null, leaderboard: null, podium: null },
    });
    renderHostSession();
    await screen.findByText("123456");
    expect(screen.getByRole("button", { name: /start game/i })).toBeDisabled();
  });

  it("keeps Start game disabled when every lobby player has disconnected", async () => {
    socket.respondTo("host:join", {
      ok: true,
      data: {
        phase: "lobby",
        quizTitle: "Geo Quiz",
        lobby: { ...lobbyPayload, players: [{ id: "p1", name: "Alice", connected: false }] },
        question: null,
        reveal: null,
        leaderboard: null,
        podium: null,
      },
    });
    renderHostSession();
    await screen.findByText("123456");
    expect(screen.getByRole("button", { name: /start game/i })).toBeDisabled();
  });

  it("starts the game and reacts to a question:start push from the server", async () => {
    socket.respondTo("host:join", {
      ok: true,
      data: { phase: "lobby", quizTitle: "Geo Quiz", lobby: lobbyPayload, question: null, reveal: null, leaderboard: null, podium: null },
    });
    socket.respondTo("host:start-question", { ok: true });
    const user = userEvent.setup();
    renderHostSession();

    await user.click(await screen.findByRole("button", { name: /start game/i }));
    expect(socket.emit).toHaveBeenCalledWith("host:start-question", { pin: "123456", token: "host-token" }, expect.any(Function));

    socket.trigger("question:start", questionStart);
    expect(await screen.findByText("Capital of France?")).toBeInTheDocument();
  });

  it("shows the reveal breakdown, marking the correct choice, without exposing it before then", async () => {
    socket.respondTo("host:join", {
      ok: true,
      data: { phase: "question", quizTitle: "Geo Quiz", lobby: lobbyPayload, question: questionStart, reveal: null, leaderboard: null, podium: null },
    });
    renderHostSession();
    await screen.findByText("Capital of France?");
    // Before reveal: choices are shown, but nothing marks a correct answer.
    expect(screen.queryByText("✓ Paris")).not.toBeInTheDocument();

    socket.trigger("question:reveal", {
      questionId: "q1",
      correctChoiceId: "c1",
      counts: { c1: 3, c2: 1 },
      answeredCount: 4,
      totalPlayers: 4,
    });

    expect(await screen.findByText("Results")).toBeInTheDocument();
    expect(screen.getByText("✓ Paris")).toBeInTheDocument();
    expect(screen.getByText("4 of 4 players answered")).toBeInTheDocument();
  });

  it("advances to the podium and to history on request", async () => {
    socket.respondTo("host:join", {
      ok: true,
      data: { phase: "podium", quizTitle: "Geo Quiz", lobby: lobbyPayload, question: null, reveal: null, leaderboard: null, podium: { podium: [{ id: "p1", name: "Alice", totalScore: 900, rank: 1 }], ranking: [{ id: "p1", name: "Alice", totalScore: 900, rank: 1 }] } },
    });
    const user = userEvent.setup();
    renderHostSession();

    expect(await screen.findByText("Final results")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /view history/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/history");
  });
});
