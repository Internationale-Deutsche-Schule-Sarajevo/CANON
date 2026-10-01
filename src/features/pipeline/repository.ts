/**
 * Full pipeline automation -- all database access for
 * document_pipeline_status / pipeline_worker_lock / pipeline_quota_events.
 * Never call from UI components -- only from worker.ts and the pipeline API
 * routes. See migrations/20260827_pipeline_queue.sql for the schema and the
 * approved plan (misty-hugging-galaxy.md) for the design rationale.
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";
import { PIPELINE_LOCK_STALE_MS, MAX_AUTO_RETRIES, type PipelineStep, type Priority } from "./constants";

export async function ensurePipelineRow(documentId: string, priority: Priority): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase
    .from("document_pipeline_status")
    .upsert({ document_id: documentId, priority }, { onConflict: "document_id", ignoreDuplicates: true });
  if (error) throw new Error(`ensurePipelineRow failed: ${error.message}`);
}

export type ActionableItem = {
  documentId: string;
  filename: string;
  step: PipelineStep;
  attempts: number;
};

const STEP_ORDER: PipelineStep[] = ["embedding", "chapter", "quiz", "summary"];

type PipelineRow = {
  document_id: string;
  priority: Priority;
  embedding_status: string;
  chapter_status: string;
  chapter_attempts: number;
  quiz_status: string;
  quiz_attempts: number;
  summary_status: string;
  summary_attempts: number;
  documents: { original_name: string } | { original_name: string }[] | null;
};

function actionableStepForRow(row: PipelineRow): { step: PipelineStep; attempts: number } | null {
  if (row.embedding_status === "pending" || row.embedding_status === "failed_retryable") {
    return { step: "embedding", attempts: 0 };
  }
  if (row.embedding_status !== "done") return null; // embedding still pending/needs a retry pass first

  if (row.chapter_status === "pending" || row.chapter_status === "failed_retryable") {
    return { step: "chapter", attempts: row.chapter_attempts };
  }
  if (row.chapter_status !== "done") return null; // needs_review or in_progress -- blocks quiz/summary too

  const quizActionable = row.quiz_status === "pending" || row.quiz_status === "failed_retryable";
  const summaryActionable = row.summary_status === "pending" || row.summary_status === "failed_retryable";
  if (quizActionable) return { step: "quiz", attempts: row.quiz_attempts };
  if (summaryActionable) return { step: "summary", attempts: row.summary_attempts };
  return null;
}

/**
 * Picks the next unit of work: urgent priority first, then bulk, oldest
 * first within each. Fetches a batch (not just one row) because the first
 * candidate by priority/created_at may have no actionable step right now
 * (e.g. its chapter is stuck in 'needs_review', blocking quiz/summary) --
 * we skip past those in-memory rather than looping one DB round-trip at a
 * time.
 */
export async function getNextActionableItem(): Promise<ActionableItem | null> {
  const supabase = createSupabaseDirectAdmin();

  for (const priority of ["urgent", "bulk"] as const) {
    const { data, error } = await supabase
      .from("document_pipeline_status")
      .select(
        "document_id, priority, embedding_status, chapter_status, chapter_attempts, quiz_status, quiz_attempts, summary_status, summary_attempts, documents!inner(original_name)",
      )
      .eq("priority", priority)
      .or(
        "embedding_status.in.(pending,failed_retryable),chapter_status.in.(pending,failed_retryable),quiz_status.in.(pending,failed_retryable),summary_status.in.(pending,failed_retryable)",
      )
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) throw new Error(`getNextActionableItem failed: ${error.message}`);
    if (!data) continue;

    for (const row of data as unknown as PipelineRow[]) {
      const actionable = actionableStepForRow(row);
      if (!actionable) continue;
      const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents;
      return {
        documentId: row.document_id,
        filename: doc?.original_name ?? row.document_id,
        step: actionable.step,
        attempts: actionable.attempts,
      };
    }
  }

  return null;
}

export async function getChapterIdForDocument(documentId: string): Promise<string | null> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("handbook_chapters")
    .select("id")
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw new Error(`getChapterIdForDocument failed: ${error.message}`);
  return data?.id ?? null;
}

export async function markStepInProgress(documentId: string, step: PipelineStep): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase
    .from("document_pipeline_status")
    .update({ [`${step}_status`]: "in_progress", updated_at: new Date().toISOString() })
    .eq("document_id", documentId);
  if (error) throw new Error(`markStepInProgress failed: ${error.message}`);
}

export async function markStepDone(documentId: string, step: PipelineStep): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase
    .from("document_pipeline_status")
    .update({ [`${step}_status`]: "done", [`${step}_error`]: null, updated_at: new Date().toISOString() })
    .eq("document_id", documentId);
  if (error) throw new Error(`markStepDone failed: ${error.message}`);
}

/** Transient error (network/429/quota) -- worker retries automatically, no attempt counted against MAX_AUTO_RETRIES. */
export async function markStepFailedRetryable(
  documentId: string,
  step: PipelineStep,
  error: string,
): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error: dbError } = await supabase
    .from("document_pipeline_status")
    .update({ [`${step}_status`]: "failed_retryable", [`${step}_error`]: error, updated_at: new Date().toISOString() })
    .eq("document_id", documentId);
  if (dbError) throw new Error(`markStepFailedRetryable failed: ${dbError.message}`);
}

/**
 * Content-quality rejection (validator caught a fabricated number/name, or
 * output too long) -- counts against MAX_AUTO_RETRIES. Below the ceiling it
 * goes back to 'pending' (next tick retries, generation has enough
 * temperature variance to plausibly pass); at/above it, 'needs_review' --
 * stops consuming quota and surfaces in the status dashboard for a human.
 */
