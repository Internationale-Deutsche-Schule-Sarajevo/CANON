# SPRINT_11 — Handbook Reader and Locked Progression
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Build the primary user experience: reading chapters with locked progression.
No shortcut. No bypass. Server enforces every condition.

---

## Scope — IN

- Chapter list with locked/unlocked visual states
- Chapter reader: clean rendered content (no raw Markdown/HTML visible)
- Scroll tracker: 100% scroll required before quiz unlocks
- Reading timer: 3 minutes minimum, server-enforced
- Quiz button: locked (greyed) until BOTH conditions met
- Handbook progress bar (shows % of total chapters completed)
- Chapter navigation (previous/next, locked chapters non-clickable)
- Completed chapters revisitable in practice mode (no progress reset)

## Scope — OUT

- Quiz UI (Sprint 12)
- Gamification points (Sprint 13)

---

## Acceptance Criteria

- [ ] User sees chapter list with clear locked/unlocked/completed visual states
- [ ] Clicking a locked chapter shows Bosnian message explaining prerequisite
- [ ] Chapter content renders cleanly (no `##`, `**`, `---` visible to user)
- [ ] Scroll tracker reaches 100% only when user has scrolled entire content
- [ ] Timer starts when chapter opens, counts server-side (stored in DB)
- [ ] Quiz button locked and greyed out until both: timer ≥ 180s AND scroll = 100%
- [ ] On quiz submission: server rejects if `(submit_time - open_time) < 180s`
- [ ] Completed chapter shows visual "done" state
- [ ] Practice mode: re-reading a completed chapter doesn't change progress
- [ ] Handbook progress bar updates after each chapter completion
- [ ] Mobile: scroll tracking works on touch devices
- [ ] `npx tsc --noEmit` passes

---

## Server-Side Time Enforcement

When user opens chapter: record `chapter_open_time` in `user_progress`.
When quiz is submitted: server checks `NOW() - chapter_open_time >= 180 seconds`.
If not: return `{ success: false, error: 'Minimalno vrijeme čitanja nije isteklo.' }`

This check is in the API route, not the UI. UI can also show the timer countdown,
but it is decorative — the server is the authority.

---

## Files Expected to Change

- `features/handbook/components/ChapterList.tsx`
- `features/handbook/components/ChapterReader.tsx`
- `features/handbook/components/ProgressBar.tsx`
- `features/handbook/repository.ts`
- `features/handbook/actions.ts`
- `app/(dashboard)/handbook/page.tsx`
- `app/(dashboard)/handbook/[chapterId]/page.tsx`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
