-- Migration: add_gamification_columns
-- Date: 2026-09-15
-- Description: Foundation for AAA UI/VFX gamification mandate, Phase 2a step 1.
--   Points and streak are per-USER (cumulative across the whole handbook, not
--   per-chapter) per GAMIFICATION.md: "Store: current_streak (int) and
--   longest_streak (int) per user" and the level table is a lookup against a
--   single cumulative point total. Added to `users`, not `user_progress`
--   (which is per user+chapter).
--
--   Director's explicit decision (2026-09-15): points/streaks are NOT
--   backfilled for already-completed chapters — every user starts at 0 from
--   launch of this feature, regardless of prior progress. That is exactly
--   what DEFAULT 0 / NULL gives us here; no backfill script follows this
--   migration.
--
--   `level` is deliberately NOT a stored column — it is always derived from
--   `total_points` via the LEVELS lookup table in
--   src/constants/gamification.ts, so it can never drift out of sync with
--   the point total (single source of truth).
--
--   `last_activity_date` (date, not timestamptz) backs the streak
--   calculation: "consecutive calendar days with >=1 quiz question
--   answered" — comparing calendar dates, not instants, so a `date` column
--   avoids timezone-boundary bugs a timestamptz diff would risk.
--
--   user_badges: one row per unlocked badge. badge_id is free text matching
--   the BADGES constant keys in gamification.ts (not an enum, so new badges
--   never need a migration) with a uniqueness constraint so the same badge
--   can never be unlocked twice for the same user.
--
-- Rollback:
--   alter table users
--     drop column if exists total_points,
--     drop column if exists current_streak,
--     drop column if exists longest_streak,
--     drop column if exists last_activity_date;
--   drop table if exists user_badges;

alter table users
  add column if not exists total_points integer not null default 0,
  add column if not exists current_streak integer not null default 0,
  add column if not exists longest_streak integer not null default 0,
  add column if not exists last_activity_date date;

create table if not exists user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  badge_id text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create index if not exists user_badges_user_id_idx on user_badges(user_id);
