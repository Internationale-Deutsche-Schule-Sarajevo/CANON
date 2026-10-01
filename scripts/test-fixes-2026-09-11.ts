/**
 * Real test (not just type-check) for the two 2026-09-11 fixes, using
 * disposable synthetic fixtures (never touches real IDSS content) so it's
 * cheap, deterministic, and doesn't burn Gemini quota — it exercises the
 * actual DB-level logic (storeChapter's auto-categorization,
 * unpublishChaptersForSupersededVersions, approveStagingDocument's existing
 * archive-by-original_name behavior) directly rather than going through the
 * full upload-UI -> OCR -> chunk -> embed -> Gemini chapter-generation path.
 *
 * Test 1 — replacement archiving: two documents share an original_name; the
 *   second is approved (existing archive-old-document logic); a chapter is
 *   stored for each; unpublishChaptersForSupersededVersions is called after
 *   the second chapter is stored (mirrors pipeline/worker.ts's ordering) and
 *   must unpublish only the OLD chapter, leaving the NEW one published.
 *
 * Test 2 — auto-categorization: storeChapter() is called with a title that
 *   should match a known keyword rule (Priority 3 -> "12. Eksterna matura i
 *   vanjsko vrednovanje") and one that should match nothing (-> literal
 *   string "Nekategorisano", not NULL) — both checked against the actual
 *   inserted row, not just the pure categorizeChapterTitle() function.
 *
 * All fixture rows are deleted in a `finally` block regardless of outcome.
 *
 * Run: npx tsx --env-file=.env scripts/test-fixes-2026-09-11.ts
 */
import "dotenv/config";
import { randomUUID } from "crypto";
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { insertStagingDocument, approveStagingDocument } from "../src/features/documents/upload-repository";
import { storeChapter, unpublishChaptersForSupersededVersions } from "../src/features/handbook/repository";
import { categorizeChapterTitle, SECTIONS, UNCATEGORIZED } from "../src/features/handbook/section-rules";

const DIRECTOR_USER_ID = "5d422c91-ade4-452d-9da7-97038542c50b"; // direktor@idss.ba, super_admin — FK target only, not modified

async function getChapterRow(supabase: ReturnType<typeof createSupabaseDirectAdmin>, id: string) {
  const { data, error } = await supabase
    .from("handbook_chapters")
    .select("id, is_published, section")
    .eq("id", id)
    .single();
  if (error) throw new Error(`getChapterRow(${id}) failed: ${error.message}`);
  return data;
}

async function testReplacementArchiving(): Promise<{ pass: boolean; details: string[] }> {
  const supabase = createSupabaseDirectAdmin();
  const details: string[] = [];
  const originalName = `TEST_REPLACEMENT_${Date.now()}.docx`;
  const docAId = randomUUID();
  const docBId = randomUUID();
  const cleanupDocIds: string[] = [];
  const cleanupChapterIds: string[] = [];

  try {
    // Document A: inserted directly as already-active (represents "the
    // current version before a replacement is uploaded").
    const { error: insertAError } = await supabase.from("documents").insert({
      id: docAId,
      filename: originalName,
      original_name: originalName,
      status: "active",
      content_hash: `test-hash-a-${docAId}`,
      file_size_bytes: 100,
      mime_type: "text/plain",
      uploaded_by: DIRECTOR_USER_ID,
      approved_by: DIRECTOR_USER_ID,
      approved_at: new Date().toISOString(),
      metadata: {},
    });
    if (insertAError) throw new Error(`insert doc A failed: ${insertAError.message}`);
    cleanupDocIds.push(docAId);
    details.push(`Doc A (${docAId}) inserted as active, original_name="${originalName}"`);

    const chapterAId = await storeChapter(docAId, "Test Replacement Chapter v1", "Sadržaj verzije 1.", 99990);
    cleanupChapterIds.push(chapterAId);
    details.push(`Chapter A (${chapterAId}) stored for doc A`);

    const chapterABefore = await getChapterRow(supabase, chapterAId);
    details.push(`Chapter A before replacement: is_published=${chapterABefore.is_published}`);
    if (!chapterABefore.is_published) throw new Error("Precondition failed: chapter A should start published");

    // Document B: inserted as 'staging' with the SAME original_name, then
    // approved through the real approveStagingDocument() — this is the
    // exact function the admin approval route calls, so it exercises the
    // existing archive-old-document-by-original_name logic for real.
    await insertStagingDocument({
      documentId: docBId,
      originalName,
      mimeType: "text/plain",
      sizeBytes: 100,
      contentHash: `test-hash-b-${docBId}`,
      uploadedBy: DIRECTOR_USER_ID,
      metadata: {},
    });
    cleanupDocIds.push(docBId);
    details.push(`Doc B (${docBId}) inserted as staging, same original_name`);

    const approveResult = await approveStagingDocument(docBId, DIRECTOR_USER_ID);
    details.push(
      `approveStagingDocument(B) -> archivedOldDocumentId=${approveResult.archivedOldDocumentId} (expected ${docAId})`,
    );
    if (approveResult.archivedOldDocumentId !== docAId) {
      throw new Error(
        `approveStagingDocument did not archive doc A as expected (got ${approveResult.archivedOldDocumentId})`,
      );
    }

    // Mirrors pipeline/worker.ts's chapter step: store the new chapter for B,
    // THEN call unpublishChaptersForSupersededVersions.
    const chapterBId = await storeChapter(docBId, "Test Replacement Chapter v2", "Sadržaj verzije 2.", 99991);
    cleanupChapterIds.push(chapterBId);
    details.push(`Chapter B (${chapterBId}) stored for doc B`);

    const unpublishedCount = await unpublishChaptersForSupersededVersions(docBId, originalName);
    details.push(`unpublishChaptersForSupersededVersions(B) -> unpublished ${unpublishedCount} chapter(s) (expected 1)`);

    const chapterAAfter = await getChapterRow(supabase, chapterAId);
    const chapterBAfter = await getChapterRow(supabase, chapterBId);
    details.push(`Chapter A after: is_published=${chapterAAfter.is_published} (expected false)`);
    details.push(`Chapter B after: is_published=${chapterBAfter.is_published} (expected true)`);

    const pass =
      unpublishedCount === 1 &&
      chapterAAfter.is_published === false &&
      chapterBAfter.is_published === true;

    return { pass, details };
  } finally {
    if (cleanupChapterIds.length > 0) {
      await supabase.from("handbook_chapters").delete().in("id", cleanupChapterIds);
    }
    if (cleanupDocIds.length > 0) {
      await supabase.from("documents").delete().in("id", cleanupDocIds);
    }
    details.push(`Cleanup: deleted ${cleanupChapterIds.length} chapter(s), ${cleanupDocIds.length} document(s)`);
  }
}

