/**
 * Handbook Repository
 * All database access for chapter generation (Sprint 10) and the chapter
 * reader / locked progression (Sprint 11).
 * Never call these from Client Components — only from Server Components,
 * Server Actions, generator.ts, and API routes. Uses createSupabaseDirectAdmin()
 * throughout (service role, no RLS/cookies) — callers resolve "who is the
 * current user" themselves via createSupabaseServerClient() and pass the
 * resulting public.users.id in explicitly.
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";
import { MINIMUM_READING_SECONDS } from "./constants";
import { categorizeChapterTitle } from "./section-rules";

export type ActiveDocumentSummary = {
  id: string;
  filename: string;
};

/**
 * All active documents, oldest first (import/approval order) — this determines
 * chapter order_index when generating from scratch.
 */
export async function getActiveDocuments(): Promise<ActiveDocumentSummary[]> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("documents")
    .select("id, filename")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getActiveDocuments failed: ${error.message}`);
  return data ?? [];
}

export async function getGeneratedChaptersCount(): Promise<number> {
  const supabase = createSupabaseDirectAdmin();
  const { count, error } = await supabase
    .from("handbook_chapters")
    .select("*", { count: "exact", head: true });

  if (error) return 0;
  return count ?? 0;
}

/**
 * Active documents that don't have a handbook_chapters row yet.
 * Used for idempotent re-runs — only newly-active documents get generated.
 */
export async function getDocumentsWithoutChapters(): Promise<ActiveDocumentSummary[]> {
  const supabase = createSupabaseDirectAdmin();

  const [{ data: activeDocs, error: docsError }, { data: chapters, error: chaptersError }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("id, filename")
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      supabase.from("handbook_chapters").select("document_id"),
    ]);

  if (docsError) {
    throw new Error(`getDocumentsWithoutChapters failed: ${docsError.message}`);
  }
  if (chaptersError) {
    throw new Error(`getDocumentsWithoutChapters failed: ${chaptersError.message}`);
  }

  const chapteredIds = new Set((chapters ?? []).map((c) => c.document_id));
  return (activeDocs ?? []).filter((d) => !chapteredIds.has(d.id));
}

/**
 * Concatenate a document's active chunks (chunk_index order) into one text block.
 * Used as generation context instead of re-reading source files — this works
 * uniformly whether the document came from the local USTAV repo/ import or a
 * Sprint 09 Storage-backed admin upload.
 */
export async function getChunkTextForDocument(documentId: string): Promise<string> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("document_chunks")
    .select("text, chunk_index")
    .eq("document_id", documentId)
    .eq("document_status", "active")
    .order("chunk_index", { ascending: true });

  if (error) throw new Error(`getChunkTextForDocument failed: ${error.message}`);
  return (data ?? []).map((c) => c.text).join("\n\n");
}

export async function deleteChapterForDocument(documentId: string): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase
    .from("handbook_chapters")
    .delete()
    .eq("document_id", documentId);

  if (error) throw new Error(`deleteChapterForDocument failed: ${error.message}`);
}

/**
 * Returns the new row's id — generateAllChapters() needs it immediately
 * after to generate and attach that chapter's summary in the same pass.
 */
/**
 * Auto-categorizes every new chapter via the shared deterministic keyword
 * rules (section-rules.ts) — wired in 2026-09-11 so new/replacement
 * documents get a `section` immediately instead of always landing on
 * "Nekategorisano" until someone re-runs scripts/categorize-chapters.ts by
 * hand. Same rules, same "no match -> Nekategorisano, never guessed"
 * behavior as the original 316-chapter backfill. This is the only function
 * that inserts handbook_chapters rows (called by both generator.ts's bulk
 * generateAllChapters and pipeline/worker.ts's per-document chapter step),
 * so putting it here guarantees both paths get it, not just one.
 */
export async function storeChapter(
  documentId: string,
  title: string,
  content: string,
  orderIndex: number,
): Promise<string> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("handbook_chapters")
    .insert({
      document_id: documentId,
      title,
      content,
      order_index: orderIndex,
      section: categorizeChapterTitle(title),
    })
    .select("id")
    .single();

  if (error) throw new Error(`storeChapter failed: ${error.message}`);
  return data.id;
}

/**
 * Unpublishes (is_published=false, nothing deleted) any still-published
 * chapter belonging to an earlier, now-archived version of the same
 * document (matched by original_name, same mechanism already used for
 * documents/document_chunks in upload-repository.ts — see
 * getActiveDocumentByOriginalName there). Closes the gap found 2026-09-11:
 * approving a replacement document archived the old `documents` row and its
 * `document_chunks`, but the old chapter in the Handbook reader stayed
 * published forever, showing stale content side-by-side with the new
 * chapter. Handles more than one prior archived version (a document
 * replaced twice), not just the most recent. Call AFTER the new chapter is
 * successfully stored — if generation for the new chapter fails, the old
 * one should stay visible rather than leaving a gap.
 */
export async function unpublishChaptersForSupersededVersions(
  newDocumentId: string,
  originalName: string,
): Promise<number> {
  const supabase = createSupabaseDirectAdmin();

  const { data: oldDocs, error: oldDocsError } = await supabase
    .from("documents")
    .select("id")
    .eq("original_name", originalName)
    .eq("status", "archived")
    .neq("id", newDocumentId);
  if (oldDocsError) {
    throw new Error(`unpublishChaptersForSupersededVersions (lookup) failed: ${oldDocsError.message}`);
  }
  if (!oldDocs || oldDocs.length === 0) return 0;

  const oldDocIds = oldDocs.map((d) => d.id);
  const { data: updated, error: updateError } = await supabase
    .from("handbook_chapters")
    .update({ is_published: false })
    .in("document_id", oldDocIds)
    .eq("is_published", true)
    .select("id");
  if (updateError) {
    throw new Error(`unpublishChaptersForSupersededVersions (update) failed: ${updateError.message}`);
  }

  return updated?.length ?? 0;
}

// ── Sprint 11: Chapter reader / locked progression ──────────────────────────

export type ChapterSummary = {
  id: string;
  title: string;
  order_index: number;
  generated_at: string;
  // Thematic grouping for the /handbook list (ChapterList) — see
  // section-rules.ts. Always a real section string in practice
  // (categorizeChapterTitle never returns null, only the literal
  // "Nekategorisano"), but the DB column is nullable, so callers must still
  // handle null defensively.
  section: string | null;
};

export type ChapterFull = {
  id: string;
  title: string;
  content: string;
  order_index: number;
  // Needed by scripts/regenerate-truncated.ts to tell "already regenerated by
  // this campaign's corrected prompt" apart from "old content that happens to
  // be structurally well-formed" — see CAMPAIGN_START there.
  generated_at: string;
  // "Pročitaj više" feature — null until generate-chapter-summaries.ts (or
  // the auto-summary step in generateChapterForDocument's caller) fills it
  // in. The reader falls back to showing full content immediately when null.
  summary: string | null;
};

export type UserProgressRow = {
  id: string;
  user_id: string;
  chapter_id: string;
  attempts: number;
  completed: boolean;
  completed_at: string | null;
  chapter_opened_at: string | null;
  scrolled_to_end_at: string | null;
  last_attempt_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * All PUBLISHED chapters that currently exist, ordered by order_index.
 * Selects only list-view fields (not content) — with up to 382 chapters at
 * ~3-10k characters each, fetching full content for a list view would be
 * wasteful. Use getChapterById() for the reader page, which needs full
 * content.
 *
 * is_published=false chapters (non-text artifacts: logos, forms, per-student
 * records — see corrections/CHAPTER_TRIAGE.md) are filtered out here, not
 * deleted — their document_chunks remain intact and searchable as chatbot
 * source material. This is the single query behind ChapterList, the
 * handbook/[chapterId] and quiz/[chapterId] reader pages, and quiz
 * generation's generateAllQuizQuestions() — filtering here excludes
 * unpublished chapters from all four uniformly.
 *
 * Unlock progression (computeChapterUnlockState in chapter-lock.ts) walks
 * this returned array by POSITION, not by order_index value, so filtering
 * rows out here does not break the "previous chapter must be completed"
 * chain — it just skips straight to the next published chapter, the same
 * way pre-existing order_index gaps already were harmless.
 */
export async function getAllChapters(): Promise<ChapterSummary[]> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("handbook_chapters")
    .select("id, title, order_index, generated_at, section")
    .eq("is_published", true)
    .order("order_index", { ascending: true });

  if (error) throw new Error(`getAllChapters failed: ${error.message}`);
  return data ?? [];
}

export async function getChapterById(id: string): Promise<ChapterFull | null> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("handbook_chapters")
    .select("id, title, content, order_index, generated_at, summary")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getChapterById failed: ${error.message}`);
  return data;
}

