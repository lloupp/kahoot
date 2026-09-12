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

// Cheap brute-force guard against PIN scanning. Keyed on both the socket
// (tight limit — a single connection has no reason to hammer these events)
// and the remote address (looser limit, since a classroom of students can
// legitimately share one IP): a socket-only limit is trivially bypassed by
// opening a new connection per attempt, which is exactly how an attacker
// would scan the PIN space. This is still a mitigation, not a hard
// guarantee — PIN error responses stay generic and games auto-expire.
const ATTEMPT_WINDOW_MS = 60 * 1000;
const SOCKET_ATTEMPT_LIMIT = 8;
const IP_ATTEMPT_LIMIT = 40;
const attemptsBySocket = new Map<string, { count: number; windowStart: number }>();
const attemptsByIp = new Map<string, { count: number; windowStart: number }>();

function checkAndBump(store: Map<string, { count: number; windowStart: number }>, key: string, limit: number): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart > ATTEMPT_WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

function registerAttempt(socket: Socket): boolean {
  const bySocket = checkAndBump(attemptsBySocket, socket.id, SOCKET_ATTEMPT_LIMIT);
  const byIp = checkAndBump(attemptsByIp, socket.handshake.address, IP_ATTEMPT_LIMIT);
  return bySocket && byIp;
}

setInterval(() => {
  const cutoff = Date.now() - ATTEMPT_WINDOW_MS;
  for (const [key, entry] of attemptsBySocket) if (entry.windowStart < cutoff) attemptsBySocket.delete(key);
  for (const [key, entry] of attemptsByIp) if (entry.windowStart < cutoff) attemptsByIp.delete(key);
}, 5 * 60 * 1000).unref();

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

/** Full state snapshot used to resume either role (host reload or student
 * reconnect) into whatever phase the game is actually in, instead of only
 * the bare phase name — a host who refreshes mid-question or mid-reveal
 * must land back on a working screen, not a blank one. */
function sessionSnapshot(session: GameSessionState) {
  return {
    phase: session.phase,
    quizTitle: session.quizTitle,
    lobby: lobbyPayload(session),
    question: gameManager.getCurrentQuestion(session) ? questionStartPayload(session) : null,
    reveal: session.phase === "reveal" ? revealPayload(session) : null,
    leaderboard: session.phase === "leaderboard" ? leaderboardPayload(session) : null,
    podium: session.phase === "podium" ? podiumPayload(session) : null,
  };
}

/** Only ever call this once a question has actually closed (reveal or
 * later) — it exposes correctness, which must never reach a student while
 * their classmates could still be answering the same question. */
function personalResultPayload(session: GameSessionState, participantId: string) {
  const question = gameManager.getCurrentQuestion(session);
  if (!question) return null;
  const participant = session.participants.get(participantId);
  const answer = participant?.answers.get(question.id);
  if (!answer) return { answered: false as const };
  return {
    answered: true as const,
    isCorrect: answer.isCorrect,
    pointsAwarded: answer.pointsAwarded,
    totalScore: participant!.totalScore,
  };
}

/** Safe to reveal at any phase — whether they've answered, not whether they were right. */
function hasAnsweredCurrentQuestion(session: GameSessionState, participantId: string): boolean {
  const question = gameManager.getCurrentQuestion(session);
  if (!question) return false;
  return Boolean(session.participants.get(participantId)?.answers.has(question.id));
}

const QUESTION_CLOSED_PHASES = new Set(["reveal", "leaderboard", "podium"]);

export function registerSocketHandlers(io: Server) {
  gameManager.on("question:ended", (pin: string) => {
    const session = gameManager.getByPin(pin);
    if (!session) return;
    io.to(roomName(pin)).emit("question:reveal", revealPayload(session));
    // Correctness is only ever revealed once the question has closed for
    // everyone, and only to the participant who owns the answer — sent
    // directly to their socket rather than broadcast to the room.
    for (const participant of session.participants.values()) {
      if (participant.socketId) {
        io.to(participant.socketId).emit("answer:result", personalResultPayload(session, participant.id));
      }
    }
  });

  gameManager.on("session:abandoned", (session: GameSessionState) => {
    persistFinishedSession(session, "abandoned").catch((e) => console.error("Failed to persist abandoned session", e));
  });

  io.on("connection", (socket: Socket) => {
    socket.on("host:join", (payload: { pin: string; token: string }, ack: Ack) => {
      try {
        const userId = requireHostToken(payload.token);
        const session = gameManager.attachHostSocket(payload.pin, userId, socket.id);
        socket.join(roomName(payload.pin));
        ok(ack, sessionSnapshot(session));
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

    socket.on("host:skip-question", (payload: { pin: string; token: string }, ack: Ack) => {
      try {
        const userId = requireHostToken(payload.token);
        // Closing the question emits "question:ended" (registered above),
        // which broadcasts the reveal and personal results — no separate
        // broadcast needed here.
        gameManager.skipQuestion(payload.pin, userId);
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

    function finishGame(pin: string, hostUserId: string): { ended: boolean } {
      const { session, alreadyEnded } = gameManager.endGame(pin, hostUserId);
      if (!alreadyEnded) {
        io.to(roomName(pin)).emit("game:over", podiumPayload(session));
        // A game ended straight from the lobby (no question ever started)
        // has nothing worth reporting — skip writing a zero-player history row.
        if (session.currentQuestionIndex >= 0) {
          persistFinishedSession(session).catch((e) => console.error("Failed to persist session", e));
        }
      }
      return { ended: true };
    }

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
          ok(ack, finishGame(payload.pin, userId));
        }
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on("host:end-game", (payload: { pin: string; token: string }, ack: Ack) => {
      try {
        const userId = requireHostToken(payload.token);
        ok(ack, finishGame(payload.pin, userId));
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on("student:join", (payload: { pin: string; name: string }, ack: Ack) => {
      try {
        if (!registerAttempt(socket)) {
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
          if (!registerAttempt(socket)) {
            throw new GameError("RATE_LIMITED", "Too many attempts, please wait a moment and try again");
          }
          const session = gameManager.rejoinStudent(
            payload.pin,
            payload.participantId,
            payload.joinToken,
            socket.id,
          );
          socket.join(roomName(payload.pin));
          io.to(roomName(payload.pin)).emit("lobby:update", lobbyPayload(session));
          const questionClosed = QUESTION_CLOSED_PHASES.has(session.phase);
          ok(ack, {
            ...sessionSnapshot(session),
            myResult: questionClosed ? personalResultPayload(session, payload.participantId) : null,
            hasAnsweredCurrentQuestion: hasAnsweredCurrentQuestion(session, payload.participantId),
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
          if (!registerAttempt(socket)) {
            throw new GameError("RATE_LIMITED", "Too many attempts, please wait a moment and try again");
          }
          gameManager.submitAnswer(
            payload.pin,
            payload.participantId,
            payload.questionId,
            payload.choiceId,
            socket.id,
          );
          // Correctness/points are intentionally withheld here — see
          // question:ended above — so an early answer can never leak the
          // correct choice to the rest of the class before time is up.
          ok(ack, { received: true });
        } catch (err) {
          fail(ack, err);
        }
      },
    );

    socket.on("disconnect", () => {
      attemptsBySocket.delete(socket.id);
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
