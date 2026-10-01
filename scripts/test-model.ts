/**
 * One-off model comparison script — evaluating replacement models for
 * gemini-2.5-flash (Google's pre-shutdown 404 on projects without prior usage).
 *
 * Does NOT touch gemini-provider.ts, the quiz generator, the handbook chapter
 * generator, or any production model string. Does NOT write to the database —
 * read-only chapter/document lookup, console output only. Safe to delete once
 * the replacement model is chosen.
 *
 * Two modes, sharing the same 3 chapters of differing lengths (short ~2k,
 * medium ~9k, long ~20k+ chars, picked from handbook_chapters):
 *
 *   quiz    (default) — same QUIZ_SYSTEM_PROMPT + generationConfig
 *                        (maxOutputTokens 8192, temperature 0.5) as
 *                        src/features/quiz/generator.ts. Validates output as
 *                        a 15-question JSON array.
 *   chapter            — same SYSTEM_PROMPT + generationConfig
 *                        (maxOutputTokens 8192, temperature 0.3) as
 *                        src/features/handbook/generator.ts. Source text is
 *                        the underlying document's chunk text (not the
 *                        already-generated handbook_chapters.content), same
 *                        as generateChapterForDocument() uses. Prints the
 *                        full generated chapter text for eyeballing.
 *
 * Prompts/options are duplicated here (not imported) since neither generator
 * file exports them and this script must not modify production code. Keys
 * come from the existing GeminiKeyManager (no hardcoded key, no separate
 * key-rotation logic).
 *
 * Run (Windows CMD):
 *   set NODE_OPTIONS=--env-file=.env && npx tsx scripts/test-model.ts gemini-2.5-flash
 *   set NODE_OPTIONS=--env-file=.env && npx tsx scripts/test-model.ts gemini-3.5-flash chapter
 *   set NODE_OPTIONS=--env-file=.env && npx tsx scripts/test-model.ts gemini-3.1-flash-lite chapter 65536 longest
 *
 * (NODE_OPTIONS="--env-file=.env" is rejected by this Node version — pass
 * --env-file=.env directly to tsx instead, e.g.
 * npx tsx --env-file=.env scripts/test-model.ts <model> [quiz|chapter] [maxTokens] [default|longest])
 *
 * Arguments:
 *   model      required — Gemini model string
 *   mode       "quiz"|"chapter", default "quiz"
 *   maxTokens  integer, default 8192 (generationConfig.maxOutputTokens — the
 *              official per-model ceiling is 65536 for gemini-2.5-flash,
 *              gemini-3.5-flash, and gemini-3.1-flash-lite; 8192 is a
 *              self-imposed cap from generator.ts/quiz generator.ts, not an
 *              API limit. This is a raw request-body number, NOT
 *              GenerateOptions.maxTokens — that production type stays a
 *              512|2048|4096|8192 union; widening it is out of scope here.)
 *   chapterSet "default"|"longest", chapter mode only, default "default".
 *              "longest" targets the 3 specific documents most affected by
 *              8192 truncation in production (by underlying source-document
 *              size, not generated-chapter size — a truncated chapter looks
 *              short in handbook_chapters.content even though its source was
 *              huge): "Pravilnik o provođenju mjera odgojno obrazovne
 *              podrške", "Pedagoški standardi i normativi", "IDSS
 *              Safeguariing Policy BHS Final".
 */

import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { getKeyManager } from "../src/lib/ai/providers/gemini-key-manager";
import { getChunkTextForDocument } from "../src/features/handbook/repository";
import {
  QuizQuestionSchema,
  type QuizQuestionGenerated,
} from "../src/features/quiz/schemas/quiz.schema";

const GENERATION_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Verbatim copy of src/features/quiz/generator.ts QUIZ_SYSTEM_PROMPT — do not
// let this drift from the production string, but do not import/export it
// from generator.ts either (out of scope for this one-off script).
const QUIZ_SYSTEM_PROMPT =
  "Generiši 15 pitanja za kviz na osnovu sljedećeg teksta iz Priručnika za nastavnike IDSS škole. " +
  "Jezik: bosanski. Format: JSON array. Svako pitanje treba imati: question (tekst pitanja), " +
  "options (array od tačno 4 stringa), correctIndex (broj 0-3), explanation (kratko objašnjenje zasnovano " +
  "na tekstu zašto je odgovor tačan). Objašnjenja drži sažetima (jedna do dvije rečenice). " +
  "Vrati ISKLJUČIVO validan JSON array, bez dodatnog teksta prije ili poslije, bez markdown ograda.";

