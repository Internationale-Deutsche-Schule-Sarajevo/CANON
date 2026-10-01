/**
 * Rjesenje Maturalna Komisija chapter fix — same pattern as
 * scripts/agenda-fix-ocr-and-regenerate.ts, director-approved (see chat).
 *
 * 1) The stored OCR chunk for Rjesenje_Maturalna_Komisija.png (document_id
 *    8a45c97a-c4fd-4e2c-9e11-72552520c5f8) has one misread surname, confirmed
 *    by direct visual comparison against the source image: committee member
 *    #4's surname is "ĐOGIĆ" on the actual document, stored as "DOGIĆ" (lost
 *    diacritic) in document_chunks.text. Every other row/field in the table
 *    and the surrounding legal text was checked against the image and
 *    matches. Scoped single-word correction on the one chunk that contains it.
 *
 * 2) handbook_chapters.content for chapter 36bc0bec-45f9-4a08-b176-23d3c3d2031e
 *    is then regenerated from the corrected chunk text, using the same
 *    strict one-off anti-fabrication system prompt as the Agenda fix (not
 *    generator.ts's shared SYSTEM_PROMPT). Chapter id/order_index untouched.
 *
 * 3) Existing quiz_questions for this chapter are scoped-deleted and
 *    regenerated from the corrected chapter content (same pattern as
 *    scripts/scoped-quiz-fix-ocr-chapters.ts / agenda-scoped-quiz-fix.ts).
 *
 * Explicitly OUT of scope for this script (per director instruction):
 *   - bbbc0750 / 398e9f6d ("Pravila učionice" chapters) — confirmed clean,
 *     not touched, poster glitch in bbbc0750 is original-document behavior.
 *   - Page 2 of Rjesenje Maturalna Komisija (document shows "1 / 2", page 2
 *     was never sourced/OCR'd) — separate decision, not this script's concern.
 *
 * Run: npx tsx --env-file=.env scripts/rjesenje-fix-ocr-and-regenerate.ts
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { getAIProvider } from "../src/lib/ai/ai-provider.factory";
import { getChapterById, updateChapterContent } from "../src/features/handbook/repository";
import { getQuestionCountForChapter, deleteQuestionsForChapter } from "../src/features/quiz/repository";
import { generateQuestionsForChapter } from "../src/features/quiz/generator";

const CHAPTER_ID = "36bc0bec-45f9-4a08-b176-23d3c3d2031e";
const DOCUMENT_ID = "8a45c97a-c4fd-4e2c-9e11-72552520c5f8";

const CORRECTIONS: [string, string][] = [["DOGIĆ MERSIJA", "ĐOGIĆ MERSIJA"]];

const STRICT_SYSTEM_PROMPT =
  "Ti si profesionalni pisac institucionalnih priručnika za nastavnike. " +
  "Pišeš poglavlje za Priručnik za nastavnike P.U. Internationale Deutsche Schule Sarajevo. " +
  "Jezik: bosanski (latinica). Ton: profesionalan, topao, precizan.\n\n" +
  "STROGA PRAVILA FORMATIRANJA:\n" +
  "- Nikada ne koristi Markdown sintaksu: bez #, ##, **, *, -, ili bilo kojih " +
  "drugih Markdown simbola. Piši čist tekst, organizovan u paragrafe.\n" +
  "- Nikada ne koristi em-crticu (—). Koristi zarez ili tačku.\n" +
  "- Nikada ne spominji nazive foldera, kategorija, ili tehničke oznake dokumenata.\n" +
  "- Ne koristi AI fraze ili surogatne formulacije.\n\n" +
  "STROGO PRAVILO TAČNOSTI (najvažnije pravilo, nadjačava sve ostale stilske smjernice):\n" +
  "- Zabranjeno je izmišljati bilo koje vlastito ime, naziv, broj, datum ili instituciju " +
  "koji nije doslovno naveden u priloženom dokumentu.\n" +
  "- Lična imena i prezimena (npr. iz tabele članova komisije) moraju biti prenesena " +
  "TAČNO onako kako pišu u dokumentu, slovo po slovo, uključujući dijakritičke znakove " +
  "(č, ć, đ, š, ž). Nikad ne mijenjaj, ne skraćuj i ne 'normalizuj' ime ili prezime.\n" +
  "- Brojeve članova zakona, brojeve službenih novina, datume i adrese prenesi tačno " +
  "kako piše u dokumentu.\n" +
  "- Ako nisi siguran da li je neki podatak zaista u dokumentu, izostavi ga radije " +
  "nego da nagađaš.\n" +
  "- Nikada ne dopunjavaj tekst sadržajem kojeg nema u dokumentu i nikada ne piši " +
  "o samom zadatku pisanja poglavlja, o pravilima formatiranja, niti se potpisuj.\n\n" +
  "Osnova isključivo dokument koji dobiješ u kontekstu.";

function sanitizeGeneratedContent(text: string): string {
  let result = text;
  result = result.replace(/—/g, ", ");
  result = result.replace(/^[ \t]*[-*][ \t]+/gm, "");
  result = result.replace(/\*\*/g, "").replace(/\*/g, "");
  result = result.replace(/#/g, "");
  result = result.replace(/[ \t]{2,}/g, " ");
  result = result.replace(/[ \t]+$/gm, "");
  result = result.replace(/^[ \t]+/gm, "");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

async function main() {
  const supabase = createSupabaseDirectAdmin();

  // ── Part 1: correct the misread surname in the stored OCR chunk(s) ──
  const { data: chunks, error: chunkErr } = await supabase
    .from("document_chunks")
    .select("id, chunk_index, text")
    .eq("document_id", DOCUMENT_ID)
    .eq("document_status", "active")
    .order("chunk_index", { ascending: true });
  if (chunkErr) throw new Error(`chunk fetch failed: ${chunkErr.message}`);
  if (!chunks || chunks.length === 0) throw new Error("no active chunks found for Rjesenje document");

  let correctedAny = false;
  for (const chunk of chunks) {
    let text = chunk.text;
    for (const [wrong, right] of CORRECTIONS) {
      if (text.includes(wrong)) {
        text = text.split(wrong).join(right);
        correctedAny = true;
        console.log(`[Fix] chunk_index=${chunk.chunk_index}: "${wrong}" -> "${right}"`);
      }
    }
    if (text !== chunk.text) {
      const { error: updErr } = await supabase
        .from("document_chunks")
        .update({ text })
        .eq("id", chunk.id);
      if (updErr) throw new Error(`chunk update failed (id=${chunk.id}): ${updErr.message}`);
    }
  }
  if (!correctedAny) {
    console.warn("[Fix] Očekivana pogrešna fraza nije pronađena — chunk je možda već ispravljen. Nastavljam.");
  }

  // ── Part 2: rebuild the corrected source text and regenerate the chapter ──
  const { data: freshChunks, error: freshErr } = await supabase
    .from("document_chunks")
    .select("text, chunk_index")
    .eq("document_id", DOCUMENT_ID)
    .eq("document_status", "active")
    .order("chunk_index", { ascending: true });
  if (freshErr) throw new Error(`fresh chunk fetch failed: ${freshErr.message}`);

  const sourceText = (freshChunks ?? []).map((c) => c.text).join("\n\n").trim();
  console.log(`\n[Regen] Ispravljeni izvorni tekst (${sourceText.length} znakova):\n${sourceText}\n`);

  const ai = getAIProvider();
  const userPrompt =
    "Napiši poglavlje priručnika isključivo na osnovu sljedećeg dokumenta.\n\n" +
    "Naziv dokumenta: Rjesenje_Maturalna_Komisija.md\n\n" +
    `Sadržaj dokumenta:\n${sourceText}`;

  const result = await ai.generate(userPrompt, STRICT_SYSTEM_PROMPT, {
    maxTokens: 65536,
    temperature: 0.3,
    language: "bs",
  });

  const content = sanitizeGeneratedContent(result.text);
  console.log(`[Regen] finishReason=${result.finishReason ?? "(n/a)"} tokensUsed=${result.tokensUsed}`);

  if (!content.trim()) throw new Error("Generisan prazan sadržaj — ništa nije sačuvano.");

  // ── Validation gate before writing ──
  const requiredVerbatim = [
    "Mulalić",
    "Karaman",
    "Agić",
    "Đogić",
    "Neretljak",
    "Smajić",
    "maturalne komisije",
  ];
  const missing = requiredVerbatim.filter(
    (frag) => !content.toLowerCase().includes(frag.toLowerCase()),
  );
  const forbidden = ["Dogić"]; // wrong spelling without Đ; safe from colliding with "Đogić" (different first char)
  const leaked = forbidden.filter((frag) => content.toLowerCase().includes(frag.toLowerCase()));

  console.log(`\n[Validate] Nedostaju očekivani fragmenti: ${missing.length ? missing.join(", ") : "(nijedan)"}`);
  console.log(`[Validate] Zabranjeni (stari, netačni) fragmenti procurili: ${leaked.length ? leaked.join(", ") : "(nijedan)"}`);

  console.log(`\n${"=".repeat(80)}\n[Regen] NOVI SADRŽAJ (${content.length} znakova) — NIJE JOŠ SAČUVANO, samo prikaz\n${"=".repeat(80)}\n`);
  console.log(content);

  if (leaked.length > 0) {
    console.error("\n❌ Zaustavljam se: stari netačan naziv je i dalje u novom tekstu. Ništa nije sačuvano.");
    process.exitCode = 1;
    return;
  }
  if (missing.length > 0) {
    console.error("\n⚠️  Neki očekivani fragmenti nedostaju — pregledaj ručno prije čuvanja. Ništa nije automatski sačuvano.");
    process.exitCode = 1;
    return;
  }

  await updateChapterContent(CHAPTER_ID, content);
  console.log("\n✅ handbook_chapters.content ažuriran in-place (isti id/order_index, quiz_questions se sada zasebno regenerišu).");

  // ── Part 3: scoped quiz delete + regenerate ──
  const before = await getQuestionCountForChapter(CHAPTER_ID);
  console.log(`\n[Quiz] pitanja prije (za stari, netačan sadržaj): ${before}`);

  const deleted = await deleteQuestionsForChapter(CHAPTER_ID);
  console.log(`[Quiz] obrisano (SCOPED, samo ovaj chapter_id): ${deleted}`);

  const quizResult = await generateQuestionsForChapter(CHAPTER_ID);
  console.log(
    `[Quiz] generisanje: generated=${quizResult.generated} skipped=${quizResult.skipped} ` +
      `invalidCount=${quizResult.invalidCount} error=${quizResult.error ?? "(none)"}`,
  );

  const after = await getQuestionCountForChapter(CHAPTER_ID);
  console.log(`[Quiz] pitanja poslije: ${after}  (očekivano 15)`);

  const { data: questions, error: qErr } = await supabase
    .from("quiz_questions")
    .select("id, question, options")
    .eq("chapter_id", CHAPTER_ID);
  if (qErr) throw qErr;

  // Check for the wrong spelling surviving anywhere: strip correct occurrences
  // of "Đogić" first, then look for a leftover "Dogić".
  const stillBadSimple = (questions ?? []).filter((q) => {
    const blob = JSON.stringify(q);
    // remove correct occurrences first, then check if "Dogić" remains
    const withoutCorrect = blob.replace(/đogić/gi, "");
    return /dogić/i.test(withoutCorrect);
  });
  console.log(`[Quiz] pitanja koja i dalje sadrže staru grešku: ${stillBadSimple.length}`);
  for (const q of stillBadSimple) console.log("  -", q.question);

  console.log("\n=== Sva nova pitanja (za pregled) ===");
  for (const q of questions ?? []) {
    console.log(`- ${q.question}`);
    console.log(`  ${JSON.stringify(q.options)}`);
  }

  const updated = await getChapterById(CHAPTER_ID);
  console.log(`\n[Regen] Potvrda iz baze (${updated?.content.length} znakova):\n`);
  console.log(updated?.content);
}

main().catch((err) => {
  console.error("[RjesenjeFix] Fatal:", err);
  process.exitCode = 1;
});
