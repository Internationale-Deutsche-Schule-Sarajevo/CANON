-- Migration: search_bridge_translation_columns
-- Date: 2026-08-18
-- Description: "Bosanski most za pretragu" — document_chunks whose native
--   content is German/English (OCR'd posters, imported letters/reports)
--   were failing SIMILARITY_THRESHOLD against Bosnian chatbot queries even
--   when the chapter is clean and embedded, because the multilingual
--   embedder's cross-lingual cosine for short/terse content lands below
--   0.6 (confirmed case: "Pravila Ucionice I-IV Razred", raw cosine 0.4721
--   against a Bosnian query — see chat).
--
--   search_text_bs holds a strict, faithful Bosnian translation of the
--   chunk, used EXCLUSIVELY to compute a replacement `embedding` for
--   retrieval. The original `text` column is never modified — citations,
--   chapter display, and the generation-context prompt in pipeline.ts all
--   keep pointing at the real source content, untouched.
--
-- Rollback:
--   alter table document_chunks
--     drop column if exists search_text_bs,
--     drop column if exists search_source_lang,
--     drop column if exists search_translated_at;
--   -- embedding values written by the backfill are NOT reverted by this —
--   -- restore from a DB backup/snapshot taken before the backfill ran if a
--   -- full rollback of re-embedded vectors is ever needed.

alter table document_chunks
  add column if not exists search_text_bs text,
  add column if not exists search_source_lang text,
  add column if not exists search_translated_at timestamptz;
