/**
 * Quiz Question Generator — Sprint 12 (popravljeno 2026-07-17)
 * Generates 15 quiz questions per chapter via the existing AI provider layer
 * (getAIProvider().generate() -> GeminiKeyManager -> gemini-2.5-flash), same
 * rotation/throttling system used for chapter generation (Sprint 10). Do not
 * instantiate a separate Gemini client here, and do not add an extra
 * sleep/delay between calls — GeminiKeyManager already handles that.
 *
 * ROOT-CAUSE FIX (2026-07-17): maxTokens was 4096. For longer chapters the
 * 15-question JSON exceeded that limit, was truncated mid-array, failed
 * JSON.parse, stored nothing, and the chapter was retried on every run
 * forever (only chapters short enough to fit under 4096 ever succeeded).
 * Fixes: (1) maxTokens 8192, (2) robust JSON-array extraction, (3) one
 * retry on parse/validation failure, (4) LOUD, counted failure logging so
 * silent skips can never masquerade as success again.
 *
 * FOLLOW-UP (chapter-truncation sprint): maxTokens raised again, 8192 -> 65536.
 * 8192 was never an API limit for gemini-2.5-flash, only a self-imposed cap —
 * the real ceiling is 65536, and thinking tokens draw from the same output
 * budget, so 8192 could still truncate a 15-question JSON array for chapters
 * that produce long reasoning traces even after fix (1) above.
 */

import { getAIProvider } from "@/lib/ai/ai-provider.factory";
import { getAllChapters, getChapterById } from "@/features/handbook/repository";
import {
  getQuestionCountForChapter,
  storeQuestions,
  type QuizQuestionInput,
} from "./repository";
import { QuizQuestionSchema } from "./schemas/quiz.schema";

const TARGET_QUESTION_COUNT = 15;
const MAX_GENERATION_ATTEMPTS = 2;

const QUIZ_SYSTEM_PROMPT =
  "Generiši 15 pitanja za kviz na osnovu sljedećeg teksta iz Priručnika za nastavnike IDSS škole. " +
  "Jezik: bosanski. Format: JSON array. Svako pitanje treba imati: question (tekst pitanja), " +
  "options (array od tačno 4 stringa), correctIndex (broj 0-3), explanation (kratko objašnjenje zasnovano " +
  "na tekstu zašto je odgovor tačan). Objašnjenja drži sažetima (jedna do dvije rečenice). " +
  "Vrati ISKLJUČIVO validan JSON array, bez dodatnog teksta prije ili poslije, bez markdown ograda.";

/**
 * Vadi JSON array iz Gemini odgovora robusno: skida ```json ... ``` ograde,
 * pa ako i dalje ima teksta oko arraya, izdvaja od prvog "[" do zadnjeg "]".
 * Vraća null ako array nije pronađen.
 */
function extractJsonArray(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    return cleaned;
  }

  const first = cleaned.indexOf("[");
  const last = cleaned.lastIndexOf("]");
  if (first !== -1 && last !== -1 && last > first) {
    return cleaned.slice(first, last + 1);
  }

  return null;
}

export type GenerateQuestionsResult = {
  chapterId: string;
  generated: number;
  invalidCount: number;
  skipped: boolean;
  error?: string;
};

