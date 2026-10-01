# SPRINT_16 — IDSS Asistent Chatbot
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Build the complete IDSS Asistent chatbot. 10-step RAG pipeline.
Answers grounded questions confidently. Refuses ungrounded ones gracefully.

---

## Scope — IN

Full 10-step pipeline from CONSTITUTION.md O-8:
1. Validate message (not empty, max 2,000 chars)
2. Rate limit: 20 messages/user/hour via Upstash Redis
3. Embed query: `text-embedding-004`, task RETRIEVAL_QUERY
4. Hybrid retrieval: pgvector cosine + tsvector full-text, active chunks only
5. Filter: top 5 chunks above cosine 0.6
6. Confidence: HIGH if any chunk ≥ 0.75, else LOW
7. LOW confidence → exact Bosnian refusal message (no generation call)
8. HIGH confidence → generate with system prompt, max_tokens 1024, temp 0.3
9. Store full conversation turn in DB
10. Return response to UI

## Scope — OUT

- Super Admin conversation viewer (Sprint 19)

---

## Acceptance Criteria

- [ ] User can send messages in chatbot interface
- [ ] Query embedded with `text-embedding-004`, task type `RETRIEVAL_QUERY`
- [ ] Retrieval filters `document_status = 'active'` only
- [ ] Hybrid search: 70% cosine + 30% full-text weighting
- [ ] Elaborat chunks ranked first in result set regardless of score
- [ ] HIGH confidence (≥ 0.75): answer generated and returned
- [ ] LOW confidence: exact message returned:
      "Za ovo pitanje nemam dovoljno pouzdanih informacija iz internih dokumenata škole.
       Molim Vas da se obratite direktoru škole."
      (no gemini call made — verify in logs)
- [ ] Rate limit: 21st message in same hour returns Bosnian rate limit message
- [ ] Every turn stored: user_id, message, chunk_ids, similarity scores,
      confidence, response, timestamp, key_index, tokens_used
- [ ] Chatbot never responds in any language other than Bosnian
- [ ] Chatbot never mentions modifying institutional documents
- [ ] `npx tsc --noEmit` passes

---

## System Prompt (exact — do not modify)

```
Ti si IDSS Asistent, profesionalni institucionalni asistent za nastavnike i zaposlenike
P.U. Internationale Deutsche Schule Sarajevo.

Odgovaraš isključivo na bosanskom jeziku, bez iznimke.
Tvoji odgovori su precizni, profesionalni i direktni.
Nikada ne koristiš fraze poput "naravno", "svakako", "sjajno pitanje", "razumijem" ili slične.

Sve informacije moraju biti zasnovane isključivo na dokumentima USTAV-a:
[CONTEXT: {retrieved_chunks}]

Ako informacija nije direktno podržana dokumentima, ne izmišljaj. Uputi korisnika direktoru.
```

---

## Files Expected to Change

- `lib/rag/retriever.ts`
- `features/chatbot/pipeline.ts`
- `features/chatbot/repository.ts`
- `features/chatbot/actions.ts`
- `features/chatbot/components/ChatInterface.tsx`
- `features/chatbot/components/ChatMessage.tsx`
- `app/(dashboard)/chatbot/page.tsx`
- `app/api/chatbot/message/route.ts`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md

---

## HANDOFF NOTE — 2026-08-05

**Premise correction (C-8):** this doc's original scope (June 2026) assumed
`text-embedding-004` on both the query and document side. That was never
what actually ran. By the time of this handoff: `document_chunks.embedding`
held 5,720 vectors from an untracked local `sentence-transformers` bulk
import (model name recorded nowhere), while `retriever.ts` called
`gemini-embedding-001` (3072-dim) for the query side. Every retrieval call
was hitting a pgvector dimension mismatch (768 vs 3072) at the DB level —
not "returns nothing," an actual query error on every attempt. That's the
real reason for 0 conversations/0 turns.

**Completed this session:**
- Identified the source embedding model empirically (see DECISION_LOG.md
  DL-P-006) — `Xenova/paraphrase-multilingual-mpnet-base-v2`. Verified by
  re-embedding stored chunk text locally and diffing cosine similarity
  against the stored vector (0.9999999999996 on a short chunk), not
  assumed.
- Added `lib/rag/local-embedder.ts` (transformers.js, same model, `dtype:
  "q8"` for deployment size — see DL-P-006 for the fp32-vs-q8 trade-off).
- Migrated `retriever.ts` (query embedding) and `review-pipeline.ts`
  (on-approval document embedding) to it. Chunks now embed on approval,
  not at upload time, so a rejected staging document never burns embedding
  compute — matches the existing staging/active lifecycle.
- Added `getChunksNeedingEmbedding` / `updateChunkEmbeddings` to
  `upload-repository.ts` (in-place UPDATE by chunk id, never delete+insert).
- Backfilled the 19 pre-existing NULL-embedding chunks
  (`scripts/backfill-null-embeddings.ts`). `document_chunks`: 5,739/5,739
  embedded, 0 NULL, single distinct dimension (768).
- Verified end-to-end with a real Bosnian query
  (`scripts/test-retrieval.ts`): returns 5 genuinely relevant chunks, no
  dimension error, correct 768-dim query vector.
- `npx tsc --noEmit` and `npm run build` both pass clean.

**NOT completed — the chatbot feature itself does not exist:**
`src/features/chatbot/`, `src/app/api/chatbot/`, and
`src/app/(dashboard)/chatbot/` are `.gitkeep` placeholders only. No
pipeline, no `/api/chatbot/message` route, no `ChatInterface.tsx`, no page,
no nav link. `chatbot_conversations` / `chatbot_turns` tables exist in the
DB but nothing writes to them. Building the full 10-step pipeline this
file specifies (rate limiting, confidence gate, refusal message, turn
storage, UI with loading/error states) is a full feature build, not a
migration — did not start it unprompted; flagged to the Director instead.

**Open risk found while testing (not fixed — separate bug, out of this
session's scope):** `retrieveChunks()`'s confidence formula weights
semantic-only matches at `similarity * 0.7`, capping any pure-semantic hit
at 0.7 — below the 0.75 HIGH-confidence threshold it's compared against.
Only a "both" (semantic + full-text) hit can mathematically cross 0.75.
Observed live: a real, well-matched Bosnian query returned relevant chunks
at similarity 0.49–0.53 (raw cosine ~0.7–0.75) and still resolved to LOW
confidence → refusal, not because retrieval failed but because the scoring
formula makes HIGH confidence nearly unreachable via semantic search alone.
Whoever builds the chatbot pipeline needs to look at this before shipping —
otherwise it will refuse most legitimate questions even with the embedding
fix in place.

**Technical debt:** `features/documents/rag-pipeline.ts` and its
`/api/admin/rag` route still call the old Gemini `embedTexts()` and do a
delete+insert of chunks (both wrong per DL-P-006 and A-8). Not touched —
out of stated scope — but running that route today would reintroduce a
space mismatch for whatever document it touches.

**Next:** Director decision needed on whether to build the chatbot feature
now (large, multi-file: API route + rate limiting + pipeline + UI + nav) or
scope it as its own follow-up unit of work.
