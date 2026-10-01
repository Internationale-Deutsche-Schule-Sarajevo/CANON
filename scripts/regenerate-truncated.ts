/**
 * Chapter regeneration script — chapter-truncation fix sprint.
 *
 * Regenerates a director-approved list of chapters (REGENERATE category from
 * corrections/CHAPTER_TRIAGE.md, curated by hand into corrections/
 * REGENERATE_LIST.md) using the raised 65536 maxTokens ceiling and the new
 * proportional-length, fact-preserving SYSTEM_PROMPT in
 * src/features/handbook/generator.ts. Does NOT touch EXCLUDE or RE-EXTRACT
 * candidates — those need a separate migration/decision and a re-import
 * respectively, neither of which this script performs.
 *
 * Uses the existing AI provider layer (generateChapterForDocument() ->
 * getAIProvider() -> GeminiKeyManager) — no separate client, no sleeps
 * between calls; GeminiKeyManager already rotates across keys and handles
 * 429 throttling internally.
 *
 * Run (Windows CMD):
 *   npx tsx --env-file=.env scripts\regenerate-truncated.ts
 *   npx tsx --env-file=.env scripts\regenerate-truncated.ts corrections\REGENERATE_LIST.md
 *
 * Input: a markdown file (default corrections/REGENERATE_LIST.md, override
 * via argv[2]) containing chapter UUIDs anywhere in its text — every
 * UUID-shaped token is extracted and deduplicated, so a raw list, a copied
 * markdown table, or a filtered subset of CHAPTER_TRIAGE.md's REGENERATE
 * table all work unchanged. Does not hardcode a count and does not re-derive
 * the list with a heuristic — the director decides which chapters go in.
 *
 * Never delete-then-insert: updateChapterContent() overwrites content on the
 * existing row, so id and order_index survive and reading order/unlock
 * progression is untouched.
 *
 * Resumable/idempotent: before spending a Gemini call, each chapter's
 * CURRENTLY STORED content is checked against the same validation used for
 * freshly generated content, PLUS a generated_at >= CAMPAIGN_START guard. If
 * both pass, the chapter is skipped — re-running after a partial batch (or
 * after a quota cutoff) never re-pays for chapters already fixed BY THIS
 * CAMPAIGN.
 *
 * The generated_at guard is load-bearing, not decorative: validateChapterContent()
 * only checks structural completeness (non-empty, ends in terminal punctuation,
 * no finishReason truncation, no system-prompt fingerprint) — it says nothing
 * about fabrication. Every chapter in REGENERATE_LIST.md is there precisely
 * because its OLD content is fabricated (chapter_len far exceeds source_len,
 * see CHAPTER_TRIAGE.md) yet still reads as fluent, complete prose — so on a
 * chapter-cleanup campaign's first-ever run, most of that old fabricated
 * content would trivially pass the structural check and be silently skipped,
 * never regenerated, while the run log claims "already valid." Confirmed live
 * on this campaign's first run (2026-07-26): chapters last touched on
 * 2026-07-11/07-21 — days before this campaign — were skipped this way before
 * the guard was added. CAMPAIGN_START makes "structurally valid" only count
 * as "already fixed" when the content was actually written by this campaign.
 */

import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import {
  getChapterSourceInfo,
  getChapterById,
  updateChapterContent,
} from "../src/features/handbook/repository";
import { generateChapterForDocument } from "../src/features/handbook/generator";
import { deleteQuestionsForChapter } from "../src/features/quiz/repository";

const MAX_ATTEMPTS = 2;

// Fixed at this chapter-cleanup campaign's actual start (2026-07-26, Director
// go-ahead on the is_published migration + REGENERATE_LIST build). Any
// handbook_chapters row whose generated_at is before this was written by the
// OLD prompt (Sprint 10 initial generation or an earlier ad-hoc regen), not
// by this campaign's corrected proportional-length prompt — see the module
// comment above for why that distinction has to gate the idempotent skip.
// Do not bump this on later resumed runs; it marks the campaign, not the run.
const CAMPAIGN_START = new Date("2026-07-26T00:00:00.000Z");

const LEAK_FINGERPRINTS = [
  "institucionalnih priručnika",
  "markdown",
  "stroga pravila",
  "em-crticu",
  "vaš pisac",
];

type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Same bar a saved chapter must clear whether it was just generated or is
 * already sitting in the database (the idempotent re-check uses this too).
 * Truncation heuristic mirrors the one corrections/TRUNCATED_CHAPTERS.md used
 * (content must end in sentence-terminal punctuation); finishReason is only
 * enforced when the provider actually exposed one, since not every caller
 * (e.g. previously-stored content) has it available.
 */
function validateChapterContent(
  content: string,
  finishReason: string | undefined,
): ValidationResult {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { ok: false, reason: "prazan sadržaj" };
  }

  if (finishReason && finishReason !== "STOP") {
    return {
      ok: false,
      reason: `finishReason="${finishReason}" (očekivano STOP — moguće odsječen izlaz)`,
    };
  }

  if (!/[.!?"»)\]]$/.test(trimmed)) {
    return {
      ok: false,
      reason: "sadržaj se ne završava terminalnom interpunkcijom (moguće odsječen usred rečenice/riječi)",
    };
  }

  const lower = trimmed.toLowerCase();
  for (const fingerprint of LEAK_FINGERPRINTS) {
    if (lower.includes(fingerprint)) {
      return {
        ok: false,
        reason: `sadržaj sadrži fingerprint "${fingerprint}" (curenje system prompta u tekst)`,
      };
    }
  }

  return { ok: true };
}

