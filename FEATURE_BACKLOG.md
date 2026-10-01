# FEATURE_BACKLOG.md — All Features and Build Phases
# IDSS Handbook Web Application
# Version 1.0 — June 2026

---

> This is the master list of everything to be built.
> Sprints are defined in `/sprints/SPRINT_XX.md`.
> When a feature is completed, update CHANGELOG.md.

---

## Build Phases

### Phase 1 — Project Scaffold
**Sprint:** SPRINT_01
**Exit criteria:** `npm run dev` starts without errors or warnings
- [ ] Next.js App Router + TypeScript strict mode
- [ ] Tailwind CSS v4 configured
- [ ] Shadcn/ui installed and configured
- [ ] Sentry installed and configured
- [ ] `.env.example` created with all required keys
- [ ] `constants/index.ts` created
- [ ] `types/index.ts` created
- [ ] Feature folder structure created

### Phase 2 — Environment Validation
**Sprint:** SPRINT_02
**Exit criteria:** App refuses to start if any required env var is missing
- [ ] Startup validation: all `.env` keys checked
- [ ] Clear error message for each missing variable
- [ ] `FATAL:` prefix on all startup errors

### Phase 3 — Design Token System
**Sprint:** SPRINT_03
**Exit criteria:** All CSS tokens present, Tailwind configured to use them
- [ ] `app/globals.css` with complete token system (see DESIGN_SYSTEM.md)
- [ ] IDSS brand colours defined as tokens
- [ ] Gamification colours defined as tokens
- [ ] Typography scale defined
- [ ] Spacing scale defined
- [ ] No hardcoded values in any component

### Phase 4 — AI Provider Layer
**Sprint:** SPRINT_04
**Exit criteria:** All 8 keys load, round-robin rotation works, fallback queue works
- [ ] `lib/ai/ai-provider.interface.ts` — AIProvider interface
- [ ] `lib/ai/providers/gemini-key-manager.ts` — 8-key rotation
- [ ] `lib/ai/providers/gemini-provider.ts` — Gemini implementation
- [ ] `lib/ai/ai-provider.factory.ts` — factory function
- [ ] Startup validation: all 8 Gemini keys present
- [ ] HTTP 429 handling: rotate immediately
- [ ] All-keys-throttled: FIFO queue, 120s max wait
- [ ] Non-429 errors: throw immediately without rotation

### Phase 5 — Supabase Schema
**Sprint:** SPRINT_05
**Exit criteria:** schema-audit.md complete, all migrations run, vector(768) verified
- [ ] Full schema inspection → `schema-audit.md`
- [ ] All required tables created (see CONSTITUTION.md A-8)
- [ ] pgvector extension enabled
- [ ] `vector(768)` column on `document_chunks` verified
- [ ] Row Level Security policies defined
- [ ] `user_role` enum created
- [ ] Numbered migration files in `/migrations/`

### Phase 6 — Authentication System
**Sprint:** SPRINT_06
**Exit criteria:** Login, logout, role redirect, registration request all work
- [ ] Email + password authentication via Supabase Auth
- [ ] Registration request flow (status: PENDING)
- [ ] Super Admin approval/rejection in dashboard
- [ ] Email notification on registration outcome (Resend)
- [ ] Role-based redirect after login
- [ ] HTTP-only session cookie
- [ ] Protected route middleware

### Phase 7 — USTAV Import Pipeline
**Sprint:** SPRINT_07
**Exit criteria:** All 382 files verified, manifest in DB, integrity report 382/382
- [ ] Parse all links from `INDEX.md`
- [ ] Verify every file exists on disk
- [ ] Confirm count = exactly 382 (abort if not)
- [ ] Compute SHA-256 hash per file
- [ ] Store manifest in `documents` table
- [ ] Store integrity report in `system_integrity` table

