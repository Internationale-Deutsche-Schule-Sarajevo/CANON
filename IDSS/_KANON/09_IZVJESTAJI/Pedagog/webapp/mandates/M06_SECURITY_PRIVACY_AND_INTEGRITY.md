# M06 — Security, Privacy, and Data Integrity Review

## Objective
Independently assess confidentiality, authorization, integrity, and safe operation before release.

## Required outputs
- `SECURITY_REVIEW.md`
- Permission matrix.
- Threat/risk register with severity, evidence, mitigation, and residual risk.

## Required checks
- Verify Apps Script deployment mode and identity semantics.
- Verify server-side role authorization for every read, write, export, archive, and history operation.
- Confirm no public spreadsheet sharing is required.
- Search client files for credentials, tokens, secrets, private identifiers, and privileged endpoints.
- Verify input validation, output encoding, safe DOM updates, formula-injection protection, payload limits, and error sanitization.
- Test unauthorized access, altered role values, direct API invocation, replay/duplicate submissions, stale writes, and malformed inputs.
- Verify audit events include only necessary metadata and cannot be silently rewritten by ordinary users.
- Confirm backups and recovery approach before any destructive operation.
- Verify that synthetic test data is not confused with real records.
- Review whether the data being stored requires additional institutional/legal approval. Do not claim legal compliance merely because controls exist.

## Release blockers
Any demonstrated unauthorized access to confidential reports, client-side-only role checks, exposed credentials, public spreadsheet access, silent overwriting of submitted reports, or loss of audit history blocks release.

## Acceptance criteria
Every required check is PASS, FAIL, or NOT RUN with evidence. No critical/high failure may be hidden or described as passed.
