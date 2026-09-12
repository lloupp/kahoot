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

  it("catches repeated-letter evasion by collapsing runs before matching", () => {
    expect(containsBlockedWord("fuuuck")).toBe(true);
    expect(containsBlockedWord("shiiiit")).toBe(true);
  });

  it("catches ph->f and v->u substitution evasion", () => {
    expect(containsBlockedWord("phuck")).toBe(true);
    expect(containsBlockedWord("fvck")).toBe(true);
  });

  it("catches slurs and harassment terms beyond the original small list", () => {
    for (const name of ["Hitler", "Nazi", "sieg heil", "rape", "kys", "whore", "slut", "wanker"]) {
      expect(containsBlockedWord(name)).toBe(true);
    }
  });

  it("blocks bare impersonation of an authority figure, exact match only", () => {
    expect(containsBlockedWord("admin")).toBe(true);
    expect(containsBlockedWord("ADMIN")).toBe(true);
    expect(containsBlockedWord("host")).toBe(true);
    expect(containsBlockedWord("teacher")).toBe(true);
    // Known gap, accepted rather than hidden: decorated impersonation
    // attempts pass, since blocking "teacher" as a substring would also
    // catch real names/words containing it (kept exact-match only).
    expect(containsBlockedWord("Mr Teacher")).toBe(false);
  });
});
