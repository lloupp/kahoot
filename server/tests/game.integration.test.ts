import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "http";
import type { Server as HttpServer } from "http";
import type { AddressInfo } from "net";
import { Server as IOServer } from "socket.io";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { randomUUID } from "crypto";
import { createApp } from "../src/app";
import { registerSocketHandlers } from "../src/socket";
import { prisma } from "../src/db";
import { gameManager } from "../src/game/GameManager";

let httpServer: HttpServer;
let baseUrl: string;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  const app = createApp();
  httpServer = createServer(app);
  const io = new IOServer(httpServer, { cors: { origin: "*" } });
  registerSocketHandlers(io);
  await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()));
  const port = (httpServer.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await new Promise((resolve) => httpServer.close(() => resolve(undefined)));
  await prisma.$disconnect();
});

type Ack = { ok: true; data?: any } | { ok: false; error: string; code?: string };

function emitAsync(socket: ClientSocket, event: string, payload: unknown): Promise<Ack> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitForEvent<T = any>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const s = ioClient(baseUrl, { transports: ["websocket"], forceNew: true });
    sockets.push(s);
    s.on("connect", () => resolve(s));
  });
}

function makeQuestions(count: number, timeLimitMs: number) {
  return Array.from({ length: count }, (_, i) => ({
    text: `Question ${i + 1}?`,
    timeLimitMs,
    points: 1000,
    choices: [
      { text: "Correct", isCorrect: true },
      { text: "Wrong A", isCorrect: false },
      { text: "Wrong B", isCorrect: false },
    ],
  }));
}

async function setupGame(questionCount: number, timeLimitMs: number) {
  const email = `${randomUUID()}@example.com`;
  const reg = await request(baseUrl)
    .post("/api/auth/register")
    .send({ name: "Teacher", email, password: "supersecret1" });
  const token = reg.body.token as string;
  const quizRes = await request(baseUrl)
    .post("/api/quizzes")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Integration Quiz", questions: makeQuestions(questionCount, timeLimitMs) });
  const sessionRes = await request(baseUrl)
    .post("/api/sessions")
    .set("Authorization", `Bearer ${token}`)
    .send({ quizId: quizRes.body.id });
  return { token, quiz: quizRes.body, pin: sessionRes.body.pin as string };
}

