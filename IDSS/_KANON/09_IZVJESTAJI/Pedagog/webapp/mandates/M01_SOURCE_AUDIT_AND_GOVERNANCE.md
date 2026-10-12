# M01 — Canonical Source and Repository Audit

## Objective
Establish the factual baseline before designing or changing the app.

## Required actions
1. Inspect the target directory and nearby `IDSS/_KANON/09_IZVJESTAJI/` sources.
2. Search CANON for pedagogical report templates, annual/monthly plans, institutional terminology, existing spreadsheet structures, relevant data rules, and approved procedures.
3. Read the current `proba.txt` without modifying it.
4. Read the relevant Commander v1.6.2 rules and project instructions.
5. Identify current source files, formats, versions, dates, owners where documented, and their authority level.
6. Separate verified facts, user-provided requirements, design proposals, and open decisions.
7. Identify whether an existing app or source-of-truth spreadsheet exists elsewhere in the authorized CANON tree. Do not assume none exists merely because this folder is sparse.
8. Produce `AUDIT_REPORT.md` with source inventory, findings, conflicts, missing information, and next actions.

## Guardrails
- Do not invent report fields, indicator formulas, risk thresholds, reporting dates, approval roles, or retention periods.
- Do not edit source documents during the audit.
- If a URL or repository source fails, retry once, record the exact failure, and continue with other sources.
- Do not implement the application in this mandate.

## Acceptance criteria
- Every material requirement has a source or is explicitly marked as user-provided.
- Existing assets and potential dependencies are accounted for.
- Critical blockers are surfaced before architecture decisions.
- `AUDIT_REPORT.md` contains actionable findings, not just a list of filenames.
