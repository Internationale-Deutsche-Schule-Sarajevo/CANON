/**
 * Agenda chapter fix — two-part correction, director-approved (see chat):
 *
 * 1) The stored OCR chunk for Agenda.png (document_id 93799ac1-...) has two
 *    misread words, confirmed by direct visual comparison against the source
 *    image (repo/ASSETS/Agenda.png): "NEKEDA" should be "NEREDA", and
 *    "PRELIJEVANJE RUKU" should be "PRLJANJE RUKU". Every other line was
 *    checked against the image and matches. This is a scoped, evidence-backed
 *    text correction on ONE document_chunks row — not a re-OCR, not a
 *    heuristic guess.
 *
 * 2) handbook_chapters.content for the Agenda chapter (de22f60c-...) is then
 *    regenerated from the corrected chunk text, using a stricter one-off
 *    system prompt (STRICT_SYSTEM_PROMPT below, not generator.ts's shared
 *    SYSTEM_PROMPT) that explicitly forbids inventing any name, title, or
 *    number not literally present in or arithmetically derivable from the
 *    source. Chapter id/order_index untouched (updateChapterContent, in
 *    place). Quiz questions are left alone — not this script's concern.
 *
 * Run: npx tsx --env-file=.env scripts/agenda-fix-ocr-and-regenerate.ts
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { getAIProvider } from "../src/lib/ai/ai-provider.factory";
import { getChapterById, updateChapterContent } from "../src/features/handbook/repository";

const CHAPTER_ID = "de22f60c-53d7-49e6-b335-9774ba5c09f2";
const DOCUMENT_ID = "93799ac1-3b48-4ce9-a954-0e80dd22c29c";

const CORRECTIONS: [string, string][] = [
  ["LABORATORIJA NEKEDA", "LABORATORIJA NEREDA"],
  ["PRELIJEVANJE RUKU", "PRLJANJE RUKU"],
];

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
  "- Zabranjeno je izmišljati bilo koje vlastito ime, naziv sesije, naslov, broj, " +
  "trajanje, datum ili instituciju koji nije doslovno naveden ili jasno izvediv " +
  "(npr. aritmetikom iz eksplicitno navedenih vremena) iz priloženog dokumenta.\n" +
  "- Ako dokument navodi naziv sesije ili stavke doslovno, prenesi ga TAČNO onako " +
  "kako piše, riječ za riječ. Dozvoljena je samo promjena velikih/malih slova radi " +
  "stila rečenice, nikad izmjena ili zamjena same riječi.\n" +
  "- Ako neka stavka rasporeda nema naziv u dokumentu, opiši je opisno (npr. " +
  "'prva jutarnja sesija', 'sesija nakon velikog odmora') umjesto izmišljanja naslova.\n" +
  "- Trajanje neke stavke smiješ navesti SAMO ako se može izračunati iz eksplicitno " +
  "datih vremena početka i kraja u dokumentu (npr. 9:00-10:30 = 90 minuta), nikad " +
  "procjenom.\n" +
  "- Ako nisi siguran da li je neki podatak zaista u dokumentu, izostavi ga radije " +
  "nego da nagađaš ili parafraziraš na način koji mijenja značenje.\n" +
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

  // ── Part 1: correct the two misread words in the stored OCR chunk ──
  const { data: chunks, error: chunkErr } = await supabase
    .from("document_chunks")
    .select("id, chunk_index, text")
    .eq("document_id", DOCUMENT_ID)
    .eq("document_status", "active")
    .order("chunk_index", { ascending: true });
  if (chunkErr) throw new Error(`chunk fetch failed: ${chunkErr.message}`);
  if (!chunks || chunks.length === 0) throw new Error("no active chunks found for Agenda document");

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
    console.warn("[Fix] Nijedna od očekivanih pogrešnih fraza nije pronađena — chunk je možda već ispravljen. Nastavljam.");
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
    "Naziv dokumenta: Agenda.md\n\n" +
    `Sadržaj dokumenta:\n${sourceText}`;

  const result = await ai.generate(userPrompt, STRICT_SYSTEM_PROMPT, {
    maxTokens: 65536,
    temperature: 0.3,
    language: "bs",
  });

  const content = sanitizeGeneratedContent(result.text);
  console.log(`[Regen] finishReason=${result.finishReason ?? "(n/a)"} tokensUsed=${result.tokensUsed}`);

  if (!content.trim()) throw new Error("Generisan prazan sadržaj — ništa nije sačuvano.");

  // ── Validation gate before writing: exact fragments must survive verbatim ──
  const requiredVerbatim = [
    "Laboratorija Nereda",
    "Demaskiranje IBL",
    "Kriteriji za svaku priliku",
    "Veliko finale",
    "Maja Ljubović",
    "14",
  ];
  const missing = requiredVerbatim.filter(
    (frag) => !content.toLowerCase().includes(frag.toLowerCase()),
  );
  const forbidden = ["Nekeda", "prelijevanje ruku"];
  const leaked = forbidden.filter((frag) => content.toLowerCase().includes(frag.toLowerCase()));

  console.log(`\n[Validate] Nedostaju očekivani fragmenti: ${missing.length ? missing.join(", ") : "(nijedan)"}`);
  console.log(`[Validate] Zabranjeni (stari, netačni) fragmenti procurili: ${leaked.length ? leaked.join(", ") : "(nijedan)"}`);

  console.log(`\n${"=".repeat(80)}\n[Regen] NOVI SADRŽAJ (${content.length} znakova) — NIJE JOŠ SAČUVANO, samo prikaz\n${"=".repeat(80)}\n`);
  console.log(content);

  if (leaked.length > 0) {
    console.error("\n❌ Zaustavljam se: stari netačan naziv je i dalje u novom tekstu. Ništa nije sačuvano u handbook_chapters.");
    process.exitCode = 1;
    return;
  }
  if (missing.length > 0) {
    console.error("\n⚠️  Neki očekivani fragmenti nedostaju — pregledaj ručno prije čuvanja. Ništa nije automatski sačuvano.");
    process.exitCode = 1;
    return;
  }

  await updateChapterContent(CHAPTER_ID, content);
  console.log("\n✅ handbook_chapters.content ažuriran in-place (isti id/order_index, quiz_questions netaknut).");

  const updated = await getChapterById(CHAPTER_ID);
  console.log(`\n[Regen] Potvrda iz baze (${updated?.content.length} znakova):\n`);
  console.log(updated?.content);
}

main().catch((err) => {
  console.error("[AgendaFix] Fatal:", err);
  process.exitCode = 1;
});
