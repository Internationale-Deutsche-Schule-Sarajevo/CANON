/**
 * Gamification service — pure functions only, no I/O (no Supabase calls, no
 * Date.now() side effects beyond what's passed in). Callers (Phase 2a step
 * 4: submitQuizAnswers) own all reads/writes; these functions just compute
 * the correct numbers/decisions from explicit inputs, so every branch is
 * independently unit-testable without a database.
 *
 * Values come from src/constants/gamification.ts (GAMIFICATION.md's exact
 * numbers) — this file only implements the RULES for combining them, never
 * hardcodes a point value itself.
 */

import {
  POINTS,
  LEVELS,
  BADGES,
  BADGE_DEFINITIONS,
  SPEED_BADGE_THRESHOLD_SECONDS,
  getLevelForPoints,
  type Level,
  type BadgeId,
} from "@/constants/gamification";

// ── Points ────────────────────────────────────────────────────────────────

export type CalculatePointsInput = {
  /** Out of 5 — the quiz always has exactly 5 questions. */
  correctCount: number;
  /** True if this is the user's first-ever submission for this chapter (user_progress.attempts was 0 before this call). */
  isFirstAttempt: boolean;
  /** True if the chapter was already `completed` before this submission — a free practice retake earns 0, per GAMIFICATION.md "Chapter revisited (practice mode) | 0". */
  isPracticeMode: boolean;
  /** True if this submission is the first time this specific chapter reaches `completed = true`. */
  justCompletedChapter: boolean;
  /** True if updateStreak() just brought current_streak to exactly 7 for the first time (caller checks against already-unlocked badges). */
  justReachedStreak7: boolean;
  /** True if updateStreak() just brought current_streak to exactly 30 for the first time. */
  justReachedStreak30: boolean;
  /** True if this submission's chapter completion brought the user to 100% of all chapters, for the first time. */
  justCompletedAllChapters: boolean;
};

/** Total points earned by one quiz submission — per-question points plus any bonuses that fired on this exact submission. */
export function calculatePoints(input: CalculatePointsInput): number {
  if (input.isPracticeMode) return 0;

  const perQuestion = input.isFirstAttempt ? POINTS.CORRECT_FIRST_ATTEMPT : POINTS.CORRECT_RETRY;
  let points = input.correctCount * perQuestion;

  if (input.justCompletedChapter) points += POINTS.CHAPTER_COMPLETE_BONUS;
  if (input.justReachedStreak7) points += POINTS.STREAK_7_BONUS;
  if (input.justReachedStreak30) points += POINTS.STREAK_30_BONUS;
  if (input.justCompletedAllChapters) points += POINTS.ALL_CHAPTERS_BONUS;

  return points;
}

// ── Levels ────────────────────────────────────────────────────────────────

export type LevelUpResult = {
  leveledUp: boolean;
  previousLevel: Level;
  newLevel: Level;
};

/** Compares point totals before/after a submission to detect a level-up — for the celebrate() trigger. */
export function checkLevelUp(previousTotalPoints: number, newTotalPoints: number): LevelUpResult {
  const previousLevel = getLevelForPoints(previousTotalPoints);
  const newLevel = getLevelForPoints(newTotalPoints);
  return { leveledUp: newLevel.level > previousLevel.level, previousLevel, newLevel };
}

export { LEVELS };

// ── Streak ────────────────────────────────────────────────────────────────

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  /** YYYY-MM-DD, calendar date only — matches the `date` (not timestamptz) column, deliberately avoiding timezone-boundary bugs a timestamp diff would risk. */
  lastActivityDate: string | null;
};

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Today's calendar date (YYYY-MM-DD) in the school's timezone. GAMIFICATION.md
 * resets streaks at "midnight local time"; the server runs in UTC, so using
 * the UTC date would flip the day at 01:00/02:00 in Sarajevo. Every streak
 * date (writing in submitQuizAnswers, reading in the nav bar) must come from
 * here so they always agree.
 */
export function getTodayDateString(now: Date = new Date()): string {
  // "sv-SE" formats as YYYY-MM-DD.
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sarajevo" });
}

/**
 * The streak to DISPLAY right now. The stored current_streak only changes
 * when the user answers something, so if they skipped yesterday it still
 * holds the old number until their next submission — but the streak is
 * already broken. Alive only if the last activity was today or yesterday.
 */
export function getEffectiveStreak(state: StreakState, todayDateStr: string): number {
  if (!state.lastActivityDate) return 0;
  if (state.lastActivityDate === todayDateStr) return state.currentStreak;
  if (state.lastActivityDate === addDaysToDateString(todayDateStr, -1)) return state.currentStreak;
  return 0;
}

/**
 * GAMIFICATION.md streak rules: "consecutive calendar days with >=1 quiz
 * question answered", increments on a new calendar day, resets if the
 * previous calendar day had no activity. Calling this twice on the same
 * `todayDateStr` is idempotent (second call is a no-op) — a user answering
 * many questions in one day doesn't inflate the streak.
 */
