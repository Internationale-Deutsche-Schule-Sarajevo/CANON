# Sequential Mandate Index — IDSS Pedagog Webapp

Execute mandates in order. Do not jump to implementation before the source audit, specification, and architecture/data contract are complete.

| Order | Mandate | Required output | Gate |
|---|---|---|---|
| M01 | Canonical source and repository audit | Source inventory, current-state report, open questions | Director-facing status identifies facts vs gaps |
| M02 | Requirements and acceptance criteria | PRD, user stories, explicit scope/non-scope, acceptance tests | No unresolved critical business rule hidden |
| M03 | Architecture and data contract | HTML/Apps Script/Sheets architecture, schema, API contract, access model | Security and data lifecycle reviewed |
| M04 | UX and interaction specification | Screen map, design tokens, states, responsive/accessibility rules | UX supports real workflows without fake data |
| M05 | Implementation | Standalone HTML and Apps Script source artifacts, configuration guide | Matches approved PRD and contract |
| M06 | Security, privacy, and integrity review | Threat model, permission matrix, validation and audit review | No known critical access-control flaw |
| M07 | Test and independent verification | Test matrix, results, evidence, defects | No critical/high unresolved defect |
| M08 | Release, setup, and handoff | Deployment checklist, one-time setup steps, operator guide, final status | No false claims; rollback/backup path documented |

## Rules for every mandate
- Read relevant project and Commander documents at the start.
- Inspect before modifying; keep scope bounded.
- Do not overwrite existing files without checking them first.
- If the current environment cannot execute code, clearly mark execution tests NOT RUN and provide reproducible steps.
- Do not use real student/staff data in fixtures.
- Commit only the intended project artifacts.
- At the end of each mandate, state: status, evidence, changed files, tests/results, unresolved decisions, and next mandate.

## Execution note
The current folder is an instruction package location inside CANON, not a new standalone GitHub repository. Do not run generic bootstrap steps that create a new repository or replace the existing repository history.
