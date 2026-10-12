# M05 — Implementation

## Preconditions
M01–M04 are accepted. If a critical decision remains unresolved, implement only non-risky scaffolding and clearly mark blocked functionality; do not fake a secure or complete workflow.

## Required deliverables
- A single self-contained `index.html` with embedded CSS and JavaScript.
- Google Apps Script source as a separate text artifact suitable for deployment in Apps Script.
- `SETUP.md` explaining configuration, deployment, permissions, spreadsheet tabs/schema, backup, and rollback.
- Synthetic test fixtures clearly separated from production data.

## Implementation rules
1. Preserve existing project assets and inspect before replacing.
2. Implement the approved contract, not an improvised one.
3. Keep all sensitive authorization decisions in Apps Script.
4. Validate input both in the browser for usability and on the server for security.
5. Use safe DOM rendering; do not inject untrusted report text with unsafe HTML.
6. Protect against formula injection in spreadsheet-bound text.
7. Use stable IDs; do not use row number as a permanent record identity.
8. Use explicit timestamps and documented timezone handling.
9. Handle retries and duplicate submits without duplicating records.
10. Prevent stale edits from silently overwriting newer changes.
11. Make report save/submission outcomes explicit.
12. Keep audit events separate from report content and avoid logging sensitive content.
13. Include robust loading, empty, error, timeout, and permission states.
14. Keep code understandable and commented where a future ACA needs context.
15. Do not introduce external frontend dependencies.

## Acceptance criteria
- Every implemented behaviour maps to an approved acceptance criterion.
- HTML and Apps Script contract match.
- No secrets or real personal records are embedded.
- No decorative control falsely claims an action occurred.
