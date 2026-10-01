# SPRINT_05 — Supabase Schema and Migrations
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Inspect existing Supabase schema, document it, then create all required tables
with proper indexes and RLS policies. pgvector must be enabled and verified.

---

## Scope — IN

- Full schema inspection → `schema-audit.md`
- All required tables created (see list below)
- pgvector extension enabled
- `vector(768)` column on `document_chunks` verified
- `user_role` enum created
- Row Level Security policies on all tables
- Numbered migration files in `/migrations/`

## Scope — OUT

- No data insertion
- No auth logic (Sprint 06)
- No AI pipelines (Sprint 08)

---

## Acceptance Criteria

- [ ] `schema-audit.md` documents all existing tables and their state
- [ ] All tables from list below exist with correct columns
- [ ] `SELECT typname FROM pg_type WHERE typname = 'vector'` returns result
- [ ] `document_chunks.embedding` column is type `vector(768)`
- [ ] ivfflat or hnsw index created on `document_chunks.embedding`
- [ ] `user_role` enum has values: `super_admin`, `admin`, `user`
- [ ] RLS enabled on all tables
- [ ] All migrations are numbered SQL files with header comments
- [ ] Rollback SQL documented in every migration header

---

## Required Tables

```
users                   (id, email, full_name, role, status, created_at)
registration_requests   (id, email, full_name, role_requested, status, reason, created_at)
documents               (id, filename, status, hash, ocr_processed, metadata, created_at)
document_chunks         (id, document_id, chunk_index, text, embedding vector(768), document_status)
handbook_chapters       (id, document_id, title, content, generated_at)
quiz_questions          (id, chapter_id, question, options jsonb, correct_index, explanation)
user_progress           (id, user_id, chapter_id, attempts, completed, completed_at)
user_points             (id, user_id, points, level, current_streak, longest_streak)
badges                  (id, badge_key, name, description, trigger_condition)
user_badges             (id, user_id, badge_id, awarded_at)
chatbot_conversations   (id, user_id, created_at)
chatbot_turns           (id, conversation_id, user_message, response, confidence, chunk_ids, created_at)
audit_log               (id, user_id, action, entity, before_state, after_state, created_at)
system_integrity        (id, import_type, total, succeeded, failed, status, created_at)
```

---

## Migration File Format

```sql
-- Migration: 001_initial_schema
-- Date: 2026-06-28
-- Author: ACA
-- Description: Create all base tables for IDSS Handbook
-- Rollback: [DROP TABLE statements in reverse order]

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Create role enum
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'user');

-- [tables follow]
```

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
