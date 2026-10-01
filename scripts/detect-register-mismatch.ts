/**
 * Read-only — identifies which of the 413 (52 njemački + 361 engleski)
 * chunks share Pravila-I-IV's STRUKTURNI problem: kratka lista izjava u
 * 1. licu/imperativu ("Ich komme pünktlich." / "I arrive on time.") umjesto
 * formalne proze. Ovo je fuzzy heuristika (ne jezička detekcija kao franc)
 * — svaki kandidat se ispisuje s punim tekstom radi ljudske provjere prije
 * generisanja bilo kakvog drugog bridge sloja.
 *
 * Signal: udio rečenica koje počinju ličnom zamjenicom/imperativom (Ich/I/
 * Wir/We/Kein/No...) unutar KRATKOG chunka (malo rečenica, kratke rečenice).
 * Ne oslanja se samo na jedan marker jer stvarna pravila mogu biti pisana
 * i bez zamjenice ("Kein Handy im Unterricht.").
 */
import { franc } from "franc";
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { stripFrontmatter } from "../src/lib/rag/frontmatter";

const MIN_WORD_TOKENS = 5;
const PAGE_SIZE = 1000;

function countWordTokens(text: string): number {
  const matches = text.match(/[A-Za-zÀ-ſ]{3,}/g);
  return matches ? matches.length : 0;
}

type Row = { id: string; document_id: string; chunk_index: number; text: string };

async function fetchAllActiveChunks(): Promise<Row[]> {
  const supabase = createSupabaseDirectAdmin();
  const all: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("document_chunks")
      .select("id, document_id, chunk_index, text")
      .eq("document_status", "active")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`fetch failed at offset ${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

const FIRST_PERSON_IMPERATIVE_MARKERS =
  /^(ich|wir|kein|keine|nein|sei|seid|i|we|no|don't|do not|never|always)\b/i;

type Analysis = {
  row: Row;
  lang: "deu" | "eng";
  sentenceCount: number;
  matchingCount: number;
  ratio: number;
  avgWordsPerSentence: number;
  isCandidate: boolean;
};

function analyze(source: string, lang: "deu" | "eng"): Omit<Analysis, "row" | "lang"> {
  // Split on sentence-enders and newlines/numbering markers (OCR'd posters
  // often number each line: "1 Ich komme..." "2 Ich grüße...").
  const rawSentences = source
    .split(/(?<=[.!?])\s+|\n+|(?<=\D)(?=\b\d{1,2}\s+[A-ZÄÖÜ])/g)
    .map((s) => s.replace(/^\d{1,2}\s+/, "").trim())
    .filter((s) => s.length >= 3);

  if (rawSentences.length === 0) {
    return { sentenceCount: 0, matchingCount: 0, ratio: 0, avgWordsPerSentence: 0, isCandidate: false };
  }

  const matching = rawSentences.filter((s) => FIRST_PERSON_IMPERATIVE_MARKERS.test(s));
  const totalWords = rawSentences.reduce((sum, s) => sum + (s.match(/\S+/g)?.length ?? 0), 0);
  const avgWords = totalWords / rawSentences.length;
  const ratio = matching.length / rawSentences.length;

  // Candidate: majority of sentences are short first-person/imperative
  // statements, AND the chunk as a whole is short (a handful of such lines,
  // not a long document that merely contains one "I" sentence somewhere).
  const isCandidate = ratio >= 0.4 && rawSentences.length <= 25 && avgWords <= 12 && matching.length >= 2;

  return { sentenceCount: rawSentences.length, matchingCount: matching.length, ratio, avgWordsPerSentence: avgWords, isCandidate };
}

async function main() {
  const allChunks = await fetchAllActiveChunks();

  const nonBosnian: { row: Row; lang: "deu" | "eng" }[] = [];
  for (const row of allChunks) {
    const stripped = stripFrontmatter(row.text);
    if (countWordTokens(stripped) < MIN_WORD_TOKENS) continue;
    const detected = franc(stripped, { minLength: 10 });
    if (detected === "deu") nonBosnian.push({ row, lang: "deu" });
    else if (detected === "eng") nonBosnian.push({ row, lang: "eng" });
  }

  console.log(`[Register] Njemački+engleski chunkovi ukupno: ${nonBosnian.length} (očekivano 413)`);

  const analyzed: Analysis[] = nonBosnian.map(({ row, lang }) => {
    const source = stripFrontmatter(row.text);
    const a = analyze(source, lang);
    return { row, lang, ...a };
  });

  const candidates = analyzed.filter((a) => a.isCandidate);
  const candidateDocIds = new Set(candidates.map((c) => c.row.document_id));

  console.log(`\n=== REZULTAT ===`);
  console.log(`Kandidati za register-mismatch (kratka lista 1. lica/imperativa): ${candidates.length} chunkova`);
  console.log(`Distinct dokumenata: ${candidateDocIds.size}`);

  console.log(`\n=== SPISAK KANDIDATA (pun tekst za tvoj pregled) ===`);
  for (const c of candidates) {
    console.log(
      `\n  doc=${c.row.document_id} chunk=${c.row.id} #${c.row.chunk_index} lang=${c.lang} ` +
        `ratio=${c.ratio.toFixed(2)} (${c.matchingCount}/${c.sentenceCount} rečenica) avgWords=${c.avgWordsPerSentence.toFixed(1)}`,
    );
    console.log(`  ${stripFrontmatter(c.row.text).slice(0, 400).replace(/\n/g, " | ")}`);
  }

  // Document titles, for readable review.
  const supabase = createSupabaseDirectAdmin();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, original_name")
    .in("id", Array.from(candidateDocIds));
  console.log(`\n=== DOKUMENTI ===`);
  for (const d of docs ?? []) {
    console.log(`  ${d.id}  ${d.original_name}`);
  }
}

main().catch((err) => {
  console.error("[Register] Fatal:", err);
  process.exitCode = 1;
});
