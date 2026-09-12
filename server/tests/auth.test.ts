import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

const app = createApp();

function uniqueEmail() {
  return `${randomUUID()}@example.com`;
}

describe("auth", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("registers a new teacher and returns a token", async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada Lovelace", email, password: "supersecret1" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.email).toBe(email);
  });

  it("rejects registration with a weak password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada", email: uniqueEmail(), password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate email registration", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ name: "Ada", email, password: "supersecret1" });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada 2", email, password: "supersecret1" });
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ name: "Ada", email, password: "supersecret1" });
    const res = await request(app).post("/api/auth/login").send({ email, password: "supersecret1" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
  });

  it("rejects login with wrong password", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ name: "Ada", email, password: "supersecret1" });
    const res = await request(app).post("/api/auth/login").send({ email, password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  it("never returns the password hash", async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada", email, password: "supersecret1" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});
