import { describe, it, expect } from "vitest";
import { extractErrorMessage } from "./client";

describe("extractErrorMessage", () => {
  it("falls back to a generic message when the body is missing", () => {
    expect(extractErrorMessage(undefined)).toMatch(/something went wrong/i);
  });

  it("uses the server's plain error message when there are no validation details", () => {
    expect(extractErrorMessage({ error: "Invalid email or password" })).toBe("Invalid email or password");
  });

  it("prefers the first zod issue's field and message over the generic error", () => {
    const body = {
      error: "Validation failed",
      details: [{ message: "Must be at least 8 characters", path: ["password"] }],
    };
    expect(extractErrorMessage(body)).toBe("password: Must be at least 8 characters");
  });

  it("falls back to just the message when the issue path has no string segment", () => {
    const body = { error: "Validation failed", details: [{ message: "Expected array, received string", path: [] }] };
    expect(extractErrorMessage(body)).toBe("Expected array, received string");
  });

  it("joins a nested path with dots", () => {
    const body = {
      error: "Validation failed",
      details: [{ message: "Exactly one choice must be marked correct", path: ["questions", 0, "choices"] }],
    };
    expect(extractErrorMessage(body)).toBe("questions.choices: Exactly one choice must be marked correct");
  });
});
