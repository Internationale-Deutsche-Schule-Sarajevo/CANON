# schema-audit.md

# IDSS Handbook — Supabase Schema Audit

# Date: 2026-06-28

# Project: wpizjmqkhbreuiaeobvz

## Status: COMPLETE ✅

## Migration Applied

- 001_initial_schema.sql — all 14 tables created successfully

## Tables

| Table                 | Status     | Notes                                   |
| --------------------- | ---------- | --------------------------------------- |
| users                 | ✅ Created | role enum, status check                 |
| registration_requests | ✅ Created | pending/approved/rejected               |
| documents             | ✅ Created | staging/active/archived                 |
| document_chunks       | ✅ Created | vector(768) embedding                   |
| handbook_chapters     | ✅ Created | generated content                       |
| quiz_questions        | ✅ Created | JSONB options                           |
| user_progress         | ✅ Created | chapter_opened_at for server time check |
| user_points           | ✅ Created | level, streak tracking                  |
| badges                | ✅ Created | 10 badges seeded                        |
| user_badges           | ✅ Created | junction table                          |
| chatbot_conversations | ✅ Created | permanent storage                       |
| chatbot_turns         | ✅ Created | confidence, chunk_ids                   |
| audit_log             | ✅ Created | full write audit                        |
| system_integrity      | ✅ Created | import tracking                         |

## Extensions

- vector (pgvector) ✅ enabled

## Enums

- user_role: super_admin, admin, user ✅
- document_status: staging, active, archived ✅

## Indexes

- ivfflat on document_chunks.embedding ✅
- FTS gin index on document_chunks.text ✅
- All foreign key indexes ✅

## pgvector

- Dimension: 768 ✅ verified
- Index type: ivfflat (lists=100) ✅
