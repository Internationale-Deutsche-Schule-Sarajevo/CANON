/**
 * OCR repoint-and-regenerate — fabrication fix for chapters whose source
 * document is actually a binary-stub placeholder (imported_from: 'USTAV'
 * legacy import never OCR'd the real image; documents.storage_path pointed
 * at "ASSETS/<name>.md", a stub that literally says "this is a binary file").
 *
 * For each target: real image -> transcribeImageBuffer() (Gemini vision OCR)
 * -> replace this document's document_chunks (delete old stub chunk(s),
 * insert freshly chunked real OCR text, document_status='active' — these are
 * already-active legacy documents, not staging, so insertStagingChunks()
 * doesn't apply) -> patch documents row (storage_path/content_hash/mime_type/
 * file_size_bytes/ocr_processed) -> generateChapterForDocument() reads the
 * now-current chunks -> updateChapterContent() in place (same chapter id/
 * order_index, no delete+insert, no forceRegenerate).
 *
 * Does NOT touch is_published or quiz_questions — those are separate,
 * explicitly-gated decisions made after reading the actual OCR output.
 *
 * Run: npx tsx --env-file=.env scripts/ocr-repoint-and-regenerate.ts
 */
import { createHash } from "crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { transcribeImageBuffer } from "../src/features/documents/services/ocr";
import { chunkDocument } from "../src/lib/rag/chunker";
import { getChapterById, updateChapterContent } from "../src/features/handbook/repository";
import { generateChapterForDocument } from "../src/features/handbook/generator";

type Target = {
  chapterId: string;
  documentId: string;
  pngFilename: string;
  originalFilename: string; // used as the "filename" the generator derives a title from
};

// Round 2 — same stub-fabrication defect, found by the C survey.
const TARGETS: Target[] = [
  {
    chapterId: "bbbc0750-4cec-4d2c-9283-337cb1f57840",
    documentId: "c1a0b320-8f97-4822-a4ea-f1386824bfb6",
    pngFilename: "Pravila_Ucionice_I-IV_Razred.png",
    originalFilename: "Pravila_Ucionice_I-IV_Razred.md",
  },
  {
    chapterId: "398e9f6d-0637-4552-9953-7dfde6614040",
    documentId: "df4efaf7-12f3-488b-87fb-b51e3ccc3dc1",
    pngFilename: "Pravila_učionice_V-IX_Razred.png",
    originalFilename: "Pravila_učionice_V-IX_Razred.md",
  },
];

const OCR_MAX_ATTEMPTS = 3;

async function replaceChunks(documentId: string, markdown: string): Promise<number> {
  const supabase = createSupabaseDirectAdmin();

  const { error: deleteError } = await supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", documentId);
  if (deleteError) throw new Error(`Brisanje starih chunkova nije uspjelo: ${deleteError.message}`);

  const chunks = chunkDocument(markdown);
  const rows = chunks.map((chunk) => ({
    document_id: documentId,
    chunk_index: chunk.chunkIndex,
    text: chunk.text,
    embedding: null, // Sprint 16 embedding migration handles this later, same as every other chunk in this table
    document_status: "active" as const,
    char_offset_start: chunk.charOffsetStart,
    char_offset_end: chunk.charOffsetEnd,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from("document_chunks").insert(batch);
    if (error) throw new Error(`Upis novih chunkova nije uspio: ${error.message}`);
  }

  return rows.length;
}

async function repointDocument(documentId: string, pngPath: string, markdown: string, sizeBytes: number) {
  const supabase = createSupabaseDirectAdmin();
  const contentHash = createHash("sha256").update(markdown, "utf8").digest("hex");

  const { error } = await supabase
    .from("documents")
    .update({
      storage_path: pngPath,
      content_hash: contentHash,
      mime_type: "image/png",
      file_size_bytes: sizeBytes,
      ocr_processed: true,
    })
    .eq("id", documentId);
  if (error) throw new Error(`Repoint dokumenta nije uspio: ${error.message}`);
}

async function main() {
  for (const target of TARGETS) {
    console.log(`\n${"=".repeat(70)}\n[OCR-Repoint] ${target.pngFilename}\n${"=".repeat(70)}`);

    const pngPath = path.resolve("repo/ASSETS", target.pngFilename);
    const buffer = await fs.readFile(pngPath);
    console.log(`  slika: ${buffer.length} bajta`);

    let ocr: Awaited<ReturnType<typeof transcribeImageBuffer>> | null = null;
    for (let attempt = 1; attempt <= OCR_MAX_ATTEMPTS; attempt++) {
      try {
        ocr = await transcribeImageBuffer(buffer, "image/png");
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ⚠️  OCR pokušaj ${attempt}/${OCR_MAX_ATTEMPTS} pukao: ${message}`);
        if (attempt === OCR_MAX_ATTEMPTS) {
          console.error(`  ❌ OCR neuspješan nakon ${OCR_MAX_ATTEMPTS} pokušaja — preskačem ovaj fajl, ništa nije mijenjano.`);
        }
      }
    }
    if (!ocr) continue;

    console.log(`  OCR finishReason: ${ocr.finishReason ?? "(n/a)"}  tokensUsed: ${ocr.tokensUsed}`);
    console.log(`  OCR tekst (${ocr.text.length} znakova):\n`);
    console.log(ocr.text);

    if (!ocr.text.trim()) {
      console.error(`  ❌ OCR nije vratio tekst — preskačem repoint/regeneraciju za ovaj fajl.`);
      continue;
    }

    const chunkCount = await replaceChunks(target.documentId, ocr.text);
    console.log(`\n  document_chunks osvježeno: ${chunkCount} novih chunk(ova), stari obrisani (scoped na ovaj document_id).`);

    await repointDocument(target.documentId, `ASSETS/${target.pngFilename}`, ocr.text, buffer.length);
    console.log(`  documents row repoint-ovan (storage_path, content_hash, mime_type, file_size_bytes, ocr_processed).`);

    let chapterContent: string | null = null;
    for (let attempt = 1; attempt <= OCR_MAX_ATTEMPTS; attempt++) {
      try {
        const result = await generateChapterForDocument(target.documentId, target.originalFilename);
        chapterContent = result.content;
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ⚠️  Generisanje poglavlja pokušaj ${attempt}/${OCR_MAX_ATTEMPTS} pukao: ${message}`);
      }
    }
    if (!chapterContent) {
      console.error(`  ❌ Generisanje poglavlja neuspješno nakon ${OCR_MAX_ATTEMPTS} pokušaja. document_chunks/documents JESU ažurirani (pravi OCR tekst), ali handbook_chapters.content NIJE — staro (fabrikovano) poglavlje ostaje dok se ne ponovi ovaj korak.`);
      continue;
    }

    await updateChapterContent(target.chapterId, chapterContent);
    console.log(`  handbook_chapters.content ažuriran in-place (${chapterContent.length} znakova), isti id/order_index.`);

    const updated = await getChapterById(target.chapterId);
    console.log(`\n  --- Novi sadržaj poglavlja (${updated?.content.length} znakova) ---`);
    console.log(updated?.content);
  }
}

main().catch((err) => {
  console.error("[OCR-Repoint] Fatal:", err);
  process.exitCode = 1;
});
