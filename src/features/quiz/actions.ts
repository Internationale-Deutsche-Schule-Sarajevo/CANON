/**
 * Quiz Server Actions — Sprint 12
 */

"use server";

import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import {
  hasMinimumReadingTimeElapsed,
  hasScrolledToEnd,
  getUserProgressForChapter,
  getAllChapters,
  getUserProgressMap,
} from "@/features/handbook/repository";
import {
  getQuestionPoolForChapter,
  recordQuizAttempt,
  markChapterCompleted,
  type ScoredAnswer,
} from "./repository";
import { SubmitQuizAnswersSchema } from "./schemas/quiz.schema";
import {
  calculatePoints,
  checkLevelUp,
  updateStreak,
  checkBadgeUnlocks,
  getTodayDateString,
} from "@/features/gamification/service";
import {
  getUserGamificationState,
  getUnlockedBadgeIds,
  applyGamificationUpdate,
} from "@/features/gamification/repository";
import type { BadgeId } from "@/constants/gamification";

const PASSING_SCORE = 5;

export type QuizResultItem = {
  questionId: string;
  question: string;
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
  explanation: string;
};

export type SubmitQuizResult =
  | {
      success: true;
      score: number;
      passed: boolean;
      results: QuizResultItem[];
      // Gamification (2026-09-15, AAA UI/VFX mandate Phase 2a step 4) — data
      // only, no visual meaning attached yet (that's Phase 2c). All 0/false
      // for a practice-mode retake of an already-completed chapter (no
      // reward for revisiting, matches GAMIFICATION.md's "Chapter revisited
      // | 0" rule extended consistently to streak/badges), and all 0/false
      // if the gamification update itself failed (best-effort — a failure
      // here must never invalidate an otherwise-valid quiz result).
      pointsEarned: number;
      totalPoints: number;
      leveledUp: boolean;
      newlyUnlockedBadges: BadgeId[];
    }
  | { success: false; error: string };

