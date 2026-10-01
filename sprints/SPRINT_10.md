# SPRINT_10 — Handbook Chapter Generation
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Generate professional Bosnian Handbook chapters from USTAV documents using Gemini.
Store them in the database. Never generate on-the-fly per user request.

---

## Scope — IN

- Generate chapter content for all 382 USTAV documents
- Store in `handbook_chapters` table
- Run as QStash background job (not blocking)
- Progress visible to Super Admin
- Regeneration: re-run for specific document when triggered by Living Ecosystem

## Scope — OUT

- Handbook reader UI (Sprint 11)
- Quiz question generation (Sprint 12)

---

## Acceptance Criteria

- [ ] Chapter generated for each USTAV document using `gemini-2.5-flash`
- [ ] Every chapter ≥ 3,000 rendered characters
- [ ] Every chapter in Bosnian, professional tone, no filler phrases, no em-dash
- [ ] No raw Markdown syntax in stored content (pre-rendered)
- [ ] Every chapter includes: at least one process description, one structured table
- [ ] `max_output_tokens: 8192`, `temperature: 0.3`
- [ ] Failed chapters logged — pipeline continues with others
- [ ] Super Admin sees generation progress per document
- [ ] `npx tsc --noEmit` passes

---

## Generation System Prompt

```
Ti si profesionalni pisac institucionalnih priručnika za nastavnike.
Pišeš poglavlje za Priručnik za nastavnike P.U. Internationale Deutsche Schule Sarajevo.
Jezik: bosanski (latinica). Ton: profesionalan, topao, precizan.
Ne koristiš: em-crticu, AI fraze, surogatne formulacije.
Minimalno 3.000 znakova. Sadržaj mora uključivati opis procesa i tabelu.
Osnova isključivo: [USTAV_DOCUMENT_CONTENT]
```

---

## Files Expected to Change

- `features/handbook/generator.ts`
- `features/handbook/repository.ts`
- `app/api/admin/generate-chapters/route.ts`
- `app/(dashboard)/super-admin/system/page.tsx`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
