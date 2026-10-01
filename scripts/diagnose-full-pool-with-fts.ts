import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";
import { stripFrontmatter } from "../src/lib/rag/frontmatter";

const SIMILARITY_THRESHOLD = 0.6;
const TOP_K = 5;
const ELABORAT_DOCUMENT_ID = "cbd20e73-4ea8-4f3a-a816-ee8131e3c479";
const TARGET_CHUNK_ID = "b4a226a0-4bf8-4595-aa57-57a470ad24ef";

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const query = "Koja pravila vrijede u učionici za razrede I-IV?";
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
    if (chunkMap.has(row.id)) {
      const e = chunkMap.get(row.id); e.similarity += 0.3; e.source = "both";
    } else {
      chunkMap.set(row.id, { id: row.id, documentId: row.document_id, similarity: 0.3, raw: null, source: "fulltext" });
    }
  }

  // manually add the target chunk (bypassing match_chunks LIMIT) to see its computed cosine + where it'd land
  const { data: targetChunk } = await supabase.from("document_chunks").select("id, document_id, embedding").eq("id", TARGET_CHUNK_ID).single();
  const storedVec = typeof targetChunk.embedding === "string" ? JSON.parse(targetChunk.embedding) : targetChunk.embedding;
  const targetRaw = cosine(queryEmbedding, storedVec);
  console.log(`Target chunk fresh raw cosine: ${targetRaw.toFixed(4)} (in fulltext pool already? ${chunkMap.has(TARGET_CHUNK_ID)})`);

  const docIds = [...new Set(Array.from(chunkMap.values()).map((c) => c.documentId))];
  const { data: docs } = await supabase.from("documents").select("id, filename").in("id", docIds);
  const filenameById = new Map((docs ?? []).map((d) => [d.id, d.filename]));

  const chunks = Array.from(chunkMap.values()).sort((a, b) => {
    const aE = a.documentId === ELABORAT_DOCUMENT_ID, bE = b.documentId === ELABORAT_DOCUMENT_ID;
    if (aE !== bE) return aE ? -1 : 1;
    return b.similarity - a.similarity;
  });
  chunks.forEach((c, i) => {
    console.log(`${i + 1}. blended=${c.similarity.toFixed(4)} raw=${c.raw?.toFixed(4) ?? "null"} source=${c.source} doc=${filenameById.get(c.documentId) ?? c.documentId}`);
  });
  console.log(`\nCurrent top-${TOP_K} cutoff (5th place) blended score: ${chunks[TOP_K - 1]?.similarity.toFixed(4)}`);
  console.log(`Target chunk raw*0.7 (no boost) = ${(targetRaw * 0.7).toFixed(4)} -- needed boost to just exceed cutoff: ${(chunks[TOP_K - 1].similarity - targetRaw * 0.7 + 0.0001).toFixed(4)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
