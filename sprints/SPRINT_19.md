# SPRINT_19 — Super Admin Dashboards
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Give the Director complete visibility and control over every aspect of the platform
from a single, clear, professionally designed dashboard.

---

## Scope — IN

- User management: list all users, approve/reject pending registrations, view role and status
- Progress overview: all users × all chapters — who completed what, when, how many attempts
- Chatbot conversation log: search by user, by date, by question content
- Audit log viewer: filterable by user, action type, date range
- System health: import status, RAG index status, job queue status, last ecosystem update
- Manual reindex trigger (re-runs USTAV import + RAG pipeline)
- Document archive viewer: view old document versions (read-only)

## Scope — OUT

- DOCX export (Sprint 20)

---

## Acceptance Criteria

- [ ] Super Admin can see all pending registrations and approve/reject each
- [ ] Super Admin can see every user's progress across all chapters
- [ ] Super Admin can open any chatbot conversation and read the full exchange
- [ ] Super Admin can search chatbot logs by keyword
- [ ] Audit log shows: who, what action, when, what changed (before/after)
- [ ] System health shows: 382/382 documents indexed, last update timestamp,
      any failed jobs with retry button
- [ ] Manual reindex button triggers full USTAV import + RAG pipeline
- [ ] Archive viewer shows old document versions, clearly marked ARCHIVED,
      with deactivation date and reason
- [ ] All data in Bosnian plain-language labels
- [ ] Empty states for every list (no blank screens)
- [ ] `npx tsc --noEmit` passes

---

## Files Expected to Change

- `app/(dashboard)/super-admin/page.tsx`
- `app/(dashboard)/super-admin/users/page.tsx`
- `app/(dashboard)/super-admin/progress/page.tsx`
- `app/(dashboard)/super-admin/chatbot-logs/page.tsx`
- `app/(dashboard)/super-admin/audit-log/page.tsx`
- `app/(dashboard)/super-admin/system/page.tsx`
- `app/(dashboard)/super-admin/archive/page.tsx`
- Multiple repository functions across features

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
