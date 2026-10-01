/**
 * Chatbot Pipeline — IDSS Asistent
 * Implements CONSTITUTION.md O-8's 10-step pipeline end to end:
 * 1. Validate message      -> done by the caller (schemas/message.schema.ts) before this runs
 * 2. Rate limit             -> checkChatbotRateLimit()
 * 3. Embed query            -> retrieveChunks() (local 768-dim model, Sprint 16)
 * 4. Hybrid retrieval       -> retrieveChunks()
 * 5. Top 5 above cosine 0.6 -> retrieveChunks() (SIMILARITY_THRESHOLD)
 * 6. Confidence gate        -> retrieveChunks() returns raw-cosine-based confidence
 * 7. LOW  -> exact refusal, no Gemini call
 * 8. HIGH -> generate with the exact P-7 system prompt, max_tokens 1024, temp 0.3
 * 9. Store turn             -> repository.insertTurn()
 * 10. Return response       -> sendChatMessage()'s return value
 *
 * Uses the existing AI provider layer (getAIProvider().generate() ->
 * GeminiKeyManager) — no separate client, same as every other AI call site.
 */

import { getAIProvider } from "@/lib/ai/ai-provider.factory";
import { retrieveChunks, type RetrievedChunk } from "@/lib/rag/retriever";
import { checkChatbotRateLimit } from "./rate-limit";
import {
  getOrCreateConversation,
  insertTurn,
  resolveChapterSources,
  type ChapterSource,
} from "./repository";

// P-7 (CONSTITUTION.md) — exact text, do not modify.
const SYSTEM_PROMPT_TEMPLATE =
  `Ti si IDSS Asistent, profesionalni institucionalni asistent za nastavnike i zaposlenike\n` +
  `P.U. Internationale Deutsche Schule Sarajevo.\n\n` +
  `Odgovaraš isključivo na bosanskom jeziku, bez iznimke.\n` +
  `Tvoji odgovori su precizni, profesionalni i direktni.\n` +
  `Nikada ne koristiš fraze poput "naravno", "svakako", "sjajno pitanje", "razumijem" ili slične.\n\n` +
  `Sve informacije moraju biti zasnovane isključivo na dokumentima USTAV-a:\n` +
  `[CONTEXT: {retrieved_chunks}]\n\n` +
  `Ako informacija nije direktno podržana dokumentima, ne izmišljaj. Uputi korisnika direktoru.`;

// P-7 — exact refusal text, do not modify.
const REFUSAL_MESSAGE =
  `Za ovo pitanje nemam dovoljno pouzdanih informacija iz internih dokumenata škole.\n` +
  `Molim Vas da se obratite direktoru škole.`;

export class ChatbotRateLimitError extends Error {
  constructor(public resetAtMs: number) {
    super("Rate limit exceeded: max 20 messages per hour.");
    this.name = "ChatbotRateLimitError";
  }
}

export type SendMessageResult = {
  turnId: string;
  response: string;
  confidence: "HIGH" | "LOW";
  sources: ChapterSource[];
};

function buildSystemPrompt(chunks: RetrievedChunk[]): string {
  const context = chunks.map((c) => c.text).join("\n\n---\n\n");
  return SYSTEM_PROMPT_TEMPLATE.replace("{retrieved_chunks}", context);
}

/** Distinct, ordered chapter sources for the chunks actually used in an answer. */
async function resolveSources(chunks: RetrievedChunk[]): Promise<ChapterSource[]> {
  const documentIds = Array.from(new Set(chunks.map((c) => c.documentId)));
  return resolveChapterSources(documentIds);
}

export async function sendChatMessage(
  userId: string,
  message: string,
): Promise<SendMessageResult> {
  // Step 2: rate limit
  const rateLimit = await checkChatbotRateLimit(userId);
  if (!rateLimit.allowed) {
    throw new ChatbotRateLimitError(rateLimit.resetAtMs);
  }

  // Steps 3-6: embed + hybrid retrieval + threshold + confidence
  const retrieval = await retrieveChunks(message);
  const conversationId = await getOrCreateConversation(userId);

  const chunkIds = retrieval.chunks.map((c) => c.id);
  const similarityScores = retrieval.chunks.map((c) => c.similarity);

  // Step 7: LOW confidence — exact refusal, no Gemini call
  if (retrieval.confidence === "LOW") {
    console.log(`[ChatbotPipeline] LOW confidence — refusing without a generation call. userId=${userId}`);
    const turnId = await insertTurn({
      conversationId,
      userMessage: message,
      response: REFUSAL_MESSAGE,
      confidence: "LOW",
      chunkIds,
      similarityScores,
      keyIndexUsed: null,
      tokensUsed: null,
    });
    return { turnId, response: REFUSAL_MESSAGE, confidence: "LOW", sources: [] };
  }

  // Step 8: HIGH confidence — generate, grounded exclusively in retrieved chunks
  const ai = getAIProvider();
  const systemPrompt = buildSystemPrompt(retrieval.chunks);
  const result = await ai.generate(message, systemPrompt, {
    maxTokens: 1024,
    temperature: 0.3,
    language: "bs",
  });

  const sources = await resolveSources(retrieval.chunks);

  // Step 9: store turn
  const turnId = await insertTurn({
    conversationId,
    userMessage: message,
    response: result.text,
    confidence: "HIGH",
    chunkIds,
    similarityScores,
    keyIndexUsed: result.keyIndexUsed,
    tokensUsed: result.tokensUsed,
  });

  // Step 10: return
  return { turnId, response: result.text, confidence: "HIGH", sources };
}
