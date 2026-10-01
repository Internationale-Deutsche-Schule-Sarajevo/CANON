/**
 * RAG Retriever
 * Hybrid semantic + full-text search against active document chunks
 * Semantic: pgvector cosine similarity (70% weight)
 * Full-text: Supabase tsvector (30% weight)
 *
 * Query embedding: local transformers.js model (see lib/rag/local-embedder.ts
 * and DECISION_LOG.md DL-P-006), NOT lib/rag/embedder.ts (Gemini). It must
 * match whatever embedded document_chunks.embedding, or cosine similarity
 * is meaningless — Sprint 16 exists specifically to fix that mismatch.
 *
 * Returned chunk text is passed through stripFrontmatter() (shared with
 * features/handbook/generator.ts, see lib/rag/frontmatter.ts) before being
 * handed back — legacy USTAV-imported chunk_index=0 chunks carry a raw YAML
 * frontmatter block that must never reach a prompt or a user-facing result.
 *
 * Confidence (chatbot feature, C-8 follow-up): CONSTITUTION.md P-7 / O-8 says
 * "HIGH if any chunk >= 0.75" — that is raw cosine similarity, not the 70/30
 * blended score used for ranking. Blending a semantic-only hit at *0.7 caps
 * it at 0.7, which can never reach 0.75 on its own (only a "both" hit with
 * the +0.3 full-text bonus could) — flagged but left unfixed in the Aug-5
 * Sprint 16 handoff (sprints/SPRINT_16.md "Open risk found while testing").
 * Fixed here: rawSemanticSimilarity carries the un-weighted cosine
 * separately from the blended `similarity` used for sort order; confidence
 * is computed from the max rawSemanticSimilarity across the final top-K,
 * never from the blended score.
 *
 * Elaborat priority (CONSTITUTION.md:55-56, SPRINT_16.md acceptance
 * criterion "Elaborat chunks ranked first in result set regardless of
 * score"): among chunks that already cleared the normal retrieval filters
 * (same candidate pool as everyone else — this does not bypass
 * SIMILARITY_THRESHOLD), any chunk from the Elaborat document is sorted
 * ahead of all non-Elaborat chunks before the top-K slice. Confirmed with
 * the Director before implementing (see chat) — "ranked first in result
 * set" presupposes the chunk is already in the qualified set; nothing in
 * the source text says to bypass the relevance floor.
 *
 * Grade-level ranking boost (2026-08-20, approved plan): match_chunks's
 * `match_count = TOP_K*2` LIMIT can exclude a chunk that clears
 * SIMILARITY_THRESHOLD but is outranked by a crowded field of generic
 * documents (see [[search-bridge-cross-lingual-retrieval]] Gotcha #1 — the
 * Pravila I-IV/V-IX classroom-rules case: raw cosine 0.6495, but 20+
 * Bosnian rulebooks score 0.66-0.70 and fill the LIMIT-10 pool first). When
 * the query names a grade range ("I-IV", "V-IX", ...) and a document's
 * filename carries the same range tag, that document's chunks are fetched
 * directly (bypassing the RPC's LIMIT, not its relevance floor — the same
 * SIMILARITY_THRESHOLD gate still applies, computed from a fresh cosine
 * against queryEmbedding) and given a small ranking-only bonus
 * (GRADE_LEVEL_BOOST) before the top-K slice. Does NOT touch
 * rawSemanticSimilarity or CONFIDENCE_THRESHOLD — confirmed with the
 * Director that this is a ranking-only fix and will NOT flip LOW to HIGH
 * for the I-IV/V-IX case today (both max out at raw ~0.65-0.71, still
 * below 0.75); that refusal is accepted, intended behavior, not a bug this
 * boost is meant to chase.
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";
import { embedTextsLocal } from "./local-embedder";
import { stripFrontmatter } from "./frontmatter";

const SIMILARITY_THRESHOLD = 0.6;
const CONFIDENCE_THRESHOLD = 0.75;
const TOP_K = 5;
const GRADE_LEVEL_BOOST = 0.05;

// "Elaborat Medjunarodna Njemacka Skola Sarajevo" — the school's founding
// document. document_id is stable (never re-imported), confirmed via
// corrections/CHAPTER_TRIAGE.md and corrections/REGENERATE_LIST.md.
const ELABORAT_DOCUMENT_ID = "cbd20e73-4ea8-4f3a-a816-ee8131e3c479";

// Grade-range tags recognized in both the query (via regex) and a
// document's filename (via plain substring match). Narrow by design —
// only the two ranges that currently have tagged documents
// (Pravila_Ucionice_I-IV_Razred.md, Pravila_učionice_V-IX_Razred.md).
// Add a tag here only once a real document is tagged with it.
const GRADE_RANGE_SIGNALS: { tag: string; patterns: RegExp[] }[] = [
  {
    tag: "I-IV",
    patterns: [
      /\bI\s*[-–—]\s*IV\b/i,
      /\bod\s+I\s+do\s+IV\b/i,
      /\bprv(i|og)\s+do\s+četvrt(i|og)\s+razred/i,
      /\b1\s*[-–—.]\s*4\.?\s*razred/i,
    ],
  },
  {
    tag: "V-IX",
    patterns: [
      /\bV\s*[-–—]\s*IX\b/i,
      /\bod\s+V\s+do\s+IX\b/i,
      /\bpet(i|og)\s+do\s+devet(i|og)\s+razred/i,
      /\b5\s*[-–—.]\s*9\.?\s*razred/i,
    ],
  },
];

function detectGradeRangeTags(query: string): string[] {
  const tags = new Set<string>();
  for (const signal of GRADE_RANGE_SIGNALS) {
    if (signal.patterns.some((p) => p.test(query))) tags.add(signal.tag);
  }
  return Array.from(tags);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type RetrievedChunk = {
  id: string;
  documentId: string;
  text: string;
  /** Blended 70/30 score — determines display/tie-break order, NOT confidence. */
  similarity: number;
  /** Raw pgvector cosine similarity, present only when a semantic match
   * contributed to this chunk (source "semantic" or "both"). This, not
   * `similarity`, is what O-8's 0.75 confidence threshold is measured against. */
  rawSemanticSimilarity: number | null;
  source: "semantic" | "fulltext" | "both";
};

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  confidence: "HIGH" | "LOW";
  queryEmbedding: number[];
};

