/**
 * C-9 spot-check — read-only dump of stored OCR chunk text + document row
 * for 3 chapters, to compare against repo/ASSETS/ source images by hand.
 * No writes.
 *
 * Run: npx tsx --env-file=.env scripts/c9-spotcheck-dump.ts
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

const CHAPTER_IDS = [
  "36bc0bec-45f9-4a08-b176-23d3c3d2031e",
  "bbbc0750-4cec-4d2c-9283-337cb1f57840",
  "398e9f6d-0637-4552-9953-7dfde6614040",
];

async function main() {
  const supabase = createSupabaseDirectAdmin();

  for (const chapterId of CHAPTER_IDS) {
    const { data: chapter, error: chErr } = await supabase
      .from("handbook_chapters")
      .select("id, title, document_id")
      .eq("id", chapterId)
      .single();
    if (chErr) throw new Error(`${chapterId}: ${chErr.message}`);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, filename, original_name, storage_path, mime_type, file_size_bytes")
      .eq("id", chapter.document_id)
      .single();
    if (docErr) throw new Error(`${chapter.document_id}: ${docErr.message}`);

    const { data: chunks, error: chunkErr } = await supabase
      .from("document_chunks")
      .select("chunk_index, text")
      .eq("document_id", chapter.document_id)
      .eq("document_status", "active")
      .order("chunk_index", { ascending: true });
    if (chunkErr) throw new Error(`${chapter.document_id} chunks: ${chunkErr.message}`);

    console.log("#".repeat(80));
    console.log(`# ${chapter.title}  (chapter:${chapter.id}, doc:${doc.id})`);
    console.log(`# storage_path=${doc.storage_path}  mime=${doc.mime_type}  size=${doc.file_size_bytes}`);
    console.log("#".repeat(80));
    for (const c of chunks ?? []) {
      console.log(`\n--- chunk_index=${c.chunk_index} (${c.text.length} chars) ---`);
      console.log(c.text);
    }
    console.log("\n");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exitCode = 1;
});
