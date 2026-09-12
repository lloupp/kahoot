// A deliberately generic blocklist — this is a basic first line of defense
// against the most obvious classroom-inappropriate names, not a
// comprehensive profanity filter (those require locale-aware lists and
// regular maintenance, which is out of scope here — it catches a real
// fraction of attempts, not all of them). A teacher still has no way to
// remove a name that slips through; see README's known limitations.
const BLOCKED_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "nigger",
  "faggot",
  "cunt",
  "retard",
  "whore",
  "slut",
  "pussy",
  "penis",
  "dickhead",
  "wanker",
  "twat",
  "bollocks",
  "hitler",
  "nazi",
  "siegheil",
  "rape",
  "pedo",
  "molest",
  "kys",
  "anus",
];

// Names that only ever exist to impersonate an authority figure in the
// room — blocked as an exact match (after normalizing), not a substring,
// so real names like "Hostetler" aren't caught by "host".
const RESERVED_NAMES = new Set(["admin", "administrator", "host", "teacher", "moderator", "system", "quizarena", "support"]);

/** Normalizes common evasion tricks — leetspeak substitutions, punctuation,
 * and repeated characters ("fuuuck", "shiiit") — applied identically to
 * both the input name and the blocklist itself, so a collapsed/substituted
 * blocked word (e.g. "bollocks" -> "bolocks") still matches. */
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
    .replace(/ph/g, "f")
    .replace(/v/g, "u")
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");
}

const NORMALIZED_BLOCKED_WORDS = BLOCKED_WORDS.map(normalize);

export function containsBlockedWord(name: string): boolean {
  const normalized = normalize(name);
  if (RESERVED_NAMES.has(normalized)) return true;
  return NORMALIZED_BLOCKED_WORDS.some((word) => normalized.includes(word));
}
