/**
 * Bosanski most za pretragu — TALAS 1 (njemački, 52 chunka).
 *
 * Za svaki chunk čiji je izvorni jezik njemački (isti franc-based detekcija
 * kao scripts/detect-non-bosnian-chunks.ts, ovdje ponovljena da bude
 * samostalna): generiše strogo vjeran bosanski prevod isključivo za
 * pretragu (search_text_bs), automatski validira prevod PRIJE upisa, i
 * SAMO za chunkove koji prođu validaciju: upisuje search_text_bs/
 * search_source_lang/search_translated_at i ponovo računa `embedding` iz
 * prevoda (originalni `text` se NIKAD ne mijenja — citat/prikaz/generacija
 * ostaju netaknuti).
 *
 * Run: npx tsx --env-file=.env scripts/search-bridge-wave1-german.ts
 */
import { franc } from "franc";
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { stripFrontmatter } from "../src/lib/rag/frontmatter";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";
import { getAIProvider } from "../src/lib/ai/ai-provider.factory";

const SOUTH_SLAVIC = new Set(["bos", "hrv", "srp", "cnr"]);
const MIN_WORD_TOKENS = 5;
const PAGE_SIZE = 1000;
const TARGET_LANG = "deu";

function countWordTokens(text: string): number {
  const matches = text.match(/[A-Za-zÀ-ſ]{3,}/g);
  return matches ? matches.length : 0;
}

const TRANSLATION_SYSTEM_PROMPT =
  "Ti si precizan prevodilac za internu upotrebu u P.U. Internationale Deutsche Schule Sarajevo. " +
  "Tvoj jedini zadatak je prevod teksta na bosanski jezik (latinica), ništa drugo.\n\n" +
  "STROGO PRAVILO TAČNOSTI (najvažnije pravilo, nadjačava sve ostale stilske smjernice):\n" +
  "- Prevedi TAČNO ono što piše u izvornom tekstu, riječ za riječ po značenju. Ovo je prevod, " +
  "ne parafraza, ne sažetak, ne tumačenje.\n" +
  "- Ne dodaji objašnjenja, kontekst, komentare ili bilo šta što nije doslovno u izvorniku.\n" +
  "- Ne izostavljaj nijedan dio izvornog teksta.\n" +
  "- Zadrži sve brojeve, datume, vlastita imena, nazive institucija i skraćenice TAČNO onako " +
  "kako su napisani u izvorniku — imena osoba, institucija i brojevi se ne prevode.\n" +
  "- Zadrži strukturu izvornika koliko je moguće (npr. ako je izvornik lista kratkih rečenica " +
  "ili tabela, prevod treba zadržati isti oblik i redoslijed).\n" +
  "- Ako je dio teksta nečitak, oštećen OCR-om ili nejasan, prevedi najbliže doslovno moguće " +
  "značenje. Ne izmišljaj sadržaj kojeg nema u izvorniku.\n\n" +
  "Vrati ISKLJUČIVO prevod, bez uvoda, napomena ili objašnjenja procesa prevođenja.";

const GERMAN_STOPWORDS = [" und ", " der ", " die ", " das ", " ich ", " ist ", " nicht ", " für ", " mit ", " auf ", " eine ", " sich ", " werden ", " sind "];
const ENGLISH_STOPWORDS = [" the ", " and ", " is ", " of ", " to ", " in ", " for ", " with ", " this ", " that ", " are ", " was "];

// Genuine institutional/format/currency codes seen in this corpus that must
// survive translation verbatim. NOT "every all-caps token" — a first attempt
// using a blanket [A-Z]{2,} regex caught ordinary German words written in
// caps for a poster heading (KLASSENRAUM REGELN) and false-flagged perfectly
// correct translations. Extend this list if a genuine miss turns up in the
// rejected-list review, rather than widening the regex back out.
const KNOWN_PRESERVE_TOKENS = [
  "IDSS", "BHS", "DEU", "EN", "PDF", "DOCX", "XLSX",
  "IBAN", "SWIFT", "BIC", "KM", "BAM", "EUR", "USD",
];

type Row = { id: string; document_id: string; chunk_index: number; text: string };

type ValidationResult = { ok: true } | { ok: false; reasons: string[] };

function extractNumbers(text: string): string[] {
  const matches = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return Array.from(new Set(matches));
}

function extractKnownTokens(text: string): string[] {
  const upper = text.toUpperCase();
  return KNOWN_PRESERVE_TOKENS.filter((tok) => new RegExp(`\\b${tok}\\b`).test(upper));
}

