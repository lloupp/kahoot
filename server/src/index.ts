import { createServer } from "http";
import { Server } from "socket.io";
import { createApp } from "./app";
import { registerSocketHandlers } from "./socket";
import { gameManager } from "./game/GameManager";
import { persistFinishedSession } from "./game/persist";
import { env } from "./env";

const app = createApp();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: env.clientOrigin, credentials: true },
});

registerSocketHandlers(io);

httpServer.listen(env.port, () => {
  console.log(`QuizArena server listening on port ${env.port}`);
});

let shuttingDown = false;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);

  // Registered first, before anything that could hang, so a stalled DB
  // write or a lingering connection can never prevent the process from
  // actually exiting.
  const forceExit = setTimeout(() => process.exit(1), 5000);
  forceExit.unref();

  // A deploy/restart shouldn't silently discard a game in progress: persist
  // anything that has actually been played, the same way an abandoned idle
  // session would be, before the process exits. Capped so a stalled write
  // can't block shutdown indefinitely — the 5s force-exit above still wins.
  const toPersist = gameManager
    .getAllSessions()
    .filter((s) => s.phase !== "podium" && s.currentQuestionIndex >= 0 && s.participants.size > 0);
  await withTimeout(
    Promise.all(
      toPersist.map((session) =>
        persistFinishedSession(session, "abandoned").catch((err) =>
          console.error(`Failed to persist session ${session.pin} on shutdown`, err),
        ),
      ),
    ),
    3000,
  );

  gameManager.shutdown();
  // io was constructed with httpServer, so closing io also closes it —
  // a separate httpServer.close() here would just race an already-closed
  // server.
  io.close(() => process.exit(0));
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
