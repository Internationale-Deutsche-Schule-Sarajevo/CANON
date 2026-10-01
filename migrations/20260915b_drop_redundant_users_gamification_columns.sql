-- Migration: drop_redundant_users_gamification_columns
-- Date: 2026-09-15 (follow-up to 20260915_add_gamification_columns.sql, same day)
-- Description: Reverts the total_points/current_streak/longest_streak/
--   last_activity_date columns added to `users` earlier today. A real DB
--   integration test (scripts/test-gamification-integration.ts) surfaced
--   that a COMPLETE gamification schema already existed in this database
--   (seeded 2026-07-01, before this session's audit) that the app code
--   never referenced: `badges` (10 rows, matching GAMIFICATION.md exactly),
--   `user_points` (points/level/current_streak/longest_streak/
--   last_active_date per user), and `user_badges` (badge_id as a uuid FK to
--   badges.id, not the free-text scheme this session invented). The
--   original migration's `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT
--   EXISTS` silently no-op'd against user_badges (it already existed) while
--   still adding a redundant, competing set of columns on `users` —
--   violating single-source-of-truth. This migration removes those, so
--   `user_points` is the only place points/level/streak live.
--
-- Rollback (re-adds the columns this migration removes, though there's no
--   reason to — user_points is correct going forward):
--   alter table users
--     add column if not exists total_points integer not null default 0,
--     add column if not exists current_streak integer not null default 0,
--     add column if not exists longest_streak integer not null default 0,
--     add column if not exists last_activity_date date;

alter table users
  drop column if exists total_points,
  drop column if exists current_streak,
  drop column if exists longest_streak,
  drop column if exists last_activity_date;
