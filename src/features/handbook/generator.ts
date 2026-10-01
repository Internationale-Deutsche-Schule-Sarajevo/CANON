/**
 * Handbook Chapter Generator — Sprint 10
 * Generates one Handbook chapter per active document via the existing AI provider
 * layer (getAIProvider().generate() -> GeminiKeyManager -> gemini-2.5-flash).
 * Do not instantiate a separate Gemini client here, and do not add an extra
 * sleep/delay between calls — GeminiKeyManager already rotates across 8 keys and
 * handles HTTP 429 throttling/queueing internally (see gemini-key-manager.ts).
 *
 * Content source: concatenated document_chunks text (chunk_index order), not the
 * local repo/ files. This works uniformly for both legacy USTAV imports
 * (local-disk-backed) and Sprint 09 admin uploads (Supabase-Storage-backed)
 * without the generator needing to know which storage origin a document came from.
 *
 * NOTE: stored chapter content may still contain raw Markdown syntax (##, **, ---
 * etc.) if Gemini includes it despite the system prompt's instruction not to.
 * Sprint 11 (Handbook reader) is responsible for stripping/rendering that cleanly —
 * this sprint stores whatever text comes back as-is.
 */

import { getAIProvider } from "@/lib/ai/ai-provider.factory";
import { stripFrontmatter } from "@/lib/rag/frontmatter";
import {
  getActiveDocuments,
  getDocumentsWithoutChapters,
  getGeneratedChaptersCount,
  getChunkTextForDocument,
  deleteChapterForDocument,
  storeChapter,
  updateChapterSummary,
  type ActiveDocumentSummary,
} from "./repository";
import { generateSummaryForChapter } from "./summary-generator";

const SYSTEM_PROMPT =
  "Ti si profesionalni pisac institucionalnih priručnika za nastavnike. " +
  "Pišeš poglavlje za Priručnik za nastavnike P.U. Internationale Deutsche Schule Sarajevo. " +
  "Jezik: bosanski (latinica). Ton: profesionalan, topao, precizan.\n\n" +
  "STROGA PRAVILA FORMATIRANJA:\n" +
  "- Nikada ne koristi Markdown sintaksu: bez #, ##, **, *, -, ili bilo kojih " +
  "drugih Markdown simbola. Piši čist tekst, organizovan u paragrafe.\n" +
  "- Nikada ne koristi em-crticu (—). Koristi zarez ili tačku.\n" +
  "- Nikada ne spominji nazive foldera, kategorija, ili tehničke oznake " +
  "dokumenata (npr. '02_NASTAVNIK') u sadržaju.\n" +
  "- Ne koristi AI fraze ili surogatne formulacije.\n" +
  "- Dužina: između 8.000 i 14.000 znakova, ali SAMO ako izvorni dokument ima " +
  "dovoljno sadržaja za to. Ako je dokument kratak, poglavlje mora biti " +
  "srazmjerno kraće.\n" +
  "- OBAVEZNO SAČUVAJ SVE PROVJERLJIVE PODATKE iz izvornog dokumenta: brojeve, " +
  "omjere, procente, pragove, rokove, nazive institucija i reference na članove " +
  "i odluke. Ako dokument navodi konkretan broj ili rok, on se mora pojaviti u " +
  "poglavlju. Prozu skrati, podatke nikad.\n" +
  "- Nikada ne dopunjavaj tekst sadržajem kojeg nema u dokumentu i nikada ne piši " +
  "o samom zadatku pisanja poglavlja, o pravilima formatiranja, niti se potpisuj.\n" +
  "- Sadržaj mora prirodno uključivati opis barem jednog procesa.\n\n" +
  "Osnova isključivo dokumenti koje dobiješ u kontekstu.";

export type GenerateAllChaptersResult = {
  total: number;
  succeeded: number;
  failed: number;
  errors: string[];
};

function deriveTitle(filename: string): string {
  const withoutExt = filename.replace(/\.[^./]+$/, "");
  const spaced = withoutExt.replace(/[_-]+/g, " ").trim();
  return spaced.length > 0 ? spaced : filename;
}

/**
 * Post-processing safety net: the system prompt tells Gemini not to use Markdown,
 * but gemini-2.5-flash doesn't reliably comply (observed: ** bold survives on some
 * generations). Strip known artifacts as a guaranteed cleanup pass rather than
 * relying on prompt compliance alone. Not a full Markdown parser by design —
 * just the specific artifacts observed in testing.
 */
