import { describe, it, expect } from "vitest";
import { validateQuizDraft, QuestionDraft } from "./quizValidation";

function makeQuestion(overrides: Partial<QuestionDraft> = {}): QuestionDraft {
  return {
    text: "What is 2+2?",
    imageUrl: "",
    timeLimitSeconds: 20,
    points: 1000,
    choices: [
      { text: "4", isCorrect: true },
      { text: "5", isCorrect: false },
    ],
    ...overrides,
  };
}

describe("validateQuizDraft", () => {
  it("accepts a well-formed quiz", () => {
    expect(validateQuizDraft("Math Quiz", [makeQuestion()])).toBeNull();
  });

  it("requires a title", () => {
    expect(validateQuizDraft("", [makeQuestion()])).toMatch(/title/i);
    expect(validateQuizDraft("   ", [makeQuestion()])).toMatch(/title/i);
  });

  it("requires at least one question", () => {
    expect(validateQuizDraft("Quiz", [])).toMatch(/question/i);
  });

  it("requires question text", () => {
    expect(validateQuizDraft("Quiz", [makeQuestion({ text: "  " })])).toMatch(/needs text/i);
  });

  it("requires at least 2 choices", () => {
    expect(validateQuizDraft("Quiz", [makeQuestion({ choices: [{ text: "Only one", isCorrect: true }] })])).toMatch(
      /at least 2 choices/i,
    );
  });

  it("rejects more than 6 choices", () => {
    const choices = Array.from({ length: 7 }, (_, i) => ({ text: `Choice ${i}`, isCorrect: i === 0 }));
    expect(validateQuizDraft("Quiz", [makeQuestion({ choices })])).toMatch(/at most 6 choices/i);
  });

  it("rejects an empty choice", () => {
    expect(
      validateQuizDraft("Quiz", [
        makeQuestion({ choices: [{ text: "4", isCorrect: true }, { text: "  ", isCorrect: false }] }),
      ]),
    ).toMatch(/empty choice/i);
  });

  it("requires exactly one correct choice (rejects zero)", () => {
    expect(
      validateQuizDraft("Quiz", [
        makeQuestion({ choices: [{ text: "4", isCorrect: false }, { text: "5", isCorrect: false }] }),
      ]),
    ).toMatch(/exactly one correct/i);
  });

  it("requires exactly one correct choice (rejects more than one)", () => {
    expect(
      validateQuizDraft("Quiz", [
        makeQuestion({ choices: [{ text: "4", isCorrect: true }, { text: "5", isCorrect: true }] }),
      ]),
    ).toMatch(/exactly one correct/i);
  });

  it("enforces the minimum time limit", () => {
    expect(validateQuizDraft("Quiz", [makeQuestion({ timeLimitSeconds: 1 })])).toMatch(/at least 2 seconds/i);
  });

  it("enforces the maximum time limit", () => {
    expect(validateQuizDraft("Quiz", [makeQuestion({ timeLimitSeconds: 121 })])).toMatch(/at most 120 seconds/i);
  });

  it("rejects negative points", () => {
    expect(validateQuizDraft("Quiz", [makeQuestion({ points: -1 })])).toMatch(/points/i);
  });

  it("accepts an empty image URL (optional field)", () => {
    expect(validateQuizDraft("Quiz", [makeQuestion({ imageUrl: "" })])).toBeNull();
  });

  it("accepts a valid http(s) image URL", () => {
    expect(validateQuizDraft("Quiz", [makeQuestion({ imageUrl: "https://example.com/cat.png" })])).toBeNull();
  });

  it("rejects a malformed image URL", () => {
    expect(validateQuizDraft("Quiz", [makeQuestion({ imageUrl: "not a url" })])).toMatch(/valid http/i);
  });

  it("rejects a non-http(s) image URL scheme", () => {
    expect(validateQuizDraft("Quiz", [makeQuestion({ imageUrl: "javascript:alert(1)" })])).toMatch(/valid http/i);
    expect(validateQuizDraft("Quiz", [makeQuestion({ imageUrl: "data:image/png;base64,abc" })])).toMatch(/valid http/i);
  });

  it("reports the first failing question by number", () => {
    const result = validateQuizDraft("Quiz", [makeQuestion(), makeQuestion({ text: "" })]);
    expect(result).toMatch(/^Question 2/);
  });
});
