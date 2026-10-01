/** Thousands separator used in Bosnian ("1.250"), done by hand so output never depends on the runtime's ICU data. */
export function formatPoints(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Percent progress from this level's floor to the next level's floor; 100 at the top level. */
export function levelProgressPercent(points: number, currentMin: number, nextMin: number | null): number {
  if (nextMin === null) return 100;
  const span = nextMin - currentMin;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((points - currentMin) / span) * 100)));
}

type LevelBadgeProps = {
  level: number;
  name: string;
  points: number;
  currentLevelMinPoints: number;
  /** null at the top level. */
  nextLevelMinPoints: number | null;
};

/**
 * Current level + progress toward the next one. Static presentation only
 * (Phase 2b); reuses the existing .progress-bar-* classes and tokens, so the
 * later palette swap recolors it automatically.
 */
export function LevelBadge({ level, name, points, currentLevelMinPoints, nextLevelMinPoints }: LevelBadgeProps) {
  const percent = levelProgressPercent(points, currentLevelMinPoints, nextLevelMinPoints);
  const summary =
    nextLevelMinPoints === null
      ? `${formatPoints(points)} bodova, najviši nivo`
      : `${formatPoints(points)} / ${formatPoints(nextLevelMinPoints)} bodova do sljedećeg nivoa`;

  return (
    <div className="level-badge" title={summary}>
      <span className="level-badge-number" aria-hidden="true">
        {level}
      </span>
      <div className="level-badge-text">
        <span className="level-badge-name">
          Nivo {level}: {name}
        </span>
        <div
          className="progress-bar-track level-badge-track"
          role="progressbar"
          aria-label="Napredak do sljedećeg nivoa"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={summary}
        >
          <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
