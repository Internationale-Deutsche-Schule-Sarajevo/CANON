/**
 * Upload Repository — all database access for the document upload/approval workflow.
 * Never call from UI components — only from upload-pipeline.ts, Server Actions, and API routes.
 *
 * Filename uniqueness note: `documents.filename` has a UNIQUE constraint, but multiple
 * revisions of "the same document" (old active + new staging) must exist simultaneously
 * during review. Staging rows are therefore inserted with a mangled filename
 * (`<name>::staging::<id>`); `original_name` (no unique constraint) always holds the
 * true, clean filename. On approval the old active row is renamed out of the canonical
 * slot (`<name>::archived::<id>`) and archived, then the staging row is renamed into
 * the now-free canonical slot and activated.
 *
 * Rejection note: document_status has no 'rejected' value (staging/active/archived only).
 * A rejected document is stored as status='archived' with rejection_reason populated;
 * documents archived because they were superseded by a newer version have
 * rejection_reason = NULL. That column is how the two cases are told apart.
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";
import type { Chunk } from "@/lib/rag/chunker";
import { downloadFromStaging, moveToArchived } from "./services/storage";

export async function getActiveDocumentByOriginalName(originalName: string) {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("documents")
    .select("id, filename, original_name, storage_path, content_hash, metadata")
    .eq("original_name", originalName)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`getActiveDocumentByOriginalName failed: ${error.message}`);
  return data;
}

/**
 * Fetch the Markdown content of an active document, if it was ever uploaded through
 * this pipeline. Returns null for legacy USTAV imports — those are local files on
 * disk and were never written to Supabase Storage, so there is nothing to diff against.
 */
export async function getActiveDocumentMarkdown(documentId: string): Promise<string | null> {
  const buffer = await downloadFromStaging(`${documentId}/content.md`);
  if (!buffer) return null;
  return buffer.toString("utf-8");
}

export async function insertStagingDocument(params: {
  documentId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  uploadedBy: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const stagingFilename = `${params.originalName}::staging::${params.documentId}`;

  const { error } = await supabase.from("documents").insert({
    id: params.documentId,
    filename: stagingFilename,
    original_name: params.originalName,
    status: "staging",
    content_hash: params.contentHash,
    file_size_bytes: params.sizeBytes,
    mime_type: params.mimeType,
    uploaded_by: params.uploadedBy,
    metadata: params.metadata,
  });

  if (error) throw new Error(`Upis staging dokumenta nije uspio: ${error.message}`);
}

export async function updateDocumentStoragePath(
  documentId: string,
  storagePath: string,
): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase
    .from("documents")
    .update({ storage_path: storagePath })
    .eq("id", documentId);
  if (error) throw new Error(`updateDocumentStoragePath failed: ${error.message}`);
}

export async function patchDocumentMetadata(
  documentId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { data: existing, error: fetchError } = await supabase
    .from("documents")
    .select("metadata")
    .eq("id", documentId)
    .single();
  if (fetchError) throw new Error(`patchDocumentMetadata fetch failed: ${fetchError.message}`);

  const merged = { ...((existing?.metadata as Record<string, unknown>) ?? {}), ...patch };
  const { error } = await supabase
    .from("documents")
    .update({ metadata: merged })
    .eq("id", documentId);
  if (error) throw new Error(`patchDocumentMetadata update failed: ${error.message}`);
}

