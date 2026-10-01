/**
 * Real DB-level integration test for Phase 2a step 4 (points/streak/badges
 * wired into submitQuizAnswers), against the CORRECT pre-existing schema
 * (user_points / badges / user_badges — see gamification/repository.ts's
 * header comment for the 2026-09-15 correction). submitQuizAnswers itself
 * can't be called directly from a plain script — it's a "use server" action
 * that needs a real Next.js request/cookie context — so this exercises the
 * exact same repository+service functions it calls internally
 * (getUserGamificationState, getUnlockedBadgeIds, calculatePoints,
 * updateStreak, checkBadgeUnlocks, applyGamificationUpdate) against a
 * disposable test account.
 *
 * Uses one of the existing test.user+*@idss.ba disposable accounts (not a
 * synthetic fixture, since users.id has a foreign-key constraint to
 * auth.users — an arbitrary UUID can't be inserted). Its original
 * gamification state is saved and restored at the end regardless of
 * pass/fail — including resolving its original badge_key set back to the
 * badge_id uuids user_badges actually stores.
 *
 * Run: npx tsx --env-file=.env scripts/test-gamification-integration.ts
 */
import "dotenv/config";
import {
  getUserGamificationState,
  getUnlockedBadgeIds,
  getUserBadgeUnlocks,
  applyGamificationUpdate,
} from "../src/features/gamification/repository";
import { calculatePoints, checkLevelUp, updateStreak, checkBadgeUnlocks } from "../src/features/gamification/service";
import { BADGES, POINTS, getLevelForPoints, type BadgeId } from "../src/constants/gamification";
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

