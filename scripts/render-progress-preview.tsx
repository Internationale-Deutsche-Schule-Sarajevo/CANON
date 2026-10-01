/**
 * Visual check helper: renders the status bar + ProgressView with fixed sample
 * data into standalone HTML files, using the real built CSS bundle, so the
 * layout can be looked at in a browser without a login. Output goes to the
 * directory given as the first argument.
 *
 * Run (after `npm run build`): npx tsx scripts/render-progress-preview.tsx <outDir>
 */
import React from "react";
import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { ProgressView } from "../src/components/gamification/ProgressView";
import { LevelBadge } from "../src/components/gamification/LevelBadge";
import { StreakDisplay } from "../src/components/gamification/StreakDisplay";
import { buildBadgeList } from "../src/features/gamification/service";
import { BADGES, getLevelForPoints, getNextLevel } from "../src/constants/gamification";
import { levelProgressPercent } from "../src/components/gamification/LevelBadge";

const outDir = process.argv[2];
const cssDir = path.join(process.cwd(), ".next", "static", "chunks");
const css = fs
  .readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => fs.readFileSync(path.join(cssDir, f), "utf8"))
  .join("\n");

function page(title: string, points: number, streak: number, longest: number, done: number, unlocked: [string, string][]) {
  const level = getLevelForPoints(points);
  const next = getNextLevel(points);
  const pct = levelProgressPercent(points, level.minPoints, next ? next.minPoints : null);
  const badges = buildBadgeList(new Map(unlocked as [never, string][]));
  const body = renderToStaticMarkup(
    <>
      <header className="nav nav-status-bar">
        <span className="nav-user-name">Davor Mulalić</span>
        <a href="#" className="nav-status-link">
          <LevelBadge level={level.level} name={level.name} points={points} currentLevelMinPoints={level.minPoints} nextLevelMinPoints={next ? next.minPoints : null} />
          <StreakDisplay currentStreak={streak} />
        </a>
      </header>
      <ProgressView
        level={{ level: level.level, name: level.name }}
        points={points}
        levelPercent={pct}
        nextLevel={next ? { level: next.level, name: next.name, pointsNeeded: next.minPoints - points } : null}
        streak={streak}
        longestStreak={longest}
        completedCount={done}
        totalChapters={316}
        chaptersPercent={Math.round((done / 316) * 100)}
        nextChapter={{ id: "x", title: "KODEKS IDSS 11092020.doc" }}
        badges={badges}
      />
    </>,
  );
  return `<!doctype html><html lang="bs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body>${body}</body></html>`;
}

fs.writeFileSync(path.join(outDir, "progress-fresh.html"), page("fresh", 0, 0, 0, 3, []));
fs.writeFileSync(
  path.join(outDir, "progress-advanced.html"),
  page("advanced", 830, 9, 12, 41, [
    [BADGES.FIRST_CHAPTER, "2026-09-02T10:00:00Z"],
    [BADGES.PERFECT_FIRST, "2026-09-02T10:00:00Z"],
    [BADGES.STREAK_7, "2026-09-16T08:00:00Z"],
    [BADGES.NO_MISTAKES, "2026-09-02T10:00:00Z"],
  ]),
);
console.log("written to", outDir);
