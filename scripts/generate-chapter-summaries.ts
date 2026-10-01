/**
 * Chapter summary generation — "Pročitaj više" feature.
 * Resumable: getChaptersNeedingSummary() filters on summary IS NULL, same
 * pattern as search_translated_at in the search-bridge scripts. Re-running
 * this script only processes chapters that don't have a summary yet.
 *
 * WAVE_SIZE controls how many chapters this run processes — set per the
 * approved wave plan (Wave A ~50, then Wave B for the rest after the
 * Director reviews Wave A's two flagged samples). Two specific chapters are
 * force-included in Wave A regardless of their natural order_index position,
 * per explicit Director request (dense-procedural content check before
 * committing to the fixed 2-4 sentence prompt for the full corpus).
 *
 * Run: npx tsx --env-file=.env scripts/generate-chapter-summaries.ts
 */
import { getChaptersNeedingSummary, updateChapterSummary, type ChapterForSummary } from "../src/features/handbook/repository";
import { generateSummaryForChapter } from "../src/features/handbook/summary-generator";

// 50 -> 24 (2026-08-26, closing out Talas A): both MANDATORY_CHAPTER_IDS now
// already have a summary (46876ce3 on 2026-08-25, 36bc0bec on 2026-08-26
// after the named-persons prompt fix), and the 2026-08-25 run already wrote
// 24 more "rest" chapters (order_index 0-26, minus 3 rejected at 15/22/24
// under the old prompt — those 3 stay in the pending pool and get picked up
// again here). Original Talas A plan was 50 total (2 mandatory + 48 rest);
// 26 are done, so 24 closes it out exactly. Do not read this as the
// permanent wave size — Talas B gets its own value.
const WAVE_SIZE = 24;

// Pravilnik o arhiviranju i čuvanju dokumentacije, Rjesenje Maturalna
// Komisija — gusto-proceduralni sadržaj (rokovi, imenovani članovi), Director
// želi ove dvije posebno pregledati prije Talasa B.
const MANDATORY_CHAPTER_IDS = [
  "46876ce3-cc86-4675-b16d-0af7b0c29558", // Pravilnik o arhiviranju
  "36bc0bec-45f9-4a08-b176-23d3c3d2031e", // Rjesenje Maturalna Komisija
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PACING_DELAY_MS = 4000;
const RETRY_BACKOFF_MS = 8000;

async function generateWithRetry(content: string, maxAttempts = 4) {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateSummaryForChapter(content);
    } catch (err) {
      lastErr = err as Error;
      console.log(`  (pokušaj ${attempt}/${maxAttempts} neuspješan: ${lastErr.message})`);
      if (attempt < maxAttempts) await sleep(RETRY_BACKOFF_MS);
    }
  }
  throw lastErr;
}

