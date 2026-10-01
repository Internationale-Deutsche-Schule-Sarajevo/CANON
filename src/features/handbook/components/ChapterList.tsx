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

  const remainingCount = chapters.length - completedCount;
  const nextChapter = chapters.find((chapter) => stateMap.get(chapter.id) !== "completed");

  return (
    <div>
      <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#0b2d4d] via-[#123f63] to-[#0d6b78] p-6 text-white shadow-lg" aria-labelledby="handbook-overview-title">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">IDSS Knowledge Hub</p>
            <h2 id="handbook-overview-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Vaš sljedeći korak u učenju</h2>
            <p className="mt-2 text-sm leading-6 text-slate-100">
              Čitajte odobrena poglavlja redom, pratite napredak i uvijek se vratite na sadržaj koji je najvažniji za vašu ulogu.
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-xs text-cyan-100">Ukupan napredak</p>
            <p className="mt-1 text-3xl font-bold">{progressPercent}%</p>
          </div>
        </div>
        <div className="mt-6" aria-label={`Napredak: ${completedCount} od ${chapters.length} poglavlja`}>
          <div className="mb-2 flex justify-between text-xs font-medium text-slate-100">
            <span>{completedCount} završeno</span>
            <span>{remainingCount} preostalo</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        {nextChapter ? (
          <Link href={`/handbook/${nextChapter.id}`} className="mt-5 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#0b2d4d] transition hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#123f63]">
            Nastavite s učenjem <span aria-hidden="true" className="ml-2">→</span>
          </Link>
        ) : (
          <p className="mt-5 text-sm font-semibold text-cyan-100">Sva poglavlja su završena. Odličan posao.</p>
        )}
      </section>

      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-idss-dark-blue">Poglavlja priručnika</h2>
          <p className="text-sm text-gray-600">Odaberite poglavlje da otvorite sadržaj i označite ga kao završeno.</p>
        </div>
        <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex">{chapters.length} poglavlja</span>
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
