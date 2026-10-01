/**
 * Document Embedder
 * Generates vector embeddings using gemini-embedding-001
 * Uses GeminiKeyManager for key rotation
 * Batch size: max 100 texts per API call
 */

import { getAIProvider } from "@/lib/ai/ai-provider.factory";

const BATCH_SIZE = 100;

export type EmbeddingBatch = {
  texts: string[];
  vectors: number[][];
};

/**
 * Generate embeddings for an array of texts
 * Automatically batches into groups of 100
 */
export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const ai = getAIProvider();
  const allVectors: number[][] = [];

  // Process in batches of 100
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    console.log(
      `[Embedder] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/` +
        `${Math.ceil(texts.length / BATCH_SIZE)} (${batch.length} texts)`,
    );

    const result = await ai.embed(batch, taskType);
    allVectors.push(...result.vectors);
  }

  return allVectors;
}
