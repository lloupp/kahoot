import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { QuizSummary } from "../api/types";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Spinner, ErrorBanner, EmptyState } from "../components/Feedback";

export function Dashboard() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<QuizSummary[]>("/api/quizzes");
      setQuizzes(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your quizzes.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this quiz? This cannot be undone.")) return;
    setBusyId(id);
    try {
      await api.delete(`/api/quizzes/${id}`);
      setQuizzes((prev) => prev?.filter((q) => q.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the quiz.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(id: string) {
    setBusyId(id);
    try {
      await api.post(`/api/quizzes/${id}/duplicate`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not duplicate the quiz.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleStart(quiz: QuizSummary) {
    if (quiz.questionCount === 0) {
      setError("Add at least one question before starting a game.");
      return;
    }
    setBusyId(quiz.id);
    try {
      const session = await api.post<{ pin: string }>("/api/sessions", { quizId: quiz.id });
      navigate(`/host/${session.pin}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the game.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">My quizzes</h1>
        <Link to="/quizzes/new" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          + New quiz
        </Link>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {quizzes === null && <Spinner label="Loading your quizzes..." />}

      {quizzes?.length === 0 && (
        <EmptyState
          title="No quizzes yet"
          description="Create your first quiz to start hosting live games."
          action={
            <Link to="/quizzes/new" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Create a quiz
            </Link>
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {quizzes?.map((quiz) => (
          <Card key={quiz.id} className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{quiz.title}</h2>
              {quiz.subject && <p className="text-sm text-brand-600">{quiz.subject}</p>}
              <p className="text-sm text-slate-500">
                {quiz.questionCount} question{quiz.questionCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="md" disabled={busyId === quiz.id} onClick={() => handleStart(quiz)}>
                Start
              </Button>
              <Link
                to={`/quizzes/${quiz.id}/edit`}
                className="inline-flex items-center rounded-xl border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
              >
                Edit
              </Link>
              <Button variant="secondary" size="md" disabled={busyId === quiz.id} onClick={() => handleDuplicate(quiz.id)}>
                Duplicate
              </Button>
              <Button variant="danger" size="md" disabled={busyId === quiz.id} onClick={() => handleDelete(quiz.id)}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
