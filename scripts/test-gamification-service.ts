/**
 * Unit tests for src/features/gamification/service.ts — pure functions, no
 * DB, no network. Kept in scripts/ as a regression check, same pattern as
 * scripts/test-fixes-2026-09-11.ts.
 *
 * Run: npx tsx scripts/test-gamification-service.ts
 */
import {
  calculatePoints,
  checkLevelUp,
  updateStreak,
  checkBadgeUnlocks,
  getEffectiveStreak,
  getTodayDateString,
  buildBadgeList,
  formatDateBs,
} from "../src/features/gamification/service";
import { POINTS, BADGES } from "../src/constants/gamification";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
  }
}

console.log("=== calculatePoints ===");
assertEqual(
  calculatePoints({ correctCount: 5, isFirstAttempt: true, isPracticeMode: false, justCompletedChapter: true, justReachedStreak7: false, justReachedStreak30: false, justCompletedAllChapters: false }),
  5 * POINTS.CORRECT_FIRST_ATTEMPT + POINTS.CHAPTER_COMPLETE_BONUS,
  "5/5 first attempt + chapter complete = 5*20 + 100 = 200",
);
assertEqual(
  calculatePoints({ correctCount: 3, isFirstAttempt: false, isPracticeMode: false, justCompletedChapter: false, justReachedStreak7: false, justReachedStreak30: false, justCompletedAllChapters: false }),
  3 * POINTS.CORRECT_RETRY,
  "3/5 retry attempt, not completed = 3*10 = 30",
);
assertEqual(
  calculatePoints({ correctCount: 5, isFirstAttempt: false, isPracticeMode: true, justCompletedChapter: false, justReachedStreak7: false, justReachedStreak30: false, justCompletedAllChapters: false }),
  0,
  "practice mode (already completed) = 0, regardless of score",
);
assertEqual(
  calculatePoints({ correctCount: 5, isFirstAttempt: true, isPracticeMode: false, justCompletedChapter: true, justReachedStreak7: true, justReachedStreak30: false, justCompletedAllChapters: false }),
  5 * POINTS.CORRECT_FIRST_ATTEMPT + POINTS.CHAPTER_COMPLETE_BONUS + POINTS.STREAK_7_BONUS,
  "chapter complete + streak-7 bonus stack = 100 + 20*5 + 50 = 250",
);
assertEqual(
  calculatePoints({ correctCount: 5, isFirstAttempt: true, isPracticeMode: false, justCompletedChapter: true, justReachedStreak7: false, justReachedStreak30: false, justCompletedAllChapters: true }),
  5 * POINTS.CORRECT_FIRST_ATTEMPT + POINTS.CHAPTER_COMPLETE_BONUS + POINTS.ALL_CHAPTERS_BONUS,
  "final chapter of 316 + all-complete bonus stack = 100+100+500 = 700",
);

console.log("\n=== checkLevelUp ===");
assertEqual(checkLevelUp(100, 200).leveledUp, true, "100 -> 200 crosses level 2 threshold (150) = level up");
assertEqual(checkLevelUp(100, 149).leveledUp, false, "100 -> 149 stays under 150 = no level up");
assertEqual(checkLevelUp(0, 0).leveledUp, false, "0 -> 0 = no level up");
assertEqual(checkLevelUp(100, 200).newLevel.name, "Suradnik", "100 -> 200 lands on Suradnik");
assertEqual(checkLevelUp(7999, 8000).newLevel.name, "IDSS Ambasador", "crossing into max level 10");

