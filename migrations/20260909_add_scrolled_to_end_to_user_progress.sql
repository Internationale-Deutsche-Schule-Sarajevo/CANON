-- Migration: add_scrolled_to_end_to_user_progress
-- Date: 2026-09-09
-- Description: Closes a real access-control gap found during the quiz-gating
--   review: the "scrolled to 100% of chapter content" condition was tracked
--   ONLY in client-side React state (ChapterReader.tsx `scrolledToEnd`) and
--   never sent to or verified by the server. Only the 3-minute timer was
--   re-checked server-side (via chapter_opened_at), so a user who directly
--   opened /quiz/[chapterId] and waited out the timer elsewhere could submit
--   the quiz without ever having scrolled the chapter — "both conditions
--   together" was cosmetic in the UI, not actually enforced.
--   This column lets the client report "reached 100% scroll" once (via a new
--   server action), and both submitQuizAnswers and the quiz page's access
--   check now require it alongside the timer, symmetric to how
--   chapter_opened_at already backs hasMinimumReadingTimeElapsed.
-- Rollback: alter table user_progress drop column if exists scrolled_to_end_at;

alter table user_progress
  add column if not exists scrolled_to_end_at timestamptz;
