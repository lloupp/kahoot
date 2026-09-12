import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export const choiceSchema = z.object({
  text: z.string().trim().min(1, "Choice text is required").max(300),
  isCorrect: z.boolean(),
});

export const questionSchema = z.object({
  text: z.string().trim().min(1, "Question text is required").max(500),
  imageUrl: z.string().trim().url().max(2000).optional().or(z.literal("")).optional(),
  timeLimitMs: z.number().int().min(2000).max(120000).default(20000),
  points: z.number().int().min(0).max(10000).default(1000),
  choices: z
    .array(choiceSchema)
    .min(2, "At least 2 choices are required")
    .max(6, "At most 6 choices are allowed")
    .refine((choices) => choices.filter((c) => c.isCorrect).length === 1, {
      message: "Exactly one choice must be marked correct",
    }),
});

export const quizSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  subject: z.string().trim().max(100).optional().or(z.literal("")).optional(),
  description: z.string().trim().max(1000).optional().or(z.literal("")).optional(),
  questions: z.array(questionSchema).max(100).default([]),
});

export type QuizInput = z.infer<typeof quizSchema>;