export async function submitQuizAnswers(
  chapterId: string,
  answers: { questionId: string; selectedIndex: number }[],
): Promise<SubmitQuizResult> {
  const parsed = SubmitQuizAnswersSchema.safeParse({ chapterId, answers });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Neispravan zahtjev." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { success: false, error: "Niste prijavljeni." };
  }

  const dbUser = await getUserByEmailDirect(user.email);
  if (!dbUser) {
    return { success: false, error: "Niste prijavljeni." };
  }

  // Server-side enforcement of BOTH gate conditions together — independent of
  // whatever the client-side timer/scroll state showed. Previously only the
  // timer was re-checked here; scroll was tracked only in ChapterReader's
  // React state and never verified server-side (found 2026-09-09), so a user
  // could reach this action without ever having scrolled the chapter. Both
  // must now hold, matching the "OBA uslova ZAJEDNO" spec exactly, not just
  // cosmetically in the UI.
  //
  // Exception: a chapter the user already completed is practice mode in the
  // reader (ChapterReader's isPracticeMode) — free re-read, no timer/scroll
  // requirement shown, no re-tracking. scrolled_to_end_at is a brand-new
  // column (2026-09-09) and is NULL for every already-completed row, so
  // enforcing it unconditionally here would lock every existing user out of
  // retaking a quiz they already passed. Mirror the reader's own rule
  // instead: already-completed skips both checks, same as it always has for
  // the timer (chapter_opened_at from the original pass already satisfies it
  // trivially; scroll gets the same treatment for consistency).
  const existingProgress = await getUserProgressForChapter(dbUser.id, parsed.data.chapterId);
  const isRetakeOfCompleted = existingProgress?.completed === true;

  if (!isRetakeOfCompleted) {
    const [timeElapsed, scrolledToEnd] = await Promise.all([
      hasMinimumReadingTimeElapsed(dbUser.id, parsed.data.chapterId),
      hasScrolledToEnd(dbUser.id, parsed.data.chapterId),
    ]);
    if (!timeElapsed || !scrolledToEnd) {
      return {
        success: false,
        error:
          !timeElapsed && !scrolledToEnd
            ? "Minimalno vrijeme čitanja nije isteklo i poglavlje nije pročitano do kraja."
            : !timeElapsed
              ? "Minimalno vrijeme čitanja nije isteklo."
              : "Poglavlje nije pročitano do kraja (skrolovanje).",
      };
    }
  }

  // Fetch the actual questions from the DB and score against them — never
  // trust client-submitted correct answers.
  const pool = await getQuestionPoolForChapter(parsed.data.chapterId);
  const poolById = new Map(pool.map((q) => [q.id, q]));

  const results: QuizResultItem[] = [];
  const countedIds = new Set<string>();
  let score = 0;

  for (const answer of parsed.data.answers) {
    if (countedIds.has(answer.questionId)) continue; // ignore duplicate submissions for the same question
    const question = poolById.get(answer.questionId);
    if (!question) continue; // ignore unknown/stale question ids

    countedIds.add(answer.questionId);
    const correct = answer.selectedIndex === question.correct_index;
    if (correct) score++;

    results.push({
      questionId: question.id,
      question: question.question,
      selectedIndex: answer.selectedIndex,
      correctIndex: question.correct_index,
      correct,
      explanation: question.explanation,
    });
  }

  const passed = score >= PASSING_SCORE;

  const scoredAnswers: ScoredAnswer[] = results.map((r) => ({
    questionId: r.questionId,
    selectedIndex: r.selectedIndex,
    correct: r.correct,
  }));

  await recordQuizAttempt(dbUser.id, parsed.data.chapterId, score, scoredAnswers);

  const justCompletedChapter = passed && !isRetakeOfCompleted;

  if (passed) {
    await markChapterCompleted(dbUser.id, parsed.data.chapterId);
  }

  // Gamification (2026-09-15) — runs AFTER the core quiz result is already
  // committed above, so a failure here can never undo or block a
  // legitimate pass; caught and logged, never thrown, per the same
  // best-effort discipline as unpublishChaptersForSupersededVersions.
  // isFirstAttempt uses existingProgress captured BEFORE recordQuizAttempt
  // incremented it, so "0 prior attempts" correctly means "this is attempt
  // #1" — matches GAMIFICATION.md's per-question first-attempt/retry split.
  let pointsEarned = 0;
  let totalPoints = 0;
  let leveledUp = false;
  let newlyUnlockedBadges: BadgeId[] = [];

  try {
    if (!isRetakeOfCompleted) {
      const isFirstAttempt = (existingProgress?.attempts ?? 0) === 0;

      const [gamState, unlockedBadgeIds, allChapters, progressMap] = await Promise.all([
        getUserGamificationState(dbUser.id),
        getUnlockedBadgeIds(dbUser.id),
        getAllChapters(),
        getUserProgressMap(dbUser.id),
      ]);

      const completedChaptersCountBefore = [...progressMap.values()].filter((p) => p.completed).length;
      const completedChaptersCountAfter = completedChaptersCountBefore + (justCompletedChapter ? 1 : 0);
      const totalChaptersCount = allChapters.length;

      const todayDateStr = getTodayDateString(); // Sarajevo calendar date, see service.ts
      const streakBefore = gamState.currentStreak;
      const newStreak = updateStreak(
        {
          currentStreak: gamState.currentStreak,
          longestStreak: gamState.longestStreak,
          lastActivityDate: gamState.lastActivityDate,
        },
        todayDateStr,
      );
      const justReachedStreak7 = newStreak.currentStreak === 7 && streakBefore !== 7;
      const justReachedStreak30 = newStreak.currentStreak === 30 && streakBefore !== 30;
      const justCompletedAllChapters =
        justCompletedChapter && totalChaptersCount > 0 && completedChaptersCountAfter === totalChaptersCount;

      const secondsSinceChapterOpened =
        justCompletedChapter && existingProgress?.chapter_opened_at
          ? Math.floor((Date.now() - new Date(existingProgress.chapter_opened_at).getTime()) / 1000)
          : null;

      pointsEarned = calculatePoints({
        correctCount: score,
        isFirstAttempt,
        isPracticeMode: false,
        justCompletedChapter,
        justReachedStreak7,
        justReachedStreak30,
        justCompletedAllChapters,
      });

      totalPoints = gamState.totalPoints + pointsEarned;
      const levelResult = checkLevelUp(gamState.totalPoints, totalPoints);
      leveledUp = levelResult.leveledUp;

      newlyUnlockedBadges = checkBadgeUnlocks({
        justCompletedChapter,
        isFirstAttempt,
        correctCount: score,
        completedChaptersCountAfter,
        totalChaptersCount,
        streakAfter: newStreak.currentStreak,
        secondsSinceChapterOpened,
        alreadyUnlockedBadgeIds: unlockedBadgeIds,
      });

      await applyGamificationUpdate(dbUser.id, {
        newTotalPoints: totalPoints,
        newLevel: levelResult.newLevel.level,
        // updateStreak() only ever returns a null lastActivityDate if it
        // short-circuits on an unchanged same-day input, which itself
        // requires the input to already be today's date (a real string) —
        // so this is never actually null; the `?? todayDateStr` fallback
        // just satisfies the type checker, it's logically unreachable.
        newStreak: { ...newStreak, lastActivityDate: newStreak.lastActivityDate ?? todayDateStr },
        newlyUnlockedBadgeIds: newlyUnlockedBadges,
      });
    }
  } catch (err) {
    console.error(
      `[QuizActions] Gamification update failed for user=${dbUser.id} chapter=${parsed.data.chapterId} (quiz result above is still valid):`,
      err instanceof Error ? err.message : String(err),
    );
    pointsEarned = 0;
    totalPoints = 0;
    leveledUp = false;
    newlyUnlockedBadges = [];
  }

  return { success: true, score, passed, results, pointsEarned, totalPoints, leveledUp, newlyUnlockedBadges };
}
