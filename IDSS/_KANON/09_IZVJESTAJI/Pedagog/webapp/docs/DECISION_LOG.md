# Decision log and open decisions

## Decisions taken in this build
| ID | Decision | Basis |
|----|----------|-------|
| D-01 | Backend is Supabase (Auth + PostgREST RPC), not Google Sheets + Apps Script. | User approval (permission asked per CANON). |
| D-02 | 3D scene and points kept within CANON limits: no external libs, reduced-motion/no-WebGL fallback, readable numbers beside every visual, no invented values, label "IDSS bodovi" (never "XP"). | User approval. |
| D-03 | All logic in SECURITY DEFINER RPCs; RLS enabled with no policies; no table privileges for `anon`/`authenticated`. | CANON server-side authorization. |
| D-04 | Submitted snapshots, audit trail are immutable (triggers); approved report is locked. Audit trail holds no report content. | CANON. |
| D-05 | Optimistic locking (`revizija`) + idempotency key on save/submit/return/approve. | Prevents silent overwrite. |
| D-06 | Risks: identity once (`RSK-<year>-nnn`) + per-period state; unresolved risks carry over. KPI 3A/3B/3C. | Audit findings on risk model. |
| D-07 | Deadlines Europe/Sarajevo; due date = 5th of next month, moved to next working day; return deadline = 3 working days. | Existing instructions (DEC-05). |
| D-09 | QMS in report is limited to QP 05 (Obuka) and QP 09 (Kreativni čas) per user. Per workshop: `qp05_zapis` Da/Ne; creative classes: planned / held / visited-and-recorded (QP 09.PC-02) + explanation. Score T4 (20) + T5 (20) + T6 eDnevnik (10) = 50. | User instruction 2026-10-15; scoring split is a proposal. |
| D-10 | UI: edge-to-edge layout, no animation toggle (animations always on; OS `prefers-reduced-motion` still honoured). | User instruction; accessibility constraint kept. |
| D-08 | Score: max 1000 = 900 system (B 250, S 250, T 200, E 200) + 100 director rating (0–5 × 20). | Proposal; see open decisions. |

## OPEN DECISIONS (need school management)
1. Scoring weights and thresholds (all numbers in "Kako se boduje") — proposal only.
2. Neutral points when nothing applies (T1 no planned visits = 30; E4 no workshops = 20; risk items full points with no risks). A draft therefore shows a non-zero score before any input.
3. Public holidays / school breaks list (`neradni_dani` is empty by default).
4. Rank thresholds (Pripravnik … Velemajstor) and badge set.
5. Data retention (former DEC-04) and who may export archives.
6. QMS procedure names (QP_01…QP_07 codes kept; official titles not invented).
7. Whether the director may reject a recommendation without comment (currently comment required for "Odbijeno"/"Potrebna dorada").
8. Carried-risk edge case: returning an earlier month after a later draft exists is blocked by the server (KASNIJI_PERIOD / PRENESENI_RIZIK_NEDOSTAJE); policy for resolving it is undecided.

9. Discrepancies in the supplied QP documents (not resolved by me): QP 05 text names the plan form `QP 05.PL-01` while its table says `QP 05.PO-01`; QP 09 table lists the visit form with code `QP 09.PO-01` (same as the plan) while the body says `QP 09.PC-02` (app uses PC-02); QP 09 sections 2–4 still describe training, not creative classes; QP 09 lists `QP 05.*` forms as its own records. Management should correct the documents.
10. QP 09 says creative classes are held by teachers and only visited by the pedagogue; whether the pedagogue also holds any is not defined. The app records held and visited counts.
11. Real contact data (pedagogue name, e-mail, phone) is kept only in `lokalno/POSTAVI_PROFILE.sql`, outside the CANON-controlled repo content; the app stores it in `profili`.

## Not done / not verified (truthful status)
- NOT DEPLOYED: nothing was run against the user's Supabase project (no anon key or credentials were available). SQL verified only on local PostgreSQL 16 with an auth stub.
- NOT RUN: Supabase Auth REST layer (`api.js` Supabase mode) against a real project; real-browser GPU rendering (only software WebGL in headless Chromium).
- NOT RUN: automated WCAG audit; contrast and keyboard checked by hand only partially.
- CANON repository was read-only: proposed changes are in `CANON_PRIJEDLOG_IZMJENA.md`, not committed.

## Visual identity (2026-10-16)
- D-11 Palette: official IDSS colours #000000, #08ABE6, #E8262C, #035EA1, #FFCB29, plus white and neutral black tints for backgrounds/text. Contrast: black on #08ABE6/#FFCB29 and white on #035EA1 pass WCAG AA; #E8262C is used for accents, pills with white bold text and borders, never for small body text.
- D-12 Typography: modern sans-serif system stack (Segoe UI Variable / SF Pro / Roboto / Helvetica Neue) for all text; no web fonts (CANON forbids external fonts and none is bundled). A bundled licensed font would require management approval.
