import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { StudentJoin } from "./StudentJoin";
import { emitAsync } from "../api/socket";

vi.mock("../api/socket", () => ({
  emitAsync: vi.fn(),
}));

function renderJoin() {
  return render(
    <MemoryRouter>
      <StudentJoin />
    </MemoryRouter>,
  );
}

describe("StudentJoin page", () => {
  beforeEach(() => {
    vi.mocked(emitAsync).mockReset();
    sessionStorage.clear();
  });

  it("rejects a PIN that isn't exactly 6 digits before contacting the server", async () => {
    const user = userEvent.setup();
    renderJoin();

    await user.type(screen.getByLabelText("Game PIN"), "123");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/6-digit/i);
    expect(emitAsync).not.toHaveBeenCalled();
  });

  it("strips non-digit characters as the PIN is typed", async () => {
    const user = userEvent.setup();
    renderJoin();
    const pinField = screen.getByLabelText("Game PIN") as HTMLInputElement;
    await user.type(pinField, "12a3b4c5d6");
    expect(pinField.value).toBe("123456");
  });

  it("advances to the name step with a valid PIN, then joins", async () => {
    vi.mocked(emitAsync).mockResolvedValueOnce({
      ok: true,
      data: { participantId: "p1", joinToken: "tok1" },
    });
    const user = userEvent.setup();
    renderJoin();

    await user.type(screen.getByLabelText("Game PIN"), "123456");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Your name"), "Alice");
    await user.click(screen.getByRole("button", { name: /join game/i }));

    await waitFor(() =>
      expect(emitAsync).toHaveBeenCalledWith("student:join", { pin: "123456", name: "Alice" }),
    );
    expect(sessionStorage.getItem("quizarena_participant_123456")).toContain("p1");
  });

  it("shows a server error and returns to the PIN step when the PIN doesn't exist", async () => {
    vi.mocked(emitAsync).mockResolvedValueOnce({
      ok: false,
      error: "No active game found for this PIN",
      code: "PIN_NOT_FOUND",
    });
    const user = userEvent.setup();
    renderJoin();

    await user.type(screen.getByLabelText("Game PIN"), "999999");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Your name"), "Alice");
    await user.click(screen.getByRole("button", { name: /join game/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no active game/i);
    // Bounced back to the PIN step, not stuck on the name step.
    expect(screen.getByLabelText("Game PIN")).toBeInTheDocument();
  });

  it("shows a taken-name error without bouncing back to the PIN step", async () => {
    vi.mocked(emitAsync).mockResolvedValueOnce({
      ok: false,
      error: "That name is already taken in this game",
      code: "NAME_TAKEN",
    });
    const user = userEvent.setup();
    renderJoin();

    await user.type(screen.getByLabelText("Game PIN"), "123456");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Your name"), "Alice");
    await user.click(screen.getByRole("button", { name: /join game/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already taken/i);
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
  });
});
