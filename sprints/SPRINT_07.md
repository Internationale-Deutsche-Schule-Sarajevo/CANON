# SPRINT_07 — USTAV Import Pipeline
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Import all 382 USTAV documents from INDEX.md into the database.
This is the foundation of the entire knowledge system.
If this is incomplete or incorrect, every feature built on top of it will fail.

---

## Scope — IN

- Parse all 382 links from `repo/INDEX.md`
- Verify every file exists on disk
- Confirm count = exactly 382 (abort entire import if not)
- Read content of each file
- Compute SHA-256 hash of each file
- Store complete manifest in `documents` table
- Store integrity report in `system_integrity` table
- Super Admin dashboard widget showing import status

## Scope — OUT

- Chunking and embedding (Sprint 08)
- Chapter generation (Sprint 10)
- Quiz generation (Sprint 12)

---

## Acceptance Criteria

- [ ] Import triggered by Super Admin action (button in dashboard)
- [ ] Import aborts immediately if any file from INDEX.md is missing
      (lists all missing files, does not partial-import)
- [ ] Import confirms count = 382 before proceeding
- [ ] All 382 documents stored in `documents` table with status=`active`
- [ ] SHA-256 hash stored per document
- [ ] `system_integrity` record created: total=382, succeeded=382, failed=0
- [ ] Super Admin sees real-time progress during import
- [ ] Import is idempotent: running twice does not create duplicates
      (check existing hash before inserting)
- [ ] `npx tsc --noEmit` passes

---

## Import Abort Conditions

Any of these must abort the ENTIRE import before touching the database:

1. Any file listed in INDEX.md does not exist on disk
2. Total file count ≠ 382
3. INDEX.md cannot be parsed

On abort: store failure record in `system_integrity`, notify Super Admin.

---

## Files Expected to Change

- `features/documents/import-pipeline.ts`
- `features/documents/repository.ts`
- `app/api/admin/import/route.ts`
- `app/(dashboard)/super-admin/system/page.tsx`
- `migrations/006_import_tracking.sql` (if not already in Sprint 05)

---

## USTAV Path

```
Local: C:\DAVOR_PRIVATE\AI\Prirucnik_Za_Nastavnike\web-app-IDSS-handbook\repo
INDEX.md: repo\INDEX.md
Documents: repo\[path-from-index]
```

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
