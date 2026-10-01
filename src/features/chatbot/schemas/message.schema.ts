/**
 * Chatbot — Zod validation schema
 * O-8 step 1: "Validate message (not empty, max 2,000 chars)"
 */

import { z } from "zod";

export const ChatMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Poruka ne može biti prazna.")
    .max(2000, "Poruka ne smije prelaziti 2000 znakova."),
});

export type ChatMessageInput = z.infer<typeof ChatMessageSchema>;
