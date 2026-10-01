/**
 * Document Review Pipeline — Sprint 09
 * Orchestrates Super Admin approve/reject decisions on staging documents.
 */

import { after } from "next/server";
import { logAuditEvent } from "@/lib/audit-log";
import { embedTextsLocal } from "@/lib/rag/local-embedder";
import { ensurePipelineRow, markStepDone, markStepFailedRetryable } from "@/features/pipeline/repository";
import { runPipelineWorker } from "@/features/pipeline/worker";
import type { Priority } from "@/features/pipeline/constants";
import {
  approveStagingDocument,
  getChunksNeedingEmbedding,
  rejectStagingDocument,
  updateChunkEmbeddings,
} from "./upload-repository";

/**
 * Embeds every chunk of `documentId` still missing a vector, using the
 * local model (DECISION_LOG.md DL-P-006). Shared by the synchronous
 * on-approval attempt below AND the pipeline worker's retry pass (worker.ts)
 * so there is exactly one embedding code path, not two.
 */
export async function embedPendingChunks(documentId: string): Promise<{ chunksEmbedded: number }> {
  const pending = await getChunksNeedingEmbedding(documentId);
  if (pending.length === 0) return { chunksEmbedded: 0 };

  const vectors = await embedTextsLocal(pending.map((c) => c.text));
  await updateChunkEmbeddings(pending.map((chunk, i) => ({ id: chunk.id, embedding: vectors[i] })));
  return { chunksEmbedded: pending.length };
}

export type ApproveResult = {
  filename: string;
  archivedOldDocumentId: string | null;
  chunksActivated: number;
  chunksEmbedded: number;
  embeddingError: string | null;
};

export async function approveDocument(
  documentId: string,
  approvedBy: string,
  priority: Priority = "urgent",
): Promise<ApproveResult> {
  const result = await approveStagingDocument(documentId, approvedBy);

  await logAuditEvent({
    userId: approvedBy,
    action: "document_approved",
    entityType: "document",
    entityId: documentId,
    afterState: {
      filename: result.filename,
      archivedOldDocumentId: result.archivedOldDocumentId,
      chunksActivated: result.chunksActivated,
    },
  });

  // Full pipeline automation (2026-08-26): every approved document gets a
  // document_pipeline_status row up front so embedding/chapter/quiz/summary
  // are all tracked from the same moment, even though embedding is
  // attempted synchronously right below. priority='urgent' for a single
  // approval (this default), 'bulk' when called from the bulk-approve
  // action (see approveAllStagingDocuments below) -- urgent always jumps
  // the bulk queue in the pipeline worker.
  await ensurePipelineRow(documentId, priority);

  // Sprint 16: embed on approval, not at upload time — a staging document
  // that gets rejected never burns embedding compute. Chunks were inserted
  // with embedding=NULL (see insertStagingChunks); fill that in now with
  // the same local model the query side uses (DECISION_LOG.md DL-P-006).
  // Best-effort: a failure here must not undo the approval that already
  // committed above — embedding_status='failed_retryable' means the
  // pipeline worker retries it automatically, so this no longer needs a
  // manual scripts/backfill-null-embeddings.ts run to recover.
  let chunksEmbedded = 0;
  let embeddingError: string | null = null;
  try {
    const embedResult = await embedPendingChunks(documentId);
    chunksEmbedded = embedResult.chunksEmbedded;
    await markStepDone(documentId, "embedding");
  } catch (err) {
    embeddingError = err instanceof Error ? err.message : String(err);
    console.error(
      `[ReviewPipeline] Embedding generation failed for document ${documentId}:`,
      embeddingError,
    );
    await markStepFailedRetryable(documentId, "embedding", embeddingError);
  }

  // Kick the pipeline worker for chapter/quiz/summary without making the
  // Director wait on the approve click -- after() runs once the response
  // has been sent (Next.js docs: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md).
  // The worker's own lock means this is safe to fire even if a cron tick or
  // another approval is running one concurrently -- whichever one doesn't
  // get the lock just no-ops.
  after(() => {
    runPipelineWorker().catch((err) => {
      console.error("[ReviewPipeline] Post-approval pipeline worker run failed:", err);
    });
  });

  return { ...result, chunksEmbedded, embeddingError };
}