export function updateStreak(previous: StreakState, todayDateStr: string): StreakState {
  if (previous.lastActivityDate === todayDateStr) {
    return previous; // already counted today
  }

  const yesterday = addDaysToDateString(todayDateStr, -1);
  const isConsecutive = previous.lastActivityDate === yesterday;
  const newCurrentStreak = isConsecutive ? previous.currentStreak + 1 : 1;

  return {
    currentStreak: newCurrentStreak,
    longestStreak: Math.max(previous.longestStreak, newCurrentStreak),
    lastActivityDate: todayDateStr,
  };
}

// ── Badge list for display ────────────────────────────────────────────────

export type BadgeListItem = {
  id: BadgeId;
  name: string;
  description: string;
  unlocked: boolean;
  /** ISO timestamp, only when unlocked. */
  awardedAt: string | null;
};

/** All badges in their defined order, each marked unlocked/locked with its unlock time — the /progress page's single input. */
export function buildBadgeList(unlockedAt: ReadonlyMap<BadgeId, string>): BadgeListItem[] {
  return Object.values(BADGE_DEFINITIONS).map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    unlocked: unlockedAt.has(def.id),
    awardedAt: unlockedAt.get(def.id) ?? null,
  }));
}

/** ISO timestamp -> "21. 9. 2026." in Sarajevo time. Manual formatting so output never depends on the runtime's locale data. */
export function formatDateBs(iso: string): string {
  const [y, m, d] = getTodayDateString(new Date(iso)).split("-").map(Number);
  return `${d}. ${m}. ${y}.`;
}

// ── Badges ────────────────────────────────────────────────────────────────

export type BadgeCheckInput = {
  justCompletedChapter: boolean;
  isFirstAttempt: boolean;
  correctCount: number;
  /** Count of chapters with completed=true for this user, AFTER this submission. */
  completedChaptersCountAfter: number;
  /** Total chapters currently in the handbook (getAllChapters().length). */
  totalChaptersCount: number;
  /** current_streak AFTER updateStreak() ran for this submission. */
  streakAfter: number;
  /** Seconds between chapter_opened_at and this submission — null if unknown/practice mode (no fresh chapter_opened_at to measure from). Backs badge_speed. */
  secondsSinceChapterOpened: number | null;
  /** Badge ids this user already has — never re-unlock one (the DB's unique constraint would reject a duplicate insert anyway, but the caller needs this to avoid even trying, and to know what's actually NEW for the celebration UI). */
  alreadyUnlockedBadgeIds: ReadonlySet<BadgeId>;
};

/**
 * Returns badge ids newly unlocked by this submission (empty if none).
 *
 * badge_speed: GAMIFICATION.md originally said "within 2 minutes (120s) of
 * unlocking," but MINIMUM_READING_SECONDS (handbook/constants.ts) requires
 * 180s of reading before the quiz can even be submitted, making 120s
 * structurally unreachable. Director's decision (2026-09-15): threshold
 * raised to SPEED_BADGE_THRESHOLD_SECONDS (240s), same measurement point
 * (chapter_opened_at to submission time).
 */
export function checkBadgeUnlocks(input: BadgeCheckInput): BadgeId[] {
  const unlocked: BadgeId[] = [];
  const has = (id: BadgeId) => input.alreadyUnlockedBadgeIds.has(id);
  const unlock = (id: BadgeId) => {
    if (!has(id) && !unlocked.includes(id)) unlocked.push(id);
  };

  if (input.justCompletedChapter) {
    if (input.completedChaptersCountAfter === 1) unlock(BADGES.FIRST_CHAPTER);

    const ratio = input.totalChaptersCount > 0 ? input.completedChaptersCountAfter / input.totalChaptersCount : 0;
    if (ratio >= 0.25) unlock(BADGES.QUARTER);
    if (ratio >= 0.5) unlock(BADGES.HALFWAY);
    if (ratio >= 0.75) unlock(BADGES.THREE_QUARTERS);
    if (input.totalChaptersCount > 0 && input.completedChaptersCountAfter >= input.totalChaptersCount) {
      unlock(BADGES.COMPLETE);
    }
  }

  if (input.isFirstAttempt && input.correctCount === 5) {
    unlock(BADGES.NO_MISTAKES);
    if (input.completedChaptersCountAfter === 1) unlock(BADGES.PERFECT_FIRST);
  }

  if (input.streakAfter === 7) unlock(BADGES.STREAK_7);
  if (input.streakAfter === 30) unlock(BADGES.STREAK_30);

  if (
    input.justCompletedChapter &&
    input.secondsSinceChapterOpened !== null &&
    input.secondsSinceChapterOpened <= SPEED_BADGE_THRESHOLD_SECONDS
  ) {
    unlock(BADGES.SPEED);
  }

  return unlocked;
}
