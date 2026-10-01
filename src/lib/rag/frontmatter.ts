/**
 * Shared frontmatter stripping — extracted from features/handbook/generator.ts
 * (C-10, Sprint 16 follow-up) so retriever.ts and generator.ts use the exact
 * same rule instead of two copies drifting apart.
 *
 * Source .md files carry a YAML frontmatter block (title/chapter/chapter_desc/
 * source_path/file_type/... between --- delimiters) that chunkDocument() has no
 * special handling for, so it ends up as part of chunk_index 0's text. That's
 * harmless for embeddings/retrieval, but feeding it to Gemini as "document
 * content" caused it to echo metadata values (e.g. chapter: "02_NASTAVNIK")
 * back into generated chapters — and, before this fix, retriever.ts returned it
 * verbatim in RAG results too (377 of 5741 active chunks, all chunk_index=0,
 * legacy USTAV imports, carry this block — measured via scripts/c10-frontmatter-scope.ts).
 * Strip it before it ever reaches a prompt or a retrieval result.
 */
export function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "");
}