### Phase 8 — RAG Pipeline
**Sprint:** SPRINT_08
**Exit criteria:** All 382 docs chunked at 512 tokens, embedded, stored in pgvector
- [ ] Chunker: 512 tokens, 64 token overlap, tiktoken counting
- [ ] Embedder: `text-embedding-004`, task type `RETRIEVAL_DOCUMENT`
- [ ] Batch processing: max 100 chunks per API call
- [ ] Store in `document_chunks` with `document_status = 'active'`
- [ ] ivfflat or hnsw index on embedding column
- [ ] Progress tracking visible to Super Admin

### Phase 9 — Document Lifecycle
**Sprint:** SPRINT_09
**Exit criteria:** Full upload → stage → approve → archive cycle works
- [ ] Admin upload: PDF, DOCX, XLSX only, max 10MB
- [ ] File validation: MIME, extension, size
- [ ] Staging storage (Supabase Storage bucket: `staging-documents`)
- [ ] SHA-256 hash computation
- [ ] Diff generation against current active version
- [ ] Staging RAG chunks (not yet active)
- [ ] Super Admin review interface
- [ ] Approval: activate new, archive old
- [ ] Archive storage (bucket: `archived-documents`)
- [ ] 15-step pipeline complete (see CONSTITUTION.md O-3)

### Phase 10 — Handbook Chapter Generation
**Sprint:** SPRINT_10
**Exit criteria:** Min 5 chapters generated, stored, retrievable
- [ ] Generate chapter content: `gemini-2.5-flash`, max_tokens 8192, temp 0.3
- [ ] Store in `handbook_chapters` table
- [ ] Min 3,000 characters per chapter
- [ ] Bosnian only, professional tone
- [ ] No raw Markdown or HTML in output

### Phase 11 — Handbook Reader + Progression
**Sprint:** SPRINT_11
**Exit criteria:** Progression lock works end-to-end with server-side time validation
- [ ] Chapter reader: clean rendered content
- [ ] Scroll tracking: 100% scroll required
- [ ] Timer: 3 minutes minimum (server-enforced)
- [ ] Quiz button locked until both conditions met
- [ ] Server validates: quiz submission time - open time ≥ 180s
- [ ] Chapter navigation (locked/unlocked states)
- [ ] Handbook progress bar

### Phase 12 — Quiz Engine
**Sprint:** SPRINT_12
**Exit criteria:** Full cycle: attempt, fail, retry, pass, unlock works
- [ ] Question generation: `gemini-2.5-flash` during import
- [ ] Min 15 questions per chapter in `quiz_questions` table
- [ ] Random 5-question draw per attempt
- [ ] 5/5 required to pass (no partial credit)
- [ ] Different random set on retry
- [ ] Answer submission flow (see DESIGN_SYSTEM.md)
- [ ] USTAV-grounded explanation per question
- [ ] Quiz progress bar (5 questions)
- [ ] Consecutive wrong answers counter (3 → empathy animation)

### Phase 13 — Gamification System
**Sprint:** SPRINT_13
**Exit criteria:** All scoring correct, badges awarded, level-up triggers
- [ ] Points system (see GAMIFICATION.md)
- [ ] 10 levels with Bosnian institutional names
- [ ] Streak tracking (daily, reset at midnight)
- [ ] 10 badges with trigger conditions
- [ ] Trophy.so integration OR custom Supabase implementation
- [ ] User progress dashboard
- [ ] Admin progress overview
- [ ] Super Admin progress overview

### Phase 14 — IDSSLogo3D Component
**Sprint:** SPRINT_14
**Exit criteria:** Logo renders fixed top-left, auto-rotates, idle bob works
- [ ] Three.js setup with exact gridData from DESIGN_SYSTEM.md
- [ ] Fixed position: top 20px, left 20px, 120×120px, z-index 9999
- [ ] Auto-rotation via OrbitControls
- [ ] Idle bob animation (sine wave, period 2.5s)
- [ ] Click: opens idss.edu.ba in new tab
- [ ] React component: IDSSLogo3D with forwardRef
- [ ] Exposes: celebrate(), fail(), reset()
- [ ] Lazy loaded, does not block page load
- [ ] Cleanup on unmount

