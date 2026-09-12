import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { getSocket, Ack } from "../api/socket";
import {
  AnswerAck,
  LeaderboardPayload,
  LobbyPayload,
  PodiumPayload,
  PublicQuestion,
  QuestionStartPayload,
  RevealPayload,
} from "../api/gameTypes";
import { loadParticipant } from "../lib/participantStorage";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { ErrorBanner, Spinner } from "../components/Feedback";
import { useCountdown } from "../hooks/useCountdown";

type Phase = "connecting" | "lobby" | "question" | "reveal" | "leaderboard" | "podium" | "error";

const CHOICE_STYLES = [
  "bg-rose-500 hover:bg-rose-600 focus-visible:outline-rose-700",
  "bg-sky-500 hover:bg-sky-600 focus-visible:outline-sky-700",
  "bg-amber-500 hover:bg-amber-600 focus-visible:outline-amber-700",
  "bg-emerald-500 hover:bg-emerald-600 focus-visible:outline-emerald-700",
  "bg-violet-500 hover:bg-violet-600 focus-visible:outline-violet-700",
  "bg-cyan-500 hover:bg-cyan-600 focus-visible:outline-cyan-700",
];
const CHOICE_SHAPES = ["▲", "◆", "●", "■", "★", "⬡"];

export function StudentSession() {
  const { pin = "" } = useParams();
  const stored = loadParticipant(pin);

  const [phase, setPhase] = useState<Phase>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState("");
  const [lobby, setLobby] = useState<LobbyPayload | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [questionMeta, setQuestionMeta] = useState<QuestionStartPayload | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [myAnswer, setMyAnswer] = useState<AnswerAck | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload | null>(null);
  const [podium, setPodium] = useState<PodiumPayload | null>(null);
  const [hostAway, setHostAway] = useState(false);

  const remainingMs = useCountdown(questionMeta?.endsAt ?? null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!stored) return;
    const participant = stored;
    const socket = getSocket();

    async function rejoin() {
      setHostAway(false);
      const res = await emitRejoin();
      if (!res.ok) {
        setErrorMessage(res.error);
        setPhase("error");
        return;
      }
      setQuizTitle(res.data.quizTitle ?? "");
      if (res.data.podium) {
        setPodium(res.data.podium);
        setPhase("podium");
      } else if (res.data.leaderboard) {
        setLeaderboard(res.data.leaderboard);
        setPhase("leaderboard");
      } else if (res.data.question) {
        applyQuestionStart(res.data.question);
      } else {
        setPhase("lobby");
      }
    }

    function emitRejoin(): Promise<Ack<{
      phase: string;
      quizTitle: string;
      question: QuestionStartPayload | null;
      leaderboard: LeaderboardPayload | null;
      podium: PodiumPayload | null;
    }>> {
      return new Promise((resolve) => {
        socket.emit(
          "student:rejoin",
          { pin, participantId: participant.participantId, joinToken: participant.joinToken },
          resolve,
        );
      });
    }

    function applyQuestionStart(data: QuestionStartPayload) {
      setQuestionMeta(data);
      setQuestion(data.question);
      setSelectedChoiceId(null);
      setMyAnswer(null);
      setReveal(null);
      submittingRef.current = false;
      setPhase("question");
    }

    function onLobbyUpdate(data: LobbyPayload) {
      setHostAway(false);
      setLobby(data);
      setPhase((p) => (p === "connecting" ? "lobby" : p));
    }

    function onQuestionStart(data: QuestionStartPayload) {
      setHostAway(false);
      applyQuestionStart(data);
    }

    function onReveal(data: RevealPayload) {
      setHostAway(false);
      setReveal(data);
      setPhase("reveal");
    }

    function onLeaderboard(data: LeaderboardPayload) {
      setHostAway(false);
      setLeaderboard(data);
      setPhase("leaderboard");
    }

    function onGameOver(data: PodiumPayload) {
      setHostAway(false);
      setPodium(data);
      setPhase("podium");
    }

    function onHostDisconnected() {
      setHostAway(true);
    }

    socket.on("connect", rejoin);
    socket.on("lobby:update", onLobbyUpdate);
    socket.on("question:start", onQuestionStart);
    socket.on("question:reveal", onReveal);
    socket.on("leaderboard:update", onLeaderboard);
    socket.on("game:over", onGameOver);
    socket.on("host:disconnected", onHostDisconnected);

    if (socket.connected) rejoin();

    return () => {
      socket.off("connect", rejoin);
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("question:start", onQuestionStart);
      socket.off("question:reveal", onReveal);
      socket.off("leaderboard:update", onLeaderboard);
      socket.off("game:over", onGameOver);
      socket.off("host:disconnected", onHostDisconnected);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (!stored) {
    return <Navigate to={`/join?pin=${pin}`} replace />;
  }

  async function submitAnswer(choiceId: string) {
    if (!question || submittingRef.current || remainingMs <= 0) return;
    submittingRef.current = true;
    setSelectedChoiceId(choiceId);
    const socket = getSocket();
    const res = await new Promise<Ack<AnswerAck>>((resolve) => {
      socket.emit(
        "student:answer",
        { pin, participantId: stored!.participantId, questionId: question.id, choiceId },
        resolve,
      );
    });
    if (res.ok) {
      setMyAnswer(res.data);
    } else {
      setErrorMessage(res.error);
      setSelectedChoiceId(null);
      submittingRef.current = false;
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {hostAway && (
        <div className="mb-4">
          <ErrorBanner message="The host disconnected. Hang tight, the game will resume when they're back." />
        </div>
      )}
      {errorMessage && phase !== "error" && (
        <div className="mb-4">
          <ErrorBanner message={errorMessage} />
        </div>
      )}

      {phase === "connecting" && (
        <div className="flex justify-center py-16">
          <Spinner label="Connecting..." />
        </div>
      )}

      {phase === "error" && <ErrorBanner message={errorMessage ?? "Something went wrong."} />}

      {phase === "lobby" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-bold text-slate-900">{quizTitle || "Waiting for the game to start..."}</h1>
          <p className="text-slate-500">You&apos;re in, {stored.name}! Waiting for the host to start.</p>
          <p className="text-sm text-slate-400">
            {lobby?.players.length ?? 1} player{(lobby?.players.length ?? 1) === 1 ? "" : "s"} in the lobby
          </p>
        </Card>
      )}

      {phase === "question" && question && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">
              Question {(questionMeta?.questionIndex ?? 0) + 1} / {questionMeta?.totalQuestions}
            </span>
            <span
              className={`text-lg font-bold tabular-nums ${remainingMs < 5000 ? "text-red-600" : "text-brand-700"}`}
              aria-live="polite"
            >
              {Math.ceil(remainingMs / 1000)}s
            </span>
          </div>
          <Card>
            <h1 className="text-xl font-semibold text-slate-900">{question.text}</h1>
            {question.imageUrl && (
              <img src={question.imageUrl} alt="" className="mt-4 max-h-64 w-full rounded-lg object-contain" />
            )}
          </Card>

          {myAnswer ? (
            <Card className="text-center">
              <p className={`text-lg font-bold ${myAnswer.isCorrect ? "text-emerald-600" : "text-red-600"}`}>
                {myAnswer.isCorrect ? "Correct!" : "Not quite"}
              </p>
              <p className="text-slate-500">+{myAnswer.pointsAwarded} points · {myAnswer.totalScore} total</p>
            </Card>
          ) : remainingMs <= 0 ? (
            <Card className="text-center text-slate-500">Time&apos;s up! Waiting for results...</Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {question.choices.map((choice, i) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => submitAnswer(choice.id)}
                  disabled={submittingRef.current || Boolean(selectedChoiceId)}
                  className={`flex min-h-[4.5rem] items-center gap-3 rounded-xl px-4 py-4 text-left text-lg font-semibold text-white shadow transition disabled:opacity-60 ${CHOICE_STYLES[i % CHOICE_STYLES.length]}`}
                >
                  <span aria-hidden="true" className="text-2xl">
                    {CHOICE_SHAPES[i % CHOICE_SHAPES.length]}
                  </span>
                  {choice.text}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === "reveal" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          {myAnswer ? (
            <>
              <p className={`text-2xl font-bold ${myAnswer.isCorrect ? "text-emerald-600" : "text-red-600"}`}>
                {myAnswer.isCorrect ? "Correct!" : "Incorrect"}
              </p>
              <p className="text-slate-500">You earned {myAnswer.pointsAwarded} points · {myAnswer.totalScore} total</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-slate-600">Time was up before you answered</p>
          )}
          {reveal && (
            <p className="text-sm text-slate-400">
              {reveal.answeredCount} of {reveal.totalPlayers} players answered
            </p>
          )}
          <p className="text-slate-500">Waiting for the host to continue...</p>
        </Card>
      )}

      {phase === "leaderboard" && leaderboard && (
        <Card>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Leaderboard</h1>
          <ol className="flex flex-col gap-2">
            {leaderboard.players.map((p) => (
              <li
                key={p.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  p.name === stored.name ? "bg-brand-50 font-semibold text-brand-800" : "bg-slate-50"
                }`}
              >
                <span>
                  #{p.rank} {p.name}
                </span>
                <span>{p.totalScore} pts</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {phase === "podium" && podium && (
        <Card className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Game over!</h1>
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
                <li key={p.id} className={`flex justify-between rounded px-2 py-1 ${p.name === stored.name ? "bg-brand-50" : ""}`}>
                  <span>
                    #{p.rank} {p.name}
                  </span>
                  <span>{p.totalScore} pts</span>
                </li>
              ))}
            </ol>
          </div>
          <Button onClick={() => (window.location.href = "/join")}>Play another game</Button>
        </Card>
      )}
    </div>
  );
}
