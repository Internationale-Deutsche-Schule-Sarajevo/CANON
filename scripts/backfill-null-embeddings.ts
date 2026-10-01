/**
 * One-off backfill — Sprint 16 (embedding-space unification).
 *
 * Fills in document_chunks.embedding for chunks left NULL before the
 * on-approval embedding step existed (review-pipeline.ts). As of
 * 2026-08-05 that is exactly 19 chunks, all belonging to one already-active
 * document (IDSS_Strategija_2026-2029.docx) that was approved before this
 * fix landed, so the new on-approval hook never ran for it.
 *
 * Uses the exact same repository functions and local embedder the
 * on-approval path uses — not a separate one-off implementation — so a
 * chunk backfilled here is indistinguishable from one embedded normally.
 *
 * Run (Windows CMD):
 *   npx tsx --env-file=.env scripts\backfill-null-embeddings.ts
 */

import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import {
  getChunksNeedingEmbedding,
  updateChunkEmbeddings,
} from "../src/features/documents/upload-repository";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const { data: docs, error } = await supabase
    .from("document_chunks")
    .select("document_id")
    .is("embedding", null);

  if (error) throw new Error(`Query failed: ${error.message}`);

  const documentIds = Array.from(new Set((docs ?? []).map((d) => d.document_id)));
  console.log(`[Backfill] ${documentIds.length} document(s) with NULL-embedding chunks.`);

  let totalEmbedded = 0;
  for (const documentId of documentIds) {
    const pending = await getChunksNeedingEmbedding(documentId);
    if (pending.length === 0) continue;

    console.log(`[Backfill] ${documentId}: embedding ${pending.length} chunk(s)...`);
    const vectors = await embedTextsLocal(pending.map((c) => c.text));
    await updateChunkEmbeddings(
      pending.map((chunk, i) => ({ id: chunk.id, embedding: vectors[i] })),
    );
    totalEmbedded += pending.length;
    console.log(`[Backfill] ${documentId}: done.`);
  }

  console.log(`[Backfill] Complete: ${totalEmbedded} chunk(s) embedded.`);
}

main().catch((err) => {
  console.error("[Backfill] Fatal:", err);
  process.exitCode = 1;
});
