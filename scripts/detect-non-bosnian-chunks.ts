/**
 * Read-only language-audit for the "bosanski most za pretragu" feature —
 * identifies exactly how many active document_chunks are NOT Bosnian
 * (South-Slavic family: bos/hrv/srp/cnr all treated as "no bridge needed",
 * since they share script + vocabulary closely enough with Bosnian that the
 * multilingual embedder handles them the same way — the actual problem
 * observed is German/English content against Bosnian queries).
 *
 * No writes. franc (ISO 639-3 detection, sync, no network) run per chunk.
 * Chunks under franc's reliable-detection floor (very short/numeric/table
 * text) are bucketed separately rather than guessed at, since a wrong
 * language guess here would translate content that didn't need it.
 */
import { franc } from "franc";
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { stripFrontmatter } from "../src/lib/rag/frontmatter";

const SOUTH_SLAVIC = new Set(["bos", "hrv", "srp", "cnr"]);
const PAGE_SIZE = 1000;
// Below this many real word-tokens after stripping frontmatter, franc's
// guess is unreliable and there's nothing meaningful to translate anyway
// (table separators, "..." fill rows, bare numbers) — bucket separately
// instead of silently either including or excluding them.
const MIN_WORD_TOKENS = 5;

function countWordTokens(text: string): number {
  const matches = text.match(/[A-Za-zÀ-ſ]{3,}/g);
  return matches ? matches.length : 0;
}

type Row = { id: string; document_id: string; chunk_index: number; text: string };

async function fetchAllActiveChunks(): Promise<Row[]> {
  const supabase = createSupabaseDirectAdmin();
  const all: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("document_chunks")
      .select("id, document_id, chunk_index, text")
      .eq("document_status", "active")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`fetch failed at offset ${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function main() {
  const chunks = await fetchAllActiveChunks();
  console.log(`[Audit] Total active chunks fetched: ${chunks.length}`);

  const buckets = {
    bosnianFamily: [] as Row[],
    german: [] as Row[],
    english: [] as Row[],
    otherOrUndetected: [] as { row: Row; detected: string }[],
    tooLittleProse: [] as Row[],
  };

  for (const row of chunks) {
    const stripped = stripFrontmatter(row.text);
    if (countWordTokens(stripped) < MIN_WORD_TOKENS) {
      buckets.tooLittleProse.push(row);
      continue;
    }
    const detected = franc(stripped, { minLength: 10 });
    if (detected === "und") {
      buckets.otherOrUndetected.push({ row, detected });
    } else if (SOUTH_SLAVIC.has(detected)) {
      buckets.bosnianFamily.push(row);
    } else if (detected === "deu") {
      buckets.german.push(row);
    } else if (detected === "eng") {
      buckets.english.push(row);
    } else {
      buckets.otherOrUndetected.push({ row, detected });
    }
  }

  const nonBosDocIds = new Set([
    ...buckets.german.map((r) => r.document_id),
    ...buckets.english.map((r) => r.document_id),
  ]);

  console.log(`\n=== Summary ===`);
  console.log(`Bosnian-family (bos/hrv/srp/cnr) — no bridge needed: ${buckets.bosnianFamily.length}`);
  console.log(`German (deu) — translation candidates: ${buckets.german.length}`);
  console.log(`English (eng) — translation candidates: ${buckets.english.length}`);
  console.log(`Undetected/other (needs manual eyeballing, NOT auto-flagged): ${buckets.otherOrUndetected.length}`);
  console.log(`Too little prose after stripping frontmatter (<${MIN_WORD_TOKENS} word-tokens; tables/numbers/separators, skipped): ${buckets.tooLittleProse.length}`);
  console.log(`\nDistinct documents with >=1 German or English chunk: ${nonBosDocIds.size}`);

  console.log(`\n=== German chunks (doc_id / chunk_index / preview) ===`);
  for (const r of buckets.german) {
    console.log(`  ${r.document_id} #${r.chunk_index}: ${r.text.slice(0, 70).replace(/\n/g, " ")}`);
  }

  console.log(`\n=== English chunks (doc_id / chunk_index / preview) ===`);
  for (const r of buckets.english) {
    console.log(`  ${r.document_id} #${r.chunk_index}: ${r.text.slice(0, 70).replace(/\n/g, " ")}`);
  }

  console.log(`\n=== Undetected/other sample (first 25, for manual review — franc code shown) ===`);
  for (const { row, detected } of buckets.otherOrUndetected.slice(0, 25)) {
    console.log(`  [${detected}] ${row.document_id} #${row.chunk_index}: ${row.text.slice(0, 70).replace(/\n/g, " ")}`);
  }
  if (buckets.otherOrUndetected.length > 25) {
    console.log(`  ... and ${buckets.otherOrUndetected.length - 25} more`);
  }
}

main().catch((err) => {
  console.error("[Audit] Fatal:", err);
  process.exitCode = 1;
});
