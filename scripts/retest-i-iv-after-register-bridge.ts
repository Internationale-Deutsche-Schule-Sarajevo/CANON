/** Re-test the exact reported query after the register bridge. Read-only. */
import { retrieveChunks } from "../src/lib/rag/retriever";

const QUERY = "Koja pravila vrijede u učionici za razrede I-IV?";
const PRAVILA_DOC_ID = "c1a0b320-8f97-4822-a4ea-f1386824bfb6";

async function main() {
  console.log(`[Retest] Query: "${QUERY}"\n`);
  const result = await retrieveChunks(QUERY);
  console.log(`confidence=${result.confidence}`);
  console.log(`chunks (top ${result.chunks.length}):`);
  let found = false;
  for (const c of result.chunks) {
    const isPravila = c.documentId === PRAVILA_DOC_ID;
    if (isPravila) found = true;
    console.log(
      `  doc=${c.documentId} src=${c.source} similarity(blended)=${c.similarity.toFixed(4)} ` +
        `rawSemanticSimilarity=${c.rawSemanticSimilarity?.toFixed(4) ?? "null"} ${isPravila ? "  <-- Pravila I-IV" : ""}`,
    );
  }
  console.log(`\nPravila I-IV u top-5 rezultatu: ${found ? "DA" : "NE"}`);
  console.log(`Prag za ulazak u pool (SIMILARITY_THRESHOLD): 0.6`);
  console.log(`Prag za HIGH confidence (CONFIDENCE_THRESHOLD): 0.75`);
}

main().catch((err) => {
  console.error("[Retest] Fatal:", err);
  process.exitCode = 1;
});