export async function insertStagingChunks(documentId: string, chunks: Chunk[]): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const rows = chunks.map((chunk) => ({
    document_id: documentId,
    chunk_index: chunk.chunkIndex,
    text: chunk.text,
    // TODO Sprint 16: generate embeddings via transformers.js after migration.
    // Left NULL deliberately — Sprint 09 does not call any embedding provider.
    embedding: null,
    document_status: "staging" as const,
    char_offset_start: chunk.charOffsetStart,
    char_offset_end: chunk.charOffsetEnd,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from("document_chunks").insert(batch);
    if (error) throw new Error(`Upis chunkova nije uspio: ${error.message}`);
  }
}

export async function listStagingDocuments() {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, original_name, mime_type, file_size_bytes, content_hash, metadata, created_at, uploaded_by, uploader:users!documents_uploaded_by_fkey(full_name, email)",
    )
    .eq("status", "staging")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listStagingDocuments failed: ${error.message}`);
  return data;
}

export async function getPendingDocumentsCount(): Promise<number> {
  const supabase = createSupabaseDirectAdmin();
  const { count, error } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("status", "staging");

  if (error) return 0;
  return count ?? 0;
}

export async function approveStagingDocument(
  documentId: string,
  approvedBy: string,
): Promise<{
  filename: string;
  archivedOldDocumentId: string | null;
  chunksActivated: number;
}> {
  const supabase = createSupabaseDirectAdmin();

  const { data: staging, error: stagingError } = await supabase
    .from("documents")
    .select("id, original_name, status")
    .eq("id", documentId)
    .single();

  if (stagingError || !staging) throw new Error("Dokument nije pronađen.");
  if (staging.status !== "staging") {
    throw new Error(`Dokument nije u statusu 'staging' (trenutni status: ${staging.status}).`);
  }

  const canonicalFilename = staging.original_name;

  const { data: existingActive } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("original_name", canonicalFilename)
    .eq("status", "active")
    .maybeSingle();

  let archivedOldDocumentId: string | null = null;

  if (existingActive) {
    archivedOldDocumentId = existingActive.id;

    const { error: archiveError } = await supabase
      .from("documents")
      .update({
        filename: `${canonicalFilename}::archived::${existingActive.id}`,
        status: "archived",
      })
      .eq("id", existingActive.id);
    if (archiveError) {
      throw new Error(`Arhiviranje prethodnog dokumenta nije uspjelo: ${archiveError.message}`);
    }

    const { error: archiveChunksError } = await supabase
      .from("document_chunks")
      .update({ document_status: "archived" })
      .eq("document_id", existingActive.id);
    if (archiveChunksError) {
      throw new Error(
        `Arhiviranje chunkova prethodnog dokumenta nije uspjelo: ${archiveChunksError.message}`,
      );
    }

    // Best-effort — no-op for legacy USTAV documents that live on local disk, never
    // uploaded to Supabase Storage. Never blocks approval.
    if (existingActive.storage_path) {
      try {
        await moveToArchived(existingActive.storage_path, existingActive.storage_path);
        await moveToArchived(
          `${existingActive.id}/content.md`,
          `${existingActive.id}/content.md`,
        );
      } catch (err) {
        console.error("[UploadRepository] Best-effort storage archival failed:", err);
      }
    }
  }

  const { error: activateError } = await supabase
    .from("documents")
    .update({
      filename: canonicalFilename,
      status: "active",
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (activateError) {
    throw new Error(`Aktivacija dokumenta nije uspjela: ${activateError.message}`);
  }

  const { data: activatedChunks, error: activateChunksError } = await supabase
    .from("document_chunks")
    .update({ document_status: "active" })
    .eq("document_id", documentId)
    .select("id");
  if (activateChunksError) {
    throw new Error(`Aktivacija chunkova nije uspjela: ${activateChunksError.message}`);
  }

  return {
    filename: canonicalFilename,
    archivedOldDocumentId,
    chunksActivated: activatedChunks?.length ?? 0,
  };
}

/**
 * Chunks for a document that still need an embedding generated — used by
 * the on-approval embedding step (review-pipeline.ts) and by the one-off
 * Sprint 16 backfill for chunks left NULL before that step existed.
 */
export async function getChunksNeedingEmbedding(
  documentId: string,
): Promise<{ id: string; text: string }[]> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, text")
    .eq("document_id", documentId)
    .is("embedding", null);

  if (error) throw new Error(`getChunksNeedingEmbedding failed: ${error.message}`);
  return data ?? [];
}

/**
 * Writes embedding vectors back onto existing chunk rows by id. Never
 * inserts or deletes — chunk rows already exist from insertStagingChunks();
 * this only fills in the column left NULL at upload time (Sprint 09 scope
 * decision, see upload-pipeline.ts). One UPDATE per chunk — Supabase's
 * postgrest client has no bulk "update many with different values" call.
 */
export async function updateChunkEmbeddings(
  updates: { id: string; embedding: number[] }[],
): Promise<void> {
  if (updates.length === 0) return;
  const supabase = createSupabaseDirectAdmin();

  for (const { id, embedding } of updates) {
    const { error } = await supabase
      .from("document_chunks")
      .update({ embedding })
      .eq("id", id);
    if (error) throw new Error(`updateChunkEmbeddings failed for chunk ${id}: ${error.message}`);
  }
}

export async function rejectStagingDocument(
  documentId: string,
  reason: string,
  reviewedBy: string,
): Promise<{ uploadedBy: string | null; originalName: string }> {
  const supabase = createSupabaseDirectAdmin();

  const { data: staging, error: fetchError } = await supabase
    .from("documents")
    .select("id, original_name, status, uploaded_by")
    .eq("id", documentId)
    .single();

  if (fetchError || !staging) throw new Error("Dokument nije pronađen.");
  if (staging.status !== "staging") {
    throw new Error(`Dokument nije u statusu 'staging' (trenutni status: ${staging.status}).`);
  }

  const { error } = await supabase
    .from("documents")
    .update({
      status: "archived",
      rejection_reason: reason,
      approved_by: reviewedBy,
      approved_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) throw new Error(`Odbijanje dokumenta nije uspjelo: ${error.message}`);

  await supabase
    .from("document_chunks")
    .update({ document_status: "archived" })
    .eq("document_id", documentId);

  return { uploadedBy: staging.uploaded_by, originalName: staging.original_name };
}
