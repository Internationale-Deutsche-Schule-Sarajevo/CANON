/**
 * Third bridge layer — TAČNO 2 chunka (b4a226a0, 0dc593d8). Deterministična
 * (NE LLM-generisana) rečenica-sažetak, direktno iz handbook_chapters.title
 * (već postojeći, ranije odobreni naslov poglavlja) — nema prostora za
 * izmišljanje jer je to doslovno prepričavanje postojećeg naslova u
 * rečenicu, ništa novo. `embedding` se računa iz
 * search_summary_bs + search_text_bs + search_text_bs_declarative
 * kombinovano. search_text_bs i search_text_bs_declarative ostaju netaknuti.
 *
 * Run: npx tsx --env-file=.env scripts/search-bridge-summary-2chunks.ts
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";
import { retrieveChunks } from "../src/lib/rag/retriever";

// Deterministic, hand-verified against handbook_chapters.title — not LLM
// output. Each is a direct sentence-rendering of the chapter's own existing
// title, adding zero facts not already in that title.
const SUMMARIES: Record<string, string> = {
  "b4a226a0-4bf8-4595-aa57-57a470ad24ef": "Pravila ponašanja u školskoj učionici za razrede I-IV.", // title: "Pravila Ucionice I IV Razred"
  "0dc593d8-21a7-4a0e-a3ad-01c7be9c3864": "Pravila ponašanja u školskoj učionici za razrede V-IX.", // title: "Pravila učionice V IX Razred"
};

async function main() {
  const supabase = createSupabaseDirectAdmin();

  for (const [chunkId, summary] of Object.entries(SUMMARIES)) {
    const { data: row, error } = await supabase
      .from("document_chunks")
      .select("id, search_text_bs, search_text_bs_declarative")
      .eq("id", chunkId)
      .single();
    if (error || !row) throw new Error(`fetch failed za ${chunkId}: ${error?.message}`);
    if (!row.search_text_bs || !row.search_text_bs_declarative) {
      throw new Error(`chunk ${chunkId} nema search_text_bs/search_text_bs_declarative — prethodni talasi moraju biti gotovi prvo`);
    }

    console.log(`\n=== chunk ${chunkId} ===`);
    console.log(`Sažetak (iz naslova poglavlja): ${summary}`);

    const combined = `${summary}\n\n${row.search_text_bs}\n\n${row.search_text_bs_declarative}`;
    const [embedding] = await embedTextsLocal([combined]);

    const { error: updErr } = await supabase
      .from("document_chunks")
      .update({ search_summary_bs: summary, embedding })
      .eq("id", chunkId);
    if (updErr) throw new Error(`update failed za ${chunkId}: ${updErr.message}`);
    console.log(`Upisano (embedding iz sažetak + prevod + deklarativni oblik kombinovano).`);
  }

  console.log(`\n\n=== RE-TEST: "Koja pravila vrijede u učionici za razrede I-IV?" ===`);
  const result = await retrieveChunks("Koja pravila vrijede u učionici za razrede I-IV?");
  console.log(`confidence=${result.confidence}`);
  let found = false;
  for (const c of result.chunks) {
    const isPravila = c.documentId === "c1a0b320-8f97-4822-a4ea-f1386824bfb6";
    if (isPravila) found = true;
    console.log(
      `  doc=${c.documentId} src=${c.source} rawSemanticSimilarity=${c.rawSemanticSimilarity?.toFixed(4) ?? "null"} ${isPravila ? "  <-- Pravila I-IV" : ""}`,
    );
  }
  console.log(`\nPravila I-IV u top-5: ${found ? "DA" : "NE"}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exitCode = 1;
});
