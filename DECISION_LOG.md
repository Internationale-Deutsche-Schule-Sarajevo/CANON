# DECISION_LOG.md — Project-Specific Decisions
# IDSS Handbook Web Application
# Version 1.0 — June 2026

---

> Project-specific decisions only.
> Universal decisions (ORM, deployment, state management) are in:
> https://raw.githubusercontent.com/IDSS123a/commander/main/DECISION_LOG.md

---

## DL-P-001 — AI Generation Model: gemini-2.5-flash

**Date:** 2026-06-28
**Decision:** Use `gemini-2.5-flash` as the exact generation model string.
**Rationale:** This is the only Gemini model string confirmed to work with the
8-key free-tier rotation system. All other model strings (including `gemini-2.0-flash`
and variants) cause errors. This string is locked and must not be changed by any ACA.

---

## DL-P-002 — 8 Gemini Free-Tier Keys for Rate Limit Distribution

**Date:** 2026-06-28
**Decision:** Use 8 separate free-tier Gemini API keys in round-robin rotation.
**Rationale:** Each free key provides ~15 RPM. 8 keys = ~120 RPM effective throughput,
sufficient for institutional use with teachers using the system concurrently.
This avoids paid API tiers while maintaining reliable performance.

---

## DL-P-003 — Trophy.so vs Custom Gamification

**Date:** 2026-06-28
**Decision:** Implement gamification with Trophy.so (100 MAU free) as first option.
If Trophy.so limits are reached or integration is too complex, fall back to custom
Supabase implementation using `user_points` and `user_badges` tables.
**Rationale:** Trophy.so reduces implementation time. Custom is always available as fallback.

---

## DL-P-004 — OCR.Space 1MB Limit Mitigation

**Date:** 2026-06-28
**Decision:** For PDFs exceeding 1MB, implement a pre-processing step that splits
the PDF into chunks under 1MB before sending to OCR.Space.
**Rationale:** OCR.Space free tier has a 1MB per file limit. School PDFs (scanned
regulations, procedures) may exceed this. Splitting is simpler than switching providers.
**Upgrade path:** If splitting proves unreliable, migrate to Docling with Python infrastructure.

---

## DL-P-005 — No Magic Links or OAuth for Authentication

**Date:** 2026-06-28
**Decision:** Email + password authentication only. No OAuth, no magic links.
**Rationale:** This is a closed institutional system. All users must be manually approved
by the Director. Magic links and OAuth create automatic access paths that bypass the
manual approval workflow, which is institutionally unacceptable.

---

## DL-P-006 — Local Embedding Model: `Xenova/paraphrase-multilingual-mpnet-base-v2` (q8), Corpus Reused Not Re-Embedded

**Date:** 2026-08-05
**Decision:** Sprint 16 embedding-space unification uses transformers.js
running `Xenova/paraphrase-multilingual-mpnet-base-v2` at `dtype: "q8"`
(~278MB) for BOTH query embedding (`retriever.ts`) and on-approval document
embedding (`review-pipeline.ts`), via a single shared module
`lib/rag/local-embedder.ts`. The existing 5,720 embedded `document_chunks`
rows are reused as-is — no corpus re-embed.

**Rationale:** `document_chunks.embedding` (vector(768)) already held 5,720
rows from an untracked one-off bulk-import script with no model name
recorded anywhere in the repo or DB — CONSTITUTION.md P-6 and
`sprints/SPRINT_08.md` both document the *original plan* (`text-embedding-004`
on both sides), but that was never what actually populated the corpus, and
`gemini-provider.ts`'s `embed()` was later changed to `gemini-embedding-001`
(3072-dim) for the query side — a third, different value. Per C-8 (verify,
never assume), the model was identified empirically rather than guessed:
pulled a stored chunk's exact text + vector from the live DB, re-embedded
that same text locally with four 768-dim candidates
(`all-mpnet-base-v2`, `paraphrase-multilingual-mpnet-base-v2`,
`multilingual-e5-base`, `LaBSE`), and compared cosine similarity against the
stored vector. `paraphrase-multilingual-mpnet-base-v2` @ fp32 returned
0.9999999999996 (bit-identical) on a short chunk and 0.96+ on a longer one
(the drop is tokenizer-truncation-length noise on long input, not a
different model — every other candidate scored under 0.17 on the same
text). This is the source model with high confidence.
**dtype q8, not fp32:** verified cosine 0.99+ vs the fp32 stored vectors on
identical text — quantization noise, not a different semantic space (query
and stored vectors are always compared to each other, never to an fp32
reference, so retrieval ranking is unaffected). Chosen over the 1.1GB fp32
weights for cold-start download size and Vercel Functions' ephemeral `/tmp`
footprint.
**Consequence:** the 19 pre-existing NULL-embedding chunks and all future
newly-approved documents are backfilled/embedded through this same module.
No `forceRegenerate`, no delete+insert, no re-embed of the 5,720 already-good
rows (M-4).
**Known gap, not fixed in this sprint:** `features/documents/rag-pipeline.ts`
and its `/api/admin/rag` route still call the old Gemini `embedTexts()` and
do a delete+insert of a document's chunks — both wrong per this decision and
per A-8 (never delete+insert for a content fix). Not in Sprint 16's stated
scope (`retriever.ts` + `review-pipeline.ts` only); flagged here so it isn't
silently forgotten. Running that route today would reintroduce a
Gemini-vs-local space mismatch for whatever it touches.

---

*IDSS Handbook Decision Log v1.0 — P.U. IDSS Sarajevo*