### Phase 15 — Logo Animation System
**Sprint:** SPRINT_15
**Exit criteria:** All animations trigger correctly from quiz events
- [ ] GSAP celebrate() — jump, spin, emissive glow, confetti, sound, bubble
- [ ] GSAP fail() — shake, scale, red tint, sound, bubble
- [ ] Empathy animation (3 consecutive wrong answers)
- [ ] Chapter completion extended celebration
- [ ] Speech bubble CSS component
- [ ] Hover micro-interaction (±10° tilt toward cursor)
- [ ] Howler.js sound integration
- [ ] Auto-reset to idle after 2 seconds

### Phase 16 — IDSS Asistent Chatbot
**Sprint:** SPRINT_16
**Exit criteria:** Answers grounded questions, refuses ungrounded with exact Bosnian message
- [ ] 10-step request pipeline (see CONSTITUTION.md O-8)
- [ ] Query embedding: `text-embedding-004`, task RETRIEVAL_QUERY
- [ ] Hybrid retrieval: 70% semantic + 30% full-text
- [ ] Top 5 chunks above cosine 0.6
- [ ] Confidence threshold 0.75
- [ ] LOW confidence: exact refusal message (no generation call)
- [ ] HIGH confidence: generate with chatbot system prompt
- [ ] Rate limiting: 20 messages/user/hour
- [ ] Full conversation storage in DB
- [ ] Super Admin conversation viewer

### Phase 17 — Admin Document Upload Workflow
**Sprint:** SPRINT_17
**Exit criteria:** Full 15-step pipeline works end-to-end (see CONSTITUTION.md O-3)
- [ ] Upload UI with real-time status
- [ ] OCR pipeline via OCR.Space (triggered when < 100 chars extracted)
- [ ] Status display: Uploading → Scanning → OCR → Converting → Ready
- [ ] Diff view for Super Admin
- [ ] Approval/rejection interface
- [ ] Email notifications (Resend)
- [ ] Audit log entries

### Phase 18 — Living Ecosystem Auto-Update
**Sprint:** SPRINT_18
**Exit criteria:** Approved doc triggers full 10-step ecosystem update
- [ ] Steps 1–5 synchronous in approval route
- [ ] Steps 6–7 as QStash background jobs
- [ ] Search index rebuild
- [ ] Super Admin in-app notification on completion
- [ ] Audit log: complete event with all step outcomes
- [ ] Partial failure: alert Super Admin, allow manual retry

### Phase 19 — Super Admin Dashboards
**Sprint:** SPRINT_19
**Exit criteria:** Super Admin sees and acts on all system data
- [ ] User management: view, approve, reject registrations
- [ ] Progress overview: all users, all chapters
- [ ] Chatbot conversation log viewer
- [ ] Audit log viewer
- [ ] Document approval interface
- [ ] System health and integrity dashboard
- [ ] Manual reindex trigger

### Phase 20 — DOCX Export
**Sprint:** SPRINT_20
**Exit criteria:** Generated DOCX matches memorandum template, downloads correctly
- [ ] `docx` npm package integration
- [ ] IDSS memorandum template applied
- [ ] IDSS logo included
- [ ] Temporary download link (1 hour expiry)
- [ ] Available to: Super Admin (all), Admin (their uploads)

### Phase 21 — Final QA
**Sprint:** SPRINT_21
**Exit criteria:** `npm run build` clean, zero TS errors, all 21 modules functional
- [ ] All roles tested end-to-end
- [ ] All modules verified
- [ ] All edge cases documented
- [ ] `npm run build` passes with zero errors
- [ ] Zero TypeScript errors
- [ ] Zero console errors in browser
- [ ] All Done Checklist items verified
- [ ] `vercel.json` configured (60s default, 300s for OCR/embedding routes)
- [ ] `.env.example` complete

---

*IDSS Handbook Feature Backlog v1.0 — P.U. IDSS Sarajevo*
