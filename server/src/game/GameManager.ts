import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { generatePin } from "../lib/pin";
import { calculateScore } from "../lib/scoring";
import {
  GamePhase,
  GameSessionState,
  Participant,
  QuestionSnapshot,
  MAX_NAME_LENGTH,
} from "./types";

export class GameError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

interface CreateSessionInput {
  quizId: string;
  quizTitle: string;
  hostUserId: string;
  questions: QuestionSnapshot[];
}

const SESSION_IDLE_CLEANUP_MS = 2 * 60 * 60 * 1000; // 2h safety net against memory leaks
const ENDED_SESSION_RETENTION_MS = 60 * 1000; // keep ended sessions briefly for final events

/**
 * The single source of truth for a live game: timing, phase, answers and
 * scoring. Nothing here trusts the client — question deadlines and scores
 * are always computed from server-side timestamps and server-held answer
 * keys.
 */
export class GameManager extends EventEmitter {
  private sessions = new Map<string, GameSessionState>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    super();
    this.cleanupInterval = setInterval(() => this.sweepStaleSessions(), 10 * 60 * 1000);
    this.cleanupInterval.unref();
  }

  private sweepStaleSessions() {
    const now = Date.now();
    for (const [pin, session] of this.sessions) {
      if (now - session.createdAt > SESSION_IDLE_CLEANUP_MS) {
        this.destroySession(pin);
      }
    }
  }

  private destroySession(pin: string) {
    const session = this.sessions.get(pin);
    if (session?.questionTimer) clearTimeout(session.questionTimer);
    this.sessions.delete(pin);
  }

  getByPin(pin: string): GameSessionState | undefined {
    return this.sessions.get(pin);
  }

  createSession(input: CreateSessionInput): GameSessionState {
    if (input.questions.length === 0) {
      throw new GameError("EMPTY_QUIZ", "This quiz has no questions and cannot be played");
    }
    const pin = generatePin((candidate) => this.sessions.has(candidate));
    const session: GameSessionState = {
      sessionId: randomUUID(),
      pin,
      quizId: input.quizId,
      quizTitle: input.quizTitle,
      hostUserId: input.hostUserId,
      hostSocketId: null,
      phase: "lobby",
      questions: input.questions,
      currentQuestionIndex: -1,
      questionStartedAt: null,
      questionEndsAt: null,
      questionTimer: null,
      participants: new Map(),
      createdAt: Date.now(),
    };
    this.sessions.set(pin, session);
    return session;
  }

  attachHostSocket(pin: string, hostUserId: string, socketId: string): GameSessionState {
    const session = this.requireSession(pin);
    if (session.hostUserId !== hostUserId) {
      throw new GameError("FORBIDDEN", "You are not the host of this session");
    }
    session.hostSocketId = socketId;
    return session;
  }

  private requireSession(pin: string): GameSessionState {
    const session = this.sessions.get(pin);
    if (!session) throw new GameError("PIN_NOT_FOUND", "No active game found for this PIN");
    return session;
  }

  joinAsStudent(pin: string, rawName: string): Participant {
    const session = this.requireSession(pin);
    if (session.phase === "podium" || session.phase === "ended") {
      throw new GameError("GAME_OVER", "This game has already ended");
    }
    const name = rawName.trim().slice(0, MAX_NAME_LENGTH);
    if (!name) {
      throw new GameError("INVALID_NAME", "Please enter a name");
    }
    const nameTaken = [...session.participants.values()].some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (nameTaken) {
      throw new GameError("NAME_TAKEN", "That name is already taken in this game");
    }
    const participant: Participant = {
      id: randomUUID(),
      name,
      socketId: null,
      connected: true,
      joinToken: randomUUID(),
      totalScore: 0,
      answers: new Map(),
    };
    session.participants.set(participant.id, participant);
    return participant;
  }

  attachParticipantSocket(pin: string, participantId: string, socketId: string): GameSessionState {
    const session = this.requireSession(pin);
    const participant = session.participants.get(participantId);
    if (!participant) throw new GameError("NOT_FOUND", "Participant not found");
    participant.socketId = socketId;
    participant.connected = true;
    return session;
  }

  rejoinStudent(pin: string, participantId: string, joinToken: string, socketId: string): GameSessionState {
    const session = this.requireSession(pin);
    const participant = session.participants.get(participantId);
    if (!participant || participant.joinToken !== joinToken) {
      throw new GameError("NOT_FOUND", "Could not resume your session");
    }
    participant.socketId = socketId;
    participant.connected = true;
    return session;
  }

  handleDisconnect(socketId: string): { pin: string; role: "host" | "student" } | null {
    for (const session of this.sessions.values()) {
      if (session.hostSocketId === socketId) {
        session.hostSocketId = null;
        return { pin: session.pin, role: "host" };
      }
      for (const participant of session.participants.values()) {
        if (participant.socketId === socketId) {
          participant.connected = false;
          participant.socketId = null;
          return { pin: session.pin, role: "student" };
        }
      }
    }
    return null;
  }

  private assertHost(session: GameSessionState, hostUserId: string) {
    if (session.hostUserId !== hostUserId) {
      throw new GameError("FORBIDDEN", "You are not the host of this session");
    }
  }

  startNextQuestion(pin: string, hostUserId: string): GameSessionState {
    const session = this.requireSession(pin);
    this.assertHost(session, hostUserId);
    if (session.phase !== "lobby" && session.phase !== "leaderboard") {
      throw new GameError("INVALID_PHASE", `Cannot start a question from phase "${session.phase}"`);
    }
    const nextIndex = session.currentQuestionIndex + 1;
    if (nextIndex >= session.questions.length) {
      throw new GameError("NO_MORE_QUESTIONS", "There are no more questions");
    }
    session.currentQuestionIndex = nextIndex;
    session.phase = "question";
    session.questionStartedAt = Date.now();
    const question = session.questions[nextIndex];
    session.questionEndsAt = session.questionStartedAt + question.timeLimitMs;

    if (session.questionTimer) clearTimeout(session.questionTimer);
    session.questionTimer = setTimeout(() => {
      this.endQuestion(pin);
    }, question.timeLimitMs);

    return session;
  }

  submitAnswer(
    pin: string,
    participantId: string,
    questionId: string,
    choiceId: string | null,
  ): Participant {
    const session = this.requireSession(pin);
    if (session.phase !== "question") {
      throw new GameError("NOT_ACCEPTING_ANSWERS", "This question is not currently accepting answers");
    }
    const question = session.questions[session.currentQuestionIndex];
    if (!question || question.id !== questionId) {
      throw new GameError("STALE_QUESTION", "That question is no longer active");
    }
    const participant = session.participants.get(participantId);
    if (!participant) throw new GameError("NOT_FOUND", "Participant not found");
    if (participant.answers.has(questionId)) {
      throw new GameError("ALREADY_ANSWERED", "You already answered this question");
    }
    const now = Date.now();
    if (session.questionEndsAt !== null && now > session.questionEndsAt) {
      throw new GameError("TOO_LATE", "Time is up for this question");
    }
    const choice = choiceId ? question.choices.find((c) => c.id === choiceId) : undefined;
    if (choiceId && !choice) {
      throw new GameError("INVALID_CHOICE", "That is not a valid choice for this question");
    }
    const answerTimeMs = now - (session.questionStartedAt ?? now);
    const isCorrect = Boolean(choice?.isCorrect);
    const pointsAwarded = calculateScore({
      basePoints: question.points,
      timeLimitMs: question.timeLimitMs,
      answerTimeMs,
      isCorrect,
    });
    participant.answers.set(questionId, {
      questionId,
      choiceId: choiceId ?? null,
      isCorrect,
      pointsAwarded,
      answerTimeMs,
    });
    participant.totalScore += pointsAwarded;

    return participant;
  }

  private endQuestion(pin: string) {
    const session = this.sessions.get(pin);
    if (!session || session.phase !== "question") return;
    if (session.questionTimer) {
      clearTimeout(session.questionTimer);
      session.questionTimer = null;
    }
    session.phase = "reveal";
    this.emit("question:ended", pin);
  }

  advanceToLeaderboard(pin: string, hostUserId: string): GameSessionState {
    const session = this.requireSession(pin);
    this.assertHost(session, hostUserId);
    if (session.phase !== "reveal") {
      throw new GameError("INVALID_PHASE", `Cannot show leaderboard from phase "${session.phase}"`);
    }
    session.phase = "leaderboard";
    return session;
  }

  hasMoreQuestions(session: GameSessionState): boolean {
    return session.currentQuestionIndex + 1 < session.questions.length;
  }

  endGame(pin: string, hostUserId: string): GameSessionState {
    const session = this.requireSession(pin);
    this.assertHost(session, hostUserId);
    session.phase = "podium";
    if (session.questionTimer) clearTimeout(session.questionTimer);
    setTimeout(() => this.destroySession(pin), ENDED_SESSION_RETENTION_MS).unref();
    return session;
  }

  getCurrentQuestion(session: GameSessionState): QuestionSnapshot | null {
    if (session.currentQuestionIndex < 0) return null;
    return session.questions[session.currentQuestionIndex] ?? null;
  }

  getPhase(pin: string): GamePhase | undefined {
    return this.sessions.get(pin)?.phase;
  }

  shutdown() {
    clearInterval(this.cleanupInterval);
  }
}

export const gameManager = new GameManager();
