# Test report (16 Oct 2026)

## DONE (run locally, PostgreSQL 16 + auth stub, Chromium/Playwright)
- SQL flow + risks: 127 PASS (tests/10_tok.sql, 20_rizici.sql).
- Adversarial SQL suite: 103 PASS (tests/40_napad.sql): role access, malformed/giant/deep payloads, SQLi/HTML stored literally, state machine, immutability, calendar edges, audit throttle.
- Parallel races on real DB: 13 PASS (tests/45_paralelno.py): exactly one winner for save/submit/approve-vs-return, no duplicates.
- JS<->SQL parity: 503 cases, 0 differences (tests/30_paritet.mjs).
- Syntax: node --check all src files; SQL loads twice (idempotent).
- Browser e2e: full flow, responsive 320-2560 px with no horizontal overflow, reduced-motion/keyboard, XSS payload inert, malicious hash routes redirected, no CSP violations.
- Hardening added: SHA-256 script CSP, frame-busting, route parameter validation, payload size guard (PREVELIK_UNOS), overflow-safe ci(), audit-trail throttle.

## NOT RUN / BLOCKED
- Real Supabase project never reached (sandbox proxy blocks supabase.co): Auth/REST layer of api.js untested against it.
- WebGL tested with software renderer only; no automated WCAG audit; no real-device test.
- Residual: style-src 'unsafe-inline' (inline style attributes); anon key is public by design; CSP/frame-busting via meta/JS only (no HTTP headers on static hosting).
