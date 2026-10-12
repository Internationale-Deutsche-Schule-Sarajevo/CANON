# M08 — Release, Setup, and Handoff

## Objective
Provide an auditable and reversible path from tested artifacts to authorized use.

## Required outputs
- `SETUP.md`
- `OPERATOR_GUIDE.md`
- `RELEASE_CHECKLIST.md`
- `HANDOFF.md`

## Required release steps
1. Verify M01–M07 completion and all open decisions.
2. Confirm the correct private spreadsheet and Apps Script project are selected; do not publish private data.
3. Document Apps Script deployment settings, allowed users, authorization flow, and endpoint configuration without publishing secrets.
4. Verify the Director and pedagogue access separately with approved test accounts.
5. Confirm initial spreadsheet structure and headers match the approved schema.
6. Create and verify a backup before migrating or replacing any data.
7. Deploy first to a test environment using synthetic data.
8. Run smoke tests after deployment and preserve evidence.
9. Obtain explicit Director approval before switching to real institutional data or making an irreversible change.
10. Document rollback and incident response steps.
11. Record exact deployed version, commit SHA, deployment identifier where safe, test results, known limitations, and next steps.

## Final report format
- Status: DONE / BLOCKED / PARTIALLY DONE.
- Files and repository links.
- Commit SHA(s).
- Tests run and exact outcomes.
- Security/privacy review result.
- Decisions still required.
- Deployment status (never infer it from a successful commit).
- Next recommended action.

## Non-negotiable
A commit is not a deployment. A successful build is not proof of secure access. A visual demonstration is not proof of correct data persistence. State each separately.
