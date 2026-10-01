# SPRINT_13 — Gamification System
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Complete points, levels, streaks, and badges. All values from GAMIFICATION.md.
No hardcoded numbers — all in `constants/gamification.ts`.

---

## Scope — IN

- Points awarded per correct answer and chapter completion
- 10 institutional levels (Pripravnik → IDSS Ambasador)
- Level-up detection and notification trigger
- Streak tracking (daily, resets at midnight local time)
- 10 badges with trigger conditions (see GAMIFICATION.md)
- Trophy.so integration OR custom Supabase implementation
- User progress dashboard (own data)
- Admin progress overview (all users)
- Streak display component (nav bar + dashboard)
- Badge display component (unlocked/locked states)

## Scope — OUT

- Logo level-up animation (Sprint 15, wire stub)
- Super Admin full dashboard (Sprint 19)

---

## Acceptance Criteria

- [ ] Correct answer (first attempt): +20 points
- [ ] Correct answer (retry): +10 points
- [ ] Chapter 5/5 completion (first time): +100 bonus points
- [ ] 7-day streak: +50 bonus points
- [ ] 30-day streak: +200 bonus points
- [ ] All chapters complete: +500 bonus points
- [ ] Level calculated from cumulative points per GAMIFICATION.md table
- [ ] Level-up: calls `celebrate()` stub, shows speech bubble with level name
- [ ] Streak increments when user answers any question on a new calendar day
- [ ] Streak resets if no activity previous calendar day (checked at midnight)
- [ ] All 10 badges award correctly on trigger conditions
- [ ] Locked badges shown greyscale with lock icon
- [ ] Unlocked badges shown in full colour with award date tooltip
- [ ] All point values in `constants/gamification.ts` (no hardcoded numbers)
- [ ] `npx tsc --noEmit` passes

---

## Level Names (from GAMIFICATION.md)

```
1  →    0 pts  Pripravnik
2  →  150 pts  Suradnik
3  →  400 pts  Edukator
4  →  800 pts  Mentor
5  → 1400 pts  Specijalist
6  → 2200 pts  Iskusni nastavnik
7  → 3200 pts  Stručni savjetnik
8  → 4500 pts  Senior edukator
9  → 6000 pts  Ekspert
10 → 8000 pts  IDSS Ambasador
```

---

## Files Expected to Change

- `constants/gamification.ts`
- `features/gamification/points.ts`
- `features/gamification/levels.ts`
- `features/gamification/streaks.ts`
- `features/gamification/badges.ts`
- `features/gamification/repository.ts`
- `features/gamification/components/StreakDisplay.tsx`
- `features/gamification/components/BadgeGrid.tsx`
- `features/gamification/components/LevelBadge.tsx`
- `app/(dashboard)/progress/page.tsx`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
