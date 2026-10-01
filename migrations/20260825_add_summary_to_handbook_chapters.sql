-- Migration: add_summary_to_handbook_chapters
-- Date: 2026-08-25
-- Description: Adds a short, user-facing AI summary per chapter for the
--   Handbook reader's "Pročitaj više" (Read more) UI — the reader defaults
--   to showing this summary, with a button that expands the untouched full
--   `content` (source of truth for citations and quiz generation; never
--   rewritten by this feature).
--   Deliberately separate from document_chunks.search_summary_bs (see
--   20260818_search_summary_bs_column.sql), which is a deterministic
--   one-sentence title restatement used only for cross-lingual retrieval
--   embedding, per document_chunks row. This column is a real, LLM-compressed
--   synopsis of the full chapter text, per handbook_chapters row, shown to
--   end users. Nullable — chapters without a summary yet just show full
--   content immediately (no button), same fallback pattern as everywhere
--   else in this codebase.
-- Rollback: alter table handbook_chapters drop column if exists summary,
--   drop column if exists summary_generated_at;

alter table handbook_chapters
  add column if not exists summary text,
  add column if not exists summary_generated_at timestamptz;