function validateTranslation(
  source: string,
  translation: string,
  finishReason: string | undefined,
): ValidationResult {
  const reasons: string[] = [];
  const trimmed = translation.trim();

  if (trimmed.length === 0) {
    reasons.push("prazan prevod");
    return { ok: false, reasons };
  }

  // MAX_TOKENS is an unambiguous truncation signal — check it directly
  // instead of only inferring truncation indirectly from missing numbers.
  if (finishReason === "MAX_TOKENS") {
    reasons.push("prevod odsječen (finishReason=MAX_TOKENS) — izlaz nepotpun");
  }

  const paddedLower = ` ${trimmed.toLowerCase()} `;
  const leakedGerman = GERMAN_STOPWORDS.filter((w) => paddedLower.includes(w));
  const leakedEnglish = ENGLISH_STOPWORDS.filter((w) => paddedLower.includes(w));
  if (leakedGerman.length >= 2) reasons.push(`moguć neprevedeni njemački (nađeno: ${leakedGerman.join(",").trim()})`);
  if (leakedEnglish.length >= 2) reasons.push(`moguć neprevedeni engleski (nađeno: ${leakedEnglish.join(",").trim()})`);

  const detected = franc(trimmed, { minLength: 10 });
  if (detected === TARGET_LANG || detected === "eng") {
    reasons.push(`franc detektuje prevod kao "${detected}", ne bosanski/srodan`);
  }

  const sourceNumbers = extractNumbers(source);
  const missingNumbers = sourceNumbers.filter((n) => !trimmed.includes(n));
  if (missingNumbers.length > 0) reasons.push(`nedostaju brojevi iz izvora: ${missingNumbers.join(", ")}`);

  const sourceKnownTokens = extractKnownTokens(source);
  const missingKnownTokens = sourceKnownTokens.filter((t) => !trimmed.toUpperCase().includes(t));
  if (missingKnownTokens.length > 0) reasons.push(`nedostaju poznate oznake/skraćenice iz izvora: ${missingKnownTokens.join(", ")}`);

  return reasons.length > 0 ? { ok: false, reasons } : { ok: true };
}

