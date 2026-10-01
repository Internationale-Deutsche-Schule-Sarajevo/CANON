/**
 * Handbook Reader — Zod validation schemas
 * Sprint 11: Handbook Reader with locked progression
 */

import { z } from "zod";

export const ChapterIdParamSchema = z.object({
  chapterId: z.string().uuid("Neispravan ID poglavlja"),
});

export type ChapterIdParam = z.infer<typeof ChapterIdParamSchema>;