function extractChapterIds(markdown: string): string[] {
  const matches = markdown.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  );
  return Array.from(new Set(matches ?? []));
}

async function getSourceLenForDocument(documentId: string): Promise<number> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("document_chunks")
    .select("text")
    .eq("document_id", documentId)
    .eq("document_status", "active");

  if (error) throw new Error(`getSourceLenForDocument failed: ${error.message}`);
  return (data ?? []).reduce((sum, chunk) => sum + chunk.text.length, 0);
}

type RegenerationTarget = {
  chapterId: string;
  documentId: string;
  filename: string;
  sourceLen: number;
};

async function loadTargets(listPath: string): Promise<RegenerationTarget[]> {
  const fs = await import("node:fs/promises");
  const raw = await fs.readFile(listPath, "utf-8");
  const chapterIds = extractChapterIds(raw);

  if (chapterIds.length === 0) {
    throw new Error(`Nijedan chapter ID (UUID) nije pronađen u ${listPath}.`);
  }

  console.log(`[Regen] ${chapterIds.length} chapter ID(-ova) pronađeno u ${listPath}.`);

  const targets: RegenerationTarget[] = [];
  for (const chapterId of chapterIds) {
    const info = await getChapterSourceInfo(chapterId);
    if (!info) {
      console.error(
        `GREŠKA: poglavlje ${chapterId} nije pronađeno (ili mu nedostaje izvorni dokument) — preskačem.`,
      );
      continue;
    }
    const sourceLen = await getSourceLenForDocument(info.documentId);
    targets.push({ chapterId, documentId: info.documentId, filename: info.filename, sourceLen });
  }

  // Smallest source first, so a daily quota cutoff buys the most chapters.
  targets.sort((a, b) => a.sourceLen - b.sourceLen);
  return targets;
}

async function main() {
  const listPath = process.argv[2] || "corrections/REGENERATE_LIST.md";
  const targets = await loadTargets(listPath);

  if (targets.length === 0) {
    console.log("[Regen] Nema validnih ciljeva za regeneraciju.");
    return;
  }

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  const failureReasons: string[] = [];

  for (const [index, target] of targets.entries()) {
    console.log(
      `\n[Regen] (${index + 1}/${targets.length}) ${target.filename} (izvor: ${target.sourceLen} znakova)...`,
    );

    try {
      const chapter = await getChapterById(target.chapterId);
      if (!chapter) {
        console.error(`❌ ${target.filename}: poglavlje ${target.chapterId} više ne postoji — preskačem.`);
        failed++;
        failureReasons.push(`${target.filename}: poglavlje ne postoji u bazi`);
        continue;
      }

      const existingCheck = validateChapterContent(chapter.content, undefined);
      const regeneratedThisCampaign = new Date(chapter.generated_at) >= CAMPAIGN_START;
      if (existingCheck.ok && regeneratedThisCampaign) {
        console.log(
          `⏭️  ${target.filename}: već regenerisano ovom kampanjom (${chapter.generated_at}) i zadovoljava validaciju — preskačem bez poziva AI-ja.`,
        );
        skipped++;
        continue;
      }
      if (existingCheck.ok && !regeneratedThisCampaign) {
        console.log(
          `🔄 ${target.filename}: postojeći sadržaj je strukturno validan ali datira prije kampanje (${chapter.generated_at}) — ` +
            `vjerovatno fabrikovan starim promptom (chapter_len ≫ source_len po CHAPTER_TRIAGE.md). Regenerišem.`,
        );
      }

      let saved = false;
      let lastReason = "";

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const result = await generateChapterForDocument(target.documentId, target.filename);
        const check = validateChapterContent(result.content, result.finishReason);

        if (check.ok) {
          await updateChapterContent(target.chapterId, result.content);
          const deletedCount = await deleteQuestionsForChapter(target.chapterId);
          console.log(
            `✅ ${target.filename}: sačuvano (${result.content.length} znakova, pokušaj ${attempt}), ` +
              `obrisano ${deletedCount} starih kviz pitanja.`,
          );
          saved = true;
          succeeded++;
          break;
        }

        lastReason = check.reason;
        console.warn(
          `⚠️  ${target.filename}: pokušaj ${attempt}/${MAX_ATTEMPTS} odbijen — ${check.reason}`,
        );
      }

      if (!saved) {
        console.error(
          `❌ ${target.filename}: neuspješno nakon ${MAX_ATTEMPTS} pokušaja — ${lastReason}. ` +
            `Staro poglavlje NIJE prepisano.`,
        );
        failed++;
        failureReasons.push(`${target.filename}: ${lastReason}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`GREŠKA (${target.filename}): ${message}`);
      failed++;
      failureReasons.push(`${target.filename}: GREŠKA — ${message}`);
    }
  }

  console.log(
    `\n[Regen] Gotovo: ${succeeded} uspješno, ${skipped} preskočeno (već validno), ` +
      `${failed} neuspješno (od ${targets.length} ukupno).`,
  );

  if (failureReasons.length > 0) {
    console.log(`\n[Regen] Razlozi neuspjeha:`);
    failureReasons.forEach((reason) => console.log(`  - ${reason}`));
  }
}

main().catch((err) => {
  console.error("[Regen] Fatal:", err);
  process.exitCode = 1;
});
