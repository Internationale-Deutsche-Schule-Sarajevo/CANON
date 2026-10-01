# SPRINT_04 — AI Provider Layer
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Build the complete AI abstraction layer. All future AI calls go through this interface.
The GeminiKeyManager rotation system must work flawlessly before any feature uses AI.

---

## Scope — IN

- `lib/ai/ai-provider.interface.ts` — AIProvider interface
- `lib/ai/providers/gemini-key-manager.ts` — 8-key rotation
- `lib/ai/providers/gemini-provider.ts` — Gemini implementation of AIProvider
- `lib/ai/ai-provider.factory.ts` — factory returns correct provider from env
- Startup validation: all 8 keys present, throw FATAL if any missing
- Test endpoint: `POST /api/test/ai` (Super Admin only, returns generation result)

## Scope — OUT

- No RAG pipeline (Sprint 08)
- No chatbot (Sprint 16)
- No chapter generation (Sprint 10)

---

## Acceptance Criteria

- [ ] GeminiKeyManager loads all 8 keys on startup
- [ ] Round-robin rotation cycles correctly through keys 1→8→1
- [ ] HTTP 429 on key N: marks throttled, immediately uses key N+1
- [ ] 65 seconds after throttle: key auto-clears and re-enters rotation
- [ ] All 8 keys throttled: request queues, retries when first key clears
- [ ] Max queue wait 120s: returns Bosnian error message to caller
- [ ] HTTP 400/401/403/500: throws immediately, does NOT rotate
- [ ] Every API call logs: timestamp, key index, status, call type
- [ ] Test endpoint works for Super Admin, returns 403 for other roles
- [ ] `npx tsc --noEmit` passes

---

## Key Rotation Rules (from CONSTITUTION.md A-6)

- Generation model: `gemini-2.5-flash` (exact string, no alternatives)
- Embedding model: `text-embedding-004` (exact string, dimension 768)
- Same key pool for both generation and embedding
- Temperature: 0.3 for factual, 0.7 for creative
- max_tokens: 512 / 2048 / 8192 — calculate per call type

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