/**
 * Overwrites an existing chapter's content in place — never delete-then-insert.
 * id and order_index must survive a regeneration: a new row would reshuffle
 * reading order, and re-inserting under a new id would orphan (not CASCADE,
 * since the FK points the other way) the chapter's existing quiz_questions
 * rows, which is why the regeneration script also has to call
 * deleteQuestionsForChapter() explicitly rather than relying on CASCADE here.
 *
 * Also clears summary/summary_generated_at — a stored summary is a
 * compression of the content it was generated from, so if content changes
 * the old summary may misrepresent it (a stale but "clean-looking" summary
 * is worse than none). Reader falls back to showing full content until
 * scripts/generate-chapter-summaries.ts re-fills it (summary IS NULL is its
 * resume filter, so this naturally re-queues the chapter).
 */
export async function updateChapterContent(
  chapterId: string,
  content: string,
): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase
    .from("handbook_chapters")
    .update({
      content,
      generated_at: new Date().toISOString(),
      summary: null,
      summary_generated_at: null,
    })
    .eq("id", chapterId);

  if (error) throw new Error(`updateChapterContent failed: ${error.message}`);
}

// ── "Pročitaj više" — chapter summaries ─────────────────────────────────────

export type ChapterForSummary = {
  id: string;
  content: string;
};

