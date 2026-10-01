# SPRINT_03 — Design Token System
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Establish the complete visual foundation of the application.
All CSS values defined as tokens. No hardcoded colours or sizes in any component ever.

---

## Scope — IN

- `app/globals.css` with complete token system (from DESIGN_SYSTEM.md)
- Tailwind configured to use CSS custom properties
- Base button components: `btn-primary`, `btn-success`, `btn-ghost`
- Navigation bar shell (empty, no logic)
- IDSSLogo3D placeholder (static div, real 3D in Sprint 14)
- Light/dark theme toggle (theme switching only, no full dark theme yet)

## Scope — OUT

- No Three.js
- No GSAP
- No actual authentication in the nav
- No data

---

## Acceptance Criteria

- [ ] `app/globals.css` contains all tokens from DESIGN_SYSTEM.md
- [ ] Zero hardcoded hex values in any component file
- [ ] `btn-primary` renders correctly with IDSS Dark Blue and depth border
- [ ] `btn-success` renders correctly with game-green and depth border
- [ ] Navigation bar visible at correct height (64px) with bottom border
- [ ] Logo placeholder in correct position (fixed, top 20px, left 20px)
- [ ] `npx tsc --noEmit` passes

---

## Design Token Reference

Full token specification: DESIGN_SYSTEM.md in this repository.

Key values:
- `--idss-dark-blue: #16558A`
- `--idss-light-blue: #1CC4E6`
- `--game-green: #58cc02`
- `--radius: 12px`
- No box-shadow anywhere — depth via `border-bottom` only

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
