/**
 * Single-chapter regeneration — truncation fix, quiz-preserving variant.
 *
 * Same content-regeneration path as regenerate-truncated.ts (generateChapterForDocument
 * -> maxTokens 65536, fact-preserving SYSTEM_PROMPT in src/features/handbook/generator.ts
 * -> updateChapterContent, in-place, id/order_index untouched), but deliberately
 * DOES NOT call deleteQuestionsForChapter(). This run's guardrail is "delete nothing" —
 * the chapter's existing quiz_questions rows are left alone, and the script confirms
 * the count is unchanged afterward rather than wiping and expecting a later regen.
 *
 * Run: npx tsx --env-file=.env scripts/regenerate-single-preserve-quiz.ts <chapterId>
 */
import {
  getChapterSourceInfo,
  getChapterById,
  updateChapterContent,
} from "../src/features/handbook/repository";
import { generateChapterForDocument } from "../src/features/handbook/generator";
import { getQuestionCountForChapter } from "../src/features/quiz/repository";

const MAX_ATTEMPTS = 2;

type ValidationResult = { ok: true } | { ok: false; reason: string };

function validateChapterContent(
  content: string,
  finishReason: string | undefined,
): ValidationResult {
  const trimmed = content.trim();
  if (trimmed.length === 0) return { ok: false, reason: "prazan sadržaj" };
  if (finishReason && finishReason !== "STOP") {
    return {
      ok: false,
      reason: `finishReason="${finishReason}" (očekivano STOP)`,
    };
  }
  if (!/[.!?"»)\]]$/.test(trimmed)) {
    return {
      ok: false,
      reason: "sadržaj se ne završava terminalnom interpunkcijom",
    };
  }
  return { ok: true };
}

async function main() {
  const chapterId = process.argv[2];
  if (!chapterId) {
    console.error("Usage: regenerate-single-preserve-quiz.ts <chapterId>");
    process.exit(1);
  }

  const info = await getChapterSourceInfo(chapterId);
  if (!info) throw new Error(`Poglavlje ${chapterId} nije pronađeno.`);

  const before = await getChapterById(chapterId);
  if (!before) throw new Error(`getChapterById vratio null za ${chapterId}.`);
  const questionsBefore = await getQuestionCountForChapter(chapterId);

  console.log(`[Regen1] ${info.filename}`);
  console.log(`  trenutna dužina: ${before.content.length} znakova, kviz pitanja: ${questionsBefore}`);
  console.log(`  trenutni kraj: "${before.content.trim().slice(-80)}"`);

  let saved = false;
  let lastReason = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n[Regen1] Pokušaj ${attempt}/${MAX_ATTEMPTS}...`);
    const result = await generateChapterForDocument(info.documentId, info.filename);
    const check = validateChapterContent(result.content, result.finishReason);

    if (check.ok) {
      await updateChapterContent(chapterId, result.content);
      console.log(
        `✅ Sačuvano in-place (${result.content.length} znakova). Ništa iz quiz_questions nije obrisano.`,
      );
      saved = true;
      break;
    }

    lastReason = check.reason;
    console.warn(`⚠️  Odbijen: ${check.reason}`);
  }

  if (!saved) {
    console.error(`❌ Neuspješno nakon ${MAX_ATTEMPTS} pokušaja — ${lastReason}. Staro poglavlje NIJE prepisano.`);
    process.exitCode = 1;
    return;
  }

  const after = await getChapterById(chapterId);
  const questionsAfter = await getQuestionCountForChapter(chapterId);

  console.log(`\n[Regen1] Provjera poslije:`);
  console.log(`  novi kraj: "${after?.content.trim().slice(-80)}"`);
  console.log(`  završava terminalnom interpunkcijom: ${/[.!?"»)\]]$/.test(after?.content.trim() ?? "")}`);
  console.log(`  kviz pitanja prije: ${questionsBefore}  poslije: ${questionsAfter}  (očekivano jednako)`);
}

main().catch((err) => {
  console.error("[Regen1] Fatal:", err);
  process.exitCode = 1;
});
