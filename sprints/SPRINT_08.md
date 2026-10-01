# SPRINT_08 — RAG Pipeline
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Chunk all 382 USTAV documents and generate vector embeddings for every chunk.
This is what gives the chatbot its knowledge and enables semantic search.

---

## Scope — IN

- Chunker: split documents into 512-token chunks with 64-token overlap
- Embedder: generate `text-embedding-004` vectors for every chunk
- Store chunks in `document_chunks` with `document_status = 'active'`
- Batch processing: max 100 chunks per API call (GeminiKeyManager rotation)
- ivfflat or hnsw index on embedding column (if not created in Sprint 05)
- Progress tracking: Super Admin sees per-document embedding status
- Run as background job via QStash (not blocking API route)

## Scope — OUT

- Chatbot retrieval (Sprint 16)
- Chapter generation (Sprint 10)
- Hybrid search (Sprint 16)

---

## Acceptance Criteria

- [ ] All 382 documents chunked (512 tokens, 64 overlap, tiktoken counting)
- [ ] Every chunk has a `vector(768)` embedding
- [ ] Chunks stored with correct `document_id` FK and `chunk_index`
- [ ] `document_status = 'active'` on all chunks from initial import
- [ ] Total chunk count logged in `system_integrity`
- [ ] Super Admin can see: total chunks, embedded, pending, failed
- [ ] Failed chunks logged individually — pipeline continues without them
- [ ] Re-running embedding only processes chunks with missing embeddings
- [ ] GeminiKeyManager rotation used for all embedding calls
- [ ] `npx tsc --noEmit` passes

---

## Chunking Specification

```
Chunk size:    512 tokens (tiktoken cl100k_base encoding)
Overlap:       64 tokens between adjacent chunks
Per chunk:     id, document_id, chunk_index, char_offset_start,
               char_offset_end, text, embedding vector(768), document_status
```

## Embedding Specification

```
Model:         text-embedding-004
Task type:     RETRIEVAL_DOCUMENT (for indexing)
Batch size:    max 100 chunks per API call
Dimension:     768 (must match vector(768) column)
```

---

## Files Expected to Change

- `lib/rag/chunker.ts`
- `lib/rag/embedder.ts`
- `features/documents/repository.ts`
- `app/api/admin/embed/route.ts`
- `app/(dashboard)/super-admin/system/page.tsx`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
