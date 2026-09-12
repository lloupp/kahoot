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

const IDLE_CLEANUP_MS = 30 * 60 * 1000; // destroy sessions with no activity for 30 minutes
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const ENDED_SESSION_RETENTION_MS = 60 * 1000; // keep ended sessions briefly for final events

/**
 * The single source of truth for a live game: timing, phase, answers and
 * scoring. Nothing here trusts the client — question deadlines and scores
 * are always computed from server-side timestamps and server-held answer
 * keys, and every mutating call is checked against the socket that is
 * actually attached to that host/participant, not just an id in the payload.
 */
export class GameManager extends EventEmitter {
  private sessions = new Map<string, GameSessionState>();
  // socketId -> {pin, participantId}, so a socket can only ever act as the
  // one participant it is currently attached to, and disconnects/lookups are O(1).
  private socketToParticipant = new Map<string, { pin: string; participantId: string }>();
  private hostSocketToPin = new Map<string, string>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    super();
    this.cleanupInterval = setInterval(() => this.sweepStaleSessions(), SWEEP_INTERVAL_MS);
    this.cleanupInterval.unref();
  }

  private touch(session: GameSessionState) {
    session.lastActivityAt = Date.now();
  }

  private sweepStaleSessions() {
    const now = Date.now();
    for (const [pin, session] of this.sessions) {
      if (now - session.lastActivityAt > IDLE_CLEANUP_MS) {
        // A game that was actually played but never explicitly ended (e.g. the
        // host closed the tab) still deserves its results saved.
        if (session.phase !== "podium" && session.currentQuestionIndex >= 0 && session.participants.size > 0) {
          this.emit("session:abandoned", session);
        }
        this.destroySession(pin);
      }
    }
  }

  private destroySession(pin: string) {
    const session = this.sessions.get(pin);
    if (!session) return;
    if (session.questionTimer) clearTimeout(session.questionTimer);
    if (session.hostSocketId) this.hostSocketToPin.delete(session.hostSocketId);
    for (const participant of session.participants.values()) {
      if (participant.socketId) this.socketToParticipant.delete(participant.socketId);
    }
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
    const now = Date.now();
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
      createdAt: now,
      lastActivityAt: now,
      firstQuestionAt: null,
    };
    this.sessions.set(pin, session);
    return session;
  }

  attachHostSocket(pin: string, hostUserId: string, socketId: string): GameSessionState {
    const session = this.requireSession(pin);
    if (session.hostUserId !== hostUserId) {
      throw new GameError("FORBIDDEN", "You are not the host of this session");
    }
    if (session.hostSocketId && session.hostSocketId !== socketId) {
      this.hostSocketToPin.delete(session.hostSocketId);
    }
    session.hostSocketId = socketId;
    this.hostSocketToPin.set(socketId, pin);
    this.touch(session);
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
    this.touch(session);
    return participant;
  }

  /** Binds a socket to a participant. A socket can only ever represent one
   * participant at a time: if it was previously bound to a different one
   * (e.g. a client re-joining without reloading), that old binding is
   * released first so disconnect bookkeeping never leaves "ghost" players
   * stuck showing as connected. */
  private bindParticipantSocket(session: GameSessionState, participant: Participant, socketId: string) {
    const previousBinding = this.socketToParticipant.get(socketId);
    if (previousBinding && previousBinding.participantId !== participant.id) {
      const previousSession = this.sessions.get(previousBinding.pin);
      const previousParticipant = previousSession?.participants.get(previousBinding.participantId);
      if (previousParticipant) {
        previousParticipant.connected = false;
        previousParticipant.socketId = null;
      }
    }
    if (participant.socketId && participant.socketId !== socketId) {
      this.socketToParticipant.delete(participant.socketId);
    }
    participant.socketId = socketId;
    participant.connected = true;
    this.socketToParticipant.set(socketId, { pin: session.pin, participantId: participant.id });
  }

  attachParticipantSocket(pin: string, participantId: string, socketId: string): GameSessionState {
    const session = this.requireSession(pin);
    const participant = session.participants.get(participantId);
    if (!participant) throw new GameError("NOT_FOUND", "Participant not found");
    this.bindParticipantSocket(session, participant, socketId);
    this.touch(session);
    return session;
  }

  rejoinStudent(pin: string, participantId: string, joinToken: string, socketId: string): GameSessionState {
    const session = this.requireSession(pin);
    const participant = session.participants.get(participantId);
    if (!participant || participant.joinToken !== joinToken) {
      throw new GameError("NOT_FOUND", "Could not resume your session");
    }
    this.bindParticipantSocket(session, participant, socketId);
    this.touch(session);
    return session;
  }

  handleDisconnect(socketId: string): { pin: string; role: "host" | "student" } | null {
    const hostPin = this.hostSocketToPin.get(socketId);
    if (hostPin) {
      const session = this.sessions.get(hostPin);
      if (session && session.hostSocketId === socketId) session.hostSocketId = null;
      this.hostSocketToPin.delete(socketId);
      return { pin: hostPin, role: "host" };
    }
    const binding = this.socketToParticipant.get(socketId);
    if (binding) {
      const session = this.sessions.get(binding.pin);
      const participant = session?.participants.get(binding.participantId);
      if (participant && participant.socketId === socketId) {
        participant.connected = false;
        participant.socketId = null;
      }
      this.socketToParticipant.delete(socketId);
      return { pin: binding.pin, role: "student" };
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
    if (session.firstQuestionAt === null) session.firstQuestionAt = session.questionStartedAt;
    const question = session.questions[nextIndex];
    session.questionEndsAt = session.questionStartedAt + question.timeLimitMs;
    this.touch(session);

    if (session.questionTimer) clearTimeout(session.questionTimer);
    session.questionTimer = setTimeout(() => {
      this.endQuestion(pin);
    }, question.timeLimitMs);

    return session;
  }

  /**
   * Records an answer. `callerSocketId` must be the socket currently bound
   * to `participantId` — this is what stops one student from submitting (or
   * blanking) an answer on another student's behalf just by knowing their id,
   * which is otherwise visible to everyone in the lobby/leaderboard payloads.
   */
  submitAnswer(
    pin: string,
    participantId: string,
    questionId: string,
    choiceId: string | null,
    callerSocketId: string,
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
    if (participant.socketId !== callerSocketId) {
      throw new GameError("FORBIDDEN", "You can only answer for yourself");
    }
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
    this.touch(session);

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
    this.touch(session);
    this.emit("question:ended", pin);
  }

  advanceToLeaderboard(pin: string, hostUserId: string): GameSessionState {
    const session = this.requireSession(pin);
    this.assertHost(session, hostUserId);
    if (session.phase !== "reveal") {
      throw new GameError("INVALID_PHASE", `Cannot show leaderboard from phase "${session.phase}"`);
    }
    session.phase = "leaderboard";
    this.touch(session);
    return session;
  }

  hasMoreQuestions(session: GameSessionState): boolean {
    return session.currentQuestionIndex + 1 < session.questions.length;
  }

  /** Ends the game. Safe to call more than once (e.g. a double-click racing
   * two acks) — a session already at the podium is left untouched. */
  endGame(pin: string, hostUserId: string): { session: GameSessionState; alreadyEnded: boolean } {
    const session = this.requireSession(pin);
    this.assertHost(session, hostUserId);
    if (session.phase === "podium") {
      return { session, alreadyEnded: true };
    }
    session.phase = "podium";
    this.touch(session);
    if (session.questionTimer) clearTimeout(session.questionTimer);
    setTimeout(() => this.destroySession(pin), ENDED_SESSION_RETENTION_MS).unref();
    return { session, alreadyEnded: false };
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
