/**
 * Read-only survey — find other active documents whose stored content is the
 * "this is a binary file" placeholder stub (same shape as Agenda/Rjesenje
 * Maturalna Komisija before their OCR fix): tiny file_size_bytes AND
 * document_chunks.text containing the stub fingerprint. Reports only —
 * touches nothing.
 *
 * Run: npx tsx --env-file=.env scripts/survey-stub-documents.ts
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

const STUB_FINGERPRINT = "this is a binary file";
const SIZE_THRESHOLD = 1000;

async function main() {
  const supabase = createSupabaseDirectAdmin();

  const { data: docs, error: docErr } = await supabase
    .from("documents")
    .select("id, filename, original_name, file_size_bytes, status, ocr_processed")
    .eq("status", "active")
    .lt("file_size_bytes", SIZE_THRESHOLD);
  if (docErr) throw new Error(`documents fetch failed: ${docErr.message}`);

  console.log(`[Survey] ${docs?.length ?? 0} active document(s) under ${SIZE_THRESHOLD} bytes — checking chunk text...`);

  const stubDocs: typeof docs = [];
  for (const doc of docs ?? []) {
    const { data: chunks, error: chunkErr } = await supabase
      .from("document_chunks")
      .select("text")
      .eq("document_id", doc.id)
      .eq("document_status", "active");
    if (chunkErr) throw new Error(`chunks fetch failed for ${doc.id}: ${chunkErr.message}`);

    const combined = (chunks ?? []).map((c) => c.text).join(" ").toLowerCase();
    if (combined.includes(STUB_FINGERPRINT)) {
      stubDocs.push(doc);
    }
  }

  console.log(`\n=== Stub-sourced active documents (${stubDocs.length}) ===`);
  if (stubDocs.length === 0) {
    console.log("(0 rows)");
  } else {
    for (const doc of stubDocs) {
      const { data: chapter } = await supabase
        .from("handbook_chapters")
        .select("id, title, is_published")
        .eq("document_id", doc.id)
        .maybeSingle();
      const questionCount = chapter
        ? (
            await supabase
              .from("quiz_questions")
              .select("*", { count: "exact", head: true })
              .eq("chapter_id", chapter.id)
          ).count
        : null;
      console.log(
        `- ${doc.original_name}  (doc:${doc.id}, ${doc.file_size_bytes}B, ocr_processed=${doc.ocr_processed}) ` +
          `-> chapter: ${chapter ? `${chapter.title} (${chapter.id}, published=${chapter.is_published}, questions=${questionCount})` : "NONE"}`,
      );
    }
  }
}

main().catch((err) => {
  console.error("[Survey] Fatal:", err);
  process.exitCode = 1;
});
