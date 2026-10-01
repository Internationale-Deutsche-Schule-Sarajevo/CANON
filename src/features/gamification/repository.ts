/**
 * Gamification Repository — all database access for points/streak/badges.
 * Never call from Client Components — same rule as every other repository
 * in this codebase (Server Actions, generator.ts, API routes only).
 *
 * CORRECTED 2026-09-15: this originally invented a parallel schema (new
 * columns on `users`, a free-text-keyed `user_badges`) without checking for
 * prior work. A real DB integration test caught that a complete
 * gamification schema already existed (seeded 2026-07-01, never referenced
 * by any application code): `user_points` (one row per user: points, level,
 * current_streak, longest_streak, last_active_date) and `badges` (10 rows,
 * already matching GAMIFICATION.md exactly, `badge_key` text + `id` uuid).
 * `user_badges.badge_id` is a uuid FK to `badges.id`, not the badge_key
 * string — every write here resolves badge_key -> badges.id first. This
 * file now reads/writes ONLY that pre-existing schema; the invented `users`
 * columns were dropped in migrations/20260915b_....sql.
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";
import type { BadgeId } from "@/constants/gamification";

export type UserGamificationState = {
  totalPoints: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null; // YYYY-MM-DD
};

const DEFAULT_STATE: UserGamificationState = {
  totalPoints: 0,
  level: 1,
  currentStreak: 0,
  longestStreak: 0,
  lastActivityDate: null,
};

/** No user_points row yet (every user starts with none — the table is only populated on first gamification event) returns the same zeroed defaults a fresh row would have. */
export async function getUserGamificationState(userId: string): Promise<UserGamificationState> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("user_points")
    .select("points, level, current_streak, longest_streak, last_active_date")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`getUserGamificationState failed: ${error.message}`);
  if (!data) return DEFAULT_STATE;

  return {
    totalPoints: data.points,
    level: data.level,
    currentStreak: data.current_streak,
    longestStreak: data.longest_streak,
    lastActivityDate: data.last_active_date,
  };
}

export async function getUnlockedBadgeIds(userId: string): Promise<Set<BadgeId>> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("user_badges")
    .select("badges(badge_key)")
    .eq("user_id", userId);

  if (error) throw new Error(`getUnlockedBadgeIds failed: ${error.message}`);

  const keys = (data ?? [])
    .map((row) => (row.badges as unknown as { badge_key: string } | null)?.badge_key)
    .filter((key): key is string => !!key);
  return new Set(keys as BadgeId[]);
}

/**
 * Badge id -> ISO timestamp it was unlocked (user_badges.awarded_at), for the
 * /progress page. Same badge_key resolution as getUnlockedBadgeIds.
 */
export async function getUserBadgeUnlocks(userId: string): Promise<Map<BadgeId, string>> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("user_badges")
    .select("awarded_at, badges(badge_key)")
    .eq("user_id", userId);

  if (error) throw new Error(`getUserBadgeUnlocks failed: ${error.message}`);

  const map = new Map<BadgeId, string>();
  for (const row of data ?? []) {
    const key = (row.badges as unknown as { badge_key: string } | null)?.badge_key;
    if (key) map.set(key as BadgeId, row.awarded_at);
  }
  return map;
}

/**
 * Applies the full result of one quiz submission's gamification computation:
 * upserts the user's single user_points row (real DB-level upsert —
 * user_points.user_id has a UNIQUE constraint, confirmed via
 * pg_constraint 2026-09-15), and inserts one user_badges row per newly
 * unlocked badge after resolving badge_key -> badges.id. user_badges also
 * has a UNIQUE (user_id, badge_id) constraint, backing the duplicate-key
 * handling below.
 */
export async function applyGamificationUpdate(
  userId: string,
  update: {
    newTotalPoints: number;
    newLevel: number;
    newStreak: { currentStreak: number; longestStreak: number; lastActivityDate: string | null };
    newlyUnlockedBadgeIds: BadgeId[];
  },
): Promise<void> {
  const supabase = createSupabaseDirectAdmin();

  const { error: upsertError } = await supabase.from("user_points").upsert(
    {
      user_id: userId,
      points: update.newTotalPoints,
      level: update.newLevel,
      current_streak: update.newStreak.currentStreak,
      longest_streak: update.newStreak.longestStreak,
      last_active_date: update.newStreak.lastActivityDate,
    },
    { onConflict: "user_id" },
  );
  if (upsertError) throw new Error(`applyGamificationUpdate (user_points upsert) failed: ${upsertError.message}`);

  if (update.newlyUnlockedBadgeIds.length === 0) return;

  const { data: badgeRows, error: badgeFetchError } = await supabase
    .from("badges")
    .select("id, badge_key")
    .in("badge_key", update.newlyUnlockedBadgeIds);
  if (badgeFetchError) throw new Error(`applyGamificationUpdate (badges lookup) failed: ${badgeFetchError.message}`);

  const resolved = badgeRows ?? [];
  if (resolved.length !== update.newlyUnlockedBadgeIds.length) {
    const foundKeys = new Set(resolved.map((b) => b.badge_key));
    const missing = update.newlyUnlockedBadgeIds.filter((id) => !foundKeys.has(id));
    console.error(`[GamificationRepository] badge_key(s) not found in badges table, skipping: ${missing.join(", ")}`);
  }
  if (resolved.length === 0) return;

  const insertRows = resolved.map((b) => ({ user_id: userId, badge_id: b.id }));
  const { error: badgeInsertError } = await supabase.from("user_badges").insert(insertRows);
  if (badgeInsertError) {
    // Unique-constraint violation means a concurrent request already
    // unlocked one of these — not a real failure, don't throw.
    if (!badgeInsertError.message.includes("duplicate key")) {
      throw new Error(`applyGamificationUpdate (user_badges insert) failed: ${badgeInsertError.message}`);
    }
  }
}
