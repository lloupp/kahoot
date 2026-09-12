import { Server, Socket } from "socket.io";
import { gameManager, GameError } from "../game/GameManager";
import { GameSessionState } from "../game/types";
import { verifyToken } from "../lib/jwt";
import { persistFinishedSession } from "../game/persist";

type Ack = (response: { ok: true; data?: unknown } | { ok: false; error: string; code?: string }) => void;

function ok(ack: Ack, data?: unknown) {
  ack({ ok: true, data });
}

function fail(ack: Ack, err: unknown) {
  if (err instanceof GameError) {
    ack({ ok: false, error: err.message, code: err.code });
  } else {
    console.error(err);
    ack({ ok: false, error: "Something went wrong" });
  }
}

// Cheap brute-force guard against PIN scanning: a socket gets a handful of
// join attempts per minute before further attempts are throttled.
const JOIN_ATTEMPT_LIMIT = 8;
const JOIN_ATTEMPT_WINDOW_MS = 60 * 1000;
const joinAttempts = new Map<string, { count: number; windowStart: number }>();

function registerJoinAttempt(socketId: string): boolean {
  const now = Date.now();
  const entry = joinAttempts.get(socketId);
  if (!entry || now - entry.windowStart > JOIN_ATTEMPT_WINDOW_MS) {
    joinAttempts.set(socketId, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= JOIN_ATTEMPT_LIMIT;
}

function requireHostToken(token: string): string {
  try {
    return verifyToken(token).userId;
  } catch {
    throw new GameError("UNAUTHORIZED", "Invalid or expired session token");
  }
}

function publicQuestion(session: GameSessionState) {
  const q = gameManager.getCurrentQuestion(session);
  if (!q) return null;
  return {
    id: q.id,
    text: q.text,
    imageUrl: q.imageUrl,
    timeLimitMs: q.timeLimitMs,
    choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
  };
}

function lobbyPayload(session: GameSessionState) {
  return {
    pin: session.pin,
    quizTitle: session.quizTitle,
    players: [...session.participants.values()].map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
  };
}

function questionStartPayload(session: GameSessionState) {
  return {
    questionIndex: session.currentQuestionIndex,
    totalQuestions: session.questions.length,
    question: publicQuestion(session),
    startedAt: session.questionStartedAt,
    endsAt: session.questionEndsAt,
  };
}

function revealPayload(session: GameSessionState) {
  const question = gameManager.getCurrentQuestion(session);
  if (!question) return null;
  const counts: Record<string, number> = {};
  for (const choice of question.choices) counts[choice.id] = 0;
  let answeredCount = 0;
  for (const participant of session.participants.values()) {
    const answer = participant.answers.get(question.id);
    if (answer) {
      answeredCount++;
      if (answer.choiceId) counts[answer.choiceId] = (counts[answer.choiceId] ?? 0) + 1;
    }
  }
  const correctChoice = question.choices.find((c) => c.isCorrect);
  return {
    questionId: question.id,
    correctChoiceId: correctChoice?.id ?? null,
    counts,
    answeredCount,
    totalPlayers: session.participants.size,
  };
}

function leaderboardPayload(session: GameSessionState) {
  return {
    questionIndex: session.currentQuestionIndex,
    totalQuestions: session.questions.length,
    players: [...session.participants.values()]
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((p, i) => ({ id: p.id, name: p.name, totalScore: p.totalScore, rank: i + 1 })),
  };
}

function podiumPayload(session: GameSessionState) {
  const ranking = [...session.participants.values()]
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((p, i) => ({ id: p.id, name: p.name, totalScore: p.totalScore, rank: i + 1 }));
  return { podium: ranking.slice(0, 3), ranking };
}

export function registerSocketHandlers(io: Server) {
  gameManager.on("question:ended", (pin: string) => {
    const session = gameManager.getByPin(pin);
    if (!session) return;
    io.to(roomName(pin)).emit("question:reveal", revealPayload(session));
  });

  io.on("connection", (socket: Socket) => {
    socket.on("host:join", (payload: { pin: string; token: string }, ack: Ack) => {
      try {
        const userId = requireHostToken(payload.token);
        const session = gameManager.attachHostSocket(payload.pin, userId, socket.id);
        socket.join(roomName(payload.pin));
        ok(ack, { phase: session.phase, lobby: lobbyPayload(session) });
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on("host:start-question", (payload: { pin: string; token: string }, ack: Ack) => {
      try {
        const userId = requireHostToken(payload.token);
        const session = gameManager.startNextQuestion(payload.pin, userId);
        io.to(roomName(payload.pin)).emit("question:start", questionStartPayload(session));
        ok(ack);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on("host:show-leaderboard", (payload: { pin: string; token: string }, ack: Ack) => {
      try {
        const userId = requireHostToken(payload.token);
        const session = gameManager.advanceToLeaderboard(payload.pin, userId);
        io.to(roomName(payload.pin)).emit("leaderboard:update", leaderboardPayload(session));
        ok(ack);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on("host:next", (payload: { pin: string; token: string }, ack: Ack) => {
      try {
        const userId = requireHostToken(payload.token);
        const session = gameManager.getByPin(payload.pin);
        if (!session) throw new GameError("PIN_NOT_FOUND", "No active game found for this PIN");
        if (gameManager.hasMoreQuestions(session)) {
          const updated = gameManager.startNextQuestion(payload.pin, userId);
          io.to(roomName(payload.pin)).emit("question:start", questionStartPayload(updated));
          ok(ack, { ended: false });
        } else {
          const ended = gameManager.endGame(payload.pin, userId);
          const payloadOut = podiumPayload(ended);
          io.to(roomName(payload.pin)).emit("game:over", payloadOut);
          persistFinishedSession(ended).catch((e) => console.error("Failed to persist session", e));
          ok(ack, { ended: true });
        }
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on("host:end-game", (payload: { pin: string; token: string }, ack: Ack) => {
      try {
        const userId = requireHostToken(payload.token);
        const ended = gameManager.endGame(payload.pin, userId);
        const payloadOut = podiumPayload(ended);
        io.to(roomName(payload.pin)).emit("game:over", payloadOut);
        persistFinishedSession(ended).catch((e) => console.error("Failed to persist session", e));
        ok(ack);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on("student:join", (payload: { pin: string; name: string }, ack: Ack) => {
      try {
        if (!registerJoinAttempt(socket.id)) {
          throw new GameError("RATE_LIMITED", "Too many attempts, please wait a moment and try again");
        }
        const participant = gameManager.joinAsStudent(payload.pin, payload.name);
        const session = gameManager.attachParticipantSocket(payload.pin, participant.id, socket.id);
        socket.join(roomName(payload.pin));
        io.to(roomName(payload.pin)).emit("lobby:update", lobbyPayload(session));
        ok(ack, {
          participantId: participant.id,
          joinToken: participant.joinToken,
          quizTitle: session.quizTitle,
          phase: session.phase,
        });
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on(
      "student:rejoin",
      (payload: { pin: string; participantId: string; joinToken: string }, ack: Ack) => {
        try {
          const session = gameManager.rejoinStudent(
            payload.pin,
            payload.participantId,
            payload.joinToken,
            socket.id,
          );
          socket.join(roomName(payload.pin));
          io.to(roomName(payload.pin)).emit("lobby:update", lobbyPayload(session));
          const currentQuestion = gameManager.getCurrentQuestion(session);
          ok(ack, {
            phase: session.phase,
            quizTitle: session.quizTitle,
            question: currentQuestion ? questionStartPayload(session) : null,
            leaderboard: session.phase === "leaderboard" ? leaderboardPayload(session) : null,
            podium: session.phase === "podium" ? podiumPayload(session) : null,
          });
        } catch (err) {
          fail(ack, err);
        }
      },
    );

    socket.on(
      "student:answer",
      (
        payload: { pin: string; participantId: string; questionId: string; choiceId: string | null },
        ack: Ack,
      ) => {
        try {
          const participant = gameManager.submitAnswer(
            payload.pin,
            payload.participantId,
            payload.questionId,
            payload.choiceId,
          );
          const answer = participant.answers.get(payload.questionId)!;
          ok(ack, {
            isCorrect: answer.isCorrect,
            pointsAwarded: answer.pointsAwarded,
            totalScore: participant.totalScore,
          });
        } catch (err) {
          fail(ack, err);
        }
      },
    );

    socket.on("disconnect", () => {
      joinAttempts.delete(socket.id);
      const result = gameManager.handleDisconnect(socket.id);
      if (!result) return;
      const session = gameManager.getByPin(result.pin);
      if (!session) return;
      if (result.role === "student") {
        io.to(roomName(result.pin)).emit("lobby:update", lobbyPayload(session));
      } else {
        io.to(roomName(result.pin)).emit("host:disconnected");
      }
    });
  });
}

function roomName(pin: string) {
  return `game:${pin}`;
}
