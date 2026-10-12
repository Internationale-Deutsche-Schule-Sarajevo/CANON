# M04 — UX Design and Interaction Specification

## Objective
Design the entire user experience against the approved PRD and data contract before implementation.

## Required outputs
- `UX_SPEC.md`
- Screen/state inventory.
- Design tokens and interaction rules documented in `UX_SPEC.md`.

## Required screens/states
Determine the exact screen set from the PRD; at minimum assess:
- Sign-in/session-expired or access-denied state.
- Role-appropriate home/dashboard.
- Monthly report list and archive.
- Draft editor with save status and validation.
- Submission confirmation and result.
- Director report review with summary, indicators, risks, overdue actions, and recommendations.
- Report detail and change history.
- Loading, empty, offline/network failure, server failure, stale/conflict, and permission-denied states.

## Visual and interaction rules
- Professional IDSS identity; use the official logo URL only as the external visual asset.
- High-quality 3D-inspired visual design and subtle gamified progress, without sacrificing readability or institutional seriousness.
- Use “IDSS bodovi” rather than “XP”.
- Keep motion purposeful; respect `prefers-reduced-motion`.
- Full keyboard operation, clear focus, accessible labels, appropriate contrast, and touch-friendly targets.
- No fake KPI values, fabricated reports, fake users, or unsupported status badges.
- Charts and progress visuals must be derived from defined data and clearly label period/source.
- Do not use external fonts, CDNs, icon libraries, or analytics.
- Make unsaved changes, save success/failure, submission, and stale data states unmistakable.

## Acceptance criteria
- Every screen maps to a user story and data/API behaviour.
- Every interactive element has a real action and error state.
- Responsive and accessibility behaviour is specified before implementation.
