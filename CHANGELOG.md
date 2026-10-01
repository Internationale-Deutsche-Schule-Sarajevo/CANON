# CHANGELOG.md
# IDSS Handbook Web Application

---

> Format: `[DATE] [PHASE/SPRINT] Description`
> Add one line per completed feature or fix.
> Never delete entries. Mark superseded entries with [SUPERSEDED].

---

## 2026-06

| Date | Sprint | What Was Done |
|---|---|---|
| 2026-06-28 | SETUP | Repository created. Commander and project Constitution established. |
| 2026-06-28 | SETUP | System Instructions v8.0 (AI Architecture Constitution) finalised. |
| 2026-06-28 | SETUP | Technology stack finalised. Key decisions recorded in DECISION_LOG.md. |
| 2026-06-28 | SETUP | Feature Backlog created. 21 build phases defined. |

---

## 2026-08

| Date | Sprint | What Was Done |
|---|---|---|
| 2026-08-05 | SPRINT 16 | Content integrity: fixed a genuine pre-fix truncation (Venture Minds Strategy chapter, regenerated in place, quiz reconciled) and triaged the 7 director-flagged low-ratio chapters against source — all faithful summaries, not truncations. Pedagoški standardi remains deferred/partial per Director direction (694KB source exceeds the 65,536-token generation ceiling). |
| 2026-08-05 | SPRINT 16 | Embedding-space unification: identified (empirically, not assumed — see DECISION_LOG.md DL-P-006) that the existing 5,720 `document_chunks.embedding` vectors were produced by `Xenova/paraphrase-multilingual-mpnet-base-v2`, not the Gemini model the query side (`retriever.ts`) was calling — a dimension mismatch (768 vs 3072) that made every retrieval query error at the DB level, explaining 0 chatbot conversations/turns. Added `lib/rag/local-embedder.ts` (transformers.js, same model, q8) and migrated `retriever.ts` (query) and `review-pipeline.ts` (on-approval document embedding) to it. Backfilled the 19 pre-existing NULL-embedding chunks. Verified end-to-end: a real Bosnian query now returns correct 768-dim results with relevant chunks, no error. |
| 2026-08-05 | SPRINT 16 | **Gap found, not closed:** the chatbot feature itself (`features/chatbot/`, `app/api/chatbot/`, `app/(dashboard)/chatbot/`) is still unbuilt — `.gitkeep` placeholders only, no pipeline/route/UI/nav link. The embedding-space fix above is a precondition for it, not a substitute. See HANDOFF note. |

---

*Sprints begin with SPRINT_01. Update this file after each completed phase.*
