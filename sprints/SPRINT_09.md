# SPRINT_09 — Document Upload and Approval Workflow
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Complete 15-step document pipeline: Admin uploads → OCR if needed → staging →
diff → Super Admin approves → ecosystem update triggered.

---

## Scope — IN

Full 15-step pipeline from CONSTITUTION.md O-3:

1. Admin upload interface (PDF, DOCX, XLSX — max 10MB)
2. File validation (MIME, extension, size)
3. Store as staging in Supabase Storage bucket `staging-documents`
4. Text extraction
5. OCR via OCR.Space if extracted text < 100 chars
6. Markdown conversion
7. SHA-256 hash computation
8. Diff against current active document hash
9. Human-readable diff summary
10. Staging RAG chunks + embeddings (not yet active)
11. Super Admin notification (in-app + email)
12. Super Admin review: diff view, approve or reject
13. On approval: new doc → active, old doc → archived
14. Move old to `archived-documents` storage bucket
15. Trigger Living Ecosystem update (Sprint 18 implements full pipeline;
    this sprint triggers it as a stub that logs "update triggered")

## Scope — OUT

- Full Living Ecosystem auto-update (Sprint 18)
- Full chatbot knowledge refresh (Sprint 16 + 18)

---

## Acceptance Criteria

- [ ] Admin can upload PDF/DOCX/XLSX only (other types rejected with Bosnian error)
- [ ] Files over 10MB rejected with Bosnian error
- [ ] Upload UI shows real-time status:
      Uploading → Validating → Extracting → OCR (if needed) → Converting → Ready
- [ ] OCR triggered automatically when extracted text < 100 chars
- [ ] OCR processes Bosnian + German + English simultaneously
- [ ] Large PDFs (>1MB) split before OCR.Space submission
- [ ] Diff summary visible to Super Admin before approval decision
- [ ] Super Admin approval makes new doc active, old doc archived immediately
- [ ] Archived doc never appears in any user-facing query
- [ ] Rejection sends email to Admin with reason
- [ ] All 15 steps logged to `audit_log`
- [ ] `npx tsc --noEmit` passes

---

## OCR.Space Integration

```
Endpoint: https://api.ocr.space/parse/image
API Key:  OCR_SPACE_API_KEY from env
Languages: bos, deu, eng (run all three)
File limit: 1MB — split PDFs exceeding this
Response:  ParsedText field from JSON response
```

---

## Files Expected to Change

- `features/documents/upload-pipeline.ts`
- `features/documents/ocr-pipeline.ts`
- `features/documents/repository.ts`
- `features/documents/actions.ts`
- `app/api/documents/upload/route.ts`
- `app/api/documents/[id]/approve/route.ts`
- `app/api/documents/[id]/reject/route.ts`
- `app/(dashboard)/admin/documents/page.tsx`
- `app/(dashboard)/super-admin/documents/page.tsx`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
