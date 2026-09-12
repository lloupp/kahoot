import { describe, it, expect } from "vitest";
import { containsBlockedWord } from "../src/lib/nameFilter";

describe("containsBlockedWord", () => {
  it("allows ordinary names", () => {
    expect(containsBlockedWord("Alice")).toBe(false);
    expect(containsBlockedWord("Bob the Builder")).toBe(false);
    expect(containsBlockedWord("Mr. Smith")).toBe(false);
  });

  it("catches a blocked word as a whole name", () => {
    expect(containsBlockedWord("fuck")).toBe(true);
  });

  it("catches a blocked word embedded in a longer name", () => {
    expect(containsBlockedWord("xXfuckyouXx")).toBe(true);
  });

  it("catches basic leetspeak substitutions", () => {
    expect(containsBlockedWord("$h1t")).toBe(true);
    expect(containsBlockedWord("a55hole")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(containsBlockedWord("FUCK")).toBe(true);
    expect(containsBlockedWord("FuCk")).toBe(true);
  });

  it("has the known substring-matching false-positive tradeoff (the 'Scunthorpe problem')", () => {
    // A pure substring blocklist inevitably flags innocent names/words that
    // happen to contain a blocked word, e.g. the town of Scunthorpe. This is
    // a known, accepted limitation of this basic filter, not a bug — a
    // teacher can't override it, which is documented in the README.
    expect(containsBlockedWord("Scunthorpe")).toBe(true);
  });
});
