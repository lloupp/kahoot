import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

const app = createApp();

function uniqueEmail() {
  return `${randomUUID()}@example.com`;
}

async function registerTeacher() {
  const email = uniqueEmail();
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Teacher", email, password: "supersecret1" });
  return res.body.token as string;
}

const validQuiz = {
  title: "Capitals of the World",
  subject: "Geography",
  questions: [
    {
      text: "What is the capital of France?",
      timeLimitMs: 20000,
      points: 1000,
      choices: [
        { text: "Paris", isCorrect: true },
        { text: "Lyon", isCorrect: false },
        { text: "Marseille", isCorrect: false },
      ],
    },
  ],
};

describe("quizzes", () => {
  let token: string;

  beforeAll(async () => {
    token = await registerTeacher();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/quizzes");
    expect(res.status).toBe(401);
  });

  it("creates a quiz with questions and choices", async () => {
    const res = await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${token}`)
      .send(validQuiz);
    expect(res.status).toBe(201);
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0].choices).toHaveLength(3);
  });

  it("rejects a question with no correct choice", async () => {
    const bad = {
      ...validQuiz,
      questions: [{ ...validQuiz.questions[0], choices: validQuiz.questions[0].choices.map((c) => ({ ...c, isCorrect: false })) }],
    };
    const res = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${token}`).send(bad);
    expect(res.status).toBe(400);
  });

  it("rejects a question with only one choice", async () => {
    const bad = {
      ...validQuiz,
      questions: [{ ...validQuiz.questions[0], choices: [{ text: "Only one", isCorrect: true }] }],
    };
    const res = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${token}`).send(bad);
    expect(res.status).toBe(400);
  });

  it("lists only the current teacher's quizzes", async () => {
    const otherToken = await registerTeacher();
    await request(app).post("/api/quizzes").set("Authorization", `Bearer ${token}`).send(validQuiz);
    const res = await request(app).get("/api/quizzes").set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("prevents a teacher from reading another teacher's quiz", async () => {
    const created = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${token}`).send(validQuiz);
    const otherToken = await registerTeacher();
    const res = await request(app)
      .get(`/api/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("prevents a teacher from deleting another teacher's quiz", async () => {
    const created = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${token}`).send(validQuiz);
    const otherToken = await registerTeacher();
    const res = await request(app)
      .delete(`/api/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("updates a quiz, replacing its questions", async () => {
    const created = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${token}`).send(validQuiz);
    const updated = { ...validQuiz, title: "Updated title", questions: [] };
    const res = await request(app)
      .put(`/api/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send(updated);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated title");
    expect(res.body.questions).toHaveLength(0);
  });

  it("duplicates a quiz", async () => {
    const created = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${token}`).send(validQuiz);
    const res = await request(app)
      .post(`/api/quizzes/${created.body.id}/duplicate`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(created.body.id);
    expect(res.body.title).toContain("copy");
    expect(res.body.questions).toHaveLength(1);
  });

  it("deletes a quiz", async () => {
    const created = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${token}`).send(validQuiz);
    const del = await request(app).delete(`/api/quizzes/${created.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);
    const get = await request(app).get(`/api/quizzes/${created.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(404);
  });
});
