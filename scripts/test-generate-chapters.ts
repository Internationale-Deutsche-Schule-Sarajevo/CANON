/**
 * Temporary test script — Sprint 10 chapter generation smoke test.
 *
 * Generates chapters for a small subset of active documents, calling the same
 * generateChapterForDocument() building block generateAllChapters() uses —
 * without touching generateAllChapters() itself, the API route, or requiring a
 * logged-in session. Safe to delete once you're done testing.
 *
 * Run (bash / git-bash):
 *   NODE_OPTIONS="--env-file=.env" npx tsx scripts/test-generate-chapters.ts 3
 *
 * Run (PowerShell):
 *   $env:NODE_OPTIONS="--env-file=.env"; npx tsx scripts/test-generate-chapters.ts 3
 *
 * Argument: how many documents to test with (default 3). Picks the first N
 * active documents in import/approval order (same order generateAllChapters()
 * would use). Deletes any existing chapter for the targeted documents first,
 * so the script is safe to re-run repeatedly while iterating.
 */

import {
  getActiveDocuments,
  deleteChapterForDocument,
  storeChapter,
} from "../src/features/handbook/repository";
import { generateChapterForDocument } from "../src/features/handbook/generator";

async function main() {
  const limit = Number(process.argv[2]) || 3;

  const activeDocs = await getActiveDocuments();
  const targets = activeDocs.slice(0, limit);

  if (targets.length === 0) {
    console.log("[Test] No active documents found.");
    return;
  }

  console.log(`[Test] Testing chapter generation for ${targets.length} document(s):`);
  targets.forEach((d, i) => console.log(`  ${i + 1}. ${d.filename}`));

  let succeeded = 0;
  let failed = 0;

  for (const [index, doc] of targets.entries()) {
    console.log(`\n[Test] (${index + 1}/${targets.length}) ${doc.filename}...`);
    try {
      // Clear any existing chapter so the script is safely re-runnable.
      await deleteChapterForDocument(doc.id);

      const { title, content } = await generateChapterForDocument(doc.id, doc.filename);
      await storeChapter(doc.id, title, content, index);

      console.log(`[Test] OK: "${title}" (${content.length} znakova)`);
      console.log(`[Test] Preview: ${content.slice(0, 200)}...`);
      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Test] GREŠKA (${doc.filename}): ${message}`);
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
