# SPRINT_17 — Admin Document Upload Workflow (Full)
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Complete Admin-facing document management: upload, track, view status.
Super Admin-facing: review diff, approve or reject with written reason.

---

## Scope — IN

- Admin document list view (their uploads, with status)
- Upload progress UI: Uploading → Validating → Extracting → OCR → Converting → Ready for Review
- Admin notification when document is rejected (email + in-app)
- Super Admin document review page: diff view, preview, approve/reject
- Super Admin sees all pending documents across all admins
- Email notifications via Resend for approval and rejection outcomes
- All actions logged to `audit_log`

## Scope — OUT

- Living Ecosystem auto-update (Sprint 18) — approval triggers stub log only

---

## Acceptance Criteria

- [ ] Admin sees list of their uploaded documents with current status
- [ ] Upload UI shows each pipeline step in real time (Supabase Realtime)
- [ ] Super Admin sees all staging documents from all admins
- [ ] Super Admin can view: original document, extracted text, diff from previous version
- [ ] Approval: document status → active, old → archived, ecosystem update stub triggered
- [ ] Rejection: reason required, email sent to uploading Admin
- [ ] Every approval/rejection logged to audit_log with: who, when, reason
- [ ] `npx tsc --noEmit` passes

---

## Files Expected to Change

- `features/documents/components/DocumentList.tsx`
- `features/documents/components/DocumentStatus.tsx`
- `features/documents/components/DiffViewer.tsx`
- `app/(dashboard)/admin/documents/page.tsx`
- `app/(dashboard)/super-admin/documents/review/[id]/page.tsx`
- `app/api/documents/[id]/approve/route.ts`
- `app/api/documents/[id]/reject/route.ts`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