// Concurrency cap for the bulk-approve loop below: these are DB-only calls
// (no Gemini, no local embedding -- see approveDocumentWithoutTrigger), but
// at ~600 documents even a few sequential round-trips each risks the 300s
// function timeout if run one at a time. 10 concurrent keeps well clear of
// that without hammering Supabase.
const BULK_APPROVE_CONCURRENCY = 10;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Bulk scenario (Director uploads up to ~600 documents at once): approves
 * every currently-staged document in one call, same approveDocument() per
 * document (same audit log / embedding logic, nothing duplicated), just
 * queued at priority='bulk' so a concurrently-approved single urgent
 * document still jumps ahead of this backlog in the pipeline worker.
 * Runs the worker once at the end -- it self-chains through the whole
 * backlog (see worker.ts) rather than needing 600 individual triggers.
 */
export async function approveAllStagingDocuments(
  documentIds: string[],
  approvedBy: string,
): Promise<{ approved: string[]; failed: { documentId: string; error: string }[] }> {
  const outcomes = await mapWithConcurrency(documentIds, BULK_APPROVE_CONCURRENCY, async (documentId) => {
    try {
      await approveDocumentWithoutTrigger(documentId, approvedBy, "bulk");
      return { documentId, ok: true as const };
    } catch (err) {
      return { documentId, ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  const approved = outcomes.filter((o) => o.ok).map((o) => o.documentId);
  const failed = outcomes.filter((o) => !o.ok).map((o) => ({ documentId: o.documentId, error: (o as { error: string }).error }));

  after(() => {
    runPipelineWorker().catch((err) => {
      console.error("[ReviewPipeline] Post-bulk-approval pipeline worker run failed:", err);
    });
  });

  return { approved, failed };
}

/** Same as approveDocument, minus the per-call after() trigger -- used by the bulk path above, which triggers the worker once at the end instead of once per document. */
async function approveDocumentWithoutTrigger(
  documentId: string,
  approvedBy: string,
  priority: Priority,
): Promise<ApproveResult> {
  const result = await approveStagingDocument(documentId, approvedBy);

  await logAuditEvent({
    userId: approvedBy,
    action: "document_approved",
    entityType: "document",
    entityId: documentId,
    afterState: {
      filename: result.filename,
      archivedOldDocumentId: result.archivedOldDocumentId,
      chunksActivated: result.chunksActivated,
    },
  });

  // Bulk path deliberately does NOT embed synchronously here (unlike the
  // single-document approveDocument() above): embedding up to ~600
  // documents' chunks one request is exactly the kind of work that can
  // exceed Vercel's 300s function timeout. Leave embedding_status='pending'
  // (ensurePipelineRow's default) -- the pipeline worker picks it up as the
  // first step for every one of these documents, same as chapter/quiz/
  // summary, self-chaining through the whole backlog after this request
  // has already returned.
  await ensurePipelineRow(documentId, priority);

  return { ...result, chunksEmbedded: 0, embeddingError: null };
}

export type RejectResult = {
  originalName: string;
  uploadedBy: string | null;
};

export async function rejectDocument(
  documentId: string,
  reason: string,
  reviewedBy: string,
): Promise<RejectResult> {
  const result = await rejectStagingDocument(documentId, reason, reviewedBy);

  await logAuditEvent({
    userId: reviewedBy,
    action: "document_rejected",
    entityType: "document",
    entityId: documentId,
    afterState: {
      filename: result.originalName,
      reason,
      uploadedBy: result.uploadedBy,
    },
  });

  // Email to the uploading Admin is stubbed — Resend sending domain isn't verified yet.
  // The decision + reason are already durably recorded above via audit_log.
  console.log(
    `[ReviewPipeline] Rejection email stub — would notify uploader ${result.uploadedBy ?? "unknown"} ` +
      `about "${result.originalName}": ${reason}`,
  );

  return result;
}
