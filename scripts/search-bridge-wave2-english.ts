/**
 * Bosanski most za pretragu — TALAS 2 (engleski, 361 chunk).
 * Isti proces kao search-bridge-wave1-german.ts (ista disciplina, ista
 * automatska validacija, isti resumable pattern — preskače chunkove koji
 * već imaju search_translated_at postavljen).
 *
 * Run: npx tsx --env-file=.env scripts/search-bridge-wave2-english.ts
 *
 * Upis (2026-08-20, approved by Director, nakon incidenta u prvom
 * pokušaju): INKREMENTALAN, po chunku — svaki validiran prevod se odmah
 * embed-uje i upisuje prije prelaska na sljedeći, ne čeka se kraj liste od
 * ~300 stavki. Prvi pokušaj je batch-ovao upis na sami kraj petlje; kad je
 * Gemini key-rotacija (vidi gemini-key-manager.ts — ključ #3 sad isključen
 * iz rotacije) upala u produženu throttle kaskadu usred obrade, svih ~130
 * dotad uspješno prevedenih chunkova je sjedilo samo u memoriji procesa,
 * bez ijednog reda upisanog — pad procesa prije kraja petlje bi ih sve
 * bacio. Inkrementalni upis znači da pad gubi najviše jednu stavku.
 */
import { franc } from "franc";
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { stripFrontmatter } from "../src/lib/rag/frontmatter";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";
import { getAIProvider } from "../src/lib/ai/ai-provider.factory";

const MIN_WORD_TOKENS = 5;
const PAGE_SIZE = 1000;
const TARGET_LANG = "eng";
const EXPECTED_COUNT = 361;

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

const KNOWN_PRESERVE_TOKENS = [
  "IDSS", "BHS", "DEU", "EN", "PDF", "DOCX", "XLSX",
  "IBAN", "SWIFT", "BIC", "KM", "BAM", "EUR", "USD",
];

type Row = { id: string; document_id: string; chunk_index: number; text: string };
type ValidationResult = { ok: true } | { ok: false; reasons: string[] };

function extractNumbers(text: string): string[] {
  return Array.from(new Set(text.match(/\d+(?:[.,]\d+)*/g) ?? []));
}
function extractKnownTokens(text: string): string[] {
  const upper = text.toUpperCase();
  return KNOWN_PRESERVE_TOKENS.filter((tok) => new RegExp(`\\b${tok}\\b`).test(upper));
}

// Izvor je uvijek engleski format (zarez = hiljade, tačka = decimala), pa se
// izvorni broj parsira jednoznačno. Prevod na bosanski smije legitimno
// promijeniti separatore (npr. "50,000" -> "50.000") ili ih zadržati kao u
// izvorniku — provjera zato poredi NUMERIČKU VRIJEDNOST, ne doslovan string.
function parseEnglishNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Prevod može biti u engleskom ILI evropskom/bosanskom zapisu, pa se za
// svaki broj-token u prevodu isprobaju obje moguće interpretacije separatora
// (tačka-hiljade/zarez-decimala i zarez-hiljade/tačka-decimala) — kandidat
// se prihvata ako bilo koja interpretacija odgovara brojčanoj vrijednosti.
function parseNumberCandidates(raw: string): number[] {
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  const candidates = new Set<number>();
  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const n =
      lastDot > lastComma
        ? Number(raw.replace(/,/g, "")) // "1,234.56" -> en: tačka decimala
        : Number(raw.replace(/\./g, "").replace(",", ".")); // "1.234,56" -> eu: zarez decimala
    if (Number.isFinite(n)) candidates.add(n);
  } else if (hasComma) {
    const parts = raw.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      const eu = Number(raw.replace(",", "."));
      if (Number.isFinite(eu)) candidates.add(eu);
    }
    const en = Number(raw.replace(/,/g, ""));
    if (Number.isFinite(en)) candidates.add(en);
  } else if (hasDot) {
    const parts = raw.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      const en = Number(raw);
      if (Number.isFinite(en)) candidates.add(en);
    }
    const eu = Number(raw.replace(/\./g, ""));
    if (Number.isFinite(eu)) candidates.add(eu);
  } else {
    const n = Number(raw);
    if (Number.isFinite(n)) candidates.add(n);
  }
  return Array.from(candidates);
}

