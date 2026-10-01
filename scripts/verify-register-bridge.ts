import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";

const QUERY = "Koja pravila vrijede u učionici za razrede I-IV?";
const CHUNK_ID = "b4a226a0-4bf8-4595-aa57-57a470ad24ef";

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const { data: chunk, error } = await supabase
    .from("document_chunks")
    .select("id, search_text_bs, search_text_bs_declarative, search_register_bridge_at, embedding")
    .eq("id", CHUNK_ID)
    .single();
  if (error || !chunk) throw new Error(`fetch failed: ${error?.message}`);

  console.log(`search_register_bridge_at: ${chunk.search_register_bridge_at}`);
  console.log(`search_text_bs_declarative: ${chunk.search_text_bs_declarative}`);

  const stored = chunk.embedding as unknown;
  const storedVec: number[] = typeof stored === "string" ? JSON.parse(stored) : (stored as number[]);
  const [qEmb] = await embedTextsLocal([QUERY]);
  console.log(`\nDirect cosine (query vs CURRENT stored embedding): ${cosine(qEmb, storedVec).toFixed(4)}`);

  const combined = `${chunk.search_text_bs}\n\n${chunk.search_text_bs_declarative}`;
  const [freshCombinedVec] = await embedTextsLocal([combined]);
  console.log(`Sanity — cosine(stored, fresh-recompute-of-combined-text): ${cosine(storedVec, freshCombinedVec).toFixed(6)}`);
  console.log(`Direct cosine (query vs FRESH combined embedding): ${cosine(qEmb, freshCombinedVec).toFixed(4)}`);

  const [declarativeOnlyVec] = await embedTextsLocal([chunk.search_text_bs_declarative ?? ""]);
  console.log(`Direct cosine (query vs declarative-ONLY embedding, for comparison): ${cosine(qEmb, declarativeOnlyVec).toFixed(4)}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
