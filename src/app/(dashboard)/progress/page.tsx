// src/app/(dashboard)/progress/page.tsx
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import { getAllChapters, getUserProgressMap } from "@/features/handbook/repository";
import { computeChapterUnlockState } from "@/features/handbook/chapter-lock";
import { getUserGamificationState, getUserBadgeUnlocks } from "@/features/gamification/repository";
import { buildBadgeList, getEffectiveStreak, getTodayDateString } from "@/features/gamification/service";
import { getLevelForPoints, getNextLevel } from "@/constants/gamification";
import { ProgressView } from "@/components/gamification/ProgressView";
import { levelProgressPercent } from "@/components/gamification/LevelBadge";

/* The fallback must catch server data failures while preserving Next signals. */
/* eslint-disable react-hooks/error-boundaries */

/**
 * Personal progress overview (Phase 2b step 7): level and points, learning
 * streak, chapter progress, the next chapter to open, and all badges.
 * Static presentation: no animation yet. It only READS existing state; nothing
 * here can change progress, points or unlocks.
 */
export default async function ProgressPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const dbUser = await getUserByEmailDirect(user.email);
  if (!dbUser) redirect("/login");

  try {
    const [state, badgeUnlocks, chapters, progressMap] = await Promise.all([
      getUserGamificationState(dbUser.id),
      getUserBadgeUnlocks(dbUser.id),
      getAllChapters(),
      getUserProgressMap(dbUser.id),
    ]);

    const level = getLevelForPoints(state.totalPoints);
    const nextLevel = getNextLevel(state.totalPoints);
    const levelPercent = levelProgressPercent(state.totalPoints, level.minPoints, nextLevel ? nextLevel.minPoints : null);
    const streak = getEffectiveStreak(
      { currentStreak: state.currentStreak, longestStreak: state.longestStreak, lastActivityDate: state.lastActivityDate },
      getTodayDateString(),
    );

    const stateMap = computeChapterUnlockState(chapters, progressMap);
    const completedCount = chapters.filter((c) => stateMap.get(c.id) === "completed").length;
    const chaptersPercent = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0;
    const nextChapter = chapters.find((c) => stateMap.get(c.id) === "unlocked") ?? null;

    const badges = buildBadgeList(badgeUnlocks);

    return (
      <ProgressView
        level={{ level: level.level, name: level.name }}
        points={state.totalPoints}
        levelPercent={levelPercent}
        nextLevel={
          nextLevel
            ? { level: nextLevel.level, name: nextLevel.name, pointsNeeded: nextLevel.minPoints - state.totalPoints }
            : null
        }
        streak={streak}
        longestStreak={state.longestStreak}
        completedCount={completedCount}
        totalChapters={chapters.length}
        chaptersPercent={chaptersPercent}
        nextChapter={nextChapter ? { id: nextChapter.id, title: nextChapter.title } : null}
        badges={badges}
      />
    );
  } catch (err) {
    // Framework signals (cookies -> dynamic rendering, redirects) must propagate.
    unstable_rethrow(err);
    console.error("[ProgressPage] failed:", err instanceof Error ? err.message : String(err));
    return (
      <div className="container mx-auto p-6 max-w-3xl">
        <p className="text-gray-600">Podaci o napretku trenutno nisu dostupni. Molimo pokušajte ponovo.</p>
        <Link href="/handbook" className="btn-ghost">
          Nazad na priručnik
        </Link>
      </div>
    );
  }
}
