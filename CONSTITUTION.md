# CONSTITUTION.md — Project-Specific Rules
# IDSS Handbook Web Application
# Version 8.0 — June 2026

---

> **FOR ANY AI CODING ASSISTANT:**
>
> This document extends the Commander Constitution with IDSS Handbook-specific rules.
> You must read Commander CONSTITUTION.md FIRST, then this document.
> When rules conflict, this document wins for this project.
> When anything is unclear: STOP and ask. Never assume.
>
> Commander Constitution:
> https://raw.githubusercontent.com/IDSS123a/commander/main/CONSTITUTION.md

---

## P-1. Project Identity

**Application name:** IDSS Handbook
**Institution:** P.U. Internationale Deutsche Schule Sarajevo
**Nature:** Closed institutional SaaS — not public, not a prototype
**Primary language:** Bosnian (Bosnian Latin script) for all user-facing content
**Terminal commands:** Windows CMD syntax only — never PowerShell, never bash

---

## P-2. Local Paths — Use Exactly As Written

| Path | Value |
|---|---|
| App root | `C:\DAVOR_PRIVATE\AI\Prirucnik_Za_Nastavnike\web-app-IDSS-handbook` |
| USTAV repo | `C:\DAVOR_PRIVATE\AI\Prirucnik_Za_Nastavnike\web-app-IDSS-handbook\repo` |
| Environment file | `C:\DAVOR_PRIVATE\AI\Prirucnik_Za_Nastavnike\web-app-IDSS-handbook\.env` |
| IDSS Memorandum | `repo\public\IDSS_Memorandum.docx` |
| IDSS Logo (static) | `repo\public\IDSS_Logo_RGB_Primarna_verzija.png` |
| 3D Logo source | `repo\public\index-mali-logo.html` |

---

## P-3. USTAV — The Only Source of Truth

The `repo` folder is the USTAV. It is the only permitted source of institutional knowledge.

**Validated state:**
- 382 Markdown documents
- 382 valid links in INDEX.md
- 0 missing files

**Absolute rule:** All Handbook content, chatbot answers, quiz questions, summaries,
and DOCX exports must be grounded exclusively in USTAV documents.
No AI training data. No general knowledge. No assumptions. USTAV only.

The **Elaborat** document has the highest retrieval priority.
If Elaborat and another document conflict: Elaborat wins.

---

## P-4. User Roles

Three roles. Enforced as PostgreSQL enum. Checked at API level first, UI level second.

```sql
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'user');
```

| Role | Who | Key Restriction |
|---|---|---|
| super_admin | Director — direktor@idss.ba only | Unrestricted |
| admin | Pedagog, Sekretar | Cannot activate documents without super_admin approval |
| user | Teachers and employees | Cannot see other users' data |

**No document may be activated without explicit Super Admin approval.**
This check must be hard-coded in the API route. Not just in the UI.

---

## P-5. Registration Rules

- No automatic approval — ever
- Default: email must end with `@idss.ba`
- Exception: Super Admin may approve any email manually
- Every registration requires explicit Super Admin action in the dashboard

---

## P-6. AI Provider — Exact Configuration

**See:** `TECH_STACK.md` for complete AI specification.

Generation model: `gemini-2.5-flash` (exact string — no other model permitted)
Embedding model: `text-embedding-004` (exact string — dimension 768)
Key rotation: 8 keys in round-robin via `GeminiKeyManager`

All AI calls go through `lib/ai/ai-provider.interface.ts`. Never directly to Gemini SDK.

---

## P-7. Chatbot Rules — IDSS Asistent

Name: **IDSS Asistent**
Language: Bosnian only — even if user writes in another language
Confidence threshold: 0.75 cosine similarity

If confidence HIGH (≥ 0.75): answer from USTAV
If confidence LOW (< 0.75): return exact Bosnian refusal:
> *"Za ovo pitanje nemam dovoljno pouzdanih informacija iz internih dokumenata škole.
> Molim Vas da se obratite direktoru škole."*

Chatbot must never modify, suggest modifying, or hint at modifying official documents.
All conversations stored permanently. Super Admin can view all.

---

## P-8. Document Status Model

Every document has exactly one of these statuses at all times:

```
staging   → uploaded by Admin, not yet approved
active    → approved by Super Admin, visible in app
archived  → replaced by newer version, never shown to users
```

**Every database query that retrieves content must include:**
`WHERE document_status = 'active'` or equivalent.

Archived content must never appear in: Handbook, chatbot, search, quiz, or any user-facing surface.

---

## P-9. Living Ecosystem Rule

When Super Admin approves a document, the system automatically:
1. Archives old document and its chunks
2. Activates new document and its chunks
3. Regenerates Handbook chapters (background job)
4. Regenerates quiz questions (background job)
5. Updates search index
6. Notifies Super Admin of completion

This pipeline is defined in full in the system instructions.
Chatbot reflects new knowledge immediately after Step 2 (no restart needed).

---

## P-10. Content Language and Tone Rules

All user-facing content in Bosnian (Bosnian Latin script):
- Professional, warm, precise, disciplined tone
- No Croatian or Serbian regional variants where avoidable
- No raw Markdown visible to users
- No raw HTML visible to users
- No AI-detectable filler phrases ("naravno", "svakako", "sjajno pitanje")
- No em-dash (—) — use comma or full stop instead
- Minimum 3,000 rendered characters per Handbook chapter

---

## P-11. Build Order

Build phases in this exact order. Complete and verify each before starting the next.
Full phase details with exit criteria: see `FEATURE_BACKLOG.md`.

```
Phase 1:  Project scaffold
Phase 2:  Environment validation
Phase 3:  Design token system
Phase 4:  AI Provider layer (GeminiKeyManager)
Phase 5:  Supabase schema + migrations
Phase 6:  Authentication system
Phase 7:  USTAV import pipeline
Phase 8:  RAG pipeline (chunk + embed)
Phase 9:  Document lifecycle (active/staging/archived)
Phase 10: Handbook chapter generation
Phase 11: Handbook reader + locked progression
Phase 12: Quiz engine
Phase 13: Gamification system
Phase 14: IDSSLogo3D component
Phase 15: Logo animation system
Phase 16: IDSS Asistent chatbot
Phase 17: Document upload workflow
Phase 18: Living Ecosystem auto-update
Phase 19: Super Admin dashboards
Phase 20: DOCX export
Phase 21: Final QA
```

---

*IDSS Handbook Constitution v8.0 — P.U. IDSS Sarajevo — direktor@idss.ba*
