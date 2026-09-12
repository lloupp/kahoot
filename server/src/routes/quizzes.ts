import { Router } from "express";
import { prisma } from "../db";
import { Prisma, Quiz, Question, Choice } from "@prisma/client";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { quizSchema, QuizInput } from "../lib/validation";
import { HttpError } from "../middleware/errorHandler";

export const quizzesRouter = Router();

quizzesRouter.use(requireAuth);

const quizInclude = {
  questions: {
    orderBy: { order: "asc" as const },
    include: { choices: { orderBy: { order: "asc" as const } } },
  },
};

type QuizWithQuestions = Quiz & {
  questions: (Question & { choices: Choice[] })[];
};

async function loadOwnedQuiz(quizId: string, ownerId: string): Promise<QuizWithQuestions> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: quizInclude,
  });
  if (!quiz) throw new HttpError(404, "Quiz not found");
  if (quiz.ownerId !== ownerId) throw new HttpError(403, "You do not have access to this quiz");
  return quiz as QuizWithQuestions;
}

quizzesRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const quizzes = await prisma.quiz.findMany({
      where: { ownerId: req.userId },
      orderBy: { updatedAt: "desc" },
      include: { questions: { select: { id: true } } },
    });
    res.json(
      quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        subject: q.subject,
        description: q.description,
        questionCount: q.questions.length,
        updatedAt: q.updatedAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

quizzesRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const quiz = await loadOwnedQuiz(req.params.id, req.userId!);
    res.json(quiz);
  } catch (err) {
    next(err);
  }
});

quizzesRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const data = quizSchema.parse(req.body);
    const quiz = await prisma.quiz.create({
      data: {
        title: data.title,
        subject: data.subject || null,
        description: data.description || null,
        ownerId: req.userId!,
        questions: {
          create: data.questions.map((q: QuizInput["questions"][number], qi: number) => ({
            text: q.text,
            imageUrl: q.imageUrl || null,
            timeLimitMs: q.timeLimitMs,
            points: q.points,
            order: qi,
            choices: {
              create: (q.choices as QuizInput["questions"][number]["choices"]).map(
                (c: QuizInput["questions"][number]["choices"][number], ci: number) => ({
                  text: c.text,
                  isCorrect: c.isCorrect,
                  order: ci,
                }),
              ),
            },
          })),
        },
      },
      include: quizInclude,
    });
    res.status(201).json(quiz);
  } catch (err) {
    next(err);
  }
});

quizzesRouter.put("/:id", async (req: AuthedRequest, res, next) => {
  try {
    await loadOwnedQuiz(req.params.id, req.userId!);
    const data = quizSchema.parse(req.body);

    const quiz = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.question.deleteMany({ where: { quizId: req.params.id } });
      return tx.quiz.update({
        where: { id: req.params.id },
        data: {
          title: data.title,
          subject: data.subject || null,
          description: data.description || null,
          questions: {
            create: data.questions.map((q: QuizInput["questions"][number], qi: number) => ({
              text: q.text,
              imageUrl: q.imageUrl || null,
              timeLimitMs: q.timeLimitMs,
              points: q.points,
              order: qi,
              choices: {
                create: (q.choices as QuizInput["questions"][number]["choices"]).map(
                  (c: QuizInput["questions"][number]["choices"][number], ci: number) => ({
                    text: c.text,
                    isCorrect: c.isCorrect,
                    order: ci,
                  }),
                ),
              },
            })),
          },
        },
        include: quizInclude,
      });
    });
    res.json(quiz);
  } catch (err) {
    next(err);
  }
});

quizzesRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    await loadOwnedQuiz(req.params.id, req.userId!);
    await prisma.quiz.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

quizzesRouter.post("/:id/duplicate", async (req: AuthedRequest, res, next) => {
  try {
    const quiz = await loadOwnedQuiz(req.params.id, req.userId!);
    const copy = await prisma.quiz.create({
      data: {
        title: `${quiz.title} (copy)`,
        subject: quiz.subject,
        description: quiz.description,
        ownerId: req.userId!,
        questions: {
          create: (quiz as QuizWithQuestions).questions.map((q: any, qi: number) => ({
            text: q.text,
            imageUrl: q.imageUrl,
            timeLimitMs: q.timeLimitMs,
            points: q.points,
            order: qi,
            choices: {
              create: q.choices.map((c: any, ci: number) => ({ text: c.text, isCorrect: c.isCorrect, order: ci })),
            },
          })),
        },
      },
      include: quizInclude,
    });
    res.status(201).json(copy);
  } catch (err) {
    next(err);
  }
});