describe("multiplayer game flow", () => {
  it("rejects joining a PIN that does not exist", async () => {
    const student = await connectClient();
    const res = await emitAsync(student, "student:join", { pin: "000000", name: "Ghost" });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.code).toBe("PIN_NOT_FOUND");
  });

  it("rejects a duplicate name within the same session", async () => {
    const { pin } = await setupGame(1, 5000);
    const a = await connectClient();
    const b = await connectClient();
    const first = await emitAsync(a, "student:join", { pin, name: "Alice" });
    expect(first.ok).toBe(true);
    const second = await emitAsync(b, "student:join", { pin, name: "alice" }); // case-insensitive
    expect(second.ok).toBe(false);
    expect(!second.ok && second.code).toBe("NAME_TAKEN");
  });

  it("rejects starting a session for a quiz with no questions", async () => {
    const email = `${randomUUID()}@example.com`;
    const reg = await request(baseUrl)
      .post("/api/auth/register")
      .send({ name: "Teacher", email, password: "supersecret1" });
    const token = reg.body.token as string;
    const quizRes = await request(baseUrl)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Empty quiz", questions: [] });
    const sessionRes = await request(baseUrl)
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ quizId: quizRes.body.id });
    expect(sessionRes.status).toBe(422);
    expect(sessionRes.body.code).toBe("EMPTY_QUIZ");
  });

  it("runs a full game end-to-end with speed-weighted scoring, leaderboard and podium", async () => {
    const timeLimitMs = 2000;
    const { token, quiz, pin } = await setupGame(2, timeLimitMs);
    const host = await connectClient();
    const hostJoin = await emitAsync(host, "host:join", { pin, token });
    expect(hostJoin.ok).toBe(true);

    const alice = await connectClient();
    const bob = await connectClient();
    const carol = await connectClient();
    const aliceJoin = await emitAsync(alice, "student:join", { pin, name: "Alice" });
    const bobJoin = await emitAsync(bob, "student:join", { pin, name: "Bob" });
    const carolJoin = await emitAsync(carol, "student:join", { pin, name: "Carol" });
    expect(aliceJoin.ok && bobJoin.ok && carolJoin.ok).toBe(true);
    const aliceId = aliceJoin.ok ? aliceJoin.data.participantId : "";
    const bobId = bobJoin.ok ? bobJoin.data.participantId : "";
    const carolId = carolJoin.ok ? carolJoin.data.participantId : "";

    const q1 = quiz.questions[0];
    const correctChoiceQ1 = q1.choices.find((c: any) => c.isCorrect).id;
    const wrongChoiceQ1 = q1.choices.find((c: any) => !c.isCorrect).id;

    const revealPromise = waitForEvent(alice, "question:reveal");
    const startAck = await emitAsync(host, "host:start-question", { pin, token });
    expect(startAck.ok).toBe(true);

    // Alice answers instantly (fast, correct) -> should score highest.
    const aliceAnswer = await emitAsync(alice, "student:answer", {
      pin,
      participantId: aliceId,
      questionId: q1.id,
      choiceId: correctChoiceQ1,
    });
    expect(aliceAnswer.ok).toBe(true);

    // Bob answers correct but slower -> should score less than Alice, more than 0.
    await new Promise((r) => setTimeout(r, timeLimitMs * 0.5));
    const bobAnswer = await emitAsync(bob, "student:answer", {
      pin,
      participantId: bobId,
      questionId: q1.id,
      choiceId: correctChoiceQ1,
    });
    expect(bobAnswer.ok).toBe(true);

    // Carol answers wrong -> 0 points.
    const carolAnswer = await emitAsync(carol, "student:answer", {
      pin,
      participantId: carolId,
      questionId: q1.id,
      choiceId: wrongChoiceQ1,
    });
    expect(carolAnswer.ok).toBe(true);

    if (aliceAnswer.ok && bobAnswer.ok && carolAnswer.ok) {
      expect(aliceAnswer.data.isCorrect).toBe(true);
      expect(bobAnswer.data.isCorrect).toBe(true);
      expect(carolAnswer.data.isCorrect).toBe(false);
      expect(carolAnswer.data.pointsAwarded).toBe(0);
      expect(aliceAnswer.data.pointsAwarded).toBeGreaterThan(bobAnswer.data.pointsAwarded);
      expect(bobAnswer.data.pointsAwarded).toBeGreaterThan(0);
    }

    // A duplicate answer from the same participant must be rejected.
    const dup = await emitAsync(alice, "student:answer", {
      pin,
      participantId: aliceId,
      questionId: q1.id,
      choiceId: wrongChoiceQ1,
    });
    expect(dup.ok).toBe(false);
    expect(!dup.ok && dup.code).toBe("ALREADY_ANSWERED");

    // Wait for the server-side timer to close the question and broadcast the reveal.
    const reveal = await revealPromise;
    expect(reveal.correctChoiceId).toBe(correctChoiceQ1);
    expect(reveal.answeredCount).toBe(3);
    expect(reveal.counts[correctChoiceQ1]).toBe(2);
    expect(reveal.counts[wrongChoiceQ1]).toBe(1);

    // Answering after the question has closed must be rejected even with a fresh joiner.
    const dave = await connectClient();
    const daveJoin = await emitAsync(dave, "student:join", { pin, name: "Dave" });
    expect(daveJoin.ok).toBe(true); // late join is allowed...
    const daveId = daveJoin.ok ? daveJoin.data.participantId : "";
    const lateAnswer = await emitAsync(dave, "student:answer", {
      pin,
      participantId: daveId,
      questionId: q1.id,
      choiceId: correctChoiceQ1,
    });
    expect(lateAnswer.ok).toBe(false); // ...but cannot retroactively answer a closed question

    const leaderboardPromise = waitForEvent(alice, "leaderboard:update");
    const showBoard = await emitAsync(host, "host:show-leaderboard", { pin, token });
    expect(showBoard.ok).toBe(true);
    const leaderboard = await leaderboardPromise;
    expect(leaderboard.players[0].name).toBe("Alice");
    expect(leaderboard.players[0].totalScore).toBeGreaterThan(leaderboard.players[1].totalScore);
    expect(leaderboard.players.find((p: any) => p.name === "Carol").totalScore).toBe(0);

    // Move to question 2.
    const q2 = quiz.questions[1];
    const correctChoiceQ2 = q2.choices.find((c: any) => c.isCorrect).id;
    const q2StartPromise = waitForEvent(alice, "question:start");
    const nextAck = await emitAsync(host, "host:next", { pin, token });
    expect(nextAck.ok).toBe(true);
    expect(nextAck.ok && nextAck.data.ended).toBe(false);
    await q2StartPromise;

    // Reusing a stale (previous) question id must be rejected.
    const stale = await emitAsync(alice, "student:answer", {
      pin,
      participantId: aliceId,
      questionId: q1.id,
      choiceId: correctChoiceQ1,
    });
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.code).toBe("STALE_QUESTION");

    // Submitting an invalid choice id is rejected.
    const invalidChoice = await emitAsync(bob, "student:answer", {
      pin,
      participantId: bobId,
      questionId: q2.id,
      choiceId: "not-a-real-choice",
    });
    expect(invalidChoice.ok).toBe(false);
    expect(!invalidChoice.ok && invalidChoice.code).toBe("INVALID_CHOICE");

    // Concurrent answers from multiple players at once must all resolve independently and correctly.
    const q2Reveal = waitForEvent(alice, "question:reveal");
    const [cAlice, cBob, cCarol, cDave] = await Promise.all([
      emitAsync(alice, "student:answer", { pin, participantId: aliceId, questionId: q2.id, choiceId: correctChoiceQ2 }),
      emitAsync(bob, "student:answer", { pin, participantId: bobId, questionId: q2.id, choiceId: correctChoiceQ2 }),
      emitAsync(carol, "student:answer", { pin, participantId: carolId, questionId: q2.id, choiceId: correctChoiceQ2 }),
      emitAsync(dave, "student:answer", { pin, participantId: daveId, questionId: q2.id, choiceId: correctChoiceQ2 }),
    ]);
    expect([cAlice, cBob, cCarol, cDave].every((r) => r.ok)).toBe(true);

    await q2Reveal;
    const finalBoardPromise = waitForEvent(alice, "leaderboard:update");
    await emitAsync(host, "host:show-leaderboard", { pin, token });
    await finalBoardPromise;

    const gameOverPromise = waitForEvent(alice, "game:over");
    const finalNext = await emitAsync(host, "host:next", { pin, token });
    expect(finalNext.ok).toBe(true);
    expect(finalNext.ok && finalNext.data.ended).toBe(true);
    const gameOver = await gameOverPromise;
    expect(gameOver.podium.length).toBeGreaterThan(0);
    expect(gameOver.ranking.length).toBe(4); // Alice, Bob, Carol, Dave

    // Verify results were persisted for teacher history/reporting.
    await new Promise((r) => setTimeout(r, 100));
    const persisted = await prisma.gameSession.findFirst({
      where: { pin },
      include: { participants: { orderBy: { rank: "asc" } } },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.participants.length).toBe(4);
    expect(persisted?.participants[0].rank).toBe(1);

    const historyRes = await request(baseUrl)
      .get("/api/sessions/history")
      .set("Authorization", `Bearer ${token}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.some((s: any) => s.pin === pin)).toBe(true);
  });

  it("preserves a student's score and position across a disconnect and reconnect", async () => {
    const { token, quiz, pin } = await setupGame(1, 3000);
    const host = await connectClient();
    await emitAsync(host, "host:join", { pin, token });
    const student = await connectClient();
    const join = await emitAsync(student, "student:join", { pin, name: "Ephemeral" });
    expect(join.ok).toBe(true);
    const participantId = join.ok ? join.data.participantId : "";
    const joinToken = join.ok ? join.data.joinToken : "";

    await emitAsync(host, "host:start-question", { pin, token });
    const q = quiz.questions[0];
    const correctChoice = q.choices.find((c: any) => c.isCorrect).id;
    const answer = await emitAsync(student, "student:answer", {
      pin,
      participantId,
      questionId: q.id,
      choiceId: correctChoice,
    });
    expect(answer.ok).toBe(true);
    const scoreBefore = answer.ok ? answer.data.totalScore : -1;

    student.disconnect();
    await new Promise((r) => setTimeout(r, 50));
    const session = gameManager.getByPin(pin);
    expect(session?.participants.get(participantId)?.connected).toBe(false);
    expect(session?.participants.get(participantId)?.totalScore).toBe(scoreBefore);

    const reconnected = await connectClient();
    const rejoin = await emitAsync(reconnected, "student:rejoin", { pin, participantId, joinToken });
    expect(rejoin.ok).toBe(true);
    expect(rejoin.ok && rejoin.data.phase).toBe("question");
    expect(session?.participants.get(participantId)?.connected).toBe(true);

    await emitAsync(host, "host:end-game", { pin, token });
    expect(session?.participants.get(participantId)?.totalScore).toBe(scoreBefore);
  });

  it("keeps the session alive across a host disconnect and lets the host resume control", async () => {
    const { token, pin } = await setupGame(1, 5000);
    const host = await connectClient();
    await emitAsync(host, "host:join", { pin, token });
    const student = await connectClient();
    await emitAsync(student, "student:join", { pin, name: "Witness" });

    const disconnectedNotice = waitForEvent(student, "host:disconnected");
    host.disconnect();
    await disconnectedNotice;

    const newHostSocket = await connectClient();
    const rejoinAck = await emitAsync(newHostSocket, "host:join", { pin, token });
    expect(rejoinAck.ok).toBe(true);

    const startAck = await emitAsync(newHostSocket, "host:start-question", { pin, token });
    expect(startAck.ok).toBe(true);
  });

  it("rejects host actions from a token that does not own the session", async () => {
    const { pin } = await setupGame(1, 5000);
    const email = `${randomUUID()}@example.com`;
    const reg = await request(baseUrl)
      .post("/api/auth/register")
      .send({ name: "Intruder", email, password: "supersecret1" });
    const intruderToken = reg.body.token as string;
    const intruderSocket = await connectClient();
    const res = await emitAsync(intruderSocket, "host:join", { pin, token: intruderToken });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.code).toBe("FORBIDDEN");
  });
});
