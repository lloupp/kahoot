import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./env";
import { authRouter } from "./routes/auth";
import { quizzesRouter } from "./routes/quizzes";
import { sessionsRouter } from "./routes/sessions";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRouter);
  app.use("/api/quizzes", quizzesRouter);
  app.use("/api/sessions", sessionsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
