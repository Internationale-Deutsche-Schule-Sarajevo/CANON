-- Migration: add_is_published_to_handbook_chapters
-- Date: 2026-07-26
-- Description: Add is_published flag to handbook_chapters so non-text
--   artifact chapters (logos, forms, per-student records — see
--   corrections/CHAPTER_TRIAGE.md) can be excluded from getAllChapters(),
--   the reader pages, and quiz generation without deleting their rows or
--   document_chunks.
-- Note: already applied directly to the live database; this file uses
--   IF NOT EXISTS so re-running it is a safe no-op.
-- Rollback: alter table handbook_chapters drop column is_published;

alter table handbook_chapters
  add column if not exists is_published boolean not null default true;
