/**
 * Render tests for the Phase 2b presentational components (StreakDisplay,
 * LevelBadge): static HTML via react-dom/server, several states each. No DB,
 * no browser. GamificationBar itself (auth + DB) is covered by the build and
 * the live check, not here.
 *
 * Run: npx tsx scripts/test-gamification-components.tsx
 */
import React from "react"; // scripts/ is outside tsconfig, so tsx uses the classic JSX transform here
import { renderToStaticMarkup } from "react-dom/server";
import { StreakDisplay, formatDays } from "../src/components/gamification/StreakDisplay";
import { LevelBadge, formatPoints, levelProgressPercent } from "../src/components/gamification/LevelBadge";
import { BadgeGrid } from "../src/components/gamification/BadgeGrid";
import { buildBadgeList } from "../src/features/gamification/service";
import { BADGES } from "../src/constants/gamification";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? `\n     ${detail}` : ""}`);
  }
}

console.log("=== formatDays (bosanski plural) ===");
for (const [n, expected] of [[0, "dana"], [1, "dan"], [2, "dana"], [4, "dana"], [5, "dana"], [11, "dana"], [21, "dan"], [22, "dana"], [101, "dan"], [111, "dana"]] as const) {
  check(`${n} -> ${expected}`, formatDays(n) === expected, `got ${formatDays(n)}`);
}

console.log("\n=== StreakDisplay ===");
{
  const zero = renderToStaticMarkup(<StreakDisplay currentStreak={0} />);
  check("streak 0: has 'inactive', no 'high'", zero.includes("streak-display inactive") && !zero.includes("high"), zero);
  check("streak 0: label", zero.includes("0 dana") && zero.includes('aria-label="Uzastopni dani učenja: 0"'), zero);
  const one = renderToStaticMarkup(<StreakDisplay currentStreak={1} />);
  check("streak 1: '1 dan', neither inactive nor high", one.includes("1 dan<") && !one.includes("inactive") && !one.includes("high"), one);
  const seven = renderToStaticMarkup(<StreakDisplay currentStreak={7} />);
  check("streak 7: 'high' class", seven.includes("streak-display high"), seven);
  check("icon is hidden from screen readers", seven.includes('aria-hidden="true"'), seven);
}

console.log("\n=== LevelBadge ===");
check("formatPoints 1250 -> 1.250", formatPoints(1250) === "1.250");
check("formatPoints 999 -> 999", formatPoints(999) === "999");
check("formatPoints 8000 -> 8.000", formatPoints(8000) === "8.000");
check("progress: 0 pts in level 1 (0..150) = 0%", levelProgressPercent(0, 0, 150) === 0);
check("progress: 75 pts in level 1 = 50%", levelProgressPercent(75, 0, 150) === 50);
check("progress: 200 pts in level 2 (150..400) = 20%", levelProgressPercent(200, 150, 400) === 20);
check("progress: top level = 100%", levelProgressPercent(9000, 8000, null) === 100);
check("progress never above 100 or below 0", levelProgressPercent(500, 0, 150) === 100 && levelProgressPercent(-5, 0, 150) === 0);
{
  const html = renderToStaticMarkup(
    <LevelBadge level={2} name="Suradnik" points={200} currentLevelMinPoints={150} nextLevelMinPoints={400} />,
  );
  check("shows 'Nivo 2: Suradnik'", html.includes("Nivo 2: Suradnik"), html);
  check("progress bar fill is 20%", html.includes("width:20%"), html);
  check("progressbar a11y attributes", html.includes('role="progressbar"') && html.includes('aria-valuenow="20"'), html);
  check("tooltip text uses Bosnian thousands format", html.includes("200 / 400 bodova do sljedećeg nivoa"), html);
  const top = renderToStaticMarkup(
    <LevelBadge level={10} name="IDSS Ambasador" points={8500} currentLevelMinPoints={8000} nextLevelMinPoints={null} />,
  );
  check("top level says highest level, 100%", top.includes("najviši nivo") && top.includes("width:100%"), top);
}

console.log("\n=== BadgeGrid ===");
{
  const badges = buildBadgeList(new Map([[BADGES.FIRST_CHAPTER, "2026-09-21T10:00:00Z"]]));
  const html = renderToStaticMarkup(<BadgeGrid badges={badges} />);
  const items = html.split("<li").length - 1;
  check("renders all 10 badges", items === 10, `found ${items}`);
  check("unlocked badge shows name and unlock date", html.includes("Prvo poglavlje") && html.includes("Otključano 21. 9. 2026."), html);
  check("locked badge shows its condition as visible text", html.includes("25% svih poglavlja savladano."), html);
  check("exactly 9 locked items (class 'locked' on <li> and its icon)", (html.match(/badge-item locked/g) ?? []).length === 9, html);
  check("screen-reader state text for both kinds", html.includes(">Otključano<") && html.includes(">Zaključano<"), html);
  check("icons hidden from screen readers", !html.includes("<svg") || html.includes('aria-hidden="true"'), html);
}

console.log(`\n=== ZAKLJUČAK: ${passed} prošlo, ${failed} palo ===`);
if (failed > 0) process.exitCode = 1;
