/**
 * Gamification constants — single source of truth for every point/level/
 * badge value. Never hardcode these numbers in UI components or business
 * logic (GAMIFICATION.md's explicit rule). Values match GAMIFICATION.md
 * exactly; VISUAL presentation of these numbers follows the AAA UI/VFX
 * mandate (2026-09-15), but the numbers themselves are unchanged by it.
 *
 * UI copy for badge/level names is Bosnian throughout, per CONSTITUTION.md
 * P-1 and the Director's explicit 2026-09-15 decision to translate the
 * mandate's illustrative English microcopy rather than adopt it literally.
 */

/**
 * badge_speed threshold, in seconds since the chapter was unlocked
 * (chapter_opened_at) — same measurement point handbook/constants.ts's
 * MINIMUM_READING_SECONDS already uses. GAMIFICATION.md originally said 120s
 * ("within 2 minutes"), but that's below MINIMUM_READING_SECONDS (180s), so
 * the quiz could never be submitted in time to qualify. Director's decision
 * (2026-09-15): raise to 240s (4 minutes) instead — same measurement point,
 * new threshold, chosen so the badge is reachable (just past the 180s
 * reading floor) but still means "fast."
 */
export const SPEED_BADGE_THRESHOLD_SECONDS = 240;

export const POINTS = {
  CORRECT_FIRST_ATTEMPT: 20,
  CORRECT_RETRY: 10,
  CHAPTER_COMPLETE_BONUS: 100,
  STREAK_7_BONUS: 50,
  STREAK_30_BONUS: 200,
  ALL_CHAPTERS_BONUS: 500,
} as const;

export type Level = {
  level: number;
  minPoints: number;
  name: string;
};

export const LEVELS: readonly Level[] = [
  { level: 1, minPoints: 0, name: "Pripravnik" },
  { level: 2, minPoints: 150, name: "Suradnik" },
  { level: 3, minPoints: 400, name: "Edukator" },
  { level: 4, minPoints: 800, name: "Mentor" },
  { level: 5, minPoints: 1400, name: "Specijalist" },
  { level: 6, minPoints: 2200, name: "Iskusni nastavnik" },
  { level: 7, minPoints: 3200, name: "Stručni savjetnik" },
  { level: 8, minPoints: 4500, name: "Senior edukator" },
  { level: 9, minPoints: 6000, name: "Ekspert" },
  { level: 10, minPoints: 8000, name: "IDSS Ambasador" },
] as const;

export const BADGES = {
  FIRST_CHAPTER: "badge_first_chapter",
  QUARTER: "badge_quarter",
  HALFWAY: "badge_halfway",
  THREE_QUARTERS: "badge_three_quarters",
  COMPLETE: "badge_complete",
  PERFECT_FIRST: "badge_perfect_first",
  STREAK_7: "badge_streak_7",
  STREAK_30: "badge_streak_30",
  NO_MISTAKES: "badge_no_mistakes",
  SPEED: "badge_speed",
} as const;

export type BadgeId = (typeof BADGES)[keyof typeof BADGES];

export type BadgeDefinition = {
  id: BadgeId;
  name: string;
  description: string;
};

/** name/description are the Bosnian UI copy shown on the badge itself and its tooltip (see DESIGN_SYSTEM.md Badge Display Rules). */
export const BADGE_DEFINITIONS: Record<BadgeId, BadgeDefinition> = {
  [BADGES.FIRST_CHAPTER]: {
    id: BADGES.FIRST_CHAPTER,
    name: "Prvo poglavlje",
    description: "Prvo poglavlje savladano 5/5.",
  },
  [BADGES.QUARTER]: {
    id: BADGES.QUARTER,
    name: "Četvrtina puta",
    description: "25% svih poglavlja savladano.",
  },
  [BADGES.HALFWAY]: {
    id: BADGES.HALFWAY,
    name: "Polovina puta",
    description: "50% svih poglavlja savladano.",
  },
  [BADGES.THREE_QUARTERS]: {
    id: BADGES.THREE_QUARTERS,
    name: "Tri četvrtine",
    description: "75% svih poglavlja savladano.",
  },
  [BADGES.COMPLETE]: {
    id: BADGES.COMPLETE,
    name: "Priručnik savladan",
    description: "100% svih poglavlja savladano.",
  },
  [BADGES.PERFECT_FIRST]: {
    id: BADGES.PERFECT_FIRST,
    name: "Savršen početak",
    description: "Prvi kviz: 5/5 bez ijednog netačnog odgovora, iz prvog pokušaja.",
  },
  [BADGES.STREAK_7]: {
    id: BADGES.STREAK_7,
    name: "Tjedan posvećenosti",
    description: "7 uzastopnih dana aktivnosti.",
  },
  [BADGES.STREAK_30]: {
    id: BADGES.STREAK_30,
    name: "Mjesec izvrsnosti",
    description: "30 uzastopnih dana aktivnosti.",
  },
  [BADGES.NO_MISTAKES]: {
    id: BADGES.NO_MISTAKES,
    name: "Bez greške",
    description: "Bilo koje poglavlje: 5/5 bez ijednog netačnog odgovora, iz prvog pokušaja.",
  },
  [BADGES.SPEED]: {
    id: BADGES.SPEED,
    name: "Brzi um",
    description: "Kviz položen unutar 2 minute od otključavanja.",
  },
};

/** Returns the level for a given cumulative point total — highest level whose minPoints threshold is met. */
export function getLevelForPoints(totalPoints: number): Level {
  let current: Level = LEVELS[0];
  for (const level of LEVELS) {
    if (totalPoints >= level.minPoints) current = level;
    else break;
  }
  return current;
}

/** Returns the next level (for "points to next milestone" UI), or null if already at the max level. */
export function getNextLevel(totalPoints: number): Level | null {
  const current = getLevelForPoints(totalPoints);
  const next = LEVELS.find((l) => l.level === current.level + 1);
  return next ?? null;
}
