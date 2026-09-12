export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Choice {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  text: string;
  imageUrl: string | null;
  timeLimitMs: number;
  points: number;
  choices: Choice[];
}

export interface Quiz {
  id: string;
  title: string;
  subject: string | null;
  description: string | null;
  questions: Question[];
  updatedAt: string;
}

export interface QuizSummary {
  id: string;
  title: string;
  subject: string | null;
  description: string | null;
  questionCount: number;
  updatedAt: string;
}

export interface SessionHistoryItem {
  id: string;
  pin: string;
  quizTitle: string;
  startedAt: string;
  endedAt: string | null;
  playerCount: number;
  topScore: number;
}

export interface SessionAnswer {
  id: string;
  questionText: string;
  choiceText: string | null;
  isCorrect: boolean;
  pointsAwarded: number;
  answerTimeMs: number;
}

export interface SessionParticipantReport {
  id: string;
  name: string;
  totalScore: number;
  rank: number | null;
  answers: SessionAnswer[];
}

export interface QuestionBreakdown {
  questionOrder: number;
  questionText: string;
  correctCount: number;
  answeredCount: number;
  totalPlayers: number;
}

export interface SessionReport {
  id: string;
  pin: string;
  startedAt: string;
  endedAt: string | null;
  quizTitle: string;
  participants: SessionParticipantReport[];
  questionBreakdown: QuestionBreakdown[];
  unscoredQuestionCount: number;
}
