import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { api } from "../api/client";
import { QuizSummary } from "../api/types";

vi.mock("../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, ApiError };
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function quiz(overrides: Partial<QuizSummary> = {}): QuizSummary {
  return {
    id: "q1",
    title: "Geography",
    subject: "Trivia",
    description: null,
    questionCount: 3,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
    mockNavigate.mockReset();
  });

  it("shows a loading spinner, then the empty state when there are no quizzes", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([]);
    renderDashboard();
    expect(screen.getByText(/loading your quizzes/i)).toBeInTheDocument();
    expect(await screen.findByText(/no quizzes yet/i)).toBeInTheDocument();
  });

  it("renders a fetched quiz with its question count", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([quiz()]);
    renderDashboard();
    expect(await screen.findByText("Geography")).toBeInTheDocument();
    expect(screen.getByText("3 questions")).toBeInTheDocument();
  });

  it("shows an error banner when loading fails", async () => {
    const { ApiError } = await import("../api/client");
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(500, "Server unavailable"));
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent(/server unavailable/i);
  });

  it("starts a game and navigates to the host screen on success", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([quiz()]);
    vi.mocked(api.post).mockResolvedValueOnce({ pin: "123456" });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Start" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/host/123456"));
  });

  it("refuses to start a quiz with no questions without contacting the server", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([quiz({ questionCount: 0 })]);
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Start" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least one question/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("deletes a quiz after confirmation and removes it from the list", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([quiz()]);
    vi.mocked(api.delete).mockResolvedValueOnce(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Geography")).not.toBeInTheDocument());
    expect(api.delete).toHaveBeenCalledWith("/api/quizzes/q1");
  });

  it("does not delete when the confirmation is declined", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([quiz()]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText("Geography")).toBeInTheDocument();
  });
});
