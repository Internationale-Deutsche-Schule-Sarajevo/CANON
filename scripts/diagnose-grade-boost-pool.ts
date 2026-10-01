import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";

const SIMILARITY_THRESHOLD = 0.6;
const TOP_K = 5;
const TARGET_CHUNK_ID = "b4a226a0-4bf8-4595-aa57-57a470ad24ef";

const QUERIES = [
  "Koja pravila vrijede u učionici za razrede I-IV?",         // confirmed positive
  "Koliko iznosi školarina za razred I-IV?",                    // should NOT hit Pravila_Ucionice
  "Kakav je raspored časova za razred I-IV?",                   // should NOT hit Pravila_Ucionice
  "Koja pravila vrijede u učionici za razrede V-IX?",           // positive for the OTHER doc
];

async function main() {
  const supabase = createSupabaseDirectAdmin();
  for (const query of QUERIES) {
    console.log(`\n\n===== QUERY: "${query}" =====`);
    const [queryEmbedding] = await embedTextsLocal([query]);
    const { data: semanticResults, error } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: TOP_K * 2,
    });
    if (error) { console.log("error:", error.message); continue; }
    const docIds = [...new Set((semanticResults ?? []).map((r) => r.document_id))];
    const { data: docs } = await supabase.from("documents").select("id, filename").in("id", docIds);
    const filenameById = new Map((docs ?? []).map((d) => [d.id, d.filename]));
    const ranked = (semanticResults ?? [])
      .map((r) => ({ ...r, filename: filenameById.get(r.document_id), blended: r.similarity * 0.7 }))
      .sort((a, b) => b.similarity - a.similarity);
    ranked.forEach((r, i) => {
      const marker = r.id === TARGET_CHUNK_ID ? "  <<< TARGET I-IV CHUNK" : "";
      console.log(`${i + 1}. raw=${r.similarity.toFixed(4)} blended=${r.blended.toFixed(4)} doc=${r.filename ?? r.document_id}${marker}`);
    });
    const targetInPool = ranked.findIndex((r) => r.id === TARGET_CHUNK_ID);
    console.log(`Target chunk rank in ${ranked.length}-pool: ${targetInPool === -1 ? "NOT IN POOL (below threshold)" : targetInPool + 1}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
