# SPRINT_18 — Living Ecosystem Auto-Update
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

When Super Admin approves a document, the entire platform updates automatically.
Chatbot, Handbook, quizzes — all reflect new knowledge. No manual steps. No restart.

---

## Scope — IN

Full 10-step protocol from CONSTITUTION.md O-10:

Steps 1–5 (synchronous, in approval API route):
1. Old document → `archived`
2. New document → `active`
3. Old chunks → `archived`
4. Delete staging chunks
5. New chunks → `active`

Steps 6–7 (QStash background jobs):
6. Regenerate Handbook chapters for updated document
7. Regenerate quiz question pool for affected chapters

Steps 8–10 (synchronous):
8. Rebuild full-text search index
9. In-app notification to Super Admin
10. Audit log: full event record

---

## Acceptance Criteria

- [ ] Steps 1–5 complete before approval API route returns 200
- [ ] Chatbot immediately reflects new knowledge after Step 5
      (verify: question that previously returned LOW confidence now returns HIGH)
- [ ] Steps 6–7 run as QStash background jobs (do not block approval response)
- [ ] Step 9: Super Admin sees in-app notification:
      "Ekosistem ažuriran. Priručnik, chatbot i kvizovi su sinhronizovani."
- [ ] Step 10: audit_log entry contains: doc name, old hash, new hash, all steps, timestamp
- [ ] Partial failure: Super Admin notified of which step failed, manual retry available
- [ ] Old content never appears in any query after activation (verify with test queries)
- [ ] `npx tsc --noEmit` passes

---

## QStash Job Handlers

```
POST /api/jobs/regenerate-chapters   (triggered by QStash after approval)
POST /api/jobs/regenerate-quiz       (triggered by QStash after approval)
```

Both handlers: validate QStash signature, run pipeline, log outcome.

---

## Files Expected to Change

- `features/documents/ecosystem-update.ts`
- `app/api/documents/[id]/approve/route.ts` (update to trigger ecosystem)
- `app/api/jobs/regenerate-chapters/route.ts`
- `app/api/jobs/regenerate-quiz/route.ts`
- `features/documents/repository.ts`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
