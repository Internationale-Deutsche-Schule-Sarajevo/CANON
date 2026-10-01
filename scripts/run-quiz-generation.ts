/**
 * Driver for the "4. Generiši kviz pitanja" admin action — chapter cleanup
 * campaign, post-regeneration pass. Calls the exact same
 * generateAllQuizQuestions() the /api/admin/generate-quiz-questions route
 * calls (that route is only an auth wrapper around it, see route.ts) so the
 * emptied chapters (deleteQuestionsForChapter() ran on every chapter
 * regenerate-truncated.ts touched) get fresh quiz pools. Idempotent —
 * chapters that already have >= 15 questions are skipped, so this is safe to
 * re-run.
 *
 * Run (Windows CMD):
 *   npx tsx --env-file=.env scripts\run-quiz-generation.ts
 */

import { generateAllQuizQuestions } from "../src/features/quiz/generator";

async function main() {
  const result = await generateAllQuizQuestions();
  console.log("\n[QuizGen driver] Final:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[QuizGen driver] Fatal:", err);
  process.exitCode = 1;
});
