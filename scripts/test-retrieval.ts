/**
 * Sprint 16 verification — proves retrieveChunks() no longer hits the
 * pgvector dimension mismatch (query was 3072-dim via gemini-embedding-001,
 * column is vector(768)) and returns real results for a Bosnian query.
 * Throwaway script — not part of the on-approval/query pipeline.
 *
 * Run (Windows CMD):
 *   npx tsx --env-file=.env scripts\test-retrieval.ts
 */

import { retrieveChunks } from "../src/lib/rag/retriever";

async function main() {
  const query = "Koja su prava učenika sa poteškoćama u razvoju?";
  console.log(`[Test] Query: "${query}"`);

  const result = await retrieveChunks(query);
  console.log(`[Test] Confidence: ${result.confidence}`);
  console.log(`[Test] Chunks returned: ${result.chunks.length}`);
  console.log(`[Test] Query embedding dim: ${result.queryEmbedding.length}`);

  for (const chunk of result.chunks) {
    console.log(
      `  - [${chunk.source}] sim=${chunk.similarity.toFixed(3)} doc=${chunk.documentId} :: ${chunk.text.slice(0, 100).replace(/\n/g, " ")}...`,
    );
  }
}

main().catch((err) => {
  console.error("[Test] Fatal:", err);
  process.exitCode = 1;
});