const TEST_USER_ID = "095e59ad-79fa-4264-b8a9-476cdd279dca"; // test.user+1783376758840@idss.ba — disposable

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
  }
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Resolves badge_key strings to badges.id uuids, for restoring user_badges directly (bypassing applyGamificationUpdate, which is for NEW unlocks, not restoration). */
async function badgeKeysToIds(supabase: ReturnType<typeof createSupabaseDirectAdmin>, keys: BadgeId[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const { data, error } = await supabase.from("badges").select("id, badge_key").in("badge_key", keys);
  if (error) throw new Error(`badgeKeysToIds failed: ${error.message}`);
  return (data ?? []).map((b) => b.id as string);
}

async function main() {
  const supabase = createSupabaseDirectAdmin();

  console.log(`[GamIntegration] Sačuvavam originalno stanje test naloga ${TEST_USER_ID}...`);
  const original = await getUserGamificationState(TEST_USER_ID);
  const originalBadges = await getUnlockedBadgeIds(TEST_USER_ID);
  console.log(`  original: points=${original.totalPoints} level=${original.level} streak=${original.currentStreak}/${original.longestStreak} badges=${originalBadges.size}`);

  try {
    console.log("\n[GamIntegration] Resetujem na čisto 0 stanje za test...");
    if (originalBadges.size > 0) {
      await supabase.from("user_badges").delete().eq("user_id", TEST_USER_ID);
    }
    await applyGamificationUpdate(TEST_USER_ID, {
      newTotalPoints: 0,
      newLevel: 1,
      newStreak: { currentStreak: 0, longestStreak: 0, lastActivityDate: todayPlusDays(-100) },
      newlyUnlockedBadgeIds: [],
    });

    console.log("\n=== SUBMISSION A: prvi ikad kviz, 5/5, prvi pokušaj, poglavlje 1/10 završeno ===");
    {
      const gamState = await getUserGamificationState(TEST_USER_ID);
      const unlockedBadgeIds = await getUnlockedBadgeIds(TEST_USER_ID);
      const day = todayPlusDays(0);
      const streakBefore = gamState.currentStreak;
      const newStreak = updateStreak(
        { currentStreak: gamState.currentStreak, longestStreak: gamState.longestStreak, lastActivityDate: gamState.lastActivityDate },
        day,
      );
      const pointsEarned = calculatePoints({
        correctCount: 5,
        isFirstAttempt: true,
        isPracticeMode: false,
        justCompletedChapter: true,
        justReachedStreak7: newStreak.currentStreak === 7 && streakBefore !== 7,
        justReachedStreak30: newStreak.currentStreak === 30 && streakBefore !== 30,
        justCompletedAllChapters: false,
      });
      const newTotal = gamState.totalPoints + pointsEarned;
      const newBadges = checkBadgeUnlocks({
        justCompletedChapter: true,
        isFirstAttempt: true,
        correctCount: 5,
        completedChaptersCountAfter: 1,
        totalChaptersCount: 10,
        streakAfter: newStreak.currentStreak,
        secondsSinceChapterOpened: 300,
        alreadyUnlockedBadgeIds: unlockedBadgeIds,
      });

      check("bodovi za submisiju A = 5*20 + 100 = 200", pointsEarned, 5 * POINTS.CORRECT_FIRST_ATTEMPT + POINTS.CHAPTER_COMPLETE_BONUS);
      check("novi bedževi A", newBadges.sort(), [BADGES.FIRST_CHAPTER, BADGES.NO_MISTAKES, BADGES.PERFECT_FIRST].sort());

      await applyGamificationUpdate(TEST_USER_ID, {
        newTotalPoints: newTotal,
        newLevel: getLevelForPoints(newTotal).level,
        newStreak: { ...newStreak, lastActivityDate: newStreak.lastActivityDate ?? day },
        newlyUnlockedBadgeIds: newBadges,
      });

      const afterState = await getUserGamificationState(TEST_USER_ID);
      const afterBadges = await getUnlockedBadgeIds(TEST_USER_ID);
      check("DB: points nakon A = 200", afterState.totalPoints, 200);
      check("DB: level nakon A tačno prati 200 bodova (>=150 => level 2)", afterState.level, getLevelForPoints(200).level);
      check("DB: current_streak nakon A = 1", afterState.currentStreak, 1);
      check("DB: longest_streak nakon A = 1", afterState.longestStreak, 1);
      check("DB: 3 bedža stvarno upisana u user_badges", afterBadges.size, 3);
      check("DB: sadrži badge_perfect_first", afterBadges.has(BADGES.PERFECT_FIRST), true);
      const unlockTimes = await getUserBadgeUnlocks(TEST_USER_ID);
      check("getUserBadgeUnlocks: 3 bedža, svaki sa ispravnim ISO vremenom otključavanja", unlockTimes.size === 3 && [...unlockTimes.values()].every((v) => !Number.isNaN(Date.parse(v))), true);
      check("getUserBadgeUnlocks: ključevi su isti kao getUnlockedBadgeIds", [...unlockTimes.keys()].sort(), [...afterBadges].sort());
    }

    console.log("\n=== SUBMISSION B: sljedeći dan, retry na drugom poglavlju, 3/5, ne završava ===");
    {
      const gamState = await getUserGamificationState(TEST_USER_ID);
      const unlockedBadgeIds = await getUnlockedBadgeIds(TEST_USER_ID);
      const day = todayPlusDays(1);
      const streakBefore = gamState.currentStreak;
      const newStreak = updateStreak(
        { currentStreak: gamState.currentStreak, longestStreak: gamState.longestStreak, lastActivityDate: gamState.lastActivityDate },
        day,
      );
      const pointsEarned = calculatePoints({
        correctCount: 3,
        isFirstAttempt: false,
        isPracticeMode: false,
        justCompletedChapter: false,
        justReachedStreak7: newStreak.currentStreak === 7 && streakBefore !== 7,
        justReachedStreak30: newStreak.currentStreak === 30 && streakBefore !== 30,
        justCompletedAllChapters: false,
      });
      const newTotal = gamState.totalPoints + pointsEarned;
      const newBadges = checkBadgeUnlocks({
        justCompletedChapter: false,
        isFirstAttempt: false,
        correctCount: 3,
        completedChaptersCountAfter: 1,
        totalChaptersCount: 10,
        streakAfter: newStreak.currentStreak,
        secondsSinceChapterOpened: null,
        alreadyUnlockedBadgeIds: unlockedBadgeIds,
      });

      check("bodovi za submisiju B = 3*10 = 30 (retry rate, ne kompletira)", pointsEarned, 3 * POINTS.CORRECT_RETRY);
      check("nema novih bedževa B", newBadges, []);

      await applyGamificationUpdate(TEST_USER_ID, {
        newTotalPoints: newTotal,
        newLevel: getLevelForPoints(newTotal).level,
        newStreak: { ...newStreak, lastActivityDate: newStreak.lastActivityDate ?? day },
        newlyUnlockedBadgeIds: newBadges,
      });

      const afterState = await getUserGamificationState(TEST_USER_ID);
      check("DB: points nakon B = 200+30 = 230 (kumulativno)", afterState.totalPoints, 230);
      check("DB: current_streak nakon B = 2 (uzastopni dan)", afterState.currentStreak, 2);
    }

    console.log("\n=== SUBMISSION C: praznina od 5 dana (streak prekinut) ===");
    {
      const gamState = await getUserGamificationState(TEST_USER_ID);
      const day = todayPlusDays(6); // 5-day gap from day+1
      const newStreak = updateStreak(
        { currentStreak: gamState.currentStreak, longestStreak: gamState.longestStreak, lastActivityDate: gamState.lastActivityDate },
        day,
      );
      check("pure fn: streak resetovan na 1 poslije praznine", newStreak.currentStreak, 1);
      check("pure fn: longest_streak sačuvan (2, rekord od prije)", newStreak.longestStreak, 2);

      await applyGamificationUpdate(TEST_USER_ID, {
        newTotalPoints: gamState.totalPoints,
        newLevel: gamState.level,
        newStreak: { ...newStreak, lastActivityDate: newStreak.lastActivityDate ?? day },
        newlyUnlockedBadgeIds: [],
      });
      const afterState = await getUserGamificationState(TEST_USER_ID);
      check("DB: current_streak upisan kao 1", afterState.currentStreak, 1);
      check("DB: longest_streak i dalje 2", afterState.longestStreak, 2);
    }

    console.log("\n=== NIVO: level-up detekcija i upis pravog nivoa ===");
    {
      const finalState = await getUserGamificationState(TEST_USER_ID);
      const levelCheck = checkLevelUp(0, finalState.totalPoints);
      check(`level-up detekcija za ${finalState.totalPoints} bodova (>=150 => level 2 = Suradnik)`, levelCheck.newLevel.name, "Suradnik");
      check("DB: user_points.level stvarno upisan kao 2 (ne samo izračunat)", finalState.level, 2);
    }
  } finally {
    console.log(`\n[GamIntegration] Vraćam originalno stanje test naloga...`);
    const currentBadges = await supabase.from("user_badges").select("id").eq("user_id", TEST_USER_ID);
    if ((currentBadges.data?.length ?? 0) > 0) {
      await supabase.from("user_badges").delete().eq("user_id", TEST_USER_ID);
    }

    await applyGamificationUpdate(TEST_USER_ID, {
      newTotalPoints: original.totalPoints,
      newLevel: original.level,
      newStreak: {
        currentStreak: original.currentStreak,
        longestStreak: original.longestStreak,
        lastActivityDate: original.lastActivityDate ?? todayPlusDays(-100),
      },
      newlyUnlockedBadgeIds: [],
    });
    if (original.lastActivityDate === null) {
      // applyGamificationUpdate always writes a real date string; restore the
      // true original NULL directly since that's what the account actually had.
      await supabase.from("user_points").update({ last_active_date: null }).eq("user_id", TEST_USER_ID);
    }

    if (originalBadges.size > 0) {
      const badgeIds = await badgeKeysToIds(supabase, [...originalBadges]);
      const rows = badgeIds.map((badge_id) => ({ user_id: TEST_USER_ID, badge_id }));
      if (rows.length > 0) await supabase.from("user_badges").insert(rows);
    }

    const restored = await getUserGamificationState(TEST_USER_ID);
    const restoredBadges = await getUnlockedBadgeIds(TEST_USER_ID);
    console.log(
      `  vraćeno: points=${restored.totalPoints} level=${restored.level} streak=${restored.currentStreak}/${restored.longestStreak} last=${restored.lastActivityDate} badges=${restoredBadges.size}`,
    );
    check("nalog vraćen na originalno stanje (points)", restored.totalPoints, original.totalPoints);
    check("nalog vraćen na originalno stanje (level)", restored.level, original.level);
    check("nalog vraćen na originalno stanje (badges count)", restoredBadges.size, originalBadges.size);
  }

  console.log(`\n=== ZAKLJUČAK: ${passed} prošlo, ${failed} palo ===`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[GamIntegration] Fatal:", err);
  process.exitCode = 1;
});