async function testAutoCategorization(): Promise<{ pass: boolean; details: string[] }> {
  const supabase = createSupabaseDirectAdmin();
  const details: string[] = [];
  const docId = randomUUID();
  const cleanupChapterIds: string[] = [];

  try {
    // FK target only — chapter.document_id must reference a real row, content unused.
    const { error: insertDocError } = await supabase.from("documents").insert({
      id: docId,
      filename: `TEST_CATEGORIZATION_${Date.now()}.docx`,
      original_name: `TEST_CATEGORIZATION_${Date.now()}.docx`,
      status: "active",
      content_hash: `test-hash-cat-${docId}`,
      file_size_bytes: 100,
      mime_type: "text/plain",
      uploaded_by: DIRECTOR_USER_ID,
      metadata: {},
    });
    if (insertDocError) throw new Error(`insert test doc failed: ${insertDocError.message}`);

    // Recognizable title -> should match Priority 3 (external exams).
    const recognizableTitle = "Uputstvo Za Provođenje Eksterne Mature 2026 TEST";
    const expectedSection = categorizeChapterTitle(recognizableTitle);
    details.push(`categorizeChapterTitle("${recognizableTitle}") = "${expectedSection}" (pure function)`);
    if (expectedSection !== SECTIONS.S12) {
      throw new Error(`Test title didn't match the expected rule in the pure function — fix the test, not the code.`);
    }

    const chapterId1 = await storeChapter(docId, recognizableTitle, "Test sadržaj.", 99992);
    cleanupChapterIds.push(chapterId1);
    const row1 = await getChapterRow(supabase, chapterId1);
    details.push(`storeChapter() actual DB row section = "${row1.section}" (expected "${SECTIONS.S12}")`);

    // Unrecognizable title -> should land on literal "Nekategorisano", not NULL.
    const unrecognizableTitle = `Xyzabc Qwerty Random Test Title ${Date.now()}`;
    const chapterId2 = await storeChapter(docId, unrecognizableTitle, "Test sadržaj.", 99993);
    cleanupChapterIds.push(chapterId2);
    const row2 = await getChapterRow(supabase, chapterId2);
    details.push(`storeChapter() actual DB row section (unrecognizable title) = "${row2.section}" (expected "${UNCATEGORIZED}")`);

    const pass = row1.section === SECTIONS.S12 && row2.section === UNCATEGORIZED;
    return { pass, details };
  } finally {
    if (cleanupChapterIds.length > 0) {
      await supabase.from("handbook_chapters").delete().in("id", cleanupChapterIds);
    }
    await supabase.from("documents").delete().eq("id", docId);
    details.push(`Cleanup: deleted ${cleanupChapterIds.length} chapter(s), 1 document`);
  }
}

async function main() {
  console.log("=== TEST 1: Arhiviranje starog poglavlja pri zamjeni dokumenta ===\n");
  const test1 = await testReplacementArchiving();
  for (const line of test1.details) console.log("  " + line);
  console.log(`\nTEST 1 REZULTAT: ${test1.pass ? "✅ PROŠAO" : "❌ PAO"}\n`);

  console.log("=== TEST 2: Automatska kategorizacija novog poglavlja ===\n");
  const test2 = await testAutoCategorization();
  for (const line of test2.details) console.log("  " + line);
  console.log(`\nTEST 2 REZULTAT: ${test2.pass ? "✅ PROŠAO" : "❌ PAO"}\n`);

  console.log("=== ZAKLJUČAK ===");
  console.log(`Test 1 (arhiviranje): ${test1.pass ? "PROŠAO" : "PAO"}`);
  console.log(`Test 2 (kategorizacija): ${test2.pass ? "PROŠAO" : "PAO"}`);

  if (!test1.pass || !test2.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[TestFixes] Fatal:", err);
  process.exitCode = 1;
});
