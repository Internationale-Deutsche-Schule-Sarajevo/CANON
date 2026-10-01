/**
 * Read-only dump — raw OCR chunk text for the Agenda chapter/document, plus
 * the currently stored (possibly fabricated) chapter content for comparison.
 * No writes.
 *
 * Run: npx tsx --env-file=.env scripts/dump-agenda-raw-ocr.ts
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

const CHAPTER_ID = "de22f60c-53d7-49e6-b335-9774ba5c09f2";

async function main() {
  const supabase = createSupabaseDirectAdmin();

  const { data: chapter, error: chErr } = await supabase
    .from("handbook_chapters")
    .select("id, title, document_id, is_published, content, generated_at")
    .eq("id", CHAPTER_ID)
    .single();
  if (chErr) throw new Error(`chapter fetch failed: ${chErr.message}`);

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, filename, original_name, storage_path, mime_type, file_size_bytes, ocr_processed")
    .eq("id", chapter.document_id)
    .single();
  if (docErr) throw new Error(`document fetch failed: ${docErr.message}`);

  const { data: chunks, error: chunkErr } = await supabase
    .from("document_chunks")
    .select("chunk_index, text, document_status")
    .eq("document_id", chapter.document_id)
    .order("chunk_index", { ascending: true });
  if (chunkErr) throw new Error(`chunks fetch failed: ${chunkErr.message}`);

  console.log("#".repeat(80));
  console.log(`# CHAPTER: ${chapter.title} (${chapter.id})`);
  console.log(`# is_published=${chapter.is_published}  generated_at=${chapter.generated_at}`);
  console.log("#".repeat(80));

  console.log("\n=== DOCUMENT ROW ===");
  console.log(JSON.stringify(doc, null, 2));

  console.log(`\n=== RAW document_chunks (${chunks?.length ?? 0} chunk(s)) ===`);
  for (const c of chunks ?? []) {
    console.log(`\n--- chunk_index=${c.chunk_index} status=${c.document_status} length=${c.text.length} ---`);
    console.log(c.text);
  }

  console.log(`\n=== CURRENTLY STORED (possibly fabricated) handbook_chapters.content (${chapter.content.length} znakova) ===`);
  console.log(chapter.content);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exitCode = 1;
});
