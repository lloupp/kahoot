import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StudentSession } from "./StudentSession";
import { getSocket } from "../api/socket";
import { loadParticipant } from "../lib/participantStorage";
import { createFakeSocket } from "../test/fakeSocket";

vi.mock("../api/socket", () => ({ getSocket: vi.fn() }));
vi.mock("../lib/participantStorage", () => ({
  loadParticipant: vi.fn(),
  participantStorageKey: (pin: string) => `quizarena_participant_${pin}`,
}));

function renderStudentSession(pin = "123456") {
  return render(
    <MemoryRouter initialEntries={[`/play/${pin}`]}>
      <Routes>
        <Route path="/play/:pin" element={<StudentSession />} />
        <Route path="/join" element={<div>join page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

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
const participant = { participantId: "p1", joinToken: "tok1", name: "Alice" };

describe("StudentSession page", () => {
  let socket: ReturnType<typeof createFakeSocket>;

  beforeEach(() => {
    socket = createFakeSocket();
    vi.mocked(getSocket).mockReturnValue(socket as any);
    vi.mocked(loadParticipant).mockReturnValue(participant);
  });

  it("redirects to /join when there is no stored participant", async () => {
    vi.mocked(loadParticipant).mockReturnValue(null);
    renderStudentSession();
    expect(await screen.findByText("join page")).toBeInTheDocument();
  });

  it("rejoins on mount and renders the lobby", async () => {
    socket.respondTo("student:rejoin", {
      ok: true,
      data: { phase: "lobby", quizTitle: "Geo Quiz", lobby: { pin: "123456", quizTitle: "Geo Quiz", players: [] }, question: null, reveal: null, leaderboard: null, podium: null, myResult: null, hasAnsweredCurrentQuestion: false },
    });
    renderStudentSession();
    expect(await screen.findByText(/Geo Quiz/)).toBeInTheDocument();
    expect(screen.getByText(/You're in, Alice/)).toBeInTheDocument();
    expect(socket.emit).toHaveBeenCalledWith(
      "student:rejoin",
      { pin: "123456", participantId: "p1", joinToken: "tok1" },
      expect.any(Function),
    );
  });

  it("shows the question and choice buttons when rejoining mid-question, unanswered", async () => {
    socket.respondTo("student:rejoin", {
      ok: true,
      data: { phase: "question", quizTitle: "Geo Quiz", lobby: { pin: "123456", quizTitle: "Geo Quiz", players: [] }, question: questionStart, reveal: null, leaderboard: null, podium: null, myResult: null, hasAnsweredCurrentQuestion: false },
    });
    renderStudentSession();
    expect(await screen.findByText("Capital of France?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Paris/ })).toBeInTheDocument();
  });

  it("shows 'answer locked in' (not the buttons) when rejoining mid-question, already answered — never re-exposes correctness", async () => {
    socket.respondTo("student:rejoin", {
      ok: true,
      data: {
        phase: "question",
        quizTitle: "Geo Quiz",
        lobby: { pin: "123456", quizTitle: "Geo Quiz", players: [] },
        question: questionStart,
        reveal: null,
        leaderboard: null,
        podium: null,
        myResult: null, // correctness must NOT be revealed while the question is still open
        hasAnsweredCurrentQuestion: true,
      },
    });
    renderStudentSession();
    expect(await screen.findByText(/answer locked in/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Paris/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument();
  });

  it("submits an answer without ever showing correctness from the immediate ack", async () => {
    socket.respondTo("student:rejoin", {
      ok: true,
      data: { phase: "question", quizTitle: "Geo Quiz", lobby: { pin: "123456", quizTitle: "Geo Quiz", players: [] }, question: questionStart, reveal: null, leaderboard: null, podium: null, myResult: null, hasAnsweredCurrentQuestion: false },
    });
    socket.respondTo("student:answer", { ok: true, data: { received: true } });
    const user = userEvent.setup();
    renderStudentSession();

    await user.click(await screen.findByRole("button", { name: /Paris/ }));
    expect(socket.emit).toHaveBeenCalledWith(
      "student:answer",
      { pin: "123456", participantId: "p1", questionId: "q1", choiceId: "c1" },
      expect.any(Function),
    );
    expect(await screen.findByText(/answer locked in/i)).toBeInTheDocument();
    // The ack contains no correctness info, so nothing correctness-related can appear yet.
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument();
  });

  it("reveals correctness only once the answer:result event actually arrives", async () => {
    socket.respondTo("student:rejoin", {
      ok: true,
      data: { phase: "question", quizTitle: "Geo Quiz", lobby: { pin: "123456", quizTitle: "Geo Quiz", players: [] }, question: questionStart, reveal: null, leaderboard: null, podium: null, myResult: null, hasAnsweredCurrentQuestion: false },
    });
    socket.respondTo("student:answer", { ok: true, data: { received: true } });
    const user = userEvent.setup();
    renderStudentSession();
    await user.click(await screen.findByRole("button", { name: /Paris/ }));
    await screen.findByText(/answer locked in/i);

    socket.trigger("question:reveal", { questionId: "q1", correctChoiceId: "c1", counts: { c1: 1, c2: 0 }, answeredCount: 1, totalPlayers: 1 });
    // Reveal broadcast alone (before the personal answer:result event) isn't
    // enough to claim correctness — the UI should be waiting, not guessing.
    expect(await screen.findByText(/waiting for the host to continue/i)).toBeInTheDocument();

    socket.trigger("answer:result", { answered: true, isCorrect: true, pointsAwarded: 950, totalScore: 950 });
    expect(await screen.findByText("Correct!")).toBeInTheDocument();
    expect(screen.getByText(/950 points/)).toBeInTheDocument();
  });

  it("shows the leaderboard and podium as they're pushed", async () => {
    socket.respondTo("student:rejoin", {
      ok: true,
      data: { phase: "lobby", quizTitle: "Geo Quiz", lobby: { pin: "123456", quizTitle: "Geo Quiz", players: [] }, question: null, reveal: null, leaderboard: null, podium: null, myResult: null, hasAnsweredCurrentQuestion: false },
    });
    renderStudentSession();
    await screen.findByText(/You're in/);

    socket.trigger("leaderboard:update", { questionIndex: 0, totalQuestions: 1, players: [{ id: "p1", name: "Alice", totalScore: 950, rank: 1 }] });
    expect(await screen.findByText("Leaderboard")).toBeInTheDocument();

    socket.trigger("game:over", { podium: [{ id: "p1", name: "Alice", totalScore: 950, rank: 1 }], ranking: [{ id: "p1", name: "Alice", totalScore: 950, rank: 1 }] });
    expect(await screen.findByText("Game over!")).toBeInTheDocument();
  });

  it("shows a banner when the host disconnects, and clears it on the next server event", async () => {
    socket.respondTo("student:rejoin", {
      ok: true,
      data: { phase: "lobby", quizTitle: "Geo Quiz", lobby: { pin: "123456", quizTitle: "Geo Quiz", players: [] }, question: null, reveal: null, leaderboard: null, podium: null, myResult: null, hasAnsweredCurrentQuestion: false },
    });
    renderStudentSession();
    await screen.findByText(/You're in/);

    socket.trigger("host:disconnected");
    expect(await screen.findByText(/host disconnected/i)).toBeInTheDocument();

    socket.trigger("lobby:update", { pin: "123456", quizTitle: "Geo Quiz", players: [{ id: "p1", name: "Alice", connected: true }] });
    await waitFor(() => expect(screen.queryByText(/host disconnected/i)).not.toBeInTheDocument());
  });
});