/**
 * Published chapters that don't have a summary yet (summary IS NULL is the
 * resume filter — same pattern as search_translated_at in the search-bridge
 * scripts), oldest order_index first, up to `limit` rows. Used by
 * scripts/generate-chapter-summaries.ts to run in waves; omit `limit` to
 * fetch everything still pending.
 */
export async function getChaptersNeedingSummary(limit?: number): Promise<ChapterForSummary[]> {
  const supabase = createSupabaseDirectAdmin();
  let query = supabase
    .from("handbook_chapters")
    .select("id, content")
    .eq("is_published", true)
    .is("summary", null)
    .order("order_index", { ascending: true });

  if (limit !== undefined) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`getChaptersNeedingSummary failed: ${error.message}`);
  return data ?? [];
}

/**
 * Writes a validated summary. Never call with an unvalidated summary —
 * validateSummary() (summary-validation.ts) must pass first, same discipline
 * as the search-bridge translation writes.
 */
export async function updateChapterSummary(chapterId: string, summary: string): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase
    .from("handbook_chapters")
    .update({ summary, summary_generated_at: new Date().toISOString() })
    .eq("id", chapterId);

  if (error) throw new Error(`updateChapterSummary failed: ${error.message}`);
}

export type ChapterSourceInfo = {
  documentId: string;
  filename: string;
};

/**
 * A chapter's source document_id + filename — the two inputs
 * generateChapterForDocument() needs — looked up starting from the chapter
 * id (the regeneration script's REGENERATE_LIST.md only has chapter ids).
 */
export async function getChapterSourceInfo(
  chapterId: string,
): Promise<ChapterSourceInfo | null> {
  const supabase = createSupabaseDirectAdmin();
  const { data: chapter, error: chapterError } = await supabase
    .from("handbook_chapters")
    .select("document_id")
    .eq("id", chapterId)
    .maybeSingle();

  if (chapterError) {
    throw new Error(`getChapterSourceInfo (chapter lookup) failed: ${chapterError.message}`);
  }
  if (!chapter) return null;

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("filename")
    .eq("id", chapter.document_id)
    .maybeSingle();

  if (documentError) {
    throw new Error(`getChapterSourceInfo (document lookup) failed: ${documentError.message}`);
  }
  if (!document) return null;

  return { documentId: chapter.document_id, filename: document.filename };
}

export async function getUserProgressForChapter(
  userId: string,
  chapterId: string,
): Promise<UserProgressRow | null> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("user_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("chapter_id", chapterId)
    .maybeSingle();

  if (error) throw new Error(`getUserProgressForChapter failed: ${error.message}`);
  return data;
}

