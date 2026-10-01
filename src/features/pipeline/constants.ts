/**
 * Full pipeline automation -- shared constants.
 * See migrations/20260827_pipeline_queue.sql and the approved plan
 * (Director-approved 2026-08-26) for the full design.
 */

// Same value already empirically validated by generate-chapter-summaries.ts
// and search-bridge-wave2-english.ts -- Wave 1 drove all 7 healthy Gemini
// keys into 429 throttle within ~10 minutes of back-to-back calls with no
// pacing. Do not lower this without re-reading that incident writeup.
export const PACING_DELAY_MS = 4000;
export const RETRY_BACKOFF_MS = 8000;

// A validator rejection (fabricated number/name, too long) gets this many
// automatic re-attempts before the row is parked in 'needs_review' and
// stops consuming quota. Chosen to match Talas A's observed ~25% reject
// rate without hammering a chapter that will plausibly never pass.
export const MAX_AUTO_RETRIES = 3;

// Leaves margin under Vercel's 300s default function timeout (all plans,
// including Hobby) before the worker self-chains via after() instead of
// risking a mid-call timeout.
export const WORKER_TIME_BUDGET_MS = 240_000;

// A lock older than this is treated as an abandoned run (crashed process,
// killed deployment) and may be taken over by the next trigger. Comfortably
// longer than any single Gemini call + pacing delay.
export const PIPELINE_LOCK_STALE_MS = 6 * 60 * 1000;

// After this many consecutive quota/network failures in one worker tick,
// stop immediately instead of burning through the rest of the queue against
// a dead quota -- the next cron tick / manual "run now" picks it back up.
export const MAX_CONSECUTIVE_FAILURES = 3;

export type PipelineStep = "embedding" | "chapter" | "quiz" | "summary";
export type StepStatus = "pending" | "in_progress" | "done" | "failed_retryable" | "needs_review";
export type Priority = "urgent" | "bulk";