// Verbatim copy of src/features/handbook/generator.ts SYSTEM_PROMPT.
const CHAPTER_SYSTEM_PROMPT =
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
  "- Minimalno 3.000 znakova.\n" +
  "- Sadržaj mora prirodno uključivati opis barem jednog procesa.\n\n" +
  "Osnova isključivo dokumenti koje dobiješ u kontekstu.";

// Test-only variant of CHAPTER_SYSTEM_PROMPT — NOT used by production
// generator.ts. Hypothesis: the length instability (20K/140K/200K on the same
// document) and the fidelity gap are prompt artifacts, not model properties —
// the production prompt sets only a floor ("Minimalno 3.000 znakova.") with no
// ceiling and never asks for factual preservation at all. This variant swaps
// the floor for a target range and adds an explicit instruction to keep every
// checkable number/ratio/deadline/reference, everything else identical.
const CHAPTER_SYSTEM_PROMPT_FIXED =
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
  "- Dužina: između 8.000 i 14.000 znakova.\n" +
  "- Sadržaj mora prirodno uključivati opis barem jednog procesa.\n" +
  "- OBAVEZNO SAČUVAJ SVE PROVJERLJIVE PODATKE iz izvornog dokumenta: brojeve, " +
  "omjere, procente, pragove, rokove, nazive institucija i reference na članove " +
  "i odluke. Ako dokument navodi konkretan broj ili rok, on se mora pojaviti u " +
  "poglavlju. Prozu skrati, podatke nikad.\n\n" +
  "Osnova isključivo dokumenti koje dobiješ u kontekstu.";

// Verbatim copy of src/features/quiz/generator.ts extractJsonArray().
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

// Verbatim copy of src/features/handbook/generator.ts stripFrontmatter().
function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "");
}

// Verbatim copy of src/features/handbook/generator.ts sanitizeGeneratedContent().
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

type CandidateChapter = {
  id: string;
  title: string;
  content: string;
  length: number;
  documentId: string;
};

type ChapterPick = {
  label: string;
  chapter: CandidateChapter;
};

async function pickThreeChapters(): Promise<ChapterPick[]> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("handbook_chapters")
    .select("id, title, content, document_id")
    .order("order_index", { ascending: true });

  if (error) throw new Error(`Failed to fetch chapters: ${error.message}`);
  if (!data || data.length === 0) throw new Error("No chapters found in handbook_chapters.");

  const chapters: CandidateChapter[] = data.map((c) => ({
    id: c.id,
    title: c.title,
    content: c.content,
    length: c.content.length,
    documentId: c.document_id,
  }));

  const closestTo = (target: number, excludeIds: Set<string>) => {
    const pool = chapters.filter((c) => !excludeIds.has(c.id));
    return pool.reduce((best, c) =>
      Math.abs(c.length - target) < Math.abs(best.length - target) ? c : best,
    );
  };

  const used = new Set<string>();

  const short = closestTo(2000, used);
  used.add(short.id);

  const medium = closestTo(9000, used);
  used.add(medium.id);

  // "long ~20k+": prefer the closest chapter AT or ABOVE 20k; fall back to
  // the single longest remaining chapter if nothing reaches 20k.
  const remaining = chapters.filter((c) => !used.has(c.id));
  const atOrAbove20k = remaining.filter((c) => c.length >= 20000);
  const long =
    atOrAbove20k.length > 0
      ? atOrAbove20k.reduce((best, c) => (c.length < best.length ? c : best))
      : remaining.reduce((best, c) => (c.length > best.length ? c : best));

  return [
    { label: "short (~2k)", chapter: short },
    { label: "medium (~9k)", chapter: medium },
    { label: "long (~20k+)", chapter: long },
  ];
}

