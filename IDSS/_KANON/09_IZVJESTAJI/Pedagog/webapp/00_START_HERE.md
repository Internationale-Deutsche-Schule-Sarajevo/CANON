# START HERE — IDSS Pedagog Webapp

## Mission
Continue the existing institutional work by first auditing the canonical repository and project context, then execute the mandates in `03_MANDATE_INDEX.md` sequentially. The task is not to bootstrap a generic new application or to create a new GitHub repository. The project lives in the existing CANON repository at:

`IDSS/_KANON/09_IZVJESTAJI/Pedagog/webapp/`

## Required first actions
1. Read this directory's instruction files and the existing `proba.txt`; do not overwrite or delete it.
2. Inspect relevant nearby CANON sources for reporting templates, pedagogical procedures, school terminology, data classifications, and institutional constraints.
3. Read Commander v1.6.2 governance documents relevant to the current phase, especially Constitution, Engineering Rules, Architecture Patterns, Communication Protocol, Feature Lifecycle, and Done Checklist.
4. Confirm what actually exists in the project folder and distinguish repository facts from requirements and proposals.
5. Record source paths and hashes/versions where available. Do not invent missing policies, fields, indicators, legal bases, or retention periods.
6. Follow the mandate index in order. Each mandate must produce its stated artifact or an explicit blocker report.

## Known project decisions — already supplied
- Project: IDSS Pedagog Webapp.
- Purpose: professional monthly pedagogical reporting.
- Pedagogue: enters and saves drafts, tracks planned actions, submits monthly reports, and maintains a traceable history.
- Director: reviews summaries, indicators, risks, overdue actions, and recommendations requiring decisions.
- Archive: monthly archive and change history are required.
- Frontend: one standalone HTML document with embedded CSS and JavaScript.
- Backend: Google Sheets; Google Apps Script is the mediator.
- Explicit exclusions: React, Node.js server, Supabase, and an additional server.
- UX direction: polished AAA-quality 3D/gamified visual experience, but clarity, accessibility, speed, and institutional professionalism take priority.
- Progress/reward terminology: use “IDSS bodovi”; do not use “XP”.
- External visual asset: official IDSS logo at https://idss.edu.ba/wp-content/uploads/2024/03/logo_white.png. No external fonts, CDNs, icon libraries, analytics, or other remote visual assets.
- Communication with the Director: Bosnian. Code, technical documentation, and commit messages: English unless a specific institutional artifact requires Bosnian.

## Do not repeat bootstrap questions already answered
Do not ask again for the project name, basic idea, frontend/backend choice, or explicit excluded technologies. Ask the Director only for a genuinely consequential business rule that cannot be established from the canonical sources or safely represented as an explicit unresolved decision.

## Execution protocol
- Audit before change.
- One mandate at a time; do not silently skip.
- Do not redesign or remove existing logic without evidence and explicit approval.
- Do not claim access, implementation, tests, deployment, security, or compliance without verifiable evidence.
- If a capability is unavailable in the current ACA environment, produce the complete artifact and exactly one practical next-step command where possible.
- Never put credentials, tokens, private student records, or personal data into repository files.