function sanitizeGeneratedContent(text: string): string {
  let result = text;

  // Em-dash -> comma (simplest universal replacement)
  result = result.replace(/—/g, ", ");

  // Leading "- " or "* " bullet markers, per line — keep the text, drop the marker
  result = result.replace(/^[ \t]*[-*][ \t]+/gm, "");

  // Bold/italic markers — keep the enclosed text, drop the asterisks
  result = result.replace(/\*\*/g, "").replace(/\*/g, "");

  // Heading markers (any level)
  result = result.replace(/#/g, "");

  // Collapse whitespace artifacts left behind by the stripping above
  result = result.replace(/[ \t]{2,}/g, " ");
  result = result.replace(/[ \t]+$/gm, "");
  result = result.replace(/^[ \t]+/gm, "");
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

/**
 * Exported (not just used internally by generateAllChapters) so test scripts and
 * ad-hoc tooling can generate a single chapter without going through the full
 * batch pipeline or the API route.
 */
export async function generateChapterForDocument(
  documentId: string,
  filename: string,
): Promise<{ title: string; content: string; finishReason?: string }> {
  const rawContent = await getChunkTextForDocument(documentId);
  const content = stripFrontmatter(rawContent).trim();
  if (!content) {
    throw new Error("Dokument nema nijedan aktivan chunk sadržaja.");
  }

  const ai = getAIProvider();
  const userPrompt =
    "Napiši poglavlje priručnika isključivo na osnovu sljedećeg dokumenta.\n\n" +
    `Naziv dokumenta: ${filename}\n\n` +
    `Sadržaj dokumenta:\n${content}`;

  const result = await ai.generate(userPrompt, SYSTEM_PROMPT, {
    maxTokens: 65536,
    temperature: 0.3,
    language: "bs",
  });

  return {
    title: deriveTitle(filename),
    content: sanitizeGeneratedContent(result.text),
    finishReason: result.finishReason,
  };
}

/**
 * Generate chapters for all active documents.
 * Idempotent by default — documents that already have a chapter are skipped, and
 * new order_index values continue after the current chapter count.
 * Pass forceRegenerate=true to delete and rebuild every chapter from scratch,
 * renumbering order_index 0..N-1 in document import/approval order.
 */
export async function generateAllChapters(
  forceRegenerate = false,
): Promise<GenerateAllChaptersResult> {
  const targets: ActiveDocumentSummary[] = forceRegenerate
    ? await getActiveDocuments()
    : await getDocumentsWithoutChapters();

  console.log(
    `[HandbookGenerator] ${forceRegenerate ? "Force regenerating" : "Generating"} ` +
      `${targets.length} chapter(s)...`,
  );

  if (targets.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, errors: [] };
  }

  let orderIndex = forceRegenerate ? 0 : await getGeneratedChaptersCount();
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const doc of targets) {
    console.log(
      `[HandbookGenerator] (${succeeded + failed + 1}/${targets.length}) ${doc.filename}...`,
    );

    try {
      if (forceRegenerate) {
        await deleteChapterForDocument(doc.id);
      }

      const { title, content } = await generateChapterForDocument(doc.id, doc.filename);
      const chapterId = await storeChapter(doc.id, title, content, orderIndex);

      console.log(`[HandbookGenerator] OK: ${doc.filename} (${content.length} znakova)`);

      // "Pročitaj više" sažetak, isti obrazac kao samo poglavlje — best-effort:
      // neuspjeh ovdje ne smije poništiti već upisano poglavlje. Chapter ostaje
      // punopravan (i dalje ima puni content) bez sažetka do sljedećeg ručnog
      // pokretanja scripts/generate-chapter-summaries.ts (summary IS NULL je
      // resume filter tamo).
      try {
        const summaryResult = await generateSummaryForChapter(content);
        if (summaryResult.ok) {
          await updateChapterSummary(chapterId, summaryResult.summary);
          console.log(`[HandbookGenerator] Sažetak OK: ${doc.filename} (${summaryResult.summary.length} znakova)`);
        } else {
          console.warn(
            `[HandbookGenerator] Sažetak ODBIJEN za ${doc.filename} (chapter i dalje ima puni tekst): ${summaryResult.reasons.join("; ")}`,
          );
        }
      } catch (summaryErr) {
        console.warn(
          `[HandbookGenerator] Generisanje sažetka neuspješno za ${doc.filename} (chapter i dalje ima puni tekst): ${(summaryErr as Error).message}`,
        );
      }

      succeeded++;
      orderIndex++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[HandbookGenerator] GREŠKA (${doc.filename}): ${message}`);
      errors.push(`${doc.filename}: ${message}`);
      failed++;
    }
  }

  console.log(
    `[HandbookGenerator] Gotovo: ${succeeded}/${targets.length} uspješno, ${failed} neuspješno`,
  );

  return { total: targets.length, succeeded, failed, errors };
}
