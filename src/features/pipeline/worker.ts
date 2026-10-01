/**
 * Full pipeline automation -- the background processor.
 * Picks up embedding/chapter/quiz/summary work left `pending` or
 * `failed_retryable` in document_pipeline_status and drives each one
 * through to completion, reusing the exact same generation functions the
 * manual admin buttons and scripts already call -- no second code path.
 *
 * Three triggers call this same function (see the approved plan,
 * misty-hugging-galaxy.md): a daily Vercel Cron tick (Hobby-plan safety
 * net), an after() call right after a document is approved, and a manual
 * "Pokreni obradu sada" button. The lock in acquireLock()/releaseLock()
 * makes it safe for more than one of those to fire close together --
 * whichever loses the race just no-ops.
 */

import { embedPendingChunks } from "@/features/documents/review-pipeline";
import { generateChapterForDocument } from "@/features/handbook/generator";
import { generateSummaryForChapter } from "@/features/handbook/summary-generator";
import { generateQuestionsForChapter } from "@/features/quiz/generator";
import {
  getGeneratedChaptersCount,
  storeChapter,
  getChapterById,
  updateChapterSummary,
  unpublishChaptersForSupersededVersions,
} from "@/features/handbook/repository";
import {
  acquireLock,
  releaseLock,
  getNextActionableItem,
  getChapterIdForDocument,
  markStepInProgress,
  markStepDone,
  markStepFailedRetryable,
  recordValidatorRejection,
  logQuotaEvent,
  type ActionableItem,
} from "./repository";
import { PACING_DELAY_MS, WORKER_TIME_BUDGET_MS, MAX_CONSECUTIVE_FAILURES } from "./constants";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQuotaOrNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("429") || m.includes("quota") || m.includes("throttl") || m.includes("red čekanja") || m.includes("network");
}

export type WorkerRunResult = {
  processed: number;
  succeeded: number;
  failedRetryable: number;
  needsReview: number;
  stoppedReason: "queue_empty" | "time_budget" | "consecutive_failures" | "lock_held";
};

/**
 * Processes one embedding/chapter/quiz/summary item. Returns how it went so
 * the main loop can decide whether to keep going, back off, or continue.
 */
type ProcessOutcome =
  | { kind: "done" }
  | { kind: "needs_review" }
  | { kind: "pending_retry" } // validator rejected, but under MAX_AUTO_RETRIES -- back to 'pending', not yet needs_review
  | { kind: "failed_retryable"; message: string };