// Named test documents spanning the corpus size distribution (median 23,642
// chars, 360/382 docs under 100k, 1/382 over 300k). The first 3 were the
// truncation-affected tail (identified by underlying SOURCE document size, not
// handbook_chapters.content length — a truncated chapter's stored content is
// short precisely BECAUSE generation got cut off, so ranking by generated
// length would miss them). The last 2 fill the median/mid-size gap.
const LONGEST_CHAPTER_TITLE_SUBSTRINGS = [
  "Pravilnik o provođenju mjera odgojno obrazovne podrške",
  "Pedagoški standardi i normativi",
  "IDSS Safeguariing Policy BHS Final",
  "Pravilnik o ishrani učenika", // ~23k chars — near corpus median (23,642)
  "ZAKON O UDŽBENICIMA U KS", // ~50k chars — mid-sized
];

/** titleFilter (optional): restrict to substrings of LONGEST_CHAPTER_TITLE_SUBSTRINGS that themselves contain this text — lets a single document be re-run without paying for the other two on every retry. */
async function pickNamedChapters(titleFilter?: string): Promise<ChapterPick[]> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("handbook_chapters")
    .select("id, title, content, document_id");

  if (error) throw new Error(`Failed to fetch chapters: ${error.message}`);
  if (!data || data.length === 0) throw new Error("No chapters found in handbook_chapters.");

  const substrings = titleFilter
    ? LONGEST_CHAPTER_TITLE_SUBSTRINGS.filter((s) =>
        s.toLowerCase().includes(titleFilter.toLowerCase()),
      )
    : LONGEST_CHAPTER_TITLE_SUBSTRINGS;

  if (substrings.length === 0) {
    throw new Error(`No named chapter substring matches filter "${titleFilter}".`);
  }

  const picks: ChapterPick[] = [];
  for (const substring of substrings) {
    const match = data.find((c) => c.title.toLowerCase().includes(substring.toLowerCase()));
    if (!match) {
      throw new Error(`No chapter found with title containing "${substring}".`);
    }
    picks.push({
      label: match.title,
      chapter: {
        id: match.id,
        title: match.title,
        content: match.content,
        length: match.content.length,
        documentId: match.document_id,
      },
    });
  }
  return picks;
}

/** Fetches the source document's filename + concatenated active chunk text (frontmatter-stripped) — the same input generateChapterForDocument() would use, not the already-generated handbook_chapters.content. */
async function getSourceDocument(
  documentId: string,
): Promise<{ filename: string; content: string }> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("documents")
    .select("filename")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch document ${documentId}: ${error.message}`);

  const rawContent = await getChunkTextForDocument(documentId);
  const content = stripFrontmatter(rawContent).trim();
  if (!content) throw new Error(`Document ${documentId} has no active chunk content.`);

  return { filename: data?.filename ?? "unknown", content };
}

type CallOutcome =
  | { status: number; body: any; durationMs: number }
  | { networkError: string; durationMs: number };

async function callGenerateContent(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
  temperature: number,
): Promise<CallOutcome> {
  const manager = getKeyManager();
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens, temperature },
  };

  const start = Date.now();

  for (let attempt = 0; attempt < 8; attempt++) {
    const { key, index } = await manager.getKey();
    const url = `${GENERATION_BASE_URL}/models/${model}:generateContent?key=${key}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return {
        networkError: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }

    if (response.status === 429) {
      manager.markThrottled(index);
      manager.logCall(index, 429, "generation", "throttled");
      continue; // retry with next key
    }

    const responseBody = await response.json().catch(() => ({}));
    manager.logCall(index, response.status, "generation", response.ok ? "success" : "error");
    return { status: response.status, body: responseBody, durationMs: Date.now() - start };
  }

  return {
    networkError: "All 8 keys exhausted (repeated 429s) testing this model.",
    durationMs: Date.now() - start,
  };
}

// ── Quiz mode ────────────────────────────────────────────────────────────

type QuizTestResult = {
  label: string;
  chapterTitle: string;
  chapterLength: number;
  httpStatus: number | "n/a";
  responseLength: number;
  jsonParseOk: boolean;
  validQuestions: number;
  invalidQuestions: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  error?: string;
  samples: QuizQuestionGenerated[];
};

