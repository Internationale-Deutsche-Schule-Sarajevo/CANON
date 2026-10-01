/**
 * Scoped quiz fix — Agenda chapter only (de22f60c-...). Its existing 15 quiz
 * questions were written against the pre-fix chapter content, which carried
 * the OCR misread "Laboratorija Nekeda" / "prelijevanje ruku" (see
 * scripts/agenda-fix-ocr-and-regenerate.ts for the OCR correction + chapter
 * regeneration this follows). 3 of the 15 questions embed the wrong name in
 * their question text or answer options. Same pattern as
 * scripts/scoped-quiz-fix-ocr-chapters.ts: deleteQuestionsForChapter() is
 * called only for this one explicit chapter id, never globally.
 *
 * Run: npx tsx --env-file=.env scripts/agenda-scoped-quiz-fix.ts
 */
import { getQuestionCountForChapter, deleteQuestionsForChapter } from "../src/features/quiz/repository";
import { generateQuestionsForChapter } from "../src/features/quiz/generator";
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

const CHAPTER_ID = "de22f60c-53d7-49e6-b335-9774ba5c09f2";

async function main() {
  console.log(`=== Agenda (${CHAPTER_ID}) ===`);
  const before = await getQuestionCountForChapter(CHAPTER_ID);
  console.log(`  pitanja prije (za stari, fabriciran naziv): ${before}`);

  const deleted = await deleteQuestionsForChapter(CHAPTER_ID);
  console.log(`  obrisano (SCOPED, samo ovaj chapter_id): ${deleted}`);

  const result = await generateQuestionsForChapter(CHAPTER_ID);
  console.log(
    `  generisanje: generated=${result.generated} skipped=${result.skipped} ` +
      `invalidCount=${result.invalidCount} error=${result.error ?? "(none)"}`,
  );

  const after = await getQuestionCountForChapter(CHAPTER_ID);
  console.log(`  pitanja poslije: ${after}  (očekivano 15)`);

  const supabase = createSupabaseDirectAdmin();
  const { data: questions, error } = await supabase
    .from("quiz_questions")
    .select("id, question, options")
    .eq("chapter_id", CHAPTER_ID);
  if (error) throw error;

  const stillBad = (questions ?? []).filter((q) =>
    /nekeda|prelijevanje ruku/i.test(JSON.stringify(q)),
  );
  console.log(`  pitanja koja i dalje sadrže stari naziv: ${stillBad.length}`);
  if (stillBad.length > 0) {
    for (const q of stillBad) console.log("   -", q.question);
  }

  console.log("\n=== Sva nova pitanja (za pregled) ===");
  for (const q of questions ?? []) {
    console.log(`- ${q.question}`);
    console.log(`  ${JSON.stringify(q.options)}`);
  }
}

main().catch((err) => {
  console.error("[AgendaScopedQuizFix] Fatal:", err);
  process.exitCode = 1;
});
