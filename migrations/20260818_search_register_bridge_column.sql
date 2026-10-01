-- Migration: search_register_bridge_column
-- Date: 2026-08-18
-- Description: Second search bridge, on top of search_text_bs (see
--   20260818_search_bridge_translation_columns.sql). Two chunks
--   (b4a226a0-..., "Pravila_Ucionice_I-IV_Razred.md" and 0dc593d8-...,
--   "Pravila_učionice_V-IX_Razred.md") kept failing SIMILARITY_THRESHOLD
--   even after literal Bosnian translation — direct cosine only moved
--   0.4721 -> 0.4928, still under 0.6 — because the content is a short list
--   of first-person pledges ("Ich komme pünktlich." / "Dolazim na vrijeme.")
--   which is structurally/register-mismatched against a formal question
--   ("Koja pravila vrijede...") regardless of language.
--
--   search_text_bs_declarative holds a faithful REGISTER-ONLY reformulation
--   of search_text_bs (first-person pledge -> formal rule statement, e.g.
--   "Dolazim na vrijeme." -> "Pravilo o dolasku na vrijeme."), same
--   discipline as the translation bridge (no facts added or removed).
--   `embedding` for these two chunks is recomputed from search_text_bs +
--   search_text_bs_declarative combined, so cosine ranking benefits from
--   both phrasings at once. Original `text` still never modified.
--
-- Rollback:
--   alter table document_chunks
--     drop column if exists search_text_bs_declarative,
--     drop column if exists search_register_bridge_at;
--   -- embedding values are not reverted by this — see rollback note in
--   -- 20260818_search_bridge_translation_columns.sql.

alter table document_chunks
  add column if not exists search_text_bs_declarative text,
  add column if not exists search_register_bridge_at timestamptz;
