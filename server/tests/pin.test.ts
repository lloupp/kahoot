import { describe, it, expect } from "vitest";
import { generatePin } from "../src/lib/pin";

describe("generatePin", () => {
  it("generates a 6-digit numeric string", () => {
    const pin = generatePin(() => false);
    expect(pin).toMatch(/^\d{6}$/);
  });

  it("avoids PINs reported as taken", () => {
    const taken = new Set(["100000", "100001"]);
    const pin = generatePin((candidate) => taken.has(candidate));
    expect(taken.has(pin)).toBe(false);
  });

  it("throws if it cannot find a free PIN within the attempt budget", () => {
    expect(() => generatePin(() => true, 5)).toThrow();
  });
});
