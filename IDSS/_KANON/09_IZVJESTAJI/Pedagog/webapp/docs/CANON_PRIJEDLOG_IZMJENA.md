# Proposed changes to CANON instructions (IDSS/_KANON/09_IZVJESTAJI/Pedagog/webapp)

Approved in principle by the user; not applied (repository not writable here).

1. **Architecture files (00_START_HERE, 01, 02, README):** replace "Google Sheets + Apps Script" with "Supabase (Auth + PostgreSQL RPC) + single-file HTML". Keep all security/audit rules; map "Apps Script server validation" to `idss_*` RPCs.
2. **Supersede DEC-03 (storage):** storage is PostgreSQL tables with RLS; no direct table access.
3. **Add scoring section:** IDSS bodovi model (D-08) marked as proposal; list OPEN DECISIONS 1–4.
4. **Add data-model section:** risk identity vs. per-period state; Dec→Jan ordering via `period_broj`; snapshots; revision/idempotency fields.
5. **Add test section:** SQL assertions, JS↔SQL parity, browser flow, report DONE/BLOCKED/NOT RUN.
6. **Add 3D/accessibility constraints:** no external libs, reduced motion, no-WebGL fallback, numbers always readable as text.
