import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Login } from "./Login";
import { AuthProvider } from "../context/AuthContext";
import { api, ApiError } from "../api/client";

vi.mock("../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { api: { post: vi.fn() }, ApiError };
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Login page", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
  });

  it("renders email and password fields", () => {
    renderLogin();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("shows the server's error message on failed login", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(401, "Invalid email or password"));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "wrong@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });

  it("submits the entered credentials", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ token: "t", user: { id: "1", name: "Ada", email: "ada@example.com" } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret1");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/auth/login", { email: "ada@example.com", password: "supersecret1" }),
    );
  });

  it("disables the submit button while submitting", async () => {
    let resolvePost: (v: unknown) => void = () => {};
    vi.mocked(api.post).mockReturnValueOnce(new Promise((resolve) => (resolvePost = resolve)));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret1");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByRole("button", { name: /logging in/i })).toBeDisabled();
    resolvePost({ token: "t", user: { id: "1", name: "Ada", email: "ada@example.com" } });
  });
});
