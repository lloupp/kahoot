import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { gameManager, GameError } from "../game/GameManager";
import { QuestionSnapshot } from "../game/types";

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

// Start a new live session for one of the teacher's quizzes; returns the PIN.
sessionsRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const quizId = String(req.body?.quizId ?? "");
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { orderBy: { order: "asc" }, include: { choices: { orderBy: { order: "asc" } } } } },
    });
    if (!quiz) throw new HttpError(404, "Quiz not found");
    if (quiz.ownerId !== req.userId) throw new HttpError(403, "You do not have access to this quiz");

    const questions: QuestionSnapshot[] = quiz.questions.map((q) => ({
      id: q.id,
      text: q.text,
      imageUrl: q.imageUrl,
      timeLimitMs: q.timeLimitMs,
      points: q.points,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })),
    }));

    const session = gameManager.createSession({
      quizId: quiz.id,
      quizTitle: quiz.title,
      hostUserId: req.userId!,
      questions,
    });
    res.status(201).json({ pin: session.pin, sessionId: session.sessionId });
  } catch (err) {
    if (err instanceof GameError) {
      return res.status(err.code === "EMPTY_QUIZ" ? 422 : 400).json({ error: err.message, code: err.code });
    }
    return next(err);
  }
});

// Session history for the logged-in teacher, most recent first. Keyed by
// hostId (who actually ran the game) rather than current quiz ownership, so
// history survives the source quiz being deleted or edited afterwards.
sessionsRouter.get("/history", async (req: AuthedRequest, res, next) => {
  try {
    const sessions = await prisma.gameSession.findMany({
      where: { hostId: req.userId },
      orderBy: { startedAt: "desc" },
      include: { participants: true },
    });
    res.json(
      sessions.map((s) => ({
        id: s.id,
        pin: s.pin,
        quizTitle: s.quizTitle,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        playerCount: s.participants.length,
        topScore: s.participants.reduce((max, p) => Math.max(max, p.totalScore), 0),
      })),
    );
  } catch (err) {
    next(err);
  }
});

// Full report for a single past session.
sessionsRouter.get("/history/:id", async (req: AuthedRequest, res, next) => {
  try {
    const session = await prisma.gameSession.findUnique({
      where: { id: req.params.id },
      include: {
        participants: { include: { answers: true }, orderBy: { totalScore: "desc" } },
      },
    });
    if (!session) throw new HttpError(404, "Session not found");
    if (session.hostId !== req.userId) throw new HttpError(403, "You do not have access to this session");
    res.json(session);
  } catch (err) {
    next(err);
  }
});
