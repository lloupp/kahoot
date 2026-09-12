import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Quiz } from "../api/types";
import { Card } from "../components/Card";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { ErrorBanner, Spinner } from "../components/Feedback";

interface ChoiceDraft {
  text: string;
  isCorrect: boolean;
}

interface QuestionDraft {
  text: string;
  imageUrl: string;
  timeLimitSeconds: number;
  points: number;
  choices: ChoiceDraft[];
}

function emptyQuestion(): QuestionDraft {
  return {
    text: "",
    imageUrl: "",
    timeLimitSeconds: 20,
    points: 1000,
    choices: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ],
  };
}

export function QuizEditor() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get<Quiz>(`/api/quizzes/${id}`)
      .then((quiz) => {
        setTitle(quiz.title);
        setSubject(quiz.subject ?? "");
        setDescription(quiz.description ?? "");
        setQuestions(
          quiz.questions.length
            ? quiz.questions.map((q) => ({
                text: q.text,
                imageUrl: q.imageUrl ?? "",
                timeLimitSeconds: Math.round(q.timeLimitMs / 1000),
                points: q.points,
                choices: q.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
              }))
            : [emptyQuestion()],
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this quiz."))
      .finally(() => setLoading(false));
  }, [id]);

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateChoice(qIndex: number, cIndex: number, patch: Partial<ChoiceDraft>) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        return { ...q, choices: q.choices.map((c, j) => (j === cIndex ? { ...c, ...patch } : c)) };
      }),
    );
  }

  function setCorrectChoice(qIndex: number, cIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        return { ...q, choices: q.choices.map((c, j) => ({ ...c, isCorrect: j === cIndex })) };
      }),
    );
  }

  function addChoice(qIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || q.choices.length >= 6) return q;
        return { ...q, choices: [...q.choices, { text: "", isCorrect: false }] };
      }),
    );
  }

  function removeChoice(qIndex: number, cIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || q.choices.length <= 2) return q;
        const choices = q.choices.filter((_, j) => j !== cIndex);
        if (!choices.some((c) => c.isCorrect)) choices[0].isCorrect = true;
        return { ...q, choices };
      }),
    );
  }

  function validate(): string | null {
    if (!title.trim()) return "Give your quiz a title.";
    if (questions.length === 0) return "Add at least one question.";
    for (const [i, q] of questions.entries()) {
      if (!q.text.trim()) return `Question ${i + 1} needs text.`;
      if (q.choices.length < 2) return `Question ${i + 1} needs at least 2 choices.`;
      if (q.choices.some((c) => !c.text.trim())) return `Question ${i + 1} has an empty choice.`;
      if (!q.choices.some((c) => c.isCorrect)) return `Question ${i + 1} needs a correct answer selected.`;
      if (q.timeLimitSeconds < 2) return `Question ${i + 1}'s time limit must be at least 2 seconds.`;
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);
    const payload = {
      title,
      subject: subject || undefined,
      description: description || undefined,
      questions: questions.map((q) => ({
        text: q.text,
        imageUrl: q.imageUrl || undefined,
        timeLimitMs: q.timeLimitSeconds * 1000,
        points: q.points,
        choices: q.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
      })),
    };
    try {
      if (isEditing) {
        await api.put(`/api/quizzes/${id}`, payload);
      } else {
        await api.post("/api/quizzes", payload);
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the quiz.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading quiz..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{isEditing ? "Edit quiz" : "New quiz"}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && <ErrorBanner message={error} />}

        <Card className="flex flex-col gap-4">
          <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Subject / topic" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Geography" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="quiz-description" className="text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="quiz-description"
              className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-2 outline-offset-1 outline-brand-500 focus-visible:outline"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </Card>

        {questions.map((q, qIndex) => (
          <Card key={qIndex} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Question {qIndex + 1}</h2>
              {questions.length > 1 && (
                <Button type="button" variant="ghost" size="md" onClick={() => removeQuestion(qIndex)}>
                  Remove
                </Button>
              )}
            </div>

            <TextField
              label="Question text"
              required
              value={q.text}
              onChange={(e) => updateQuestion(qIndex, { text: e.target.value })}
            />
            <TextField
              label="Image URL (optional)"
              type="url"
              placeholder="https://..."
              value={q.imageUrl}
              onChange={(e) => updateQuestion(qIndex, { imageUrl: e.target.value })}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Time limit (seconds)"
                type="number"
                min={2}
                max={120}
                value={q.timeLimitSeconds}
                onChange={(e) => updateQuestion(qIndex, { timeLimitSeconds: Number(e.target.value) })}
              />
              <TextField
                label="Points"
                type="number"
                min={0}
                max={10000}
                step={50}
                value={q.points}
                onChange={(e) => updateQuestion(qIndex, { points: Number(e.target.value) })}
              />
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-slate-700">
                Choices <span className="font-normal text-slate-400">(select the correct one)</span>
              </legend>
              {q.choices.map((choice, cIndex) => (
                <div key={cIndex} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${qIndex}`}
                    checked={choice.isCorrect}
                    onChange={() => setCorrectChoice(qIndex, cIndex)}
                    aria-label={`Choice ${cIndex + 1} is correct`}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <input
                    type="text"
                    required
                    value={choice.text}
                    placeholder={`Choice ${cIndex + 1}`}
                    onChange={(e) => updateChoice(qIndex, cIndex, { text: e.target.value })}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base outline-2 outline-offset-1 outline-brand-500 focus-visible:outline"
                  />
                  {q.choices.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeChoice(qIndex, cIndex)}
                      aria-label={`Remove choice ${cIndex + 1}`}
                      className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {q.choices.length < 6 && (
                <Button type="button" variant="secondary" size="md" onClick={() => addChoice(qIndex)} className="mt-1 self-start">
                  + Add choice
                </Button>
              )}
            </fieldset>
          </Card>
        ))}

        <Button type="button" variant="secondary" onClick={addQuestion} className="self-start">
          + Add question
        </Button>

        <div className="flex gap-3">
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? "Saving..." : "Save quiz"}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => navigate("/dashboard")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
