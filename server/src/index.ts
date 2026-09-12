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

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);

  // A deploy/restart shouldn't silently discard a game in progress: persist
  // anything that has actually been played, the same way an abandoned idle
  // session would be, before the process exits.
  const toPersist = gameManager
    .getAllSessions()
    .filter((s) => s.phase !== "podium" && s.currentQuestionIndex >= 0 && s.participants.size > 0);
  await Promise.all(
    toPersist.map((session) =>
      persistFinishedSession(session, "abandoned").catch((err) =>
        console.error(`Failed to persist session ${session.pin} on shutdown`, err),
      ),
    ),
  );

  gameManager.shutdown();
  io.close();
  httpServer.close(() => process.exit(0));
  // Safety net in case a lingering connection keeps the server from closing.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
