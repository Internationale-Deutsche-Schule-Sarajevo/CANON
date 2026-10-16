# Audit findings → fixes (summary)
Source: `IDSS_Pedagog_AUDIT_IZVJESTAJ.md` (35 findings). Resolution by area:

| Area | Original problem | Resolution |
|------|------------------|------------|
| Authorization | Role/identity trusted from client | Role read only from `profili`; every RPC checks it; RLS on, no table grants |
| Data integrity | Submitted reports overwritable, no versions | Immutable snapshots, locked approval, revision + idempotency |
| Deadlines | Server/client time mix, no holidays | Europe/Sarajevo server time, `neradni_dani`, working-day arithmetic |
| Risks | Duplicated/rewritten history, wrong KPI | Identity + per-period state, carry-over, KPI 3A/3B/3C |
| Scoring | Client-computed, inconsistent | Server-authoritative, JS mirror, parity test (503 cases) |
| Validation | Weak/different client vs server | One rule set in SQL + identical JS; Bosnian messages |
| Privacy | Report content in logs | Audit trail stores only summaries |
| Language | Mixed/non-Bosnian text | All UI text Bosnian (Latin, ijekavian) |
