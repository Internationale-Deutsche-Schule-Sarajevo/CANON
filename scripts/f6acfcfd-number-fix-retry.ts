/**
 * Ciljani re-run SAMO za 8 chunkova iz dokumenta f6acfcfd (Talas 2, engleski)
 * koji su u prvom prolazu (2026-08-25) odbijeni isključivo zbog false-positiva
 * u provjeri brojeva: validator je tražio doslovan string broja iz izvora
 * (npr. "50,000"), a prevod je ispravno bosanizirao format separatora
 * (npr. "50.000"), pa je validator to lažno prijavio kao "nedostaje broj".
 *
 * Fix (vidi search-bridge-wave2-english.ts, numberPresentInTranslation) sada
 * poredi NUMERIČKU VRIJEDNOST uz obje moguće konvencije separatora, ne
 * doslovan string — ista logika je duplicirana ovdje namjerno (ne importuje
 * se search-bridge-wave2-english.ts jer taj fajl ima top-level main() koji bi
 * se izvršio pri importu i obradio sve preostale NULL redove, ne samo ovih 8).
 *
 * Ostalih ~13 odbijenih iz Talasa 2 se NE dira ovom skriptom — namjerno.
 *
 * Run: npx tsx --env-file=.env scripts/f6acfcfd-number-fix-retry.ts
 */
import { franc } from "franc";
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { stripFrontmatter } from "../src/lib/rag/frontmatter";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";
import { getAIProvider } from "../src/lib/ai/ai-provider.factory";

const TARGET_LANG = "eng";

const TARGET_CHUNK_IDS = [
  "285fc376-399d-4eeb-8f4e-08b9a9db942c", // #45 — 15,000
  "6b4fb31c-f9e5-4aa7-b70e-58ee34d4b722", // #43 — 50,000
  "7f2ac7a3-8232-49d0-9629-24b63f50de32", // #44 — 5,000 / 4,000 / 50,000 / 15,000 / 20,000
  "8ba48085-a628-4379-92f1-729c9cfca8ab", // #4  — 50,000
  "9714c5b7-f414-4240-a751-9f95302d1d48", // #16 — 50,000
  "af368cdb-a0ed-4bc2-b2c4-84a941093f5c", // #46 — 50,000 / 5,000 / 3,500 / 6,000 / 2,000 / 1,500 / 3,000 / 1,000 / 2,500
  "f791d66d-ee76-48c3-9629-c58ad72279ce", // #70 — 0.5
  "ffb68b14-9331-45fd-82c7-449e260c4008", // #71 — 5,000
];

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

// FIX (2026-08-25): poredi numeričku vrijednost, ne doslovan string — vidi
// napomenu u search-bridge-wave2-english.ts uz istu logiku.
function parseEnglishNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function parseNumberCandidates(raw: string): number[] {
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  const candidates = new Set<number>();
  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const n = lastDot > lastComma ? Number(raw.replace(/,/g, "")) : Number(raw.replace(/\./g, "").replace(",", "."));
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
  if (sourceValue === null) return translation.includes(sourceRaw);
  const translationTokens = extractNumbers(translation);
  return translationTokens.some((tok) => parseNumberCandidates(tok).some((c) => Math.abs(c - sourceValue) < 1e-9));
}

// FIX (2026-08-25, drugi krug): OCR lom stranice usred rečenice ("Page
// 45/90") nije stvaran podatak — vidi istu napomenu u
// search-bridge-wave2-english.ts. Uklanja se samo za provjeru brojeva.
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PACING_DELAY_MS = 4000;
const RETRY_BACKOFF_MS = 8000;

