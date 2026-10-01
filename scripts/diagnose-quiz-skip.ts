/**
 * Diagnostic — replicates the EXACT skip decision generateAllQuizQuestions()
 * makes, using the real repository functions (getAllChapters,
 * getQuestionCountForChapter), with zero AI calls and zero writes.
 * Goal: confirm whether the button's own skip logic, run right now against
 * the live DB, matches the {succeeded:0, skipped:319, failed:0} report.
 *
 * Run: npx tsx --env-file=.env scripts/diagnose-quiz-skip.ts
 */
import { getAllChapters } from "../src/features/handbook/repository";
import { getQuestionCountForChapter } from "../src/features/quiz/repository";

const TARGET_QUESTION_COUNT = 15;

async function main() {
  const chapters = await getAllChapters();
  console.log(`getAllChapters() returned ${chapters.length} chapters (published only).`);

  let wouldSkip = 0;
  let wouldGenerate = 0;
  const generateList: { title: string; count: number }[] = [];
  const counts: number[] = [];

  for (const chapter of chapters) {
    const count = await getQuestionCountForChapter(chapter.id);
    counts.push(count);
    if (count >= TARGET_QUESTION_COUNT) {
      wouldSkip++;
    } else {
      wouldGenerate++;
      generateList.push({ title: chapter.title, count });
    }
  }

  console.log(`\nUsing the REAL generateQuestionsForChapter() skip condition (count >= ${TARGET_QUESTION_COUNT}):`);
  console.log(`  would skip:     ${wouldSkip}`);
  console.log(`  would generate: ${wouldGenerate}`);
  console.log(`  min count: ${Math.min(...counts)}  max count: ${Math.max(...counts)}  sum: ${counts.reduce((a, b) => a + b, 0)}`);

  if (wouldGenerate > 0) {
    console.log(`\nFirst 10 that WOULD generate (proves the count check itself is fine):`);
    for (const c of generateList.slice(0, 10)) {
      console.log(`  count=${c.count}\t${c.title}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