async function processItem(item: ActionableItem): Promise<ProcessOutcome> {
  await markStepInProgress(item.documentId, item.step);

  if (item.step === "embedding") {
    try {
      await embedPendingChunks(item.documentId);
      await markStepDone(item.documentId, "embedding");
      return { kind: "done" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markStepFailedRetryable(item.documentId, "embedding", message);
      return { kind: "failed_retryable", message };
    }
  }

  if (item.step === "chapter") {
    try {
      const { title, content } = await generateChapterForDocument(item.documentId, item.filename);
      const orderIndex = await getGeneratedChaptersCount();
      await storeChapter(item.documentId, title, content, orderIndex);

      // Best-effort — the new chapter is already safely stored above; if this
      // fails, the old chapter just stays visible alongside the new one
      // (the pre-2026-09-11 behavior) rather than losing the new chapter too.
      // See unpublishChaptersForSupersededVersions's own doc comment for why
      // this runs AFTER storeChapter, not before.
      try {
        const unpublished = await unpublishChaptersForSupersededVersions(item.documentId, item.filename);
        if (unpublished > 0) {
          console.log(
            `[PipelineWorker] Unpublished ${unpublished} chapter(s) from superseded version(s) of "${item.filename}".`,
          );
        }
      } catch (err) {
        console.error(
          `[PipelineWorker] unpublishChaptersForSupersededVersions failed for document ${item.documentId} ("${item.filename}"):`,
          err instanceof Error ? err.message : String(err),
        );
      }

      await markStepDone(item.documentId, "chapter");
      return { kind: "done" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("nema nijedan aktivan chunk")) {
        // Retrying can never help this one -- there is no content to generate from.
        await recordValidatorRejection(item.documentId, "chapter", 999, message);
        return { kind: "needs_review" };
      }
      await markStepFailedRetryable(item.documentId, "chapter", message);
      return { kind: "failed_retryable", message };
    }
  }

  const chapterId = await getChapterIdForDocument(item.documentId);
  if (!chapterId) {
    // Chapter step hasn't actually landed yet (shouldn't normally happen --
    // getNextActionableItem only returns quiz/summary once chapter_status
    // is 'done') -- treat as transient and let the next tick re-check.
    const message = "Poglavlje još nije pronađeno u bazi.";
    await markStepFailedRetryable(item.documentId, item.step, message);
    return { kind: "failed_retryable", message };
  }

  if (item.step === "quiz") {
    try {
      const result = await generateQuestionsForChapter(chapterId);
      if (result.error) {
        const { status } = await recordValidatorRejection(item.documentId, "quiz", item.attempts, result.error);
        return { kind: status === "needs_review" ? "needs_review" : "pending_retry" };
      }
      await markStepDone(item.documentId, "quiz");
      return { kind: "done" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markStepFailedRetryable(item.documentId, "quiz", message);
      return { kind: "failed_retryable", message };
    }
  }

  // summary
  try {
    const chapter = await getChapterById(chapterId);
    if (!chapter) {
      const message = "Poglavlje nije pronađeno.";
      await markStepFailedRetryable(item.documentId, "summary", message);
      return { kind: "failed_retryable", message };
    }
    const result = await generateSummaryForChapter(chapter.content);
    if (!result.ok) {
      const { status } = await recordValidatorRejection(item.documentId, "summary", item.attempts, result.reasons.join("; "));
      return { kind: status === "needs_review" ? "needs_review" : "pending_retry" };
    }
    await updateChapterSummary(chapterId, result.summary);
    await markStepDone(item.documentId, "summary");
    return { kind: "done" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markStepFailedRetryable(item.documentId, "summary", message);
    return { kind: "failed_retryable", message };
  }
}

export async function runPipelineWorker(): Promise<WorkerRunResult> {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { acquired } = await acquireLock(runId);
  if (!acquired) {
    return { processed: 0, succeeded: 0, failedRetryable: 0, needsReview: 0, stoppedReason: "lock_held" };
  }

  const startedAt = Date.now();
  let processed = 0;
  let succeeded = 0;
  let failedRetryable = 0;
  let needsReview = 0;
  let consecutiveFailures = 0;
  let stoppedReason: WorkerRunResult["stoppedReason"] = "queue_empty";

  try {
    while (true) {
      if (Date.now() - startedAt > WORKER_TIME_BUDGET_MS) {
        stoppedReason = "time_budget";
        break;
      }

      const item = await getNextActionableItem();
      if (!item) {
        stoppedReason = "queue_empty";
        break;
      }

      const outcome = await processItem(item);
      processed++;

      if (outcome.kind === "done") {
        succeeded++;
        consecutiveFailures = 0;
      } else if (outcome.kind === "needs_review") {
        needsReview++;
        consecutiveFailures = 0; // a content rejection isn't a quota problem -- don't count it toward the quota-abort threshold
      } else if (outcome.kind === "pending_retry") {
        // Validator rejected this attempt but it's still under MAX_AUTO_RETRIES
        // -- back to 'pending' for a later tick, not a queue-stopping problem.
        consecutiveFailures = 0;
      } else {
        failedRetryable++;
        // Only quota/network-shaped errors count toward the circuit breaker --
        // an isolated data error (e.g. a missing row) on one document
        // shouldn't stop the whole queue, only quota exhaustion should.
        if (isQuotaOrNetworkError(outcome.message)) {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 0;
        }
      }

      if (outcome.kind === "failed_retryable" && consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await logQuotaEvent(item.step, null, `${consecutiveFailures} uzastopnih quota/network grešaka -- obustavljam do sljedećeg pokušaja. Zadnja: ${outcome.message}`);
        stoppedReason = "consecutive_failures";
        break;
      }

      // Only the Gemini-backed steps need the empirically-required pacing
      // delay -- embedding is local and free.
      if (item.step !== "embedding") await sleep(PACING_DELAY_MS);
    }
  } finally {
    await releaseLock();
  }

  return { processed, succeeded, failedRetryable, needsReview, stoppedReason };
}
