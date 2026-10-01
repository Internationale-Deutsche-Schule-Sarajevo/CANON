/**
 * C-8 read-only check — confirms empirically that match_chunks() RPC's
 * "content" column is document_chunks.text (not handbook_chapters.content),
 * by calling the RPC with a real chunk's own stored embedding as the query
 * vector (should self-match at similarity ~1.0) and diffing the returned
 * text against a direct document_chunks select for the same id.
 * No writes.
 *
 * Run: npx tsx --env-file=.env scripts/c8-check-retriever-source.ts
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

async function main() {
  const supabase = createSupabaseDirectAdmin();

  const { data: sample, error: sampleErr } = await supabase
    .from("document_chunks")
    .select("id, document_id, text, embedding")
    .eq("document_status", "active")
    .not("embedding", "is", null)
    .limit(1)
    .single();
  if (sampleErr) throw new Error(`sample fetch failed: ${sampleErr.message}`);

  console.log(`[C8] Sample chunk id=${sample.id} document_id=${sample.document_id}`);
  console.log(`[C8] document_chunks.text (first 200 chars): ${sample.text.slice(0, 200)}`);

  const { data: rpcResult, error: rpcErr } = await supabase.rpc("match_chunks", {
    query_embedding: sample.embedding,
    match_threshold: 0.0,
    match_count: 3,
  });
  if (rpcErr) throw new Error(`match_chunks RPC failed: ${rpcErr.message}`);

  console.log(`\n[C8] match_chunks() returned ${rpcResult?.length ?? 0} row(s). Columns on row 0:`);
  console.log(JSON.stringify(rpcResult?.[0], null, 2));

  const self = (rpcResult ?? []).find((r: { id: string }) => r.id === sample.id);
  console.log(`\n[C8] Self-match found: ${!!self}`);
  if (self) {
    console.log(`[C8] self.similarity=${self.similarity}`);
    console.log(`[C8] self.content === document_chunks.text ? ${self.content === sample.text}`);
    console.log(`[C8] self.content (first 200 chars): ${String(self.content).slice(0, 200)}`);
  }
}

main().catch((err) => {
  console.error("[C8] Fatal:", err);
  process.exitCode = 1;
});