export async function generateQuestionsForChapter(
  chapterId: string,
): Promise<GenerateQuestionsResult> {
  const existingCount = await getQuestionCountForChapter(chapterId);
  if (existingCount >= TARGET_QUESTION_COUNT) {
    return { chapterId, generated: 0, invalidCount: 0, skipped: true };
  }

  const chapter = await getChapterById(chapterId);
  if (!chapter) {
    return {
      chapterId,
      generated: 0,
      invalidCount: 0,
      skipped: false,
      error: "Poglavlje nije pronađeno.",
    };
  }

  const ai = getAIProvider();
  const userPrompt = `Tekst poglavlja:\n${chapter.content}`;

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const result = await ai.generate(userPrompt, QUIZ_SYSTEM_PROMPT, {
      maxTokens: 65536,
      temperature: 0.5,
      language: "bs",
    });

    const jsonText = extractJsonArray(result.text);
    if (!jsonText) {
      lastError =
        "JSON array nije pronađen u odgovoru (moguće odsječen izlaz).";
      console.error(
        `[QuizGenerator] ⚠️ ${chapter.title}: pokušaj ${attempt}/${MAX_GENERATION_ATTEMPTS} — ${lastError} ` +
          `(dužina odgovora: ${result.text.length} znakova)`,
      );
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      lastError = `JSON parsiranje nije uspjelo: ${
        err instanceof Error ? err.message : String(err)
      }`;
      console.error(
        `[QuizGenerator] ⚠️ ${chapter.title}: pokušaj ${attempt}/${MAX_GENERATION_ATTEMPTS} — ${lastError} ` +
          `(dužina JSON-a: ${jsonText.length} znakova — vjerovatno odsječen)`,
      );
      continue;
    }

    if (!Array.isArray(parsed)) {
      lastError = "Odgovor nije JSON array.";
      console.error(
        `[QuizGenerator] ⚠️ ${chapter.title}: pokušaj ${attempt}/${MAX_GENERATION_ATTEMPTS} — ${lastError}`,
      );
      continue;
    }

    const validQuestions: QuizQuestionInput[] = [];
    let invalidCount = 0;

    for (const item of parsed) {
      const validation = QuizQuestionSchema.safeParse(item);
      if (validation.success) {
        validQuestions.push(validation.data);
      } else {
        invalidCount++;
      }
    }

    if (validQuestions.length === 0) {
      lastError = `Nijedno validno pitanje (${invalidCount} neispravnih).`;
      console.error(
        `[QuizGenerator] ⚠️ ${chapter.title}: pokušaj ${attempt}/${MAX_GENERATION_ATTEMPTS} — ${lastError}`,
      );
      continue;
    }

    await storeQuestions(chapterId, validQuestions);
    console.log(
      `[QuizGenerator] ✅ ${chapter.title}: ${validQuestions.length} pitanja sačuvano ` +
        `(${invalidCount} neispravnih, pokušaj ${attempt})`,
    );
    return {
      chapterId,
      generated: validQuestions.length,
      invalidCount,
      skipped: false,
    };
  }

  // Svi pokušaji iscrpljeni — glasno prijavi, nikad tiho preskoči.
  console.error(
    `[QuizGenerator] ❌ NEUSPJEH nakon ${MAX_GENERATION_ATTEMPTS} pokušaja: ${lastError}`,
  );
  return {
    chapterId,
    generated: 0,
    invalidCount: 0,
    skipped: false,
    error: lastError,
  };
}

export type GenerateAllQuestionsResult = {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  errors: string[];
};

/** Loops through every existing chapter; generateQuestionsForChapter() itself skips ones that already have >= 15 questions. */
export async function generateAllQuizQuestions(): Promise<GenerateAllQuestionsResult> {
  const chapters = await getAllChapters();

  console.log(
    `[QuizGenerator] Provjera pitanja za ${chapters.length} poglavlja...`,
  );

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const [index, chapter] of chapters.entries()) {
    console.log(
      `[QuizGenerator] (${index + 1}/${chapters.length}) ${chapter.title}...`,
    );

    try {
      const result = await generateQuestionsForChapter(chapter.id);
      if (result.error) {
        failed++;
        errors.push(`${chapter.title}: ${result.error}`);
      } else if (result.skipped) {
        skipped++;
      } else {
        succeeded++;
      }
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[QuizGenerator] GREŠKA (${chapter.title}): ${message}`);
      errors.push(`${chapter.title}: ${message}`);
    }
  }

  console.log(
    `[QuizGenerator] Gotovo: ${succeeded} generisano, ${skipped} preskočeno, ${failed} neuspješno`,
  );
  if (failed > 0) {
    console.error(
      `[QuizGenerator] ${failed} poglavlja i dalje BEZ pitanja. Prvih 10 razloga:\n` +
        errors.slice(0, 10).join("\n"),
    );
  }

  return { total: chapters.length, succeeded, skipped, failed, errors };
}
