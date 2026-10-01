/**
 * Chapter lock-state logic — pure functions, no I/O.
 * Single source of truth for "locked progression": shared by ChapterList
 * (rendering) and the [chapterId] reader page (server-side access control),
 * so the two can never drift out of sync with each other.
 *
 * Rule: the first existing chapter is always unlocked. Every later chapter
 * is unlocked only once the immediately preceding chapter is completed.
 */

export type ChapterLockState = "locked" | "unlocked" | "completed";

export type ChapterForLockCheck = {
  id: string;
};

export function computeChapterUnlockState(
  chapters: ChapterForLockCheck[],
  progressMap: Map<string, { completed: boolean }>,
): Map<string, ChapterLockState> {
  const stateMap = new Map<string, ChapterLockState>();
  let previousCompleted = true;

  for (const chapter of chapters) {
    const completed = progressMap.get(chapter.id)?.completed ?? false;
    const unlocked = previousCompleted;
    stateMap.set(chapter.id, completed ? "completed" : unlocked ? "unlocked" : "locked");
    previousCompleted = completed;
  }

  return stateMap;
}
