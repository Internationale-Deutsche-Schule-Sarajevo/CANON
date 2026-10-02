// src/features/handbook/components/ChapterReader.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MINIMUM_READING_SECONDS, SCROLL_THRESHOLD } from "../constants";
import { confirmScrolledToEnd } from "../actions";

type ChapterReaderProps = {
  chapter: { id: string; title: string; content: string; summary: string | null };
  /** True when user_progress.completed is already true for this chapter — a
   * free re-read with no scroll/timer requirements and no server writes. */
  isPracticeMode: boolean;
  /** ISO timestamp from the server (user_progress.chapter_opened_at). Using the
   * server's timestamp — not "time since this component mounted" — means the
   * timer reflects true elapsed time even if the user reloads the page or
   * re-opens the chapter later, matching the server-side 180s check exactly. */
  chapterOpenedAt: string | null;
};

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ChapterReader({
  chapter,
  isPracticeMode,
  chapterOpenedAt,
}: ChapterReaderProps) {
  const [scrolledToEnd, setScrolledToEnd] = useState(isPracticeMode);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // "Pročitaj više" — chapters without a summary yet (summary === null) skip
  // straight to full content, no button (fallback per plan, nothing hidden
  // behind an empty summary). Gate decision (a): chapter_opened_at is still
  // stamped at page load same as before (server side, unchanged), but the
  // scroll/timer tracking effects below don't start running until the user
  // actually expands to the full text — see the `expanded` guards in both
  // effects. Known accepted trade-off (confirmed with Director): time spent
  // sitting on the summary before clicking still counts toward the 180s once
  // expanded, since chapterOpenedAt itself doesn't move. Not a regression
  // introduced by this feature so much as the existing timer already only
  // ever measured "time since page open," never "time actually reading" —
  // this doesn't tighten or loosen that pre-existing looseness.
  const [expanded, setExpanded] = useState(!chapter.summary);
  const paragraphs = useRef(splitParagraphs(chapter.content)).current;

  // Scroll tracking — 95% threshold accounts for rounding/sub-pixel layout.
  useEffect(() => {
    if (isPracticeMode || !expanded) return;

    function handleScroll() {
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const scrollHeight = doc.scrollHeight || document.body.scrollHeight;
      const clientHeight = doc.clientHeight;

      if (scrollHeight <= clientHeight) {
        // Content shorter than the viewport — nothing to scroll, already "read".
        setScrolledToEnd(true);
        return;
      }

      const ratio = (scrollTop + clientHeight) / scrollHeight;
      if (ratio >= SCROLL_THRESHOLD) {
        setScrolledToEnd(true);
      }
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isPracticeMode, expanded]);

  // Server-side counterpart of scrolledToEnd — closes the gap where "100%
  // scroll" lived only in this component's React state and was never
  // verifiable by the server (only the 3-minute timer was, via
  // chapter_opened_at). Fires once, on the false->true transition. A
  // failure here is logged, not surfaced to the user directly — the quiz
  // submit action re-checks server-side independently (see
  // hasScrolledToEnd) and will explain if this never made it through, same
  // as the existing reading-timer's client/server split already does.
  const scrollConfirmedRef = useRef(false);
  useEffect(() => {
    if (isPracticeMode || !scrolledToEnd || scrollConfirmedRef.current) return;
    scrollConfirmedRef.current = true;
    confirmScrolledToEnd(chapter.id).then((result) => {
      if (!result.success) {
        console.error("[ChapterReader] confirmScrolledToEnd failed:", result.error);
      }
    });
  }, [isPracticeMode, scrolledToEnd, chapter.id]);

  // Reading timer — client-side UX feedback only. The server independently
  // re-validates against chapter_opened_at when the quiz is submitted.
  useEffect(() => {
    if (isPracticeMode || !expanded || !chapterOpenedAt) return;

    const openedAtMs = new Date(chapterOpenedAt).getTime();

    function tick() {
      const elapsed = Math.floor((Date.now() - openedAtMs) / 1000);
      setElapsedSeconds(Math.max(0, Math.min(elapsed, MINIMUM_READING_SECONDS)));
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isPracticeMode, expanded, chapterOpenedAt]);

  const timerComplete = isPracticeMode || elapsedSeconds >= MINIMUM_READING_SECONDS;
  const quizUnlocked = isPracticeMode || (scrolledToEnd && timerComplete);

  return (
    <div>
      {isPracticeMode && (
        <div className="mb-4 inline-block text-xs font-medium text-idss-light-blue bg-blue-50 px-3 py-1 rounded">
          Način vježbe — poglavlje je već završeno
        </div>
      )}

      <h1 className="text-3xl font-bold text-idss-dark-blue mb-6">
        {chapter.title}
      </h1>

      {expanded ? (
        <div className="space-y-4 text-gray-800 leading-relaxed">
          {/* paragraphs is derived once from immutable chapter content. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-gray-800 leading-relaxed">{chapter.summary}</p>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-idss-dark-blue font-medium underline hover:no-underline"
          >
            Pročitaj više
          </button>
        </div>
      )}

      {!isPracticeMode && (
        <div className="sticky bottom-0 mt-8 bg-white border-t border-gray-200 p-4 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-600">
            <div>
              {scrolledToEnd
                ? "Pročitano do kraja ✓"
                : "Skrolujte do kraja poglavlja"}
            </div>
            <div>
              Vrijeme čitanja: {formatTime(elapsedSeconds)} /{" "}
              {formatTime(MINIMUM_READING_SECONDS)}
            </div>
          </div>
          {quizUnlocked ? (
            <Link href={`/quiz/${chapter.id}`} className="btn-primary">
              Pokreni kviz
            </Link>
          ) : (
            <button disabled className="btn-primary">
              Pokreni kviz
            </button>
          )}
        </div>
      )}
    </div>
  );
}
