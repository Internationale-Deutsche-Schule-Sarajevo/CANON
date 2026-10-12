# Project Context and Non-Negotiables

## Institutional context
This is an internal IDSS school-administration tool for monthly pedagogical reporting. It is not a student-facing app and is not a public reporting portal. It handles confidential institutional information and potentially sensitive information about minors; privacy and role separation are core design constraints.

## User workflows

### Pedagogue
- Open the relevant reporting period.
- Create or continue a draft.
- Enter evidence-based activities, planned actions, progress, observations, risks, and recommendations as supported by approved source templates.
- Save and resume a draft without losing work.
- Submit when ready, with a clear confirmation and recorded timestamp.
- View own permitted history and prior periods.
- See validation errors in actionable language.

### Director
- View a concise monthly overview.
- Review submitted reports, indicators, risks, overdue actions, and recommendations requiring decisions.
- Open the supporting detail for each summary item.
- Compare periods only where definitions and source data are consistent.
- Access archive/history according to approved permissions.
- See when information is missing, stale, unsubmitted, or not comparable.

These workflows are requirements, not permission to invent final fields, formulas, statuses, thresholds, or legal retention rules.

## Confirmed technical constraints
- Standalone HTML file: embedded CSS and JavaScript.
- Google Sheets data store.
- Google Apps Script as the only application backend layer.
- No React, Node server, Supabase, or additional server.
- No external front-end libraries, remote fonts, icon CDNs, analytics, or unrelated external assets.
- The only external visual asset is the official logo: https://idss.edu.ba/wp-content/uploads/2024/03/logo_white.png
- The Apps Script endpoint is the intentional backend network integration and must be explicitly configured.
- Do not treat a logo URL as an authentication method or as a security control.

## Required data concepts — subject to source validation
The data model will likely need reporting period, report identifier, author/actor, status, created/updated/submitted timestamps, report sections, actions, risk/overdue items, recommendations, and audit history. These are candidate concepts, not a finalized schema. Confirm actual fields against canonical forms and the approved PRD before implementation.

## Non-negotiable quality rules
1. No invented business rules.
2. No public spreadsheet access as a shortcut.
3. No secrets in HTML or client-side JavaScript.
4. Server-side authorization on every read/write operation.
5. Submitted history must remain traceable.
6. Every calculated indicator must have a documented definition and source.
7. No synthetic values may be presented as real institutional data.
8. No destructive migration or deletion without a verified backup and explicit authorization.
9. No unsupported claim of GDPR/legal compliance.
10. No declaring a mandate complete without evidence.
11. No external asset except the official logo; no external frontend libraries.
12. The UI must remain usable with reduced motion, keyboard-only input, and small screens.
