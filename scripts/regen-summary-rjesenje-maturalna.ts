/**
 * One-off: regenerate ONLY the "Pročitaj više" summary for Rjesenje
 * Maturalna Komisija (chapter_id 36bc0bec-45f9-4a08-b176-23d3c3d2031e) using
 * the updated prompt/validator — named-persons length exception in
 * summary-generator.ts's SUMMARY_SYSTEM_PROMPT, MAX_SUMMARY_LENGTH raised to
 * 1500 in summary-validation.ts. Director wants this one sample reviewed
 * before Wave A (generate-chapter-summaries.ts) runs against the full batch.
 *
 * Writes handbook_chapters.summary only if validation passes; otherwise
 * prints the rejection reasons and the attempted text and leaves summary
 * untouched (same discipline as generate-chapter-summaries.ts's per-chapter
 * handling).
 *
 * Run: npx tsx --env-file=.env scripts/regen-summary-rjesenje-maturalna.ts
 */
import { getChapterById, updateChapterSummary } from "../src/features/handbook/repository";
import { generateSummaryForChapter } from "../src/features/handbook/summary-generator";

const CHAPTER_ID = "36bc0bec-45f9-4a08-b176-23d3c3d2031e";

async function main() {
  const chapter = await getChapterById(CHAPTER_ID);
  if (!chapter) throw new Error(`Chapter ${CHAPTER_ID} nije pronađen.`);

  console.log(`=== ${chapter.title} ===`);
  console.log(`Puni tekst: ${chapter.content.length} znakova`);
  if (chapter.summary) {
    console.log(`Postojeći sažetak (bit će prepisan ako novi prođe): ${chapter.summary.length} znakova`);
    console.log(chapter.summary);
  } else {
    console.log("Postojeći sažetak: (nema)");
  }

  const result = await generateSummaryForChapter(chapter.content);

  if (!result.ok) {
    console.log(`\n❌ ODBIJEN — ništa nije upisano u bazu.`);
    console.log(`Razlozi: ${result.reasons.join("; ")}`);
    console.log(`\nPokušaj (${result.attemptedSummary.length} znakova):`);
    console.log(result.attemptedSummary);
    process.exitCode = 1;
    return;
  }

  await updateChapterSummary(CHAPTER_ID, result.summary);
  console.log(`\n✅ PROŠAO i upisan (${result.summary.length} znakova, limit 1500):`);
  console.log(result.summary);
}

main().catch((err) => {
  console.error("[RegenSummaryRjesenje] Fatal:", err);
  process.exitCode = 1;
});