async function fetchAllActiveChunks(): Promise<(Row & { search_translated_at: string | null })[]> {
  const supabase = createSupabaseDirectAdmin();
  const all: (Row & { search_translated_at: string | null })[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("document_chunks")
      .select("id, document_id, chunk_index, text, search_translated_at")
      .eq("document_status", "active")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`fetch failed at offset ${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as (Row & { search_translated_at: string | null })[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/** Up to 2 retries on a thrown API error (e.g. one key hitting a stale/unsupported model) — the
 * provider rotates keys per call, so a bare retry routes around a single bad key. */
async function generateWithRetry(
  ai: ReturnType<typeof getAIProvider>,
  userPrompt: string,
  systemPrompt: string,
  maxAttempts = 3,
) {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.generate(userPrompt, systemPrompt, { maxTokens: 8192, temperature: 0.3, language: "bs" });
    } catch (err) {
      lastErr = err as Error;
      console.log(`  (pokušaj ${attempt}/${maxAttempts} neuspješan: ${lastErr.message})`);
    }
  }
  throw lastErr;
}

async function main() {
  const allChunks = await fetchAllActiveChunks();
  const germanChunks = allChunks.filter((row) => {
    const stripped = stripFrontmatter(row.text);
    if (countWordTokens(stripped) < MIN_WORD_TOKENS) return false;
    return franc(stripped, { minLength: 10 }) === TARGET_LANG;
  });

  console.log(`[Wave1] Njemački chunkovi ukupno: ${germanChunks.length} (očekivano 52)`);
  if (germanChunks.length !== 52) {
    console.warn(`[Wave1] UPOZORENJE: broj se ne poklapa sa ranije potvrđenih 52 — provjeri prije nastavka.`);
  }
  const alreadyDone = germanChunks.filter((r) => r.search_translated_at !== null);
  const todo = germanChunks.filter((r) => r.search_translated_at === null);
  console.log(`[Wave1] Već upisano u ranijem pokušaju (preskačem): ${alreadyDone.length}`);
  console.log(`[Wave1] Za obradu ovaj put: ${todo.length}`);

  const ai = getAIProvider();
  const supabase = createSupabaseDirectAdmin();

  const passed: { row: Row; translation: string }[] = [];
  const failed: { row: Row; reasons: string[]; translation: string }[] = [];

  for (const [i, row] of todo.entries()) {
    const source = stripFrontmatter(row.text);
    const userPrompt = `Prevedi sljedeći tekst (izvorni jezik: njemački) na bosanski:\n\n${source}`;
    let translationText = "";
    let finishReason: string | undefined;
    try {
      const result = await generateWithRetry(ai, userPrompt, TRANSLATION_SYSTEM_PROMPT);
      translationText = result.text.trim();
      finishReason = result.finishReason;
    } catch (err) {
      failed.push({ row, reasons: [`Gemini poziv neuspješan (nakon retry-a): ${(err as Error).message}`], translation: "" });
      console.log(`[${i + 1}/${todo.length}] doc=${row.document_id} #${row.chunk_index} -> GREŠKA PRI POZIVU`);
      continue;
    }

    const verdict = validateTranslation(source, translationText, finishReason);
    if (verdict.ok) {
      passed.push({ row, translation: translationText });
      console.log(`[${i + 1}/${todo.length}] doc=${row.document_id} #${row.chunk_index} -> OK`);
    } else {
      failed.push({ row, reasons: verdict.reasons, translation: translationText });
      console.log(`[${i + 1}/${todo.length}] doc=${row.document_id} #${row.chunk_index} -> ODBIJEN: ${verdict.reasons.join("; ")}`);
    }
  }

  console.log(`\n[Wave1] Ovaj pokušaj — prošlo validaciju: ${passed.length}/${todo.length}`);
  console.log(`[Wave1] Ovaj pokušaj — odbijeno (NIJE upisano): ${failed.length}/${todo.length}`);

  if (failed.length > 0) {
    console.log(`\n=== ODBIJENI (lista za tvoj pregled, ništa nije upisano za njih) ===`);
    for (const f of failed) {
      console.log(`\n  doc=${f.row.document_id} chunk=${f.row.id} #${f.row.chunk_index}`);
      console.log(`  Razlozi: ${f.reasons.join("; ")}`);
      console.log(`  Izvor: ${stripFrontmatter(f.row.text).slice(0, 150).replace(/\n/g, " ")}`);
      console.log(`  Prevod (odbijen): ${f.translation.slice(0, 150).replace(/\n/g, " ")}`);
    }
  }

  let written = 0;
  if (passed.length > 0) {
    // Re-embed only the passing translations, then write everything atomically per row.
    console.log(`\n[Wave1] Računam embedding za ${passed.length} prevoda...`);
    const embeddings = await embedTextsLocal(passed.map((p) => p.translation));

    for (let i = 0; i < passed.length; i++) {
      const { row, translation } = passed[i];
      const embedding = embeddings[i];
      const { error } = await supabase
        .from("document_chunks")
        .update({
          search_text_bs: translation,
          search_source_lang: TARGET_LANG,
          search_translated_at: new Date().toISOString(),
          embedding,
        })
        .eq("id", row.id);
      if (error) {
        console.error(`[Wave1] UPIS NEUSPJEŠAN za chunk ${row.id}: ${error.message}`);
        continue;
      }
      written++;
    }
  }
  console.log(`[Wave1] Upisano u bazu ovaj pokušaj: ${written}/${passed.length}`);

  // Final totals for the WHOLE wave (this attempt + anything already written
  // in an earlier attempt) — pull fresh from the DB rather than trusting
  // in-memory state, since this script is resumable across runs.
  const { data: allWaveRows, error: waveErr } = await supabase
    .from("document_chunks")
    .select("id, document_id, chunk_index, text, search_text_bs")
    .in("id", germanChunks.map((r) => r.id))
    .eq("search_source_lang", TARGET_LANG)
    .not("search_text_bs", "is", null);
  if (waveErr) throw new Error(`final tally fetch failed: ${waveErr.message}`);
  const totalWritten = allWaveRows?.length ?? 0;

  console.log(`\n[Wave1] === UKUPNO ZA CIJELI TALAS 1 ===`);
  console.log(`[Wave1] Uspješno prevedeno i upisano: ${totalWritten}/52`);
  console.log(`[Wave1] Odbijeno/neuspješno (nije upisano, čeka ponovni pokušaj ili tvoju odluku): ${52 - totalWritten}/52`);

  // Evenly-spaced sample across the FULL wave (not just this attempt) for
  // manual review — no RNG needed for a spread that already avoids clustering.
  const sampleCount = Math.min(5, allWaveRows?.length ?? 0);
  console.log(`\n=== ${sampleCount} PREVODA ZA TVOJ PREGLED (ravnomjerno raspoređeni uzorak iz cijelog talasa) ===`);
  const step = Math.max(1, Math.floor((allWaveRows?.length ?? 0) / sampleCount));
  for (let i = 0; i < (allWaveRows?.length ?? 0) && sampleCount > 0; i += step) {
    const p = allWaveRows![i];
    console.log(`\n  doc=${p.document_id} chunk=${p.id} #${p.chunk_index}`);
    console.log(`  IZVOR (de): ${stripFrontmatter(p.text).slice(0, 300).replace(/\n/g, " | ")}`);
    console.log(`  PREVOD (bs): ${(p.search_text_bs ?? "").slice(0, 300).replace(/\n/g, " | ")}`);
  }
}

main().catch((err) => {
  console.error("[Wave1] Fatal:", err);
  process.exitCode = 1;
});