/**
 * All of a user's progress rows, keyed by chapter_id — lets ChapterList and
 * the reader page's lock check compute state across the whole handbook in
 * one query instead of one round-trip per chapter.
 */
export async function getUserProgressMap(
  userId: string,
): Promise<Map<string, { completed: boolean }>> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("user_progress")
    .select("chapter_id, completed")
    .eq("user_id", userId);

  if (error) throw new Error(`getUserProgressMap failed: ${error.message}`);

  const map = new Map<string, { completed: boolean }>();
  for (const row of data ?? []) {
    map.set(row.chapter_id, { completed: row.completed });
  }
  return map;
}

/**
 * Records when a user first opens a chapter, creating the user_progress row
 * if needed. Sets chapter_opened_at ONLY if it isn't already set — re-opening
 * an already-opened, not-yet-completed chapter must never reset the 3-minute
 * reading timer. (There is no "Constitution O-6" — this is a direct product
 * decision confirmed with the requester, not a re-derived rule.)
 */
export async function upsertChapterOpened(
  userId: string,
  chapterId: string,
): Promise<{ chapterOpenedAt: string }> {
  const supabase = createSupabaseDirectAdmin();
  const existing = await getUserProgressForChapter(userId, chapterId);

  if (!existing) {
    const openedAt = new Date().toISOString();
    const { error } = await supabase.from("user_progress").insert({
      user_id: userId,
      chapter_id: chapterId,
      chapter_opened_at: openedAt,
    });
    if (error) throw new Error(`upsertChapterOpened insert failed: ${error.message}`);
    return { chapterOpenedAt: openedAt };
  }

  if (!existing.chapter_opened_at) {
    const openedAt = new Date().toISOString();
    const { error } = await supabase
      .from("user_progress")
      .update({ chapter_opened_at: openedAt })
      .eq("id", existing.id);
    if (error) throw new Error(`upsertChapterOpened update failed: ${error.message}`);
    return { chapterOpenedAt: openedAt };
  }

  return { chapterOpenedAt: existing.chapter_opened_at };
}

/**
 * Server-side reading-time check, ready for Sprint 12's quiz submission
 * route to call: "(submit_time - chapter_opened_at) < 180 seconds" must be
 * rejected. Not wired to any route yet this sprint — prepared per the task,
 * since the quiz submission endpoint itself doesn't exist until Sprint 12.
 */
export async function hasMinimumReadingTimeElapsed(
  userId: string,
  chapterId: string,
): Promise<boolean> {
  const progress = await getUserProgressForChapter(userId, chapterId);
  if (!progress?.chapter_opened_at) return false;

  const openedAtMs = new Date(progress.chapter_opened_at).getTime();
  const elapsedSeconds = (Date.now() - openedAtMs) / 1000;
  return elapsedSeconds >= MINIMUM_READING_SECONDS;
}

/**
 * Records that a user scrolled to the end of a chapter's content — closes
 * the gap where "100% scroll" was tracked only in client React state
 * (ChapterReader.tsx) and never verified server-side, unlike the 3-minute
 * timer (see hasMinimumReadingTimeElapsed above, backed by chapter_opened_at).
 * Idempotent: only writes the timestamp the first time, same as
 * upsertChapterOpened does for chapter_opened_at — a user_progress row must
 * already exist (the reader page always calls upsertChapterOpened before the
 * client can report a scroll event, so this never needs to insert one).
 */
export async function markScrolledToEnd(userId: string, chapterId: string): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const existing = await getUserProgressForChapter(userId, chapterId);
  if (!existing) {
    throw new Error("markScrolledToEnd: nema user_progress reda (poglavlje nije otvoreno preko servera).");
  }
  if (existing.scrolled_to_end_at) return; // already recorded, nothing to do

  const { error } = await supabase
    .from("user_progress")
    .update({ scrolled_to_end_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) throw new Error(`markScrolledToEnd failed: ${error.message}`);
}

/** Server-side counterpart to hasMinimumReadingTimeElapsed — the other half of "both conditions together". */
export async function hasScrolledToEnd(userId: string, chapterId: string): Promise<boolean> {
  const progress = await getUserProgressForChapter(userId, chapterId);
  return !!progress?.scrolled_to_end_at;
}
