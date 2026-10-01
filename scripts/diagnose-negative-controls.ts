import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";

const SIMILARITY_THRESHOLD = 0.6;
const TOP_K = 5;
const IIV_CHUNK_ID = "b4a226a0-4bf8-4595-aa57-57a470ad24ef";
const BOOST = 0.05;

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const QUERIES = [
  "Koliko iznosi školarina za razred I-IV?",
  "Kakav je raspored časova za razred I-IV?",
  "Koja je procedura upisa učenika u razred I-IV?",
];

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const { data: chunk } = await supabase.from("document_chunks").select("embedding").eq("id", IIV_CHUNK_ID).single();
  const storedVec = typeof chunk.embedding === "string" ? JSON.parse(chunk.embedding) : chunk.embedding;

  for (const query of QUERIES) {
    console.log(`\n=== "${query}" ===`);
    const [queryEmbedding] = await embedTextsLocal([query]);
    const raw = cosine(queryEmbedding, storedVec);
    const boosted = raw * 0.7 + BOOST;

    const { data: semanticResults } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding, match_threshold: SIMILARITY_THRESHOLD, match_count: TOP_K * 2,
    });
    const sorted = (semanticResults ?? []).map(r => r.similarity * 0.7).sort((a,b)=>b-a);
    const cutoff = sorted[TOP_K - 1] ?? 0;
    console.log(`I-IV chunk raw cosine: ${raw.toFixed(4)}, boosted blended: ${boosted.toFixed(4)}`);
    console.log(`Current top-5 cutoff (no boost): ${cutoff.toFixed(4)} (pool size ${sorted.length})`);
    console.log(`Would boosted I-IV chunk false-positive into top-5? ${boosted > cutoff ? "YES -- PROBLEM" : "no, stays out"}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