/**
 * Retrieve relevant chunks for a query using hybrid search
 * Always filters to active chunks only (document_status = 'active')
 */
export async function retrieveChunks(query: string): Promise<RetrievalResult> {
  const supabase = createSupabaseDirectAdmin();

  // Generate query embedding (local model — must match document-side embedding space)
  const [queryEmbedding] = await embedTextsLocal([query]);

  // Semantic search via pgvector
  const { data: semanticResults, error: semanticError } = await supabase.rpc(
    "match_chunks",
    {
      query_embedding: queryEmbedding,
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: TOP_K * 2,
    },
  );

  if (semanticError) {
    console.error("[Retriever] Semantic search error:", semanticError.message);
  }

  // Full-text search
  const { data: ftsResults, error: ftsError } = await supabase
    .from("document_chunks")
    .select("id, document_id, text")
    .eq("document_status", "active")
    .textSearch("text", query.split(" ").join(" | "), {
      type: "plain",
      config: "simple",
    })
    .limit(TOP_K * 2);

  if (ftsError) {
    console.error("[Retriever] Full-text search error:", ftsError.message);
  }

  // Combine results with weighted scoring
  const chunkMap = new Map<string, RetrievedChunk>();

  // Add semantic results (70% weight for ranking; raw cosine kept separately for confidence)
  for (const row of semanticResults ?? []) {
    chunkMap.set(row.id, {
      id: row.id,
      documentId: row.document_id,
      text: stripFrontmatter(row.content),
      similarity: row.similarity * 0.7,
      rawSemanticSimilarity: row.similarity,
      source: "semantic",
    });
  }

  // Add/merge full-text results (30% weight)
  for (const row of ftsResults ?? []) {
    if (chunkMap.has(row.id)) {
      const existing = chunkMap.get(row.id)!;
      existing.similarity += 0.3;
      existing.source = "both";
      // rawSemanticSimilarity already set from the semantic branch above — unchanged.
    } else {
      chunkMap.set(row.id, {
        id: row.id,
        documentId: row.document_id,
        text: stripFrontmatter(row.text),
        similarity: 0.3,
        rawSemanticSimilarity: null, // fulltext-only match, no cosine to report
        source: "fulltext",
      });
    }
  }

  // Grade-level ranking boost: only runs when the query names a grade
  // range AND a document is tagged with that same range in its filename —
  // zero extra queries for the overwhelming majority of queries that don't
  // mention a grade range.
  const gradeRangeTags = detectGradeRangeTags(query);
  if (gradeRangeTags.length > 0) {
    const filenameFilter = gradeRangeTags
      .map((tag) => `filename.ilike.%${tag}%`)
      .join(",");
    const { data: taggedDocs, error: taggedDocsError } = await supabase
      .from("documents")
      .select("id")
      .or(filenameFilter);

    if (taggedDocsError) {
      console.error(
        "[Retriever] Grade-range document lookup error:",
        taggedDocsError.message,
      );
    }

    if (taggedDocs && taggedDocs.length > 0) {
      const { data: taggedChunks, error: taggedChunksError } = await supabase
        .from("document_chunks")
        .select("id, document_id, text, embedding")
        .eq("document_status", "active")
        .in(
          "document_id",
          taggedDocs.map((d) => d.id),
        );

      if (taggedChunksError) {
        console.error(
          "[Retriever] Grade-range chunk fetch error:",
          taggedChunksError.message,
        );
      }

      for (const row of taggedChunks ?? []) {
        const vec =
          typeof row.embedding === "string"
            ? (JSON.parse(row.embedding) as number[])
            : (row.embedding as number[]);
        const raw = cosineSimilarity(queryEmbedding, vec);

        // Same relevance floor as every other candidate — the boost never
        // bypasses SIMILARITY_THRESHOLD, only re-ranks within the qualified set.
        if (raw < SIMILARITY_THRESHOLD) continue;

        const existing = chunkMap.get(row.id);
        if (existing) {
          existing.similarity += GRADE_LEVEL_BOOST;
        } else {
          chunkMap.set(row.id, {
            id: row.id,
            documentId: row.document_id,
            text: stripFrontmatter(row.text),
            similarity: raw * 0.7 + GRADE_LEVEL_BOOST,
            rawSemanticSimilarity: raw,
            source: "semantic",
          });
        }
      }
    }
  }

  // Sort: Elaborat chunks first (regardless of score), then by blended score
  // descending within each group — stable relative order preserved otherwise.
  const chunks = Array.from(chunkMap.values())
    .sort((a, b) => {
      const aElaborat = a.documentId === ELABORAT_DOCUMENT_ID;
      const bElaborat = b.documentId === ELABORAT_DOCUMENT_ID;
      if (aElaborat !== bElaborat) return aElaborat ? -1 : 1;
      return b.similarity - a.similarity;
    })
    .slice(0, TOP_K);

  // Determine confidence from raw cosine (never the blended rank score) —
  // O-8: "HIGH if any chunk >= 0.75". A fulltext-only chunk (no cosine)
  // cannot push confidence to HIGH on its own.
  const maxRawSimilarity = Math.max(
    0,
    ...chunks.map((c) => c.rawSemanticSimilarity ?? 0),
  );
  const confidence: "HIGH" | "LOW" =
    maxRawSimilarity >= CONFIDENCE_THRESHOLD ? "HIGH" : "LOW";

  return { chunks, confidence, queryEmbedding };
}
