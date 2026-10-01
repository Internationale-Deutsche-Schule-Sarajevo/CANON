/**
 * Quiz Engine — Zod validation schemas
 * Sprint 12: question generation output validation + answer submission input validation
 */

import { z } from "zod";

/**
 * One AI-generated quiz question, validated individually so a single
 * malformed item can be skipped without failing the whole generation batch.
 */
export const QuizQuestionSchema = z.object({
  question: z.string().min(1, "Pitanje ne smije biti prazno"),
  options: z.array(z.string().min(1)).length(4, "Mora postojati tačno 4 opcije"),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1, "Objašnjenje ne smije biti prazno"),
});

export type QuizQuestionGenerated = z.infer<typeof QuizQuestionSchema>;

export const SubmitAnswerSchema = z.object({
  questionId: z.string().uuid("Neispravan ID pitanja"),
  selectedIndex: z.number().int().min(0).max(3),
});

export const SubmitQuizAnswersSchema = z.object({
  chapterId: z.string().uuid("Neispravan ID poglavlja"),
  answers: z.array(SubmitAnswerSchema).min(1).max(5),
});

export type SubmitAnswerInput = z.infer<typeof SubmitAnswerSchema>;
export type SubmitQuizAnswersInput = z.infer<typeof SubmitQuizAnswersSchema>;
