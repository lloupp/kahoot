import { describe, it, expect } from "vitest";
import { calculateScore } from "../src/lib/scoring";

describe("calculateScore", () => {
  it("awards 0 for an incorrect answer regardless of speed", () => {
    expect(calculateScore({ basePoints: 1000, timeLimitMs: 20000, answerTimeMs: 0, isCorrect: false })).toBe(0);
    expect(calculateScore({ basePoints: 1000, timeLimitMs: 20000, answerTimeMs: 19999, isCorrect: false })).toBe(0);
  });

  it("awards full points for an instant correct answer", () => {
    expect(calculateScore({ basePoints: 1000, timeLimitMs: 20000, answerTimeMs: 0, isCorrect: true })).toBe(1000);
  });

  it("awards half points for a correct answer at the exact deadline", () => {
    expect(calculateScore({ basePoints: 1000, timeLimitMs: 20000, answerTimeMs: 20000, isCorrect: true })).toBe(500);
  });

  it("awards a proportional score in between", () => {
    // half the time elapsed -> 75% of base points
    expect(calculateScore({ basePoints: 1000, timeLimitMs: 20000, answerTimeMs: 10000, isCorrect: true })).toBe(750);
  });

  it("clamps answer time so it never scores below the floor even with bad input", () => {
    expect(calculateScore({ basePoints: 1000, timeLimitMs: 20000, answerTimeMs: 999999, isCorrect: true })).toBe(500);
    expect(calculateScore({ basePoints: 1000, timeLimitMs: 20000, answerTimeMs: -500, isCorrect: true })).toBe(1000);
  });

  it("is deterministic for identical inputs", () => {
    const params = { basePoints: 750, timeLimitMs: 15000, answerTimeMs: 4321, isCorrect: true };
    const first = calculateScore(params);
    const second = calculateScore(params);
    expect(first).toBe(second);
  });

  it("scales with basePoints", () => {
    expect(calculateScore({ basePoints: 2000, timeLimitMs: 20000, answerTimeMs: 0, isCorrect: true })).toBe(2000);
    expect(calculateScore({ basePoints: 0, timeLimitMs: 20000, answerTimeMs: 0, isCorrect: true })).toBe(0);
  });
});
