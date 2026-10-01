-- Migration: search_summary_bs_column
-- Date: 2026-08-18
-- Description: Third search-bridge layer, for the same 2 chunks as
--   20260818_search_register_bridge_column.sql (b4a226a0, 0dc593d8).
--   The register bridge alone raised direct cosine 0.4928 -> 0.5612 for
--   the reported query but still fell short of SIMILARITY_THRESHOLD (0.6).
--   search_summary_bs holds ONE sentence prepended to the combined embed
--   text, derived verbatim from the chunk's own handbook_chapters.title
--   (e.g. "Pravila Ucionice I IV Razred" -> "Pravila ponašanja u školskoj
--   učionici za razrede I-IV.") — restates the document's own existing
--   title as a sentence, adds no fact not already in that title.
--   Deterministic (not LLM-generated) precisely because it's a trivial
--   title rephrase — zero fabrication surface.
-- Rollback: alter table document_chunks drop column if exists search_summary_bs;

alter table document_chunks
  add column if not exists search_summary_bs text;
