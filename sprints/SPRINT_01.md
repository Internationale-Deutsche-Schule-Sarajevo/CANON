# SPRINT_01 — Project Scaffold
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Read Before Starting

```
Commander Constitution:
https://raw.githubusercontent.com/IDSS123a/commander/main/CONSTITUTION.md

Commander Engineering Rules:
https://raw.githubusercontent.com/IDSS123a/commander/main/ENGINEERING_RULES.md

Commander Architecture Patterns:
https://raw.githubusercontent.com/IDSS123a/commander/main/ARCHITECTURE_PATTERNS.md

Project Constitution:
https://raw.githubusercontent.com/IDSS123a/web-app-idss-handbook/main/CONSTITUTION.md
```

---

## Goal

Create a clean, correctly structured Next.js project that serves as the foundation
for all subsequent sprints. No features. No database. No AI. Structure only.

---

## Scope — IN

- Next.js App Router project with TypeScript strict mode
- Tailwind CSS v4 configured
- Shadcn/ui installed (do not customise yet)
- Sentry installed and initialised (basic error tracking from day one)
- Feature-based folder structure created (empty folders with `.gitkeep`)
- `constants/index.ts` created with placeholder
- `types/index.ts` created with placeholder
- `.env.example` created with all required keys (see TECH_STACK.md)
- `README.md` referencing Commander and project Constitution URLs
- `schema-audit.md` placeholder created

## Scope — OUT

- No database connection
- No authentication
- No AI integration
- No UI components beyond default Shadcn setup
- No design tokens (Sprint 03)
- No business logic

---

## Acceptance Criteria

Sprint is complete when:

- [ ] `npm run dev` starts without errors or warnings
- [ ] `npm run build` completes without errors
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Feature folder structure matches ARCHITECTURE_PATTERNS.md A-2 exactly
- [ ] `.env.example` contains all keys listed in TECH_STACK.md
- [ ] Sentry initialised (error visible in Sentry dashboard on test throw)
- [ ] No hardcoded values anywhere

---

## Folder Structure to Create

```
app/
  (auth)/
    login/
    register/
    pending/
  (dashboard)/
    handbook/
    quiz/
    chatbot/
    progress/
    admin/
    super-admin/
  api/
    auth/
    documents/
    quiz/
    chatbot/
    progress/
    admin/

features/
  authentication/
  documents/
  handbook/
  quiz/
  chatbot/
  gamification/
  admin/
  super-admin/

lib/
  ai/
    providers/
  db/
  email/
  validation/

components/
  ui/         (Shadcn)
  logo/
  quiz/
  handbook/
  gamification/

constants/
  index.ts

types/
  index.ts

migrations/

public/
```

---

## Technical Notes

- Use `create-next-app` with `--typescript --tailwind --app --src-dir no --import-alias "@/*"`
- Install Shadcn/ui: `npx shadcn@latest init`
- Install Sentry: follow Sentry Next.js wizard
- Do NOT install any other packages in this sprint
- Windows CMD syntax for all commands

---

## Done Checklist Reference

Before completing this sprint, run through:
https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md

---

## Handoff Note Template

```
HANDOFF NOTE — Sprint 01
Completed: [list]
Not completed: [list]
Open risks: [list]
Technical debt: none expected
Next sprint: SPRINT_02 — Environment Validation
```
