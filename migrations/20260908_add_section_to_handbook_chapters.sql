-- Migration: add_section_to_handbook_chapters
-- Date: 2026-09-08
-- Description: Adds a nullable `section` column to group the 316 flat
--   handbook_chapters rows into the 15 director-approved thematic sections
--   (deterministic keyword categorization, see scripts/categorize-chapters.ts).
--   Nullable and initially empty for every row — populated only after the
--   Director approves the dry-run assignment list. Chapters that match no
--   keyword rule are left as NULL / "Nekategorisano" rather than guessed.
--   The /handbook UI continues to render the existing flat list until the
--   Director separately approves switching it to group by this column.
-- Rollback: alter table handbook_chapters drop column if exists section;

alter table handbook_chapters
  add column if not exists section text;
