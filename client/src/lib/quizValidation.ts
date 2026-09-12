export interface ChoiceDraft {
  text: string;
  isCorrect: boolean;
}

export interface QuestionDraft {
  text: string;
  imageUrl: string;
  timeLimitSeconds: number;
  points: number;
  choices: ChoiceDraft[];
}

export const MIN_TIME_LIMIT_SECONDS = 2;
export const MAX_TIME_LIMIT_SECONDS = 120;

function isValidImageUrl(value: string): boolean {
  if (!value) return true; // optional field
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Mirrors the server's zod schema so a teacher sees a specific, actionable
 * message before submitting, rather than a generic "Validation failed". */
export function validateQuizDraft(title: string, questions: QuestionDraft[]): string | null {
  if (!title.trim()) return "Give your quiz a title.";
  if (questions.length === 0) return "Add at least one question.";
  for (const [i, q] of questions.entries()) {
    const label = `Question ${i + 1}`;
    if (!q.text.trim()) return `${label} needs text.`;
    if (q.choices.length < 2) return `${label} needs at least 2 choices.`;
    if (q.choices.length > 6) return `${label} can have at most 6 choices.`;
    if (q.choices.some((c) => !c.text.trim())) return `${label} has an empty choice.`;
    if (q.choices.filter((c) => c.isCorrect).length !== 1) return `${label} needs exactly one correct answer selected.`;
    if (q.timeLimitSeconds < MIN_TIME_LIMIT_SECONDS) {
      return `${label}'s time limit must be at least ${MIN_TIME_LIMIT_SECONDS} seconds.`;
    }
    if (q.timeLimitSeconds > MAX_TIME_LIMIT_SECONDS) {
      return `${label}'s time limit can be at most ${MAX_TIME_LIMIT_SECONDS} seconds.`;
    }
    if (q.points < 0) return `${label}'s points can't be negative.`;
    if (!isValidImageUrl(q.imageUrl)) {
      return `${label}'s image URL must be a valid http:// or https:// link.`;
    }
  }
  return null;
}
