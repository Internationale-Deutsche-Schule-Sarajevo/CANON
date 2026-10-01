/**
 * Quiz Repository
 * All database access for the quiz engine (Sprint 12).
 * Never call these from Client Components — only from Server Components,
 * Server Actions, generator.ts, and API routes. Uses createSupabaseDirectAdmin()
 * throughout (service role, no RLS/cookies) — callers resolve "who is the
 * current user" themselves and pass the resulting public.users.id in explicitly.
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";

export type QuizQuestion = {
  id: string;
  chapter_id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  created_at: string;
};

export type QuizQuestionInput = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type ScoredAnswer = {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
};

export async function getQuestionCountForChapter(chapterId: string): Promise<number> {
  const supabase = createSupabaseDirectAdmin();
  const { count, error } = await supabase
    .from("quiz_questions")
    .select("*", { count: "exact", head: true })
    .eq("chapter_id", chapterId);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Question counts for every chapter that has at least one question — used by
 * the batch generator to decide which chapters still need questions without
 * doing 316 individual count queries.
 *
 * PAGINATED (bug found 2026-09-09 in the control test): PostgREST/Supabase
 * caps any single response at max_rows=1000 (supabase/config.toml). quiz_questions
 * has 5892 rows total, so an unpaginated select silently returned only the
 * first 1000 and produced a badly wrong "needs questions" list — the control
 * test's batch generated a redundant 5 questions each for 10 chapters that
 * already had a full 15-question pool. Never query this table without
 * pagination again.
 */
export async function getQuestionCountsForAllChapters(): Promise<Map<string, number>> {
  const supabase = createSupabaseDirectAdmin();
  const counts = new Map<string, number>();
  const PAGE_SIZE = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("quiz_questions")
      .select("chapter_id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`getQuestionCountsForAllChapters failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      counts.set(row.chapter_id, (counts.get(row.chapter_id) ?? 0) + 1);
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return counts;
}

export async function storeQuestions(
  chapterId: string,
  questions: QuizQuestionInput[],
): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const rows = questions.map((q) => ({
    chapter_id: chapterId,
    question: q.question,
    options: q.options,
    correct_index: q.correctIndex,
    explanation: q.explanation,
  }));

  const { error } = await supabase.from("quiz_questions").insert(rows);
  if (error) throw new Error(`storeQuestions failed: ${error.message}`);
}

/**
 * Deletes all quiz_questions rows for a chapter, returning the count deleted.
 * Used by the chapter-regeneration script after a successful content update:
 * regenerated content invalidates the old questions, and the existing
 * "Generiši kviz pitanja" button already regenerates from scratch whenever a
 * chapter has fewer than 15 stored questions (see
 * generateQuestionsForChapter's existingCount check) — so deleting is enough,
 * no separate regeneration call is needed here.
 */
export async function deleteQuestionsForChapter(chapterId: string): Promise<number> {
  const supabase = createSupabaseDirectAdmin();
  const { error, count } = await supabase
    .from("quiz_questions")
    .delete({ count: "exact" })
    .eq("chapter_id", chapterId);

  if (error) throw new Error(`deleteQuestionsForChapter failed: ${error.message}`);
  return count ?? 0;
}

/**
 * All questions generated for a chapter (pool can hold more than the 5-question
 * test — nothing is deleted when the target dropped from 15 to 5, see
 * getFirstFiveQuestions). Ordered by created_at so "first N" is well-defined —
 * without an explicit ORDER BY, Postgres row order is not guaranteed.
 */
export async function getQuestionPoolForChapter(chapterId: string): Promise<QuizQuestion[]> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("id, chapter_id, question, options, correct_index, explanation, created_at")
    .eq("chapter_id", chapterId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getQuestionPoolForChapter failed: ${error.message}`);
  return data ?? [];
}

/**
 * Deterministic "first 5" — per the final quiz spec (2026-09-09): the test IS
 * the 5-question pool, not a random draw from a larger one. Replaces the old
 * getRandomFiveQuestions (random shuffle+slice, different set every retry).
 * Any extra rows beyond the first 5 in a chapter's pool (some chapters have
 * up to 29 from earlier generation runs) are simply never surfaced —
 * intentionally left in place, not deleted.
 */
export async function getFirstFiveQuestions(chapterId: string): Promise<QuizQuestion[]> {
  const pool = await getQuestionPoolForChapter(chapterId);
  return pool.slice(0, 5);
}

/**
 * Logs a quiz attempt. NOTE: user_progress has no column for per-question
 * answer detail, and there is no separate quiz-attempt-history table in the
 * schema established this session (Supabase MCP is disconnected this turn,
 * so this wasn't independently re-verified against the live DB — flagging
 * rather than inventing a table/column). Only the scalar aggregate already
 * on user_progress (attempts count, last_attempt_at) is persisted here; the
 * detailed per-question `answers` are accepted and logged, not stored.
 */
export async function recordQuizAttempt(
  userId: string,
  chapterId: string,
  score: number,
  answers: ScoredAnswer[],
): Promise<void> {
  console.log(
    `[QuizRepository] Attempt: user=${userId} chapter=${chapterId} score=${score}/5 ` +
      `(${answers.length} answers — not persisted in per-question detail, no schema column for it)`,
  );

  const supabase = createSupabaseDirectAdmin();
  const { data: existing, error: fetchError } = await supabase
    .from("user_progress")
    .select("id, attempts")
    .eq("user_id", userId)
    .eq("chapter_id", chapterId)
    .maybeSingle();

  if (fetchError) throw new Error(`recordQuizAttempt fetch failed: ${fetchError.message}`);

  const now = new Date().toISOString();

  if (!existing) {
    // Defensive fallback — shouldn't normally happen, since chapter_opened_at
    // is set when the chapter is first read, before the quiz is reachable.
    const { error } = await supabase.from("user_progress").insert({
      user_id: userId,
      chapter_id: chapterId,
      attempts: 1,
      last_attempt_at: now,
    });
    if (error) throw new Error(`recordQuizAttempt insert failed: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from("user_progress")
    .update({ attempts: (existing.attempts ?? 0) + 1, last_attempt_at: now })
    .eq("id", existing.id);

  if (error) throw new Error(`recordQuizAttempt update failed: ${error.message}`);
}

/** Only called on a 5/5 score. */
export async function markChapterCompleted(userId: string, chapterId: string): Promise<void> {
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase
    .from("user_progress")
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("chapter_id", chapterId);

  if (error) throw new Error(`markChapterCompleted failed: ${error.message}`);
}
