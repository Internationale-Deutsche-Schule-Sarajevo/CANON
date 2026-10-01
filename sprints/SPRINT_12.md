# SPRINT_12 — Quiz Engine
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Complete quiz system: generation, question pool, 5/5 requirement,
Duolingo-style UI with answer feedback. Next chapter unlocks only on 5/5.

---

## Scope — IN

- Quiz question generation (15 questions/chapter) via `gemini-2.5-flash`
- Random 5-question draw per attempt
- Different random set on retry
- Answer submission flow with reveal animation
- USTAV-grounded explanation per question (shown after answer)
- 5/5 required — next chapter unlocks immediately on pass
- Quiz progress bar (questions 1–5)
- Consecutive wrong answer counter (3 → empathy animation trigger in Sprint 15)
- Quiz attempt logging in `user_progress`

## Scope — OUT

- Logo animations (Sprint 15, but wire up the trigger stubs)
- Points/badges (Sprint 13)

---

## Acceptance Criteria

- [ ] 15 questions generated per chapter during import (or triggered manually)
- [ ] Each question: text, 4 options (A/B/C/D), correct index, Bosnian explanation
- [ ] Active quiz draws 5 random questions from pool
- [ ] Retry draws different 5 questions
- [ ] Answer button states match DESIGN_SYSTEM.md exactly:
      Default / Hover / Selected / Correct (green) / Incorrect (red)
- [ ] 3px solid bottom border depth effect on all answer buttons
- [ ] Submit button activates only after option selected
- [ ] All options reveal correct/incorrect simultaneously on submit
- [ ] Explanation appears below options after reveal
- [ ] 300ms delay before logo animation stub called (`celebrate()` or `fail()`)
- [ ] "Sljedeće pitanje" button appears after 2,000ms
- [ ] Score 5/5: next chapter unlocks, completion recorded in DB
- [ ] Score < 5/5: retry shown, no unlock
- [ ] Quiz progress bar fills correctly (1/5 → 2/5 → ... → 5/5)
- [ ] Attempt count and wrong answers logged per question
- [ ] `npx tsc --noEmit` passes

---

## Question Generation Prompt

```
Generiši 15 pitanja za kviz na osnovu sljedećeg USTAV dokumenta IDSS škole.
Jezik: bosanski. Format JSON array.
Svako pitanje: { question, options: [A,B,C,D], correctIndex: 0-3, explanation }
Objašnjenja moraju biti zasnovana direktno na tekstu dokumenta.
Dokument: [CHAPTER_CONTENT]
```

---

## Answer Button CSS Reference

From DESIGN_SYSTEM.md:
```css
/* Default */    background: #fff;    border: 2px solid #3c3c3c;  border-bottom: 3px solid #d0d0d0;
/* Hover */      background: #f0f7ff; border: 2px solid #16558A;
/* Selected */   background: #e8f4fd; border: 2px solid #1CC4E6;
/* Correct */    background: #d7f5a0; border: 2px solid #58cc02;  border-bottom: 3px solid #4cae02;
/* Incorrect */  background: #ffe0e0; border: 2px solid #E31B23;  border-bottom: 3px solid #b00018;
```

---

## Files Expected to Change

- `features/quiz/generator.ts`
- `features/quiz/components/QuizCard.tsx`
- `features/quiz/components/AnswerOption.tsx`
- `features/quiz/components/QuizProgressBar.tsx`
- `features/quiz/repository.ts`
- `features/quiz/actions.ts`
- `app/(dashboard)/quiz/[chapterId]/page.tsx`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
