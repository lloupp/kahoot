export interface LobbyPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export interface LobbyPayload {
  pin: string;
  quizTitle: string;
  players: LobbyPlayer[];
}

export interface PublicChoice {
  id: string;
  text: string;
}

export interface PublicQuestion {
  id: string;
  text: string;
  imageUrl: string | null;
  timeLimitMs: number;
  choices: PublicChoice[];
}

export interface QuestionStartPayload {
  questionIndex: number;
  totalQuestions: number;
  question: PublicQuestion | null;
  startedAt: number;
  endsAt: number;
}

export interface RevealPayload {
  questionId: string;
  correctChoiceId: string | null;
  counts: Record<string, number>;
  answeredCount: number;
  totalPlayers: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  totalScore: number;
  rank: number;
}

export interface LeaderboardPayload {
  questionIndex: number;
  totalQuestions: number;
  players: LeaderboardEntry[];
}

export interface PodiumPayload {
  podium: LeaderboardEntry[];
  ranking: LeaderboardEntry[];
}

export interface AnswerAck {
  isCorrect: boolean;
  pointsAwarded: number;
  totalScore: number;
}
