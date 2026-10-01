# GAMIFICATION.md — Scoring and Progression Specification
# IDSS Handbook Web Application
# Version 1.0 — June 2026

---

> All numeric values below must be stored in `constants/gamification.ts`.
> Never hardcode these values in UI components or business logic.

---

## Points Table

| Action | Points |
|---|---|
| Correct answer — first attempt | 20 |
| Correct answer — retry attempt | 10 |
| Chapter completed 5/5 — first time | 100 bonus |
| Chapter revisited (practice mode) | 0 |
| 7-day streak maintained | 50 bonus |
| 30-day streak maintained | 200 bonus |
| All chapters completed (100%) | 500 bonus |

---

## Level System — 10 Institutional Levels

| Level | Points Required | Name (Bosnian) |
|---|---|---|
| 1 | 0 | Pripravnik |
| 2 | 150 | Suradnik |
| 3 | 400 | Edukator |
| 4 | 800 | Mentor |
| 5 | 1,400 | Specijalist |
| 6 | 2,200 | Iskusni nastavnik |
| 7 | 3,200 | Stručni savjetnik |
| 8 | 4,500 | Senior edukator |
| 9 | 6,000 | Ekspert |
| 10 | 8,000 | IDSS Ambasador |

On level-up: `celebrate()` animation + speech bubble: "Čestitamo! Novi nivo: {name}! 🎓"

---

## Streak Rules

- Streak = consecutive calendar days with ≥1 quiz question answered
- Increments: when user answers any question on a new calendar day
- Resets: at midnight local time if no activity the previous calendar day
- Store: `current_streak` (int) and `longest_streak` (int) per user

---

## Badge Definitions

| Badge ID | Name | Trigger Condition |
|---|---|---|
| badge_first_chapter | Prvo poglavlje | First chapter completed 5/5 |
| badge_quarter | Četvrtina puta | 25% of all chapters completed |
| badge_halfway | Polovina puta | 50% of all chapters completed |
| badge_three_quarters | Tri četvrtine | 75% of all chapters completed |
| badge_complete | Priručnik savladan | 100% of all chapters completed |
| badge_perfect_first | Savršen početak | First quiz: 5/5 with zero wrong answers on first attempt |
| badge_streak_7 | Tjedan posvećenosti | 7-day streak achieved |
| badge_streak_30 | Mjesec izvrsnosti | 30-day streak achieved |
| badge_no_mistakes | Bez greške | Any chapter: 5/5 with zero wrong answers on first attempt |
| badge_speed | Brzi um | Any chapter quiz passed within 2 minutes of unlocking |

---

## Badge Display Rules

- Unlocked: full colour, `2px solid var(--game-green)` border, 48×48px
- Locked: `filter: grayscale(1) opacity(0.4)`, `2px solid var(--neutral-border)` border
- Hover (unlocked): tooltip — badge name + unlock date
- Hover (locked): tooltip — unlock condition in Bosnian

---

## constants/gamification.ts Structure

```typescript
export const POINTS = {
  CORRECT_FIRST_ATTEMPT: 20,
  CORRECT_RETRY: 10,
  CHAPTER_COMPLETE_BONUS: 100,
  STREAK_7_BONUS: 50,
  STREAK_30_BONUS: 200,
  ALL_CHAPTERS_BONUS: 500,
} as const;

export const LEVELS = [
  { level: 1, minPoints: 0,    name: 'Pripravnik' },
  { level: 2, minPoints: 150,  name: 'Suradnik' },
  // ... all 10
] as const;

export const BADGES = {
  FIRST_CHAPTER:   'badge_first_chapter',
  // ... all 10
} as const;
```

---

*IDSS Handbook Gamification v1.0*
