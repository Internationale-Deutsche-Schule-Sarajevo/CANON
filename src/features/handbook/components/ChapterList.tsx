// src/features/handbook/components/ChapterList.tsx
import Link from "next/link";
import { getAllChapters, getUserProgressMap, type ChapterSummary } from "../repository";
import { computeChapterUnlockState, type ChapterLockState } from "../chapter-lock";

type ChapterListProps = {
  userId: string;
};

const FALLBACK_SECTION = "Nekategorisano";

/** Sorts section labels numerically by their leading "N. " prefix (so "10." doesn't sort before "2."). Labels without a leading number (shouldn't happen — see FALLBACK_SECTION) sort last. */
function sectionSortKey(section: string): number {
  const match = section.match(/^(\d+)\./);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function groupBySection(
  chapters: ChapterSummary[],
): { section: string; chapters: ChapterSummary[] }[] {
  const groups = new Map<string, ChapterSummary[]>();
  for (const chapter of chapters) {
    const key = chapter.section ?? FALLBACK_SECTION;
    const existing = groups.get(key);
    if (existing) existing.push(chapter);
    else groups.set(key, [chapter]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => sectionSortKey(a) - sectionSortKey(b))
    .map(([section, sectionChapters]) => ({ section, chapters: sectionChapters }));
}

function ChapterRow({
  chapter,
  state,
}: {
  chapter: ChapterSummary;
  state: ChapterLockState;
}) {
  if (state === "locked") {
    return (
      <li>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded border border-gray-200 opacity-60 cursor-not-allowed">
          <span className="text-gray-500">{chapter.title}</span>
          <span className="text-xs text-gray-400">Zaključano</span>
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/handbook/${chapter.id}`}
        className={`flex items-center justify-between p-4 rounded border transition ${
          state === "completed"
            ? "bg-green-50 border-green-200 hover:bg-green-100"
            : "bg-white border-gray-200 hover:border-idss-dark-blue"
        }`}
      >
        <span className="text-idss-dark-blue font-medium">{chapter.title}</span>
        <span className="text-xs text-gray-500">
          {state === "completed" ? "Završeno" : "Otvoreno"}
        </span>
      </Link>
    </li>
  );
}

/**
 * Lists chapters that currently EXIST in handbook_chapters, ordered by
 * order_index. Chapters that haven't been generated yet simply don't appear
 * here at all (not shown as "locked") — the list grows as generation
 * completes, and the progress bar denominator is the current chapter count,
 * not the eventual 382.
 *
 * Grouped by `section` into 15 collapsible blocks (native <details>/<summary>
 * — no client JS needed for the toggle), ordered 1->15, so 316 chapters don't
 * read as one long flat scroll. Within a group, order_index order is
 * unchanged. Unlock progression (computeChapterUnlockState) still walks the
 * full flat chapter list by position, completely unaware of grouping — the
 * grouping here is presentation only, the "previous chapter must be
 * completed" chain is untouched.
 *
 * The group containing the first not-yet-completed chapter is open by
 * default (Director's call, 2026-09-14: "sve otvoreno" would defeat the
 * point of grouping at this scale); every other group starts collapsed. If
 * every chapter is completed, the first group opens instead — nothing left
 * to prioritize, but starting fully collapsed would be a worse default than
 * showing something.
 */
export async function ChapterList({ userId }: ChapterListProps) {
  const [chapters, progressMap] = await Promise.all([
    getAllChapters(),
    getUserProgressMap(userId),
  ]);

  if (chapters.length === 0) {
    return (
      <p className="text-gray-600">
        Poglavlja priručnika još nisu generisana. Molimo pokušajte kasnije.
      </p>
    );
  }

  const stateMap = computeChapterUnlockState(chapters, progressMap);
  const completedCount = chapters.filter(
    (c) => stateMap.get(c.id) === "completed",
  ).length;
  const progressPercent = Math.round((completedCount / chapters.length) * 100);

  const groups = groupBySection(chapters);
  const firstIncompleteChapterId =
    chapters.find((c) => stateMap.get(c.id) !== "completed")?.id ?? chapters[0].id;
  const defaultOpenSection =
    groups.find((g) => g.chapters.some((c) => c.id === firstIncompleteChapterId))?.section ??
    groups[0].section;

  return (
    <div>
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Napredak</span>
          <span>
            {completedCount} / {chapters.length} poglavlja
          </span>
        </div>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const groupCompletedCount = group.chapters.filter(
            (c) => stateMap.get(c.id) === "completed",
          ).length;

          return (
            <details
              key={group.section}
              open={group.section === defaultOpenSection}
              className="bg-white rounded border border-gray-200"
            >
              <summary className="flex items-center justify-between p-4 cursor-pointer font-medium text-idss-dark-blue select-none">
                <span>{group.section}</span>
                <span className="text-xs text-gray-500 font-normal">
                  {groupCompletedCount} / {group.chapters.length}
                </span>
              </summary>
              <ul className="space-y-2 p-4 pt-0">
                {group.chapters.map((chapter) => (
                  <ChapterRow
                    key={chapter.id}
                    chapter={chapter}
                    state={stateMap.get(chapter.id) ?? "locked"}
                  />
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