async function testQuizOnChapter(
  model: string,
  pick: ChapterPick,
  maxTokens: number,
): Promise<QuizTestResult> {
  const { label, chapter } = pick;
  const base = { label, chapterTitle: chapter.title, chapterLength: chapter.length };
  const userPrompt = `Tekst poglavlja:\n${chapter.content}`;

  const outcome = await callGenerateContent(model, QUIZ_SYSTEM_PROMPT, userPrompt, maxTokens, 0.5);

  if ("networkError" in outcome) {
    return {
      ...base,
      httpStatus: "n/a",
      responseLength: 0,
      jsonParseOk: false,
      validQuestions: 0,
      invalidQuestions: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs: outcome.durationMs,
      error: outcome.networkError,
      samples: [],
    };
  }

  const { status, body, durationMs } = outcome;

  if (status < 200 || status >= 300) {
    return {
      ...base,
      httpStatus: status,
      responseLength: 0,
      jsonParseOk: false,
      validQuestions: 0,
      invalidQuestions: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs,
      error: JSON.stringify(body).slice(0, 300),
      samples: [],
    };
  }

  const text: string = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const usage = body.usageMetadata ?? {};
  const tokenFields = {
    promptTokens: usage.promptTokenCount ?? 0,
    completionTokens: usage.candidatesTokenCount ?? 0,
    totalTokens: usage.totalTokenCount ?? 0,
  };

  const jsonText = extractJsonArray(text);
  if (!jsonText) {
    return {
      ...base,
      httpStatus: status,
      responseLength: text.length,
      jsonParseOk: false,
      validQuestions: 0,
      invalidQuestions: 0,
      ...tokenFields,
      durationMs,
      error: "JSON array not found in response (possibly truncated).",
      samples: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return {
      ...base,
      httpStatus: status,
      responseLength: text.length,
      jsonParseOk: false,
      validQuestions: 0,
      invalidQuestions: 0,
      ...tokenFields,
      durationMs,
      error: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
      samples: [],
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      ...base,
      httpStatus: status,
      responseLength: text.length,
      jsonParseOk: true,
      validQuestions: 0,
      invalidQuestions: 0,
      ...tokenFields,
      durationMs,
      error: "Parsed JSON is not an array.",
      samples: [],
    };
  }

  const valid: QuizQuestionGenerated[] = [];
  let invalidCount = 0;
  for (const item of parsed) {
    const validation = QuizQuestionSchema.safeParse(item);
    if (validation.success) {
      valid.push(validation.data);
    } else {
      invalidCount++;
    }
  }

  return {
    ...base,
    httpStatus: status,
    responseLength: text.length,
    jsonParseOk: true,
    validQuestions: valid.length,
    invalidQuestions: invalidCount,
    ...tokenFields,
    durationMs,
    samples: valid.slice(0, 2),
  };
}

async function runQuizMode(model: string, picks: ChapterPick[], maxTokens: number) {
  const results: QuizTestResult[] = [];
  for (const pick of picks) {
    console.log(`\n[TestModel] Calling ${model} (quiz, maxTokens=${maxTokens}) for ${pick.label} chapter "${pick.chapter.title}"...`);
    const result = await testQuizOnChapter(model, pick, maxTokens);
    results.push(result);
    console.log(
      `[TestModel] -> HTTP ${result.httpStatus}, ${result.validQuestions} valid / ${result.invalidQuestions} invalid questions, ${result.durationMs}ms`,
    );
    if (result.error) console.log(`[TestModel] -> error: ${result.error}`);
  }

  console.log(`\n=== Quiz results for ${model} ===`);
  console.table(
    results.map((r) => ({
      chapter: r.label,
      chars: r.chapterLength,
      httpStatus: r.httpStatus,
      responseLen: r.responseLength,
      jsonParseOk: r.jsonParseOk,
      validQ: r.validQuestions,
      invalidQ: r.invalidQuestions,
      promptTok: r.promptTokens,
      complTok: r.completionTokens,
      totalTok: r.totalTokens,
      durationMs: r.durationMs,
    })),
  );

  const withErrors = results.filter((r) => r.error);
  if (withErrors.length > 0) {
    console.log("\n=== Errors ===");
    withErrors.forEach((r) => console.log(`  [${r.label}] ${r.error}`));
  }

  console.log("\n=== Sample questions (Bosnian text/explanation check) ===");
  const withSamples = results.filter((r) => r.samples.length > 0);
  if (withSamples.length === 0) {
    console.log("  (no valid questions generated by any chapter — nothing to sample)");
  } else {
    const source = withSamples.find((r) => r.label.startsWith("medium")) ?? withSamples[0];
    console.log(`  From ${source.label} chapter "${source.chapterTitle}":`);
    source.samples.forEach((q, i) => {
      console.log(`\n  Q${i + 1}: ${q.question}`);
      q.options.forEach((opt, oi) => {
        const marker = oi === q.correctIndex ? "*" : " ";
        console.log(`    [${marker}] ${String.fromCharCode(65 + oi)}. ${opt}`);
      });
      console.log(`    Objašnjenje: ${q.explanation}`);
    });
  }
}

// ── Chapter mode ─────────────────────────────────────────────────────────

type ChapterTestResult = {
  label: string;
  sourceFilename: string;
  sourceLength: number;
  httpStatus: number | "n/a";
  generatedLength: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string;
  durationMs: number;
  error?: string;
  generatedText: string;
};

async function testChapterGeneration(
  model: string,
  pick: ChapterPick,
  maxTokens: number,
  promptVariant: "default" | "fixed" = "default",
): Promise<ChapterTestResult> {
  const { label } = pick;

  let source: { filename: string; content: string };
  try {
    source = await getSourceDocument(pick.chapter.documentId);
  } catch (err) {
    return {
      label,
      sourceFilename: "n/a",
      sourceLength: 0,
      httpStatus: "n/a",
      generatedLength: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      finishReason: "n/a",
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
      generatedText: "",
    };
  }

  const base = { label, sourceFilename: source.filename, sourceLength: source.content.length };
  const userPrompt =
    "Napiši poglavlje priručnika isključivo na osnovu sljedećeg dokumenta.\n\n" +
    `Naziv dokumenta: ${source.filename}\n\n` +
    `Sadržaj dokumenta:\n${source.content}`;

  const systemPrompt = promptVariant === "fixed" ? CHAPTER_SYSTEM_PROMPT_FIXED : CHAPTER_SYSTEM_PROMPT;
  const outcome = await callGenerateContent(model, systemPrompt, userPrompt, maxTokens, 0.3);

  if ("networkError" in outcome) {
    return {
      ...base,
      httpStatus: "n/a",
      generatedLength: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      finishReason: "n/a",
      durationMs: outcome.durationMs,
      error: outcome.networkError,
      generatedText: "",
    };
  }

  const { status, body, durationMs } = outcome;

  if (status < 200 || status >= 300) {
    return {
      ...base,
      httpStatus: status,
      generatedLength: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      finishReason: "n/a",
      durationMs,
      error: JSON.stringify(body).slice(0, 300),
      generatedText: "",
    };
  }

  const rawText: string = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const text = sanitizeGeneratedContent(rawText);
  const usage = body.usageMetadata ?? {};
  const finishReason: string = body.candidates?.[0]?.finishReason ?? "n/a";

  return {
    ...base,
    httpStatus: status,
    generatedLength: text.length,
    promptTokens: usage.promptTokenCount ?? 0,
    completionTokens: usage.candidatesTokenCount ?? 0,
    totalTokens: usage.totalTokenCount ?? 0,
    finishReason,
    durationMs,
    generatedText: text,
  };
}

async function runChapterMode(
  model: string,
  picks: ChapterPick[],
  maxTokens: number,
  promptVariant: "default" | "fixed" = "default",
) {
  const results: ChapterTestResult[] = [];
  for (const pick of picks) {
    console.log(`\n[TestModel] Calling ${model} (chapter, maxTokens=${maxTokens}, prompt=${promptVariant}) for ${pick.label} chapter "${pick.chapter.title}"...`);
    const result = await testChapterGeneration(model, pick, maxTokens, promptVariant);
    results.push(result);
    console.log(
      `[TestModel] -> HTTP ${result.httpStatus}, ${result.generatedLength} chars generated, finishReason=${result.finishReason}, ${result.durationMs}ms`,
    );
    if (result.error) console.log(`[TestModel] -> error: ${result.error}`);
    if (result.finishReason === "MAX_TOKENS") {
      console.log(`[TestModel] -> WARNING: truncated by maxOutputTokens (${maxTokens}) — output is cut off mid-content.`);
    }
  }

  console.log(`\n=== Chapter-generation results for ${model} ===`);
  console.table(
    results.map((r) => ({
      chapter: r.label,
      sourceFile: r.sourceFilename,
      sourceChars: r.sourceLength,
      httpStatus: r.httpStatus,
      generatedChars: r.generatedLength,
      promptTok: r.promptTokens,
      complTok: r.completionTokens,
      totalTok: r.totalTokens,
      finishReason: r.finishReason,
      durationMs: r.durationMs,
    })),
  );

  const withErrors = results.filter((r) => r.error);
  if (withErrors.length > 0) {
    console.log("\n=== Errors ===");
    withErrors.forEach((r) => console.log(`  [${r.label}] ${r.error}`));
  }

  const truncated = results.filter((r) => r.finishReason === "MAX_TOKENS");
  if (truncated.length > 0) {
    console.log(`\n=== Truncated (hit maxOutputTokens ${maxTokens}) ===`);
    truncated.forEach((r) => console.log(`  [${r.label}] ${r.generatedLength} chars — output is incomplete`));
  }

  console.log("\n=== Full generated chapter text (for eyeballing quality) ===");
  results
    .filter((r) => r.generatedText.length > 0)
    .forEach((r) => {
      console.log(`\n--- ${r.label} — source: "${r.sourceFilename}" (${r.durationMs}ms) ---`);
      console.log(r.generatedText);
    });
}

// ── Entry point ──────────────────────────────────────────────────────────

async function main() {
  const model = process.argv[2];
  const mode = (process.argv[3] || "quiz").toLowerCase();
  const maxTokensArg = process.argv[4];
  const chapterSet = (process.argv[5] || "default").toLowerCase();
  const titleFilter = process.argv[6]; // optional, "longest" only — restrict to one named document
  const promptVariant = (process.argv[7] || "default").toLowerCase(); // chapter mode only

  if (!model) {
    console.error(
      "Usage: npx tsx scripts/test-model.ts <model-string> [quiz|chapter] [maxTokens] [default|longest] [titleFilter] [default|fixed]",
    );
    process.exitCode = 1;
    return;
  }

  if (promptVariant !== "default" && promptVariant !== "fixed") {
    console.error(`Unknown prompt variant "${promptVariant}" — expected "default" or "fixed".`);
    process.exitCode = 1;
    return;
  }

  if (mode !== "quiz" && mode !== "chapter") {
    console.error(`Unknown mode "${mode}" — expected "quiz" or "chapter".`);
    process.exitCode = 1;
    return;
  }

  const maxTokens = maxTokensArg ? Number(maxTokensArg) : 8192;
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    console.error(`Invalid maxTokens "${maxTokensArg}" — expected a positive integer.`);
    process.exitCode = 1;
    return;
  }

  if (chapterSet !== "default" && chapterSet !== "longest") {
    console.error(`Unknown chapter set "${chapterSet}" — expected "default" or "longest".`);
    process.exitCode = 1;
    return;
  }

  console.log(`[TestModel] Model under test: ${model} (mode: ${mode}, maxTokens: ${maxTokens}, chapterSet: ${chapterSet}, promptVariant: ${promptVariant})`);

  const picks =
    chapterSet === "longest"
      ? await (async () => {
          console.log(
            titleFilter
              ? `[TestModel] Picking named chapter(s) matching "${titleFilter}"...`
              : "[TestModel] Picking the 3 named longest-source-document chapters...",
          );
          return pickNamedChapters(titleFilter);
        })()
      : await (async () => {
          console.log("[TestModel] Picking 3 chapters of differing lengths...");
          return pickThreeChapters();
        })();

  picks.forEach((p) =>
    console.log(`  - ${p.label}: "${p.chapter.title}" (${p.chapter.length} chars generated content)`),
  );

  if (mode === "quiz") {
    await runQuizMode(model, picks, maxTokens);
  } else {
    await runChapterMode(model, picks, maxTokens, promptVariant as "default" | "fixed");
  }

  console.log("\n[TestModel] Done. No database writes were made.");
}

main().catch((err) => {
  console.error("[TestModel] Fatal:", err);
  process.exitCode = 1;
});
