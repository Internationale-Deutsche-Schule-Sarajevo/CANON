-- Full pipeline automation (embedding -> chapter -> quiz -> summary).
-- One row per document, unifying status across every step in one place
-- instead of scattering more nullable *_at columns across 3 tables (see
-- DECISION context in src/features/pipeline/repository.ts). Search-bridge
-- (cross-lingual translation) is deliberately NOT part of this table --
-- stays manual/wave-based per Director decision (2026-08-26).

create table if not exists document_pipeline_status (
  document_id uuid primary key references documents(id) on delete cascade,
  priority text not null default 'bulk' check (priority in ('urgent', 'bulk')),

  embedding_status text not null default 'pending'
    check (embedding_status in ('pending', 'in_progress', 'done', 'failed_retryable')),
  embedding_error text,

  chapter_status text not null default 'pending'
    check (chapter_status in ('pending', 'in_progress', 'done', 'failed_retryable', 'needs_review')),
  chapter_error text,
  chapter_attempts int not null default 0,

  quiz_status text not null default 'pending'
    check (quiz_status in ('pending', 'in_progress', 'done', 'failed_retryable', 'needs_review')),
  quiz_error text,
  quiz_attempts int not null default 0,

  summary_status text not null default 'pending'
    check (summary_status in ('pending', 'in_progress', 'done', 'failed_retryable', 'needs_review')),
  summary_error text,
  summary_attempts int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_pipeline_status_queue_idx
  on document_pipeline_status (priority, created_at);

-- Single-row advisory lock so cron tick / on-approval trigger / manual
-- "run now" never run runPipelineWorker() concurrently (parallel Gemini
-- calls across the 7 rotating keys is what caused the Wave 1 throttle
-- cascade -- see search-bridge-wave2-english.ts:185-190). A lock older
-- than PIPELINE_LOCK_STALE_MS (src/features/pipeline/constants.ts) is
-- treated as an abandoned run and may be taken over.
create table if not exists pipeline_worker_lock (
  id int primary key default 1,
  locked_at timestamptz,
  run_id text,
  constraint pipeline_worker_lock_singleton check (id = 1)
);

insert into pipeline_worker_lock (id, locked_at, run_id)
values (1, null, null)
on conflict (id) do nothing;

-- Every quota/429 exhaustion the worker hits, so the first real pilot/bulk
-- run finally records a measured daily ceiling instead of the guessed
-- range in the approved plan (misty-hugging-galaxy.md, tacka 5).
create table if not exists pipeline_quota_events (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  key_index int,
  step text,
  detail text
);
