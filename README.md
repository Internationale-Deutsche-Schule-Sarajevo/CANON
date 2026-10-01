# IDSS Handbook — Web Application

**Institution:** P.U. Internationale Deutsche Schule Sarajevo
**Director:** Davor Mulalić — direktor@idss.ba
**Version:** 1.0 — June 2026
**Status:** Active Development

---

## What This Is

A closed institutional knowledge ecosystem for IDSS teachers and employees.
Full-stack SaaS web application built with Next.js, Supabase, and Gemini AI.

Key features:
- Professional Handbook reader with locked chapter progression
- AI-powered chatbot (IDSS Asistent) grounded in 382 USTAV documents
- Duolingo-inspired quiz and gamification system
- Document upload → OCR → RAG → Super Admin approval pipeline
- Living ecosystem: new documents automatically update all content

---

## For Any AI Coding Assistant

Read these documents in order before writing any code:

```
1. Commander Constitution (universal mindset):
   https://raw.githubusercontent.com/IDSS123a/commander/main/CONSTITUTION.md

2. Commander Engineering Rules:
   https://raw.githubusercontent.com/IDSS123a/commander/main/ENGINEERING_RULES.md

3. Commander Architecture Patterns:
   https://raw.githubusercontent.com/IDSS123a/commander/main/ARCHITECTURE_PATTERNS.md

4. This project's Constitution:
   https://raw.githubusercontent.com/IDSS123a/web-app-idss-handbook/main/CONSTITUTION.md

5. Current Sprint:
   https://raw.githubusercontent.com/IDSS123a/web-app-idss-handbook/main/sprints/SPRINT_01.md
```

---

## Repository Structure

```
web-app-idss-handbook/
├── README.md
├── CONSTITUTION.md          Project-specific rules and architecture
├── VISION.md                Why this app exists
├── TECH_STACK.md            Complete technology decisions
├── DESIGN_SYSTEM.md         CSS tokens, 3D logo, quiz UI
├── GAMIFICATION.md          Points, levels, badges, animations
├── FEATURE_BACKLOG.md       All features to be built
├── DECISION_LOG.md          Project-specific decisions
├── CHANGELOG.md             What has been built
└── sprints/
    ├── SPRINT_01.md         Project scaffold
    ├── SPRINT_02.md         Auth system
    ├── SPRINT_03.md         Supabase schema
    └── ...
```

---

## Local Development

```
App root:     C:\DAVOR_PRIVATE\AI\Prirucnik_Za_Nastavnike\web-app-IDSS-handbook
USTAV repo:   C:\DAVOR_PRIVATE\AI\Prirucnik_Za_Nastavnike\web-app-IDSS-handbook\repo
Environment:  C:\DAVOR_PRIVATE\AI\Prirucnik_Za_Nastavnike\web-app-IDSS-handbook\.env
```

**All terminal commands: Windows CMD syntax only. Never PowerShell. Never bash.**

---

## USTAV Knowledge Base

The `repo` folder contains 382 validated Markdown documents — the institutional
source of truth for all Handbook content, chatbot answers, and quiz questions.

```
USTAV (repo/):
  - 382 Markdown documents
  - 382 valid links in INDEX.md
  - 0 missing files
  - 0 extra files
```

No content may be generated from AI training data. USTAV only.