async function main() {
  const allPending = await getChaptersNeedingSummary();
  console.log(`[Summaries] Objavljenih poglavlja bez sažetka: ${allPending.length}`);

  const mandatory = allPending.filter((c) => MANDATORY_CHAPTER_IDS.includes(c.id));
  const rest = allPending.filter((c) => !MANDATORY_CHAPTER_IDS.includes(c.id));

  const missingMandatory = MANDATORY_CHAPTER_IDS.filter((id) => !mandatory.some((c) => c.id === id));
  if (missingMandatory.length > 0) {
    console.warn(
      `[Summaries] UPOZORENJE: obavezni chapter ID(evi) nisu pronađeni među poglavljima bez sažetka ` +
        `(već imaju sažetak, ili ne postoje/nisu objavljeni): ${missingMandatory.join(", ")}`,
    );
  }

  const todo: ChapterForSummary[] = [...mandatory, ...rest.slice(0, Math.max(0, WAVE_SIZE - mandatory.length))];
  console.log(`[Summaries] Talas veličine ${WAVE_SIZE}: obavezno uključeno ${mandatory.length}, popunjeno još ${todo.length - mandatory.length}, ukupno za obradu ${todo.length}\n`);

  const passed: { id: string; summary: string }[] = [];
  const failed: { id: string; reasons: string[]; attempted: string }[] = [];

  for (const [i, chapter] of todo.entries()) {
    const isMandatory = MANDATORY_CHAPTER_IDS.includes(chapter.id);
    let result: Awaited<ReturnType<typeof generateWithRetry>>;
    try {
      result = await generateWithRetry(chapter.content);
    } catch (err) {
      // generateWithRetry throws after exhausting its own 4 attempts (e.g. a
      // sustained Gemini key-throttle cascade) — must not crash the whole
      // batch (same discipline as search-bridge-wave2-english.ts). Log and
      // move on; summary stays NULL, so a re-run picks this chapter back up.
      failed.push({ id: chapter.id, reasons: [`Gemini poziv neuspješan (nakon retry-a): ${(err as Error).message}`], attempted: "" });
      console.log(`[${i + 1}/${todo.length}] chapter=${chapter.id}${isMandatory ? " [OBAVEZAN]" : ""} -> GREŠKA PRI POZIVU`);
      await sleep(PACING_DELAY_MS);
      continue;
    }

    if (!result.ok) {
      failed.push({ id: chapter.id, reasons: result.reasons, attempted: result.attemptedSummary });
      console.log(`[${i + 1}/${todo.length}] chapter=${chapter.id}${isMandatory ? " [OBAVEZAN]" : ""} -> ODBIJEN: ${result.reasons.join("; ")}`);
      await sleep(PACING_DELAY_MS);
      continue;
    }

    await updateChapterSummary(chapter.id, result.summary);
    passed.push({ id: chapter.id, summary: result.summary });
    console.log(`[${i + 1}/${todo.length}] chapter=${chapter.id}${isMandatory ? " [OBAVEZAN]" : ""} -> OK (upisano, ${result.summary.length} znakova)`);
    await sleep(PACING_DELAY_MS);
  }

  console.log(`\n[Summaries] === REZULTAT TALASA ===`);
  console.log(`[Summaries] Prošlo i upisano: ${passed.length}/${todo.length}`);
  console.log(`[Summaries] Odbijeno: ${failed.length}/${todo.length}`);

  if (failed.length > 0) {
    console.log(`\n=== ODBIJENI ===`);
    for (const f of failed) {
      console.log(`\n  chapter=${f.id}`);
      console.log(`  Razlozi: ${f.reasons.join("; ")}`);
      console.log(`  Pokušaj: ${f.attempted.slice(0, 200)}`);
    }
  }

  console.log(`\n=== OBAVEZNE DVIJE (za Director pregled prije Talasa B) ===`);
  for (const id of MANDATORY_CHAPTER_IDS) {
    const p = passed.find((x) => x.id === id);
    const f = failed.find((x) => x.id === id);
    if (p) {
      console.log(`\n  chapter=${id} -> PROŠAO (${p.summary.length} znakova)`);
      console.log(`  SAŽETAK: ${p.summary}`);
    } else if (f) {
      console.log(`\n  chapter=${id} -> ODBIJEN: ${f.reasons.join("; ")}`);
      console.log(`  Pokušaj: ${f.attempted}`);
    } else {
      console.log(`\n  chapter=${id} -> nije obrađen ovaj put (vidi upozorenje gore)`);
    }
  }

  const sampleCount = Math.min(5, passed.length);
  if (sampleCount > 0) {
    console.log(`\n=== ${sampleCount} SAŽETAKA ZA OPĆI PREGLED (ravnomjerno raspoređeno) ===`);
    const step = Math.max(1, Math.floor(passed.length / sampleCount));
    for (let i = 0; i < passed.length && i / step < sampleCount; i += step) {
      const p = passed[i];
      console.log(`\n  chapter=${p.id}`);
      console.log(`  SAŽETAK: ${p.summary}`);
    }
  }
}

main().catch((err) => {
  console.error("[Summaries] Fatal:", err);
  process.exitCode = 1;
});
