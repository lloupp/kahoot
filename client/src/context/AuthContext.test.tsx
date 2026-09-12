import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: { post: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

function Probe() {
  const { user, token, loading, login, register, logout } = useAuth();
  return (
    <div>
      <p data-testid="loading">{String(loading)}</p>
      <p data-testid="user">{user ? user.name : "none"}</p>
      <p data-testid="token">{token ?? "none"}</p>
      <button onClick={() => login("a@b.com", "supersecret1").catch(() => {})}>login</button>
      <button onClick={() => register("Ada", "a@b.com", "supersecret1")}>register</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    localStorage.clear();
  });

  it("starts logged out with loading resolved to false", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("restores a session from localStorage on mount", async () => {
    localStorage.setItem("quizarena_token", "stored-token");
    localStorage.setItem("quizarena_user", JSON.stringify({ id: "1", name: "Restored", email: "r@x.com" }));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("Restored"));
    expect(screen.getByTestId("token")).toHaveTextContent("stored-token");
  });

  it("logs in, persists to localStorage, and updates state", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      token: "tok-123",
      user: { id: "1", name: "Ada", email: "a@b.com" },
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByText("login"));

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("Ada"));
    expect(screen.getByTestId("token")).toHaveTextContent("tok-123");
    expect(localStorage.getItem("quizarena_token")).toBe("tok-123");
    expect(api.post).toHaveBeenCalledWith("/api/auth/login", { email: "a@b.com", password: "supersecret1" });
  });

  it("registers a new account the same way login does", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      token: "tok-456",
      user: { id: "2", name: "Ada", email: "a@b.com" },
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByText("register"));

    await waitFor(() => expect(screen.getByTestId("token")).toHaveTextContent("tok-456"));
    expect(api.post).toHaveBeenCalledWith("/api/auth/register", {
      name: "Ada",
      email: "a@b.com",
      password: "supersecret1",
    });
  });

  it("propagates a failed login without changing state", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("Invalid email or password"));

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByText("login"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(localStorage.getItem("quizarena_token")).toBeNull();
  });

  it("logs out and clears localStorage", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      token: "tok-789",
      user: { id: "3", name: "Ada", email: "a@b.com" },
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("Ada"));

    await user.click(screen.getByText("logout"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.getByTestId("token")).toHaveTextContent("none");
    expect(localStorage.getItem("quizarena_token")).toBeNull();
    expect(localStorage.getItem("quizarena_user")).toBeNull();
  });
});
