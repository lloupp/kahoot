import { prisma } from "../db";
import { GameSessionState } from "./types";

/** Persists a finished game's final results for history/reporting. */
export async function persistFinishedSession(session: GameSessionState) {
  await prisma.gameSession.create({
    data: {
      id: session.sessionId,
      pin: session.pin,
      quizId: session.quizId,
      hostId: session.hostUserId,
      status: "finished",
      startedAt: new Date(session.createdAt),
      endedAt: new Date(),
      participants: {
        create: [...session.participants.values()]
          .sort((a, b) => b.totalScore - a.totalScore)
          .map((p, index) => ({
            name: p.name,
            totalScore: p.totalScore,
            rank: index + 1,
            answers: {
              create: [...p.answers.values()].map((a) => {
                const question = session.questions.find((q) => q.id === a.questionId);
                const choice = question?.choices.find((c) => c.id === a.choiceId);
                return {
                  questionText: question?.text ?? "",
                  choiceText: choice?.text ?? null,
                  isCorrect: a.isCorrect,
                  pointsAwarded: a.pointsAwarded,
                  answerTimeMs: Math.round(a.answerTimeMs),
                };
              }),
            },
          })),
      },
    },
  });
}