function numberPresentInTranslation(sourceRaw: string, translation: string): boolean {
  const sourceValue = parseEnglishNumber(sourceRaw);
  if (sourceValue === null) return translation.includes(sourceRaw); // fallback: doslovna provjera
  const translationTokens = extractNumbers(translation);
  return translationTokens.some((tok) => parseNumberCandidates(tok).some((c) => Math.abs(c - sourceValue) < 1e-9));
}

// OCR često ubaci lom stranice usred rečenice, npr. "...similar projects...
// Page 45/90 also performed...". "45" i "90" tu nisu stvarni podaci nego
// artefakt paginacije — provjera brojeva ih zato ne smije tražiti u prevodu.
// Uklanja se SAMO za potrebe provjere brojeva, ne za sam prevod (prevodilac
// i dalje vidi puni izvorni tekst).
const PAGE_BREAK_NOISE_RE = /\bPage\s+\d{1,4}\s*\/\s*\d{1,4}\b/gi;
function stripPageBreakNoise(text: string): string {
  return text.replace(PAGE_BREAK_NOISE_RE, " ");
}

function validateTranslation(source: string, translation: string, finishReason: string | undefined): ValidationResult {
  const reasons: string[] = [];
  const trimmed = translation.trim();
  if (trimmed.length === 0) { reasons.push("prazan prevod"); return { ok: false, reasons }; }
  if (finishReason === "MAX_TOKENS") reasons.push("prevod odsječen (finishReason=MAX_TOKENS) — izlaz nepotpun");

  const paddedLower = ` ${trimmed.toLowerCase()} `;
  const leakedGerman = GERMAN_STOPWORDS.filter((w) => paddedLower.includes(w));
  const leakedEnglish = ENGLISH_STOPWORDS.filter((w) => paddedLower.includes(w));
  if (leakedGerman.length >= 2) reasons.push(`moguć neprevedeni njemački (nađeno: ${leakedGerman.join(",").trim()})`);
  if (leakedEnglish.length >= 2) reasons.push(`moguć neprevedeni engleski (nađeno: ${leakedEnglish.join(",").trim()})`);

  const detected = franc(trimmed, { minLength: 10 });
  if (detected === "deu" || detected === TARGET_LANG) reasons.push(`franc detektuje prevod kao "${detected}", ne bosanski/srodan`);

  const sourceNumbers = extractNumbers(stripPageBreakNoise(source));
  const missingNumbers = sourceNumbers.filter((n) => !numberPresentInTranslation(n, trimmed));
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wave 1 hammered 8 keys back-to-back and drove all 7 healthy keys into
// 429 throttle within ~10 minutes; once throttled, retries kept landing on
// the one permanently-broken key (404) since it never throttles. A fixed
// pacing delay between calls, plus a real backoff wait (not an immediate
// reattempt) on failure, keeps us under whatever rate window is causing
// that cascade instead of retrying into the same wall.
const PACING_DELAY_MS = 4000;
const RETRY_BACKOFF_MS = 8000;

async function generateWithRetry(ai: ReturnType<typeof getAIProvider>, userPrompt: string, systemPrompt: string, maxAttempts = 4) {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.generate(userPrompt, systemPrompt, { maxTokens: 8192, temperature: 0.3, language: "bs" });
    } catch (err) {
      lastErr = err as Error;
      console.log(`  (pokušaj ${attempt}/${maxAttempts} neuspješan: ${lastErr.message})`);
      if (attempt < maxAttempts) await sleep(RETRY_BACKOFF_MS);
    }
  }
  throw lastErr;
}

