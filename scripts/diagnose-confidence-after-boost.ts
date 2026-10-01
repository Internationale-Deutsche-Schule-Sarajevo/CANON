import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";

const SIMILARITY_THRESHOLD = 0.6;
const CONFIDENCE_THRESHOLD = 0.75;
const TOP_K = 5;
const GRADE_LEVEL_BOOST = 0.05;
const ELABORAT_DOCUMENT_ID = "cbd20e73-4ea8-4f3a-a816-ee8131e3c479";
const IIV_CHUNK_ID = "b4a226a0-4bf8-4595-aa57-57a470ad24ef";
const VIX_CHUNK_ID = "0dc593d8-21a7-4a0e-a3ad-01c7be9c3864";

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb));
}

async function simulate(query, boostChunkId) {
  const supabase = createSupabaseDirectAdmin();
  const [queryEmbedding] = await embedTextsLocal([query]);

  const { data: semanticResults } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding, match_threshold: SIMILARITY_THRESHOLD, match_count: TOP_K * 2,
  });
  const { data: ftsResults } = await supabase.from("document_chunks").select("id, document_id, text")
    .eq("document_status", "active")
    .textSearch("text", query.split(" ").join(" | "), { type: "plain", config: "simple" })
    .limit(TOP_K * 2);

  const chunkMap = new Map();
  for (const row of semanticResults ?? []) {
    chunkMap.set(row.id, { id: row.id, documentId: row.document_id, similarity: row.similarity * 0.7, raw: row.similarity, source: "semantic" });
  }
  for (const row of ftsResults ?? []) {
    if (chunkMap.has(row.id)) { const e = chunkMap.get(row.id); e.similarity += 0.3; e.source = "both"; }
    else chunkMap.set(row.id, { id: row.id, documentId: row.document_id, similarity: 0.3, raw: null, source: "fulltext" });
  }

  // simulate the grade-boost path adding the target chunk
  const { data: boostChunk } = await supabase.from("document_chunks").select("id, document_id, embedding").eq("id", boostChunkId).single();
  const vec = typeof boostChunk.embedding === "string" ? JSON.parse(boostChunk.embedding) : boostChunk.embedding;
  const raw = cosine(queryEmbedding, vec);
  if (raw >= SIMILARITY_THRESHOLD) {
    if (chunkMap.has(boostChunkId)) chunkMap.get(boostChunkId).similarity += GRADE_LEVEL_BOOST;
    else chunkMap.set(boostChunkId, { id: boostChunkId, documentId: boostChunk.document_id, similarity: raw * 0.7 + GRADE_LEVEL_BOOST, raw, source: "semantic" });
  }

  const chunks = Array.from(chunkMap.values()).sort((a, b) => {
    const aE = a.documentId === ELABORAT_DOCUMENT_ID, bE = b.documentId === ELABORAT_DOCUMENT_ID;
    if (aE !== bE) return aE ? -1 : 1;
    return b.similarity - a.similarity;
  }).slice(0, TOP_K);

  console.log(`\n=== "${query}" (AFTER boost simulated) ===`);
  chunks.forEach((c, i) => console.log(`${i+1}. blended=${c.similarity.toFixed(4)} raw=${c.raw?.toFixed(4) ?? "null"} ${c.id === boostChunkId ? "<<< BOOSTED TARGET" : ""}`));
  const maxRaw = Math.max(0, ...chunks.map(c => c.raw ?? 0));
  const confidence = maxRaw >= CONFIDENCE_THRESHOLD ? "HIGH" : "LOW";
  console.log(`maxRawSimilarity across final top-${TOP_K}: ${maxRaw.toFixed(4)} -> confidence = ${confidence}`);
}

async function main() {
  await simulate("Koja pravila vrijede u učionici za razrede I-IV?", IIV_CHUNK_ID);
  await simulate("Koja pravila vrijede u učionici za razrede V-IX?", VIX_CHUNK_ID);
}
main().catch(e => { console.error(e); process.exit(1); });
