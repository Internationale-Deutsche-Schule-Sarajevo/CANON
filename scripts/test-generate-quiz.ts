/**
 * Temporary test script — Sprint 12 quiz question generation smoke test.
 * Same pattern as scripts/test-generate-chapters.ts (Sprint 10).
 *
 * Generates quiz questions for a small subset of chapters, calling the same
 * generateQuestionsForChapter() building block generateAllQuizQuestions()
 * uses — without touching that function, the API route, or requiring a
 * logged-in session. Safe to delete once you're done testing.
 *
 * Run (bash / git-bash):
 *   NODE_OPTIONS="--env-file=.env" npx tsx scripts/test-generate-quiz.ts 1
 *
 * Run (PowerShell):
 *   $env:NODE_OPTIONS="--env-file=.env"; npx tsx scripts/test-generate-quiz.ts 1
 *
 * Argument: how many chapters to test with (default 1). Picks the first N
 * chapters (order_index order) that don't have any quiz_questions yet —
 * generateQuestionsForChapter() is already idempotent (skips chapters with
 * >= 15 questions), so re-running this script just picks up the next N
 * un-quizzed chapters rather than redoing the same ones.
 */

import { getAllChapters } from "../src/features/handbook/repository";
import {
  getQuestionCountForChapter,
  getQuestionPoolForChapter,
} from "../src/features/quiz/repository";
import { generateQuestionsForChapter } from "../src/features/quiz/generator";

async function main() {
  const limit = Number(process.argv[2]) || 1;

  const allChapters = await getAllChapters();

  const withoutQuestions: typeof allChapters = [];
  for (const chapter of allChapters) {
    const count = await getQuestionCountForChapter(chapter.id);
    if (count === 0) withoutQuestions.push(chapter);
    if (withoutQuestions.length >= limit) break;
  }

  if (withoutQuestions.length === 0) {
    console.log("[Test] No chapters without quiz questions found.");
    return;
  }

  console.log(
    `[Test] Testing quiz generation for ${withoutQuestions.length} chapter(s):`,
  );
  withoutQuestions.forEach((c, i) => console.log(`  ${i + 1}. ${c.title}`));

  let succeeded = 0;
  let failed = 0;

  for (const [index, chapter] of withoutQuestions.entries()) {
    console.log(`\n[Test] (${index + 1}/${withoutQuestions.length}) ${chapter.title}...`);
    try {
      const result = await generateQuestionsForChapter(chapter.id);

      if (result.error) {
        console.error(`[Test] GREŠKA (${chapter.title}): ${result.error}`);
        failed++;
        continue;
      }

      console.log(
        `[Test] OK: ${result.generated} pitanja generisano ` +
          `(${result.invalidCount} preskočeno kao neispravna)`,
      );

      const pool = await getQuestionPoolForChapter(chapter.id);
      for (const q of pool.slice(0, 2)) {
        console.log(`[Test] Preview: ${q.question}`);
        q.options.forEach((opt, i) => {
          const marker = i === q.correct_index ? "*" : " ";
          console.log(`    [${marker}] ${String.fromCharCode(65 + i)}. ${opt}`);
        });
        console.log(`    Objašnjenje: ${q.explanation}`);
      }

      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Test] GREŠKA (${chapter.title}): ${message}`);
      failed++;
    }
  }

  console.log(`\n[Test] Done: ${succeeded} succeeded, ${failed} failed.`);
  process.exitCode = failed > 0 && succeeded === 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("[Test] Fatal:", err);
  process.exitCode = 1;
});
