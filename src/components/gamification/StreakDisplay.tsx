import { Flame } from "lucide-react";

/** Bosnian plural for "dan": 1 dan, 2-4 dana, 5+ dana, 11 dana, 21 dan, 22 dana... */
export function formatDays(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? "dan" : "dana";
}

/**
 * Learning-streak indicator. Static presentation only (Phase 2b): styling
 * comes entirely from the existing .streak-display classes/tokens in
 * globals.css, so the later token/palette swap recolors it with no change
 * here. "inactive" when there is no live streak, "high" from a full week.
 * `currentStreak` should be the EFFECTIVE streak (see getEffectiveStreak),
 * not the raw stored value.
 */
export function StreakDisplay({ currentStreak }: { currentStreak: number }) {
  const className = ["streak-display", currentStreak === 0 ? "inactive" : "", currentStreak >= 7 ? "high" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      title="Uzastopni dani učenja"
      aria-label={`Uzastopni dani učenja: ${currentStreak}`}
    >
      <Flame size={20} aria-hidden="true" />
      <span>
        {currentStreak} {formatDays(currentStreak)}
      </span>
    </div>
  );
}