export async function recordValidatorRejection(
  documentId: string,
  step: PipelineStep,
  attemptsSoFar: number,
  reason: string,
): Promise<{ status: "pending" | "needs_review" }> {
  const supabase = createSupabaseDirectAdmin();
  const nextAttempts = attemptsSoFar + 1;
  const nextStatus = nextAttempts >= MAX_AUTO_RETRIES ? "needs_review" : "pending";
  const { error } = await supabase
    .from("document_pipeline_status")
    .update({
      [`${step}_status`]: nextStatus,
      [`${step}_error`]: reason,
      [`${step}_attempts`]: nextAttempts,
      updated_at: new Date().toISOString(),
    })
    .eq("document_id", documentId);
  if (error) throw new Error(`recordValidatorRejection failed: ${error.message}`);
  return { status: nextStatus };
}

export async function logQuotaEvent(step: string, keyIndex: number | null, detail: string): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase.from("pipeline_quota_events").insert({ step, key_index: keyIndex, detail });
  if (error) console.error(`[Pipeline] logQuotaEvent failed (non-fatal): ${error.message}`);
}

export type AcquireLockResult = { acquired: boolean };

/**
 * Single atomic UPDATE ... WHERE (not read-then-write) so two near-
 * simultaneous triggers (cron tick + on-approval + manual click) can't both
 * believe they hold the lock. On successful acquire, also resets any
 * `in_progress` rows left behind by a crashed prior run back to `pending`
 * -- cheap and safe to do unconditionally every acquire.
 */
export async function acquireLock(runId: string): Promise<AcquireLockResult> {
  const supabase = createSupabaseDirectAdmin();
  const staleThreshold = new Date(Date.now() - PIPELINE_LOCK_STALE_MS).toISOString();

  const { data, error } = await supabase
    .from("pipeline_worker_lock")
    .update({ locked_at: new Date().toISOString(), run_id: runId })
    .eq("id", 1)
    .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
    .select("id");

  if (error) throw new Error(`acquireLock failed: ${error.message}`);
  const acquired = (data?.length ?? 0) > 0;

  if (acquired) {
    for (const step of ["embedding", "chapter", "quiz", "summary"] as PipelineStep[]) {
      const { error: resetError } = await supabase
        .from("document_pipeline_status")
        .update({ [`${step}_status`]: "pending", updated_at: new Date().toISOString() })
        .eq(`${step}_status`, "in_progress");
      if (resetError) console.error(`[Pipeline] stale in_progress reset failed for ${step} (non-fatal): ${resetError.message}`);
    }
  }

  return { acquired };
}

export async function releaseLock(): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase
    .from("pipeline_worker_lock")
    .update({ locked_at: null, run_id: null })
    .eq("id", 1);
  if (error) console.error(`[Pipeline] releaseLock failed (non-fatal, will self-expire via staleness): ${error.message}`);
}

export type PipelineStatusSummary = {
  lastProcessedAt: string | null;
  currentlyRunning: boolean;
  steps: Record<PipelineStep, { done: number; queued: number; needsReview: number }>;
  needsReview: { documentId: string; documentName: string; step: PipelineStep; reason: string; attempts: number }[];
};

export async function getStatusSummary(): Promise<PipelineStatusSummary> {
  const supabase = createSupabaseDirectAdmin();

  const { data: rows, error } = await supabase
    .from("document_pipeline_status")
    .select(
      "document_id, embedding_status, embedding_error, chapter_status, chapter_error, chapter_attempts, " +
        "quiz_status, quiz_error, quiz_attempts, summary_status, summary_error, summary_attempts, updated_at, " +
        "documents!inner(original_name)",
    );
  if (error) throw new Error(`getStatusSummary failed: ${error.message}`);

  const { data: lock } = await supabase.from("pipeline_worker_lock").select("locked_at").eq("id", 1).maybeSingle();
  const currentlyRunning =
    !!lock?.locked_at && Date.now() - new Date(lock.locked_at).getTime() < PIPELINE_LOCK_STALE_MS;

  const steps: PipelineStatusSummary["steps"] = {
    embedding: { done: 0, queued: 0, needsReview: 0 },
    chapter: { done: 0, queued: 0, needsReview: 0 },
    quiz: { done: 0, queued: 0, needsReview: 0 },
    summary: { done: 0, queued: 0, needsReview: 0 },
  };
  const needsReview: PipelineStatusSummary["needsReview"] = [];
  let lastProcessedAt: string | null = null;

  for (const row of (rows ?? []) as unknown as (PipelineRow & {
    embedding_error: string | null;
    chapter_error: string | null;
    quiz_error: string | null;
    summary_error: string | null;
    updated_at: string;
  })[]) {
    const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents;
    const docName = doc?.original_name ?? row.document_id;

    if (!lastProcessedAt || row.updated_at > lastProcessedAt) lastProcessedAt = row.updated_at;

    for (const step of STEP_ORDER) {
      const status = row[`${step}_status` as keyof typeof row] as string;
      const errorMsg = row[`${step}_error` as keyof typeof row] as string | null;
      const attempts = (row[`${step}_attempts` as keyof typeof row] as number | undefined) ?? 0;

      if (status === "done") steps[step].done++;
      else if (status === "needs_review") {
        steps[step].needsReview++;
        needsReview.push({ documentId: row.document_id, documentName: docName, step, reason: errorMsg ?? "(nepoznat razlog)", attempts });
      } else {
        // pending, failed_retryable, in_progress -- all "still working on it" for the summary view
        steps[step].queued++;
      }
    }
  }

  return { lastProcessedAt, currentlyRunning, steps, needsReview };
}
