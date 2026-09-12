// A deliberately small, generic blocklist — this is a basic first line of
// defense against the most obvious classroom-inappropriate names, not a
// comprehensive profanity filter (those require locale-aware lists and
// regular maintenance, which is out of scope here). A teacher still has no
// way to remove a name that slips through; see README's known limitations.
const BLOCKED_SUBSTRINGS = ["fuck", "shit", "bitch", "asshole", "nigger", "faggot", "cunt", "retard"];

/** Normalizes common evasion tricks (leetspeak substitutions, punctuation,
 * repeated characters) before matching against the blocklist. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[^a-z]/g, "");
}

export function containsBlockedWord(name: string): boolean {
  const normalized = normalize(name);
  return BLOCKED_SUBSTRINGS.some((word) => normalized.includes(word));
}
