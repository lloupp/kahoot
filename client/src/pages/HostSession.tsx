import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Ack, getSocket } from "../api/socket";
import {
  LeaderboardPayload,
  LobbyPayload,
  PodiumPayload,
  PublicQuestion,
  QuestionStartPayload,
  RevealPayload,
} from "../api/gameTypes";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { ErrorBanner, Spinner } from "../components/Feedback";
import { useCountdown } from "../hooks/useCountdown";

type Phase = "connecting" | "lobby" | "question" | "reveal" | "leaderboard" | "podium" | "error";

const CHOICE_COLORS = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-cyan-500"];

export function HostSession() {
  const { pin = "" } = useParams();
  const { token } = useAuth();

  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyPayload | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [questionMeta, setQuestionMeta] = useState<QuestionStartPayload | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload | null>(null);
  const [podium, setPodium] = useState<PodiumPayload | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const remainingMs = useCountdown(questionMeta?.endsAt ?? null);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket();

    async function joinAsHost() {
      const res = await new Promise<Ack<{ phase: Phase; lobby: LobbyPayload }>>((resolve) => {
        socket.emit("host:join", { pin, token }, resolve);
      });
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      setLobby(res.data.lobby);
      setPhase(res.data.phase === "lobby" ? "lobby" : res.data.phase);
    }

    function onLobbyUpdate(data: LobbyPayload) {
      setLobby(data);
    }

    function onQuestionStart(data: QuestionStartPayload) {
      setQuestionMeta(data);
      setQuestion(data.question);
      setReveal(null);
      setPhase("question");
    }

    function onReveal(data: RevealPayload) {
      setReveal(data);
      setPhase("reveal");
    }

    function onLeaderboard(data: LeaderboardPayload) {
      setLeaderboard(data);
      setPhase("leaderboard");
    }

    function onGameOver(data: PodiumPayload) {
      setPodium(data);
      setPhase("podium");
    }

    socket.on("connect", joinAsHost);
    socket.on("lobby:update", onLobbyUpdate);
    socket.on("question:start", onQuestionStart);
    socket.on("question:reveal", onReveal);
    socket.on("leaderboard:update", onLeaderboard);
    socket.on("game:over", onGameOver);

    if (socket.connected) joinAsHost();

    return () => {
      socket.off("connect", joinAsHost);
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("question:start", onQuestionStart);
      socket.off("question:reveal", onReveal);
      socket.off("leaderboard:update", onLeaderboard);
      socket.off("game:over", onGameOver);
    };
  }, [pin, token]);

  async function callHost<T = unknown>(event: string): Promise<Ack<T> | null> {
    if (!token) return null;
    setActionPending(true);
    setError(null);
    const res = await new Promise<Ack<T>>((resolve) => {
      getSocket().emit(event, { pin, token }, resolve);
    });
    setActionPending(false);
    if (!res.ok) setError(res.error);
    return res;
  }

  const hasMoreQuestions = leaderboard ? leaderboard.questionIndex + 1 < leaderboard.totalQuestions : true;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {phase === "connecting" && (
        <div className="flex justify-center py-16">
          <Spinner label="Starting your game..." />
        </div>
      )}

      {phase === "error" && <ErrorBanner message={error ?? "Something went wrong."} />}

      {phase === "lobby" && (
        <div className="flex flex-col items-center gap-6 text-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Game PIN</p>
            <p className="text-6xl font-extrabold tracking-widest text-brand-700">{pin}</p>
            <p className="mt-2 text-slate-500">Students go to the join page and enter this PIN.</p>
          </div>
          <Card className="w-full">
            <h2 className="mb-3 text-lg font-semibold">
              Players ({lobby?.players.length ?? 0})
            </h2>
            {!lobby || lobby.players.length === 0 ? (
              <p className="text-slate-400">Waiting for players to join...</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {lobby.players.map((p) => (
                  <li
                    key={p.id}
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      p.connected ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {p.name}
                    {!p.connected && " (disconnected)"}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Button
            size="lg"
            disabled={actionPending || !lobby || lobby.players.length === 0}
            onClick={() => callHost("host:start-question")}
          >
            Start game
          </Button>
        </div>
      )}

      {phase === "question" && question && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">
              Question {(questionMeta?.questionIndex ?? 0) + 1} / {questionMeta?.totalQuestions}
            </span>
            <span className={`text-lg font-bold tabular-nums ${remainingMs < 5000 ? "text-red-600" : "text-brand-700"}`}>
              {Math.ceil(remainingMs / 1000)}s
            </span>
          </div>
          <Card>
            <h1 className="text-2xl font-semibold text-slate-900">{question.text}</h1>
            {question.imageUrl && (
              <img src={question.imageUrl} alt="" className="mt-4 max-h-72 w-full rounded-lg object-contain" />
            )}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {question.choices.map((c, i) => (
                <div key={c.id} className={`rounded-xl px-4 py-3 font-medium text-white ${CHOICE_COLORS[i % CHOICE_COLORS.length]}`}>
                  {c.text}
                </div>
              ))}
            </div>
          </Card>
          <p className="text-center text-slate-500">Waiting for the timer to end, or for everyone to answer...</p>
        </div>
      )}

      {phase === "reveal" && question && reveal && (
        <Card className="flex flex-col gap-4">
          <h1 className="text-xl font-bold text-slate-900">Results</h1>
          <p className="text-slate-500">
            {reveal.answeredCount} of {reveal.totalPlayers} players answered
          </p>
          <div className="flex flex-col gap-2">
            {question.choices.map((c, i) => {
              const count = reveal.counts[c.id] ?? 0;
              const pct = reveal.totalPlayers > 0 ? Math.round((count / reveal.totalPlayers) * 100) : 0;
              const isCorrect = c.id === reveal.correctChoiceId;
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <span className={`w-40 truncate text-sm font-medium ${isCorrect ? "text-emerald-700" : "text-slate-600"}`}>
                    {isCorrect ? "✓ " : ""}
                    {c.text}
                  </span>
                  <div className="h-6 flex-1 rounded-full bg-slate-100">
                    <div
                      className={`h-6 rounded-full ${isCorrect ? "bg-emerald-500" : CHOICE_COLORS[i % CHOICE_COLORS.length]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm text-slate-500">{count}</span>
                </div>
              );
            })}
          </div>
          <Button size="lg" disabled={actionPending} onClick={() => callHost("host:show-leaderboard")} className="self-start">
            Show leaderboard
          </Button>
        </Card>
      )}

      {phase === "leaderboard" && leaderboard && (
        <Card className="flex flex-col gap-4">
          <h1 className="text-xl font-bold text-slate-900">Leaderboard</h1>
          <ol className="flex flex-col gap-2">
            {leaderboard.players.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="font-medium">
                  #{p.rank} {p.name}
                </span>
                <span>{p.totalScore} pts</span>
              </li>
            ))}
          </ol>
          <Button size="lg" disabled={actionPending} onClick={() => callHost<{ ended: boolean }>("host:next")} className="self-start">
            {hasMoreQuestions ? "Next question" : "End game & show podium"}
          </Button>
        </Card>
      )}

      {phase === "podium" && podium && (
        <Card className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Final results</h1>
          <div className="flex items-end gap-4">
            {podium.podium.map((p) => (
              <div key={p.id} className="flex flex-col items-center gap-1">
                <span className="text-3xl" aria-hidden="true">
                  {p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : "🥉"}
                </span>
                <span className="font-semibold">{p.name}</span>
                <span className="text-sm text-slate-500">{p.totalScore} pts</span>
              </div>
            ))}
          </div>
          <div className="w-full text-left">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Full ranking</h2>
            <ol className="flex flex-col gap-1">
              {podium.ranking.map((p) => (
                <li key={p.id} className="flex justify-between rounded px-2 py-1">
                  <span>
                    #{p.rank} {p.name}
                  </span>
                  <span>{p.totalScore} pts</span>
                </li>
              ))}
            </ol>
          </div>
          <Button onClick={() => (window.location.href = "/history")}>View history</Button>
        </Card>
      )}
    </div>
  );
}