async function main() {
  const allChunks = await fetchAllActiveChunks();
  const englishChunks = allChunks.filter((row) => {
    const stripped = stripFrontmatter(row.text);
    if (countWordTokens(stripped) < MIN_WORD_TOKENS) return false;
    return franc(stripped, { minLength: 10 }) === TARGET_LANG;
  });

  console.log(`[Wave2] Engleski chunkovi ukupno: ${englishChunks.length} (očekivano ${EXPECTED_COUNT})`);
  if (englishChunks.length !== EXPECTED_COUNT) {
    console.warn(`[Wave2] UPOZORENJE: broj se ne poklapa sa ranije potvrđenih ${EXPECTED_COUNT}.`);
  }
  const alreadyDone = englishChunks.filter((r) => r.search_translated_at !== null);
  const todo = englishChunks.filter((r) => r.search_translated_at === null);
  console.log(`[Wave2] Već upisano (preskačem): ${alreadyDone.length}`);
  console.log(`[Wave2] Za obradu ovaj put: ${todo.length}`);

  const ai = getAIProvider();
  const supabase = createSupabaseDirectAdmin();
  const failed: { row: Row; reasons: string[]; translation: string }[] = [];
  let passedCount = 0;
  let written = 0;

  for (const [i, row] of todo.entries()) {
    const source = stripFrontmatter(row.text);
    const userPrompt = `Prevedi sljedeći tekst (izvorni jezik: engleski) na bosanski:\n\n${source}`;
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
    if (!verdict.ok) {
      failed.push({ row, reasons: verdict.reasons, translation: translationText });
      console.log(`[${i + 1}/${todo.length}] doc=${row.document_id} #${row.chunk_index} -> ODBIJEN: ${verdict.reasons.join("; ")}`);
      await sleep(PACING_DELAY_MS);
      continue;
    }
    passedCount++;

    // Upisuje se ODMAH, po chunku — vidi napomenu o inkrementalnom upisu u
    // zaglavlju fajla. Pad procesa poslije ove tačke gubi najviše ovu stavku.
    const [embedding] = await embedTextsLocal([translationText]);
    const { error } = await supabase
      .from("document_chunks")
      .update({
        search_text_bs: translationText,
        search_source_lang: TARGET_LANG,
        search_translated_at: new Date().toISOString(),
        embedding,
      })
      .eq("id", row.id);
    if (error) {
      console.error(`[Wave2] UPIS NEUSPJEŠAN za chunk ${row.id}: ${error.message}`);
    } else {
      written++;
      console.log(`[${i + 1}/${todo.length}] doc=${row.document_id} #${row.chunk_index} -> OK (upisano)`);
    }
    await sleep(PACING_DELAY_MS);
  }

  console.log(`\n[Wave2] Ovaj pokušaj — prošlo validaciju: ${passedCount}/${todo.length}`);
  console.log(`[Wave2] Ovaj pokušaj — odbijeno: ${failed.length}/${todo.length}`);
  console.log(`[Wave2] Upisano ovaj pokušaj: ${written}/${passedCount}`);

  if (failed.length > 0) {
    console.log(`\n=== ODBIJENI (ništa upisano) ===`);
    for (const f of failed) {
      console.log(`\n  doc=${f.row.document_id} chunk=${f.row.id} #${f.row.chunk_index}`);
      console.log(`  Razlozi: ${f.reasons.join("; ")}`);
      console.log(`  Izvor: ${stripFrontmatter(f.row.text).slice(0, 150).replace(/\n/g, " ")}`);
      console.log(`  Prevod (odbijen): ${f.translation.slice(0, 150).replace(/\n/g, " ")}`);
    }
  }

  const { data: allWaveRows, error: waveErr } = await supabase
    .from("document_chunks")
    .select("id, document_id, chunk_index, text, search_text_bs")
    .in("id", englishChunks.map((r) => r.id))
    .eq("search_source_lang", TARGET_LANG)
    .not("search_text_bs", "is", null);
  if (waveErr) throw new Error(`final tally fetch failed: ${waveErr.message}`);
  const totalWritten = allWaveRows?.length ?? 0;

  console.log(`\n[Wave2] === UKUPNO ZA CIJELI TALAS 2 ===`);
  console.log(`[Wave2] Uspješno prevedeno i upisano: ${totalWritten}/${EXPECTED_COUNT}`);
  console.log(`[Wave2] Odbijeno/neuspješno: ${EXPECTED_COUNT - totalWritten}/${EXPECTED_COUNT}`);

  const sampleCount = Math.min(5, allWaveRows?.length ?? 0);
  console.log(`\n=== ${sampleCount} PREVODA ZA TVOJ PREGLED (ravnomjerno raspoređeni uzorak iz cijelog talasa) ===`);
  const step = Math.max(1, Math.floor((allWaveRows?.length ?? 0) / sampleCount));
  for (let i = 0; i < (allWaveRows?.length ?? 0) && sampleCount > 0; i += step) {
    const p = allWaveRows![i];
    console.log(`\n  doc=${p.document_id} chunk=${p.id} #${p.chunk_index}`);
    console.log(`  IZVOR (en): ${stripFrontmatter(p.text).slice(0, 300).replace(/\n/g, " | ")}`);
    console.log(`  PREVOD (bs): ${(p.search_text_bs ?? "").slice(0, 300).replace(/\n/g, " | ")}`);
  }
}

main().catch((err) => {
  console.error("[Wave2] Fatal:", err);
  process.exitCode = 1;
});