async function generateWithRetry(ai: ReturnType<typeof getAIProvider>, userPrompt: string, systemPrompt: string, maxAttempts = 4) {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // 65536 (podignuto sa 8192 za ovaj drugi krug) — isti obrazac kao u
      // generator.ts / agenda-fix-ocr-and-regenerate.ts za odsječena
      // poglavlja (finishReason=MAX_TOKENS na gustim/tabelarnim izvorima).
      return await ai.generate(userPrompt, systemPrompt, { maxTokens: 65536, temperature: 0.3, language: "bs" });
    } catch (err) {
      lastErr = err as Error;
      console.log(`  (pokušaj ${attempt}/${maxAttempts} neuspješan: ${lastErr.message})`);
      if (attempt < maxAttempts) await sleep(RETRY_BACKOFF_MS);
    }
  }
  throw lastErr;
}

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, chunk_index, text, search_translated_at")
    .in("id", TARGET_CHUNK_IDS);
  if (error) throw error;
  const rows = (data ?? []) as (Row & { search_translated_at: string | null })[];

  console.log(`[Fix] Ciljanih chunkova: ${TARGET_CHUNK_IDS.length}, pronađeno u bazi: ${rows.length}`);
  const alreadyDone = rows.filter((r) => r.search_translated_at !== null);
  if (alreadyDone.length > 0) {
    console.log(`[Fix] UPOZORENJE: ${alreadyDone.length} od ciljanih već ima search_translated_at postavljen (preskačem ih, ne prepisujem): ${alreadyDone.map((r) => r.id).join(", ")}`);
  }
  const todo = rows.filter((r) => r.search_translated_at === null);
  console.log(`[Fix] Za obradu: ${todo.length}\n`);

  const ai = getAIProvider();
  const failed: { row: Row; reasons: string[]; translation: string }[] = [];
  const passed: { row: Row; translation: string }[] = [];

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
      console.log(`[${i + 1}/${todo.length}] chunk=${row.id} #${row.chunk_index} -> GREŠKA PRI POZIVU`);
      continue;
    }
    const verdict = validateTranslation(source, translationText, finishReason);
    if (!verdict.ok) {
      failed.push({ row, reasons: verdict.reasons, translation: translationText });
      console.log(`[${i + 1}/${todo.length}] chunk=${row.id} #${row.chunk_index} -> ODBIJEN: ${verdict.reasons.join("; ")}`);
      await sleep(PACING_DELAY_MS);
      continue;
    }

    const [embedding] = await embedTextsLocal([translationText]);
    const { error: writeErr } = await supabase
      .from("document_chunks")
      .update({
        search_text_bs: translationText,
        search_source_lang: TARGET_LANG,
        search_translated_at: new Date().toISOString(),
        embedding,
      })
      .eq("id", row.id);
    if (writeErr) {
      console.error(`[Fix] UPIS NEUSPJEŠAN za chunk ${row.id}: ${writeErr.message}`);
      failed.push({ row, reasons: [`upis u bazu neuspješan: ${writeErr.message}`], translation: translationText });
    } else {
      passed.push({ row, translation: translationText });
      console.log(`[${i + 1}/${todo.length}] chunk=${row.id} #${row.chunk_index} -> OK (upisano)`);
    }
    await sleep(PACING_DELAY_MS);
  }

  console.log(`\n[Fix] === REZULTAT ===`);
  console.log(`[Fix] Prošlo i upisano: ${passed.length}/${todo.length}`);
  console.log(`[Fix] I dalje odbijeno: ${failed.length}/${todo.length}`);

  if (passed.length > 0) {
    console.log(`\n=== PROŠLI (uzorak za pregled) ===`);
    for (const p of passed) {
      console.log(`\n  chunk=${p.row.id} #${p.row.chunk_index}`);
      console.log(`  IZVOR: ${stripFrontmatter(p.row.text).slice(0, 250).replace(/\n/g, " | ")}`);
      console.log(`  PREVOD: ${p.translation.slice(0, 250).replace(/\n/g, " | ")}`);
    }
  }

  if (failed.length > 0) {
    console.log(`\n=== I DALJE ODBIJENI ===`);
    for (const f of failed) {
      console.log(`\n  chunk=${f.row.id} #${f.row.chunk_index}`);
      console.log(`  Razlozi: ${f.reasons.join("; ")}`);
      console.log(`  Izvor: ${stripFrontmatter(f.row.text).slice(0, 200).replace(/\n/g, " | ")}`);
      console.log(`  Prevod (odbijen): ${f.translation.slice(0, 200).replace(/\n/g, " | ")}`);
    }
  }
}

main().catch((err) => {
  console.error("[Fix] Fatal:", err);
  process.exitCode = 1;
});
