/**
 * Deterministic keyword categorization for handbook_chapters.section — dry-run
 * / backfill tool for the ORIGINAL 316 flat chapters.
 *
 * Rules live in src/features/handbook/section-rules.ts (single source of
 * truth, shared with storeChapter()'s automatic categorization of new
 * chapters — see that file's header). This script only handles the
 * fetch/report/write plumbing for a one-off bulk pass.
 *
 * Usage:
 *   npx tsx scripts/categorize-chapters.ts            # dry run (default) — no writes
 *   npx tsx scripts/categorize-chapters.ts --write     # apply to database
 */

import "dotenv/config";
import { categorizeChapterTitle, SECTIONS, UNCATEGORIZED } from "../src/features/handbook/section-rules";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

type Chapter = { id: string; title: string; order_index: number };

async function fetchChapters(): Promise<Chapter[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/handbook_chapters?select=id,title,order_index&is_published=eq.true&order=order_index.asc`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch chapters: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function writeAssignments(assignments: { id: string; section: string }[]): Promise<void> {
  for (const { id, section } of assignments) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/handbook_chapters?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ section }),
    });
    if (!res.ok) {
      throw new Error(`Failed to update ${id}: ${res.status} ${await res.text()}`);
    }
  }
}

async function main() {
  const isWrite = process.argv.includes("--write");
  const chapters = await fetchChapters();

  const counts = new Map<string, number>();
  const uncategorized: Chapter[] = [];
  const assignments: { id: string; section: string }[] = [];

  for (const chapter of chapters) {
    const section = categorizeChapterTitle(chapter.title);
    counts.set(section, (counts.get(section) ?? 0) + 1);
    assignments.push({ id: chapter.id, section });
    if (section === UNCATEGORIZED) uncategorized.push(chapter);
  }

  console.log(`Total chapters: ${chapters.length}\n`);
  console.log("=== Counts per section ===");
  const orderedSections = [...Object.values(SECTIONS), UNCATEGORIZED];
  for (const section of orderedSections) {
    console.log(`${(counts.get(section) ?? 0).toString().padStart(3)}  ${section}`);
  }

  console.log(`\n=== Nekategorisano (${uncategorized.length}) ===`);
  for (const ch of uncategorized) {
    console.log(`${ch.id}\t${ch.title}`);
  }

  if (isWrite) {
    console.log("\n--write flag set — applying to database...");
    await writeAssignments(assignments);
    console.log("Done.");
  } else {
    console.log("\nDRY RUN — no rows were modified. Pass --write to apply.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
