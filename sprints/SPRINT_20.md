# SPRINT_20 — DOCX Export
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Generate professional DOCX files on the IDSS memorandum template.
Available to Super Admin (all documents) and Admin (their uploads).

---

## Scope — IN

- DOCX generation using `docx` npm package
- IDSS memorandum template applied (`repo\public\IDSS_Memorandum.docx`)
- IDSS logo included (`repo\public\IDSS_Logo_RGB_Primarna_verzija.png`)
- Temporary download link: generated on demand, valid 1 hour
- Available document types for export:
  - Handbook chapter as formatted document
  - User progress report (for Super Admin)
  - Audit log excerpt (for Super Admin)

## Scope — OUT

- Permanent storage of generated DOCX files

---

## Acceptance Criteria

- [ ] Super Admin can export any Handbook chapter as DOCX
- [ ] Super Admin can export user progress report as DOCX
- [ ] Admin can export their own uploaded document summary as DOCX
- [ ] Every generated DOCX uses IDSS memorandum visual style
- [ ] IDSS logo appears in header of every generated DOCX
- [ ] Download link expires after 1 hour (Supabase Storage signed URL)
- [ ] Generated file does not remain in storage after link expires
- [ ] `npx tsc --noEmit` passes

---

## Files Expected to Change

- `lib/docx/generator.ts`
- `lib/docx/memorandum-template.ts`
- `app/api/export/chapter/[id]/route.ts`
- `app/api/export/progress-report/route.ts`
- `app/api/export/audit-excerpt/route.ts`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
