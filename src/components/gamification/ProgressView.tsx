import Link from "next/link";
import { StreakDisplay, formatDays } from "./StreakDisplay";
import { BadgeGrid } from "./BadgeGrid";
import { formatPoints } from "./LevelBadge";
import type { BadgeListItem } from "@/features/gamification/service";

export type ProgressViewProps = {
  level: { level: number; name: string };
  points: number;
  levelPercent: number;
  /** null at the top level. */
  nextLevel: { level: number; name: string; pointsNeeded: number } | null;
  streak: number;
  longestStreak: number;
  completedCount: number;
  totalChapters: number;
  chaptersPercent: number;
  nextChapter: { id: string; title: string } | null;
  badges: BadgeListItem[];
};

/**
 * Presentational body of /progress: no data access, so it renders identically
 * from the page and from the render tests / visual checks. Static (no motion).
 */
export function ProgressView({
  level,
  points,
  levelPercent,
  nextLevel,
  streak,
  longestStreak,
  completedCount,
  totalChapters,
  chaptersPercent,
  nextChapter,
  badges,
}: ProgressViewProps) {
  const unlockedBadgeCount = badges.filter((b) => b.unlocked).length;

  return (
    <div className="progress-page">
      <div className="progress-page-header">
        <h1 className="text-3xl font-bold text-idss-dark-blue">Moj napredak</h1>
        <Link href="/handbook" className="btn-ghost">
          Nazad na priručnik
        </Link>
      </div>

      <section className="card progress-hero" aria-labelledby="level-heading">
        <span className="progress-hero-level" aria-hidden="true">
          {level.level}
        </span>
        <div className="progress-hero-body">
          <h2 id="level-heading">
            Nivo {level.level}: {level.name}
          </h2>
          <p>{formatPoints(points)} bodova</p>
          <div
            className="progress-bar-track"
            role="progressbar"
            aria-label="Napredak do sljedećeg nivoa"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={levelPercent}
          >
            <div className="progress-bar-fill" style={{ width: `${levelPercent}%` }} />
          </div>
          <p className="progress-muted">
            {nextLevel
              ? `Još ${formatPoints(nextLevel.pointsNeeded)} bodova do nivoa ${nextLevel.level}: ${nextLevel.name}`
              : "Dostigli ste najviši nivo."}
          </p>
        </div>
      </section>

      <div className="progress-stats">
        <section className="card" aria-labelledby="streak-heading">
          <h3 id="streak-heading">Niz učenja</h3>
          <StreakDisplay currentStreak={streak} />
          <p className="progress-muted">
            Najduži niz: {longestStreak} {formatDays(longestStreak)}
          </p>
        </section>

        <section className="card" aria-labelledby="chapters-heading">
          <h3 id="chapters-heading">Poglavlja</h3>
          <p>
            {completedCount} / {totalChapters} savladano
          </p>
          <div
            className="progress-bar-track"
            role="progressbar"
            aria-label="Savladana poglavlja"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={chaptersPercent}
          >
            <div className="progress-bar-fill" style={{ width: `${chaptersPercent}%` }} />
          </div>
        </section>
      </div>

      <section className="card" aria-labelledby="next-heading">
        <h3 id="next-heading">Sljedeće poglavlje</h3>
        {nextChapter ? (
          <Link href={`/handbook/${nextChapter.id}`} className="progress-next-link">
            {nextChapter.title}
          </Link>
        ) : (
          <p>Sva dostupna poglavlja su savladana.</p>
        )}
      </section>

      <section className="card" aria-labelledby="badges-heading">
        <h3 id="badges-heading">
          Bedževi <span className="progress-muted">({unlockedBadgeCount} / {badges.length})</span>
        </h3>
        <BadgeGrid badges={badges} />
      </section>
    </div>
  );
}
