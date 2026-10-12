# M03 — Architecture, Data Model, and API Contract

## Objective
Define a secure, maintainable implementation within the explicitly required lightweight stack.

## Required architecture
- `index.html`: one standalone frontend file with embedded CSS/JS.
- Google Apps Script: validation, authentication/authorization checks, data access, state transitions, and audit events.
- Google Sheets: private storage for application data; never make a spreadsheet publicly readable/writable as a workaround.
- Configuration documentation: explain where the Apps Script endpoint and non-secret settings are configured. No credentials or privileged secrets in the HTML.

## Required outputs
- `ARCHITECTURE.md`
- `DATA_MODEL.md`
- `API_CONTRACT.md`
- `ACCESS_CONTROL.md`
- `DECISION_LOG.md`

## Data contract requirements
For every entity/field, document:
- Purpose and source.
- Type, requiredness, allowed values, validation, and length limits.
- Identifier and relationship rules.
- Creation/update/submission timestamps and actor.
- Editability by lifecycle state.
- Retention/archive behaviour only when confirmed.
- Whether it contains personal or confidential information.

## Apps Script contract
For each operation document:
- Operation name and input schema.
- Authentication and authorization method.
- Server-side validation.
- Allowed state transition.
- Response schema and error codes.
- Idempotency/duplicate handling.
- Audit event written.
- Rate/abuse considerations and expected payload limits.

## Critical security gate
Apps Script deployment identity and access settings must be validated against the actual intended user accounts. The frontend must not decide a user's role from editable browser state. Hiding a button is not authorization. If secure role separation cannot be demonstrated in the selected deployment model, mark the architecture BLOCKED and present the smallest viable decision to the Director.

## Acceptance criteria
- No unresolved contradiction between report workflow, schema, and API.
- Every read/write operation has an access rule.
- No privileged credential appears in client code.
- Submitted-report edits and audit history have explicit rules.
- The architecture stays within the confirmed stack.
