import { expect, test } from "@playwright/test";

test("teacher and student complete a full live quiz flow", async ({ browser }) => {
  const teacherContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  const student = await studentContext.newPage();

  const quizTitle = `E2E Geography ${Date.now()}`;
  const teacherEmail = `teacher-${Date.now()}@example.com`;
  const studentName = "Student E2E";

  await teacher.goto("/");
  await expect(teacher.getByRole("heading", { name: "QuizArena" })).toBeVisible();

  await teacher.goto("/register");
  await teacher.getByLabel("Name").fill("E2E Teacher");
  await teacher.getByLabel("Email").fill(teacherEmail);
  await teacher.getByLabel("Password").fill("StrongPass123!");
  await teacher.getByRole("button", { name: "Create account" }).click();

  await expect(teacher).toHaveURL(/\/dashboard$/);
  await expect(teacher.getByRole("heading", { name: "My quizzes" })).toBeVisible();

  await teacher.getByRole("link", { name: /Create a quiz|New quiz/ }).first().click();
  await expect(teacher.getByRole("heading", { name: "New quiz" })).toBeVisible();

  await teacher.getByLabel("Title").fill(quizTitle);
  await teacher.getByLabel("Question text").fill("What is the capital of France?");
  await teacher.getByPlaceholder("Choice 1").fill("Paris");
  await teacher.getByPlaceholder("Choice 2").fill("London");
  await teacher.getByRole("button", { name: "Save quiz" }).click();

  await expect(teacher).toHaveURL(/\/dashboard$/);
  await expect(teacher.getByRole("heading", { name: quizTitle })).toBeVisible();
  await teacher.getByRole("button", { name: "Start" }).click();

  await expect(teacher).toHaveURL(/\/host\/\d{6}$/);
  const pinMatch = teacher.url().match(/\/host\/(\d{6})$/);
  expect(pinMatch).not.toBeNull();
  const pin = pinMatch![1];
  await expect(teacher.getByText(pin, { exact: true })).toBeVisible();

  await student.goto(`/join?pin=${pin}`);
  await student.getByRole("button", { name: "Next" }).click();
  await student.getByLabel("Your name").fill(studentName);
  await student.getByRole("button", { name: "Join game" }).click();

  await expect(student).toHaveURL(new RegExp(`/play/${pin}$`));
  await expect(student.getByText(new RegExp(`You're in, ${studentName}!`))).toBeVisible();
  await expect(teacher.getByText(studentName, { exact: true })).toBeVisible();

  await teacher.getByRole("button", { name: "Start game" }).click();

  await expect(student.getByRole("heading", { name: "What is the capital of France?" })).toBeVisible();
  await student.getByRole("button", { name: /Paris/ }).click();

  await expect(student.getByText("Answer locked in!", { exact: true })).toBeVisible();
  await expect(teacher.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(student.getByText("Correct!", { exact: true })).toBeVisible();

  await teacher.getByRole("button", { name: "Show leaderboard" }).click();
  await expect(teacher.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
  await expect(student.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
  await expect(teacher.getByText(new RegExp(`#1 ${studentName}`))).toBeVisible();

  await teacher.getByRole("button", { name: "End game & show podium" }).click();
  await expect(teacher.getByRole("heading", { name: "Final results" })).toBeVisible();
  await expect(student.getByRole("heading", { name: "Game over!" })).toBeVisible();
  await expect(student.getByText(studentName, { exact: true }).first()).toBeVisible();

  await teacherContext.close();
  await studentContext.close();
});