console.log("\n=== updateStreak ===");
assertEqual(
  updateStreak({ currentStreak: 0, longestStreak: 0, lastActivityDate: null }, "2026-09-15"),
  { currentStreak: 1, longestStreak: 1, lastActivityDate: "2026-09-15" },
  "first-ever activity starts streak at 1",
);
assertEqual(
  updateStreak({ currentStreak: 3, longestStreak: 5, lastActivityDate: "2026-09-14" }, "2026-09-15"),
  { currentStreak: 4, longestStreak: 5, lastActivityDate: "2026-09-15" },
  "consecutive day increments current, longest unchanged (below record)",
);
assertEqual(
  updateStreak({ currentStreak: 6, longestStreak: 6, lastActivityDate: "2026-09-14" }, "2026-09-15"),
  { currentStreak: 7, longestStreak: 7, lastActivityDate: "2026-09-15" },
  "consecutive day that ALSO breaks the longest-streak record updates both",
);
assertEqual(
  updateStreak({ currentStreak: 5, longestStreak: 10, lastActivityDate: "2026-09-10" }, "2026-09-15"),
  { currentStreak: 1, longestStreak: 10, lastActivityDate: "2026-09-15" },
  "gap of several days resets current to 1, longest preserved",
);
assertEqual(
  updateStreak({ currentStreak: 4, longestStreak: 4, lastActivityDate: "2026-09-15" }, "2026-09-15"),
  { currentStreak: 4, longestStreak: 4, lastActivityDate: "2026-09-15" },
  "same calendar day twice = idempotent no-op (doesn't double-count)",
);
assertEqual(
  updateStreak({ currentStreak: 28, longestStreak: 28, lastActivityDate: "2026-02-28" }, "2026-03-01"),
  { currentStreak: 29, longestStreak: 29, lastActivityDate: "2026-03-01" },
  "month boundary (Feb->Mar, 2026 is not a leap year) still counts as consecutive",
);
assertEqual(
  updateStreak({ currentStreak: 10, longestStreak: 10, lastActivityDate: "2025-12-31" }, "2026-01-01"),
  { currentStreak: 11, longestStreak: 11, lastActivityDate: "2026-01-01" },
  "year boundary still counts as consecutive",
);

console.log("\n=== checkBadgeUnlocks ===");
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: true, isFirstAttempt: true, correctCount: 5, completedChaptersCountAfter: 1, totalChaptersCount: 316, streakAfter: 1, secondsSinceChapterOpened: null, alreadyUnlockedBadgeIds: new Set() }).sort(),
  [BADGES.FIRST_CHAPTER, BADGES.NO_MISTAKES, BADGES.PERFECT_FIRST].sort(),
  "very first chapter, flawless first attempt -> 3 badges at once",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: true, isFirstAttempt: false, correctCount: 5, completedChaptersCountAfter: 1, totalChaptersCount: 316, streakAfter: 1, secondsSinceChapterOpened: null, alreadyUnlockedBadgeIds: new Set() }),
  [BADGES.FIRST_CHAPTER],
  "first chapter but via a RETRY (not first attempt) -> only FIRST_CHAPTER, no perfect/no-mistakes badges",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: false, isFirstAttempt: true, correctCount: 5, completedChaptersCountAfter: 1, totalChaptersCount: 316, streakAfter: 1, secondsSinceChapterOpened: null, alreadyUnlockedBadgeIds: new Set([BADGES.FIRST_CHAPTER, BADGES.PERFECT_FIRST]) }),
  [BADGES.NO_MISTAKES],
  "already-unlocked badges are never returned again, even when their trigger condition is still true",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: true, isFirstAttempt: false, correctCount: 3, completedChaptersCountAfter: 79, totalChaptersCount: 316, streakAfter: 1, secondsSinceChapterOpened: null, alreadyUnlockedBadgeIds: new Set([BADGES.FIRST_CHAPTER]) }),
  [BADGES.QUARTER],
  "79/316 = 25.0% exactly crosses the quarter threshold",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: true, isFirstAttempt: false, correctCount: 3, completedChaptersCountAfter: 316, totalChaptersCount: 316, streakAfter: 1, secondsSinceChapterOpened: null, alreadyUnlockedBadgeIds: new Set([BADGES.FIRST_CHAPTER, BADGES.QUARTER, BADGES.HALFWAY, BADGES.THREE_QUARTERS]) }),
  [BADGES.COMPLETE],
  "316/316 = 100% only unlocks COMPLETE (others already held)",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: false, isFirstAttempt: false, correctCount: 5, completedChaptersCountAfter: 50, totalChaptersCount: 316, streakAfter: 7, secondsSinceChapterOpened: null, alreadyUnlockedBadgeIds: new Set() }),
  [BADGES.STREAK_7],
  "hitting exactly 7-day streak on a non-completing submission",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: false, isFirstAttempt: false, correctCount: 2, completedChaptersCountAfter: 50, totalChaptersCount: 316, streakAfter: 8, secondsSinceChapterOpened: null, alreadyUnlockedBadgeIds: new Set() }),
  [],
  "streak of 8 (already past 7, never exactly hit it this call) unlocks nothing — matches 'streak achieved' as an exact-crossing event",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: true, isFirstAttempt: false, correctCount: 5, completedChaptersCountAfter: 50, totalChaptersCount: 316, streakAfter: 3, secondsSinceChapterOpened: 239, alreadyUnlockedBadgeIds: new Set([BADGES.FIRST_CHAPTER]) }),
  [BADGES.SPEED],
  "239s (just under the 240s threshold) unlocks badge_speed",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: true, isFirstAttempt: false, correctCount: 5, completedChaptersCountAfter: 50, totalChaptersCount: 316, streakAfter: 3, secondsSinceChapterOpened: 240, alreadyUnlockedBadgeIds: new Set([BADGES.FIRST_CHAPTER]) }),
  [BADGES.SPEED],
  "exactly 240s (inclusive boundary) still unlocks badge_speed",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: true, isFirstAttempt: false, correctCount: 5, completedChaptersCountAfter: 50, totalChaptersCount: 316, streakAfter: 3, secondsSinceChapterOpened: 241, alreadyUnlockedBadgeIds: new Set([BADGES.FIRST_CHAPTER]) }),
  [],
  "241s (just over threshold) does NOT unlock badge_speed",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: false, isFirstAttempt: false, correctCount: 5, completedChaptersCountAfter: 50, totalChaptersCount: 316, streakAfter: 3, secondsSinceChapterOpened: 100, alreadyUnlockedBadgeIds: new Set() }),
  [],
  "fast timing alone without justCompletedChapter (e.g. a practice retake) does NOT unlock badge_speed",
);
assertEqual(
  checkBadgeUnlocks({ justCompletedChapter: true, isFirstAttempt: false, correctCount: 3, completedChaptersCountAfter: 50, totalChaptersCount: 316, streakAfter: 3, secondsSinceChapterOpened: null, alreadyUnlockedBadgeIds: new Set([BADGES.FIRST_CHAPTER]) }),
  [],
  "null secondsSinceChapterOpened (unknown timing, e.g. practice mode) never unlocks badge_speed",
);

