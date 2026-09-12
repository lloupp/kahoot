import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { SessionHistoryItem } from "../api/types";
import { Card } from "../components/Card";
import { Spinner, ErrorBanner, EmptyState } from "../components/Feedback";

export function History() {
  const [sessions, setSessions] = useState<SessionHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SessionHistoryItem[]>("/api/sessions/history")
      .then(setSessions)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load history."));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Game history</h1>
      {error && <ErrorBanner message={error} />}
      {sessions === null && !error && <Spinner label="Loading history..." />}
      {sessions?.length === 0 && (
        <EmptyState title="No games played yet" description="Start a quiz to see its results here afterwards." />
      )}
      <div className="flex flex-col gap-3">
        {sessions?.map((s) => (
          <Link key={s.id} to={`/history/${s.id}`}>
            <Card className="flex items-center justify-between transition hover:ring-brand-300">
              <div>
                <p className="font-semibold text-slate-900">{s.quizTitle}</p>
                <p className="text-sm text-slate-500">
                  {new Date(s.startedAt).toLocaleString()} · PIN {s.pin}
                </p>
              </div>
              <div className="text-right text-sm text-slate-500">
                <p>{s.playerCount} players</p>
                <p>Top score: {s.topScore}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
