import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { SessionReport as SessionReportType } from "../api/types";
import { Card } from "../components/Card";
import { Spinner, ErrorBanner } from "../components/Feedback";

export function SessionReport() {
  const { id } = useParams();
  const [report, setReport] = useState<SessionReportType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<SessionReportType>(`/api/sessions/history/${id}`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this report."));
  }, [id]);

  if (error) return <ErrorBanner message={error} />;
  if (!report)
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading report..." />
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">{report.quizTitle}</h1>
      <p className="mb-6 text-sm text-slate-500">
        Played {new Date(report.startedAt).toLocaleString()} · PIN {report.pin}
      </p>

      {(report.questionBreakdown.length > 0 || report.unscoredQuestionCount > 0) && (
        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Question breakdown</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {report.questionBreakdown.map((q) => {
              // Out of every player who was in the game, not just those who
              // answered — a question everyone timed out on except one lucky
              // guess should read as the class struggling, not "100%".
              const pct = q.totalPlayers > 0 ? Math.round((q.correctCount / q.totalPlayers) * 100) : 0;
              return (
                <li key={q.questionOrder} className="flex items-center gap-3">
                  <span className="flex-1 text-slate-700">
                    {q.questionOrder + 1}. {q.questionText}
                  </span>
                  <div className="h-4 w-32 rounded-full bg-slate-100" aria-hidden="true">
                    <div
                      className={`h-4 rounded-full ${pct >= 50 ? "bg-emerald-500" : "bg-red-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-36 text-right text-slate-500">
                    {q.correctCount}/{q.totalPlayers} correct ({pct}%)
                  </span>
                </li>
              );
            })}
          </ul>
          {report.unscoredQuestionCount > 0 && (
            <p className="mt-3 text-xs text-slate-400">
              {report.unscoredQuestionCount} question{report.unscoredQuestionCount === 1 ? "" : "s"} skipped or never
              reached, and had no recorded answers — not shown above.
            </p>
          )}
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {report.participants.map((p) => (
          <Card key={p.id}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                #{p.rank} {p.name}
              </h2>
              <span className="font-semibold text-brand-700">{p.totalScore} pts</span>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {p.answers.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-t border-slate-100 py-1">
                  <span className="flex-1 text-slate-600">{a.questionText}</span>
                  <span className={a.isCorrect ? "text-emerald-600" : "text-red-500"}>
                    {a.choiceText ?? "No answer"} {a.isCorrect ? "✓" : "✗"}
                  </span>
                  <span className="ml-3 w-16 text-right text-slate-400">+{a.pointsAwarded}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
