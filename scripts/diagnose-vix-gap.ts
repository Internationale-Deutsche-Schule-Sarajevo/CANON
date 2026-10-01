import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";

const SIMILARITY_THRESHOLD = 0.6;
const TOP_K = 5;
const ELABORAT_DOCUMENT_ID = "cbd20e73-4ea8-4f3a-a816-ee8131e3c479";
const VIX_DOC_ID = "df4efaf7-12f3-488b-87fb-b51e3ccc3dc1";
const IIV_DOC_ID = "c1a0b320-8f97-4822-a4ea-f1386824bfb6";

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const supabase = createSupabaseDirectAdmin();

  const { data: iivChunks } = await supabase.from("document_chunks").select("id, chunk_index").eq("document_id", IIV_DOC_ID);
  const { data: vixChunks } = await supabase.from("document_chunks").select("id, chunk_index").eq("document_id", VIX_DOC_ID);
  console.log("I-IV doc chunk count:", iivChunks?.length, iivChunks?.map(c=>c.chunk_index));
  console.log("V-IX doc chunk count:", vixChunks?.length, vixChunks?.map(c=>c.chunk_index));

  const query = "Koja pravila vrijede u učionici za razrede V-IX?";
  const [queryEmbedding] = await embedTextsLocal([query]);

  const { data: semanticResults } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding, match_threshold: SIMILARITY_THRESHOLD, match_count: TOP_K * 2,
  });
  const chunkMap = new Map();
  for (const row of semanticResults ?? []) chunkMap.set(row.id, { similarity: row.similarity * 0.7, documentId: row.document_id });
  const sorted = Array.from(chunkMap.values()).sort((a, b) => b.similarity - a.similarity);
  console.log("5th place cutoff blended:", sorted[TOP_K - 1]?.similarity.toFixed(4));

  for (const ch of vixChunks ?? []) {
    const { data: full } = await supabase.from("document_chunks").select("embedding").eq("id", ch.id).single();
    const vec = typeof full.embedding === "string" ? JSON.parse(full.embedding) : full.embedding;
    const raw = cosine(queryEmbedding, vec);
    console.log(`V-IX chunk ${ch.chunk_index} (${ch.id}) raw=${raw.toFixed(4)} blended(no boost)=${(raw*0.7).toFixed(4)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
