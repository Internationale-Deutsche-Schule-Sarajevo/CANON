# M07 — Testing and Independent Verification

## Objective
Verify the built system independently of the implementation process and report only evidence-backed results.

## Required outputs
- `TEST_PLAN.md`
- `TEST_RESULTS.md`
- Defect list with severity, reproduction steps, expected/actual result, and status.

## Test layers
1. Static review of HTML, JavaScript, and Apps Script.
2. Contract tests for all Apps Script operations.
3. Data lifecycle tests: create, save, reload, edit, submit, history, archive.
4. Authorization tests for each role and unauthorized actor.
5. Validation and adversarial input tests.
6. Duplicate-submit, stale-write, timeout, retry, and partial-failure tests.
7. Spreadsheet formula-injection and output-encoding tests.
8. Keyboard-only and reduced-motion checks.
9. Responsive checks at representative mobile, tablet, and desktop sizes.
10. Browser console and network/error-state review.
11. Backup/restore or documented recovery rehearsal before production use.

## Reporting rules
- `PASS`: executed and passed, with evidence.
- `FAIL`: executed and failed, with evidence.
- `NOT RUN`: not executed in the available environment.
- `BLOCKED`: cannot run because a dependency, decision, or permission is missing.
- Never present a code inspection as an executed runtime test.
- Never claim security, privacy, accessibility, browser compatibility, or deployment success without recorded verification.

## Definition of done
All critical user journeys pass; no unresolved critical/high defects; every role and state has been tested; source-to-report indicators are traceable; no test uses real confidential records; and all limitations are disclosed.
