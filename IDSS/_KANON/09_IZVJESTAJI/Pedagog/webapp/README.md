# IDSS Pedagog Webapp — ACA Instructions

This directory contains the project governance, requirements, and sequential implementation mandates for the IDSS monthly pedagogical reporting web application.

## Read order
1. `00_START_HERE.md`
2. `01_SYSTEM_INSTRUCTIONS.md`
3. `02_PROJECT_CONTEXT_AND_NONNEGOTIABLES.md`
4. `03_MANDATE_INDEX.md`
5. Execute mandates `mandates/M01` through `mandates/M08` in order.
6. Before implementation, reconcile the instructions with the actual repository sources and record unresolved decisions instead of guessing.

## Scope
These files govern the **Pedagog webapp only**. They are not instructions for SCUBA, EGE, or any other project.

## Current state
The webapp directory previously contained only `proba.txt`. These documents establish the ACA execution protocol; they do not claim that the production app has already been implemented or tested.

## Project constraints
- Standalone HTML frontend.
- Google Sheets backend, mediated by Google Apps Script.
- No React, Node.js server, Supabase, or additional server unless the Director explicitly changes the architecture.
- No external CDNs, remote fonts, icon libraries, analytics, or third-party assets.
- The official IDSS logo is the sole external visual asset: https://idss.edu.ba/wp-content/uploads/2024/03/logo_white.png
- The Google Apps Script endpoint is a backend integration, not a visual asset; it must be configured and secured explicitly.
- Protect all student/staff and internal pedagogical data; never use real personal data in test fixtures.

## Status
Instructions and mandates are being established. The ACA must report implementation status truthfully and must not mark a task complete without evidence.
