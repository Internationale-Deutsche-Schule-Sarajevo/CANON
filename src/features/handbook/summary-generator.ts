/**
 * Handbook Chapter Summary Generator — "Pročitaj više" feature.
 * Summarizes an ALREADY-APPROVED, ALREADY-STORED handbook_chapters.content
 * row — never the source document or document_chunks directly. This is a
 * pure compression step on top of content that has already passed through
 * generateChapterForDocument()'s own no-fabrication discipline, not a second
 * independent pass over source material.
 *
 * Uses the same getAIProvider() -> GeminiKeyManager path as generator.ts —
 * do not instantiate a separate Gemini client here.
 */
import { getAIProvider } from "@/lib/ai/ai-provider.factory";
import { validateSummary, type ValidationResult } from "./summary-validation";

export const SUMMARY_SYSTEM_PROMPT =
  "Ti si precizan sažimač teksta za internu upotrebu u P.U. Internationale Deutsche Schule Sarajevo. " +
  "Tvoj jedini zadatak je da sažmeš tekst koji dobiješ, na bosanskom jeziku (latinica).\n\n" +
  "STROGO PRAVILO (najvažnije, nadjačava sve ostalo):\n" +
  "- Smiješ SAMO kompresovati postojeći tekst. Ne smiješ dodati nijednu činjenicu, " +
  "broj, ime, primjer ili tvrdnju koja nije doslovno već prisutna u tekstu koji dobiješ.\n" +
  "- Ne tumači, ne izvodi zaključke, ne uopštavaj izvan onoga što piše.\n" +
  "- Ako tekst navodi konkretan broj, rok ili naziv koji je centralan za poglavlje, " +
  "sažetak ga treba zadržati; sitne detalje i primjere smiješ izostaviti.\n" +
  "- Dužina: 2 do 4 rečenice (otprilike 250-450 znakova) — ovo je vodilja za tekst " +
  "bez spiska poimenično navedenih osoba, NE tvrd limit u svim slučajevima (vidi " +
  "izuzetak niže). Jedan pasus, bez naslova, bez nabrajanja, bez Markdown sintakse.\n" +
  "- IZUZETAK OD DUŽINE: Ako tekst poimenično navodi osobe u zvaničnoj ulozi (npr. " +
  "članovi komisije, potpisnici, odgovorne osobe), sažetak MORA navesti SVA ta imena " +
  "i njihove uloge, čak i ako to znači da sažetak bude duži od uobičajenog.\n" +
  "- Ne piši o samom zadatku sažimanja, ne potpisuj se, ne dodaji uvodne fraze " +
  "(\"Ovo poglavlje govori o...\").\n\n" +
  "Vrati ISKLJUČIVO sažetak, ništa drugo.";

export type SummaryGenerationResult =
  | { ok: true; summary: string }
  | { ok: false; reasons: string[]; attemptedSummary: string };

/**
 * Generates and validates a summary for one chapter's content. Returns the
 * validation verdict alongside the attempted text — callers decide whether
 * to write (ok=true), skip (ok=false), or retry. Never writes to the DB
 * itself — see repository.ts's updateChapterSummary().
 */
export async function generateSummaryForChapter(content: string): Promise<SummaryGenerationResult> {
  const ai = getAIProvider();
  const userPrompt = `Sažmi sljedeće poglavlje priručnika:\n\n${content}`;

  // maxTokens history from Wave A live testing:
  //  - 512 failed 4/4 (finishReason=MAX_TOKENS, 60-76 visible chars).
  //  - 8192 fixed a few chapters but then hit a long consecutive run of the
  //    same MAX_TOKENS failure (12+ in a row) on later, denser chapters.
  // Root cause: gemini-provider.ts sets no thinkingConfig, so gemini-2.5-
  // flash's internal "thinking" tokens draw from the same maxOutputTokens
  // budget as the final answer. Unlike OCR/translation (output length scales
  // with INPUT length, so 8192 headroom is proportionate), a summary's
  // desired OUTPUT is always tiny (2-4 sentences) regardless of input size —
  // but the THINKING needed to compress a large/dense source (chapters run
  // up to ~122,000 chars) scales with the input, not the output. 65536 (the
  // same ceiling generator.ts already uses for full chapter generation) just
  // gives that reasoning room to finish; the validator's MAX_SUMMARY_LENGTH
  // check still catches any answer that comes back too long.
  // temperature is a fixed union (0.3 | 0.5 | 0.7) on the provider interface
  // — 0.3 is the lowest available, same as generator.ts/translation use.
  const result = await ai.generate(userPrompt, SUMMARY_SYSTEM_PROMPT, {
    maxTokens: 65536,
    temperature: 0.3,
    language: "bs",
  });

  const summary = result.text.trim();
  const verdict: ValidationResult = validateSummary(content, summary, result.finishReason);

  if (!verdict.ok) {
    return { ok: false, reasons: verdict.reasons, attemptedSummary: summary };
  }
  return { ok: true, summary };
}