console.log("\n=== getEffectiveStreak ===");
assertEqual(getEffectiveStreak({ currentStreak: 5, longestStreak: 9, lastActivityDate: "2026-09-21" }, "2026-09-21"), 5, "active today: shows stored streak");
assertEqual(getEffectiveStreak({ currentStreak: 5, longestStreak: 9, lastActivityDate: "2026-09-20" }, "2026-09-21"), 5, "active yesterday, not yet today: streak still alive");
assertEqual(getEffectiveStreak({ currentStreak: 5, longestStreak: 9, lastActivityDate: "2026-09-19" }, "2026-09-21"), 0, "skipped a full day: streak is broken, shows 0 not the stale 5");
assertEqual(getEffectiveStreak({ currentStreak: 0, longestStreak: 0, lastActivityDate: null }, "2026-09-21"), 0, "never active: 0");

console.log("\n=== getTodayDateString ===");
assertEqual(getTodayDateString(new Date("2026-07-15T22:30:00Z")), "2026-07-16", "22:30 UTC in summer is already the next day in Sarajevo (UTC+2)");
assertEqual(getTodayDateString(new Date("2026-01-15T22:30:00Z")), "2026-01-15", "22:30 UTC in winter is 23:30 in Sarajevo (UTC+1): same day");
assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(getTodayDateString()), true, "default (now) returns YYYY-MM-DD");

console.log("\n=== buildBadgeList / formatDateBs ===");
{
  const none = buildBadgeList(new Map());
  assertEqual(none.length, 10, "all 10 badges listed even when none are unlocked");
  assertEqual(none.every((b) => !b.unlocked && b.awardedAt === null), true, "none unlocked: all locked, no dates");
  assertEqual(none[0].id, BADGES.FIRST_CHAPTER, "defined order preserved (first badge first)");
  const some = buildBadgeList(new Map([[BADGES.SPEED, "2026-09-21T10:00:00Z"], [BADGES.FIRST_CHAPTER, "2026-09-01T08:00:00Z"]]));
  assertEqual(some.filter((b) => b.unlocked).map((b) => b.id), [BADGES.FIRST_CHAPTER, BADGES.SPEED], "unlocked ones are marked, order stays the defined order (not unlock order)");
  assertEqual(some.find((b) => b.id === BADGES.SPEED)?.awardedAt, "2026-09-21T10:00:00Z", "unlock time carried through");
}
assertEqual(formatDateBs("2026-09-21T10:00:00Z"), "21. 9. 2026.", "date formatted d. m. yyyy.");
assertEqual(formatDateBs("2026-07-15T22:30:00Z"), "16. 7. 2026.", "late-evening UTC in summer is already the next day in Sarajevo");

console.log(`\n=== ZAKLJUČAK: ${passed} prošlo, ${failed} palo ===`);
if (failed > 0) process.exitCode = 1;
