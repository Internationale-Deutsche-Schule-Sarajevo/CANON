import Image from "next/image";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import { getUserGamificationState } from "@/features/gamification/repository";
import { getEffectiveStreak, getTodayDateString } from "@/features/gamification/service";
import { getLevelForPoints, getNextLevel } from "@/constants/gamification";
import { StreakDisplay } from "./StreakDisplay";
import { LevelBadge } from "./LevelBadge";

/* The fallback must catch server data failures while preserving Next signals. */
/* eslint-disable react-hooks/error-boundaries */

/**
 * Top status bar for every (dashboard) page: user name, level + progress,
 * learning streak. Server component. Purely additive and fail-safe — if the
 * user can't be resolved or anything throws, it renders nothing (and logs),
 * so it can never break the page it sits above; each page still does its own
 * auth and redirects exactly as before.
 */
export async function GamificationBar() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return null;

    const dbUser = await getUserByEmailDirect(user.email);
    if (!dbUser) return null;

    const state = await getUserGamificationState(dbUser.id);
    const level = getLevelForPoints(state.totalPoints);
    const nextLevel = getNextLevel(state.totalPoints);
    const streak = getEffectiveStreak(
      {
        currentStreak: state.currentStreak,
        longestStreak: state.longestStreak,
        lastActivityDate: state.lastActivityDate,
      },
      getTodayDateString(),
    );

    return (
      <header className="nav nav-status-bar">
        <Link href="/handbook" className="nav-brand" aria-label="IDSS Handbook početna stranica">
          <Image
            src="/idss-logo-whiteout.png"
            alt="Internationale Deutsche Schule Sarajevo"
            width={1460}
            height={443}
            priority
          />
        </Link>
        <span className="nav-user-name">{dbUser.full_name}</span>
        <Link href="/progress" className="nav-status-link" title="Moj napredak">
          <LevelBadge
            level={level.level}
            name={level.name}
            points={state.totalPoints}
            currentLevelMinPoints={level.minPoints}
            nextLevelMinPoints={nextLevel ? nextLevel.minPoints : null}
          />
          <StreakDisplay currentStreak={streak} />
        </Link>
      </header>
    );
  } catch (err) {
    // cookies() signals "this route is dynamic" by throwing; swallowing that
    // would let Next prerender the page without the bar. Framework errors must
    // propagate, everything else is our fail-safe case. (Next docs: unstable_rethrow)
    unstable_rethrow(err);
    console.error("[GamificationBar] failed, rendering nothing:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
