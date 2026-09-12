export type GamePhase = "lobby" | "question" | "reveal" | "leaderboard" | "podium" | "ended";

export interface ChoiceSnapshot {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionSnapshot {
  id: string;
  text: string;
  imageUrl: string | null;
  timeLimitMs: number;
  points: number;
  choices: ChoiceSnapshot[];
}

export interface ParticipantAnswer {
  questionId: string;
  choiceId: string | null;
  isCorrect: boolean;
  pointsAwarded: number;
  answerTimeMs: number;
}

export interface Participant {
  id: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  joinToken: string;
  totalScore: number;
  answers: Map<string, ParticipantAnswer>; // keyed by questionId
}

export interface GameSessionState {
  sessionId: string;
  pin: string;
  quizId: string;
  quizTitle: string;
  hostUserId: string;
  hostSocketId: string | null;
  phase: GamePhase;
  questions: QuestionSnapshot[];
  currentQuestionIndex: number;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  questionTimer: NodeJS.Timeout | null;
  participants: Map<string, Participant>;
  createdAt: number;
}

export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 20;
