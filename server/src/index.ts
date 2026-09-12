import { createServer } from "http";
import { Server } from "socket.io";
import { createApp } from "./app";
import { registerSocketHandlers } from "./socket";
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
