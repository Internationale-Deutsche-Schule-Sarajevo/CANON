/**
 * Document Upload Pipeline — Sprint 09
 * Orchestrates: download from Storage -> extract -> convert to Markdown -> hash -> diff
 * -> chunk -> store.
 *
 * Direct-to-storage upload: the browser uploads the original file straight to Supabase
 * Storage using a signed upload URL (see /api/documents/upload-url), bypassing the
 * Next.js server's request body entirely. By the time processUpload() runs, the file
 * already exists at `storagePath` — this function downloads it server-side (no incoming
 * request body size limit applies to that) rather than receiving it as a request body.
 *
 * SCOPE ADJUSTMENT (Sprint 09): embedding generation is deliberately skipped.
 * document_chunks.embedding is left NULL and document_status is set to 'staging'.
 * The live database uses 768-dim vectors from a local sentence-transformers model,
 * while src/lib/rag/embedder.ts still calls Gemini — that mismatch is resolved in
 * Sprint 16 (transformers.js migration). Do not call embedTexts() from this file.
 */

import { createHash } from "crypto";
import { chunkDocument } from "@/lib/rag/chunker";
import { logAuditEvent } from "@/lib/audit-log";
import { extractByMimeType } from "./services/text-extraction";
import { computeDiffSummary, type DiffSummary } from "./services/diff";
import { downloadFromStaging, uploadToStaging } from "./services/storage";
import {
  getActiveDocumentByOriginalName,
  getActiveDocumentMarkdown,
  insertStagingDocument,
  insertStagingChunks,
  patchDocumentMetadata,
  updateDocumentStoragePath,
} from "./upload-repository";

export type ProcessUploadResult = {
  documentId: string;
  filename: string;
  chunksCreated: number;
  ocrUsed: boolean;
  manualReviewNeeded: boolean;
  diffSummary: DiffSummary;
  isDuplicate: boolean;
};

function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function processUpload(params: {
  documentId: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
}): Promise<ProcessUploadResult> {
  const { documentId, storagePath, originalFilename, mimeType, sizeBytes, uploadedBy } = params;

  // The client already uploaded the original file directly to Storage via a signed URL.
  // Download it here for extraction — this is a server-side outbound call, not an
  // incoming request body, so it isn't subject to any platform request body size limit.
  const buffer = await downloadFromStaging(storagePath);
  if (!buffer) {
    throw new Error(
      "Fajl nije pronađen u Storage-u. Upload možda nije uspio ili je istekao signed URL.",
    );
  }

  // Step 4: text extraction (DOCX/XLSX/PDF/PNG/JPEG). Images always go through Gemini
  // OCR; PDFs fall back to per-page OCR automatically when the text layer is missing or
  // implausibly thin (see services/text-extraction.ts + services/ocr.ts). Extraction
  // failures — including OCR still yielding too little text — are non-fatal: the
  // document is flagged for manual review, never silently turned into a chapter.
  const extraction = await extractByMimeType(buffer, mimeType);
  const markdown = extraction.markdown;

  // Step 7: hash of the converted Markdown content.
  const contentHash = computeHash(markdown);

  // Step 8: compare against the current active document with the same filename.
  const activeDoc = await getActiveDocumentByOriginalName(originalFilename);
  const isDuplicate = !!activeDoc && activeDoc.content_hash === contentHash;

  // Step 1-3 (validated by caller) + insert staging row. The original file is already
  // at storagePath (uploaded directly by the client) — just record that path.
  await insertStagingDocument({
    documentId,
    originalName: originalFilename,
    mimeType,
    sizeBytes,
    contentHash,
    uploadedBy,
    metadata: {
      ocr_used: extraction.ocrUsed,
      manual_review_needed: extraction.manualReviewNeeded,
      extraction_error: extraction.extractionError ?? null,
      extracted_text_length: extraction.plainText.length,
    },
  });
  await updateDocumentStoragePath(documentId, storagePath);

  if (markdown.trim().length > 0) {
    await uploadToStaging(`${documentId}/content.md`, Buffer.from(markdown, "utf-8"), "text/markdown");
  }

  // Step 9: diff summary against the active document's Markdown, when available.
  const oldMarkdown = activeDoc ? await getActiveDocumentMarkdown(activeDoc.id) : null;
  const diffSummary = computeDiffSummary(
    oldMarkdown,
    markdown,
    !!activeDoc,
    activeDoc ? activeDoc.content_hash !== contentHash : undefined,
  );
  await patchDocumentMetadata(documentId, { diff_summary: diffSummary });

  // Step 10: chunk content WITHOUT embedding. embedding=NULL, document_status='staging'.
  const chunks = chunkDocument(markdown);
  if (chunks.length > 0) {
    await insertStagingChunks(documentId, chunks);
  }

  // Step 11: Super Admin notification via audit_log (no dedicated notifications table).
  await logAuditEvent({
    userId: uploadedBy,
    action: "document_uploaded",
    entityType: "document",
    entityId: documentId,
    afterState: {
      filename: originalFilename,
      ocrUsed: extraction.ocrUsed,
      manualReviewNeeded: extraction.manualReviewNeeded,
      isDuplicate,
      chunksCreated: chunks.length,
    },
  });

  return {
    documentId,
    filename: originalFilename,
    chunksCreated: chunks.length,
    ocrUsed: extraction.ocrUsed,
    manualReviewNeeded: extraction.manualReviewNeeded,
    diffSummary,
    isDuplicate,
  };
}
