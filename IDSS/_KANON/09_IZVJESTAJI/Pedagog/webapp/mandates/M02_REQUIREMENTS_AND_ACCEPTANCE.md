# M02 — Requirements and Acceptance Criteria

## Objective
Convert verified sources and known requirements into an unambiguous product specification.

## Required outputs
- `PRD.md`
- `specs/REPORTING_WORKFLOW/SPEC.md`
- A prioritized acceptance-test checklist.

## Required specification sections
1. Purpose and intended users.
2. User stories for pedagogue and Director.
3. Monthly report lifecycle, with each state grounded in a source or explicitly marked as an open decision.
4. Report sections and field-level definitions linked to canonical sources.
5. Required/optional fields, validation, date rules, and empty-state behaviour.
6. Summary and indicator definitions, including numerator, denominator, period, source, exclusions, and treatment of missing data where applicable.
7. Risk and overdue-action definitions; do not set thresholds without evidence or approval.
8. Archive, history, amendment, and correction requirements.
9. Permissions and visibility.
10. Error, conflict, offline, duplicate-submit, and recovery behaviour.
11. Accessibility, responsiveness, and performance acceptance criteria.
12. Explicit non-goals and exclusions.
13. Open decisions with owner and the exact consequence of each decision.

## Required acceptance-test principles
- Test each role separately.
- Test draft save/reload and recovery.
- Test report submission and duplicate submissions.
- Test unauthorized read/write attempts.
- Test archive and history traceability.
- Test empty, incomplete, stale, and inconsistent data.
- Test that dashboards never turn missing data into zero or imply unsupported comparisons.
- Test keyboard access, reduced motion, and responsive layouts.

## Gate
Do not begin production implementation until the PRD and the critical workflow/data/access decisions are grounded in sources or explicitly approved.
