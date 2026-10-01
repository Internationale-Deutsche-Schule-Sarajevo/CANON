/**
 * Scoped quiz fix — for the two OCR-repointed chapters only (Agenda, Rjesenje
 * Maturalna Komisija). Their existing 15 quiz questions were written against
 * fabricated content (generated from a "this is a binary file" stub) that has
 * since been replaced with real OCR'd content — the old questions no longer
 * match. Director-approved scoped delete: deleteQuestionsForChapter() is
 * called only for these two explicit chapter ids, never globally, never via
 * forceRegenerate.
 *
 * Run: npx tsx --env-file=.env scripts/scoped-quiz-fix-ocr-chapters.ts
 */
import { getQuestionCountForChapter, deleteQuestionsForChapter } from "../src/features/quiz/repository";
import { generateQuestionsForChapter } from "../src/features/quiz/generator";

const IDS = [
  { id: "bbbc0750-4cec-4d2c-9283-337cb1f57840", title: "Pravila Ucionice I IV Razred" },
  { id: "398e9f6d-0637-4552-9953-7dfde6614040", title: "Pravila učionice V IX Razred" },
];

async function main() {
  for (const { id, title } of IDS) {
    console.log(`\n=== ${title} (${id}) ===`);
    const before = await getQuestionCountForChapter(id);
    console.log(`  pitanja prije (za izmišljen sadržaj): ${before}`);

    const deleted = await deleteQuestionsForChapter(id);
    console.log(`  obrisano (SCOPED, samo ovaj chapter_id): ${deleted}`);

    const result = await generateQuestionsForChapter(id);
    console.log(
      `  generisanje: generated=${result.generated} skipped=${result.skipped} ` +
        `invalidCount=${result.invalidCount} error=${result.error ?? "(none)"}`,
    );

    const after = await getQuestionCountForChapter(id);
    console.log(`  pitanja poslije: ${after}  (očekivano 15)`);
  }
}

main().catch((err) => {
  console.error("[ScopedQuizFix] Fatal:", err);
  process.exitCode = 1;
});
