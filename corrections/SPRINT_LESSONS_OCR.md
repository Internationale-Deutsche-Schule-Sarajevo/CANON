# OCR Integration — Lessons Learned

Date: 2026-07-26

## Engine Choice

No separate OCR API was added. `GeminiProvider.transcribeImage()`
(`src/lib/ai/providers/gemini-provider.ts`) reuses the same `gemini-2.5-flash`
multimodal model already used for generation, sent through the same
`GeminiKeyManager` round-robin/throttle machinery — one `inline_data` image
part plus the fixed Bosnian transcription prompt, `generateContent` endpoint,
`temperature=0.3`/`maxOutputTokens=8192` (deterministic-leaning, same output
headroom as chapter generation). `AIProvider.transcribeImage()` was added to
the interface so a future provider swap only requires a new implementation,
per the existing provider-abstraction rule.

`OCR_SPACE_API_KEY` already existed in `src/lib/env.ts` from an earlier,
not-yet-approved sub-task (see `upload-pipeline.ts`'s old Sprint 09 comment).
It is **not used** by this integration — left in place unused rather than
removed, since removing an unrelated env var wasn't in scope and touching
`env.ts`'s required-vars list is a blast-radius decision for whoever owns
that sub-task.

**Proof (2 pure-image documents, `repo/ASSETS/`):**

- `Agenda.png` → 575 chars, clean structured transcription (times, session
  titles, presenter name), zero logo/header noise, `finishReason=STOP`.
- `Rjesenje_Maturalna_Komisija.png` → 2114 chars, including a 6-row Markdown
  table transcribed correctly from the source image table, legal references
  (Zakon/Pravilnik article numbers) preserved verbatim, `finishReason=STOP`.

Both ran through the *actual* pipeline function
(`extractByMimeType` → `chunkDocument`) in `scripts/test-ocr-e2e.ts`, not a
reimplementation: `ocrUsed=true`, `manualReviewNeeded=false`, 1 and 2 chunks
respectively.

## Serverless PDF-Render Finding (the make-or-break risk)

**Confirmed: `pdfjs-dist` (legacy Node build) + `@napi-rs/canvas` render PDF
pages to PNG with no system binary.** Both are npm packages; `@napi-rs/canvas`
ships prebuilt N-API binaries as `optionalDependencies`, including
`@napi-rs/canvas-linux-x64-gnu` — the exact target for Vercel's Node.js
serverless runtime (Amazon Linux, glibc, x64). No ImageMagick/GraphicsMagick,
no other system binary.

Proof method (`scripts/prove-pdf-render.ts`, not part of the shipped
pipeline): built a single-page, image-only PDF from `Agenda.png` using
`pdf-lib` (installed `--no-save` — test-fixture builder only, never a project
dependency), rendered page 1 back to PNG via
`pdfjsLib.getDocument({ data })` → `page.render({ canvas: null, canvasContext,
viewport })` at `scale=2` (~144 DPI-equivalent), then re-OCR'd the rendered
PNG through Gemini and confirmed the transcription matched the direct-image
result. Round-trip proves the full scanned-PDF → image → text path, not just
that rendering produces *a* PNG.

One non-obvious API detail: `pdfjs-dist` v6's `RenderParameters.canvas` field
is required (`HTMLCanvasElement | null`), not optional — passing only
`canvasContext` (as most older pdfjs+node-canvas examples online show) fails
`tsc` under this version. Fix: pass `canvas: null` explicitly, which the
package's own doc comment says is required "if the context must absolutely
be used to render the page." Also: `disableWorker`/`isEvalSupported` (seen in
some older pdfjs+Node snippets) are not fields of `DocumentInitParameters` in
v6 — TypeScript silently drops them as unknown properties in JS, but the
legacy Node build runs the worker in-process regardless, so they were simply
removed rather than worked around.

Real-world scaling caveat (not tested here, flagged for awareness): the OCR
PDF fallback processes pages **sequentially**, one Gemini call per page, to
keep reading order trivially correct and stay within `GeminiKeyManager`'s
existing throttle handling. A many-page scanned PDF will take proportionally
longer and consume a Vercel function's execution budget accordingly — no cap
was added since the Director's spec didn't request one and the current
default Vercel function timeout (300s) comfortably covers documents in this
corpus's actual size range (`MAX_FILE_SIZE_BYTES = 10MB`). If genuinely large
scanned PDFs start showing up, page-parallelization or a per-document page
cap would be the next lever.

## Auto-Detection Rule

`src/features/documents/services/text-extraction.ts`:

- **Images** (`image/png`, `image/jpeg`) always OCR — there is never a text
  layer to try first, so `extractImageToMarkdown()` calls Gemini directly.
  (These MIME types didn't previously exist in the upload allow-list at all;
  `document-upload.schema.ts` and the upload widget were extended so
  secretary/pedagogue/super_admin can upload a scanned page or photo the same
  way as a PDF/DOCX/XLSX.)
- **PDFs** try `pdf-parse` first, then fall back to the render+OCR path via
  `isTextImplausiblyThin(text, pageCount)` — thin if the trimmed text is
  under 100 chars **or** under 50 chars/page on average. The
  chars-per-page check matters independently of the absolute floor: a
  20-page PDF that yields 300 chars total (e.g., one stray watermark/page-
  number text element pdf-parse *did* manage to extract, with every actual
  page being a scanned image) clears the 100-char absolute floor but is
  obviously not real content — 15 chars/page average catches it. Confirmed
  live: a synthetic image-only PDF built from `Agenda.png` produced 0 chars
  from `pdf-parse`, triggered the render+OCR fallback automatically, and
  came back with 573 chars / 1 chunk (`scripts/test-ocr-e2e.ts`).

The historical "This is a binary file. Please refer to the original file for
content." placeholder mentioned in the Director's brief turned out to be
produced by a separate, older static-markdown generator (the legacy "IDSS RAG
Builder v4.3" that pre-populated `repo/ASSETS/*.md` for the original USTAV
import) rather than by this codebase's live extraction path — the current
`extractByMimeType()` never emits that string. No detection rule was added
for that exact placeholder text since nothing in the live pipeline produces
it; the `isTextImplausiblyThin()` check subsumes the intent (any document
that would otherwise degrade to "no real text" is caught the same way).

## Reliability Net

`ExtractionResult.manualReviewNeeded` (pre-existing field, now driven by OCR
outcomes too) is set — with a loud `console.error` — whenever:

- OCR itself throws (network/quota/malformed-image error), or
- OCR succeeds but the result is *still* implausibly thin by the same
  `isTextImplausiblyThin()` check (confirmed live with a blank-page PDF:
  `pdf-parse` failed to parse the near-empty stream, the render+OCR fallback
  ran anyway, Gemini returned 45 characters, still under the 100-char floor
  → `manualReviewNeeded=true`, loud log, in `scripts/test-ocr-e2e.ts`).

No new blocking mechanism was needed to keep a flagged document out of
chapter generation: documents already sit in `status='staging'` until a
super_admin approves them (`upload-repository.ts`), and
`handbook/repository.ts`'s chapter-source queries only ever read
`status='active'` documents. `manualReviewNeeded` surfaces as a red "Potreban
ručni pregled" badge in `DocumentReviewPanel.tsx` (existing UI, updated
copy — now distinguishes "failed extraction" from "failed extraction even
after OCR") — the existing staging→active approval gate *is* the review
mechanism the Director asked for; this sprint only had to make sure OCR
failures actually reach that flag instead of silently succeeding with a
near-empty document.

`ocrUsed` (renamed from the old `needsOcr`/`needs_ocr` field, whose meaning
inverted once OCR became automatic rather than an unresolved TODO) is
informational only — shown as a neutral blue badge, not a warning — since by
the time it's visible, OCR has already run transparently. Only
`manualReviewNeeded` carries an actionable warning.

## New Dependencies (M-12)

- `pdfjs-dist` (^6.1.200) — PDF parsing/rasterization, pure npm, no system
  binary.
- `@napi-rs/canvas` (^1.0.2) — Canvas 2D backing for `pdfjs-dist`'s page
  render, pure npm with prebuilt N-API binaries per platform (incl.
  `linux-x64-gnu` for Vercel), no system binary.
- `pdf-lib` — **not added**, `npm install --no-save` only, used exclusively
  by proof/test scripts (`scripts/prove-pdf-render.ts`,
  `scripts/test-ocr-e2e.ts`) to synthesize an image-only test PDF. Confirmed
  absent from `package.json` after install.

`npm audit` after adding the two real dependencies showed the same 7
pre-existing high-severity findings (next, postcss, xlsx, brace-expansion,
fast-uri) as before — nothing new introduced by `pdfjs-dist`/`@napi-rs/canvas`.

## Commander Improvement Candidates

- **Dopuna M-12 (learned-from):** "name any new dependency in your report"
  should extend to naming dependencies installed `--no-save` for test
  fixtures too, even though they never touch `package.json` — otherwise a
  future auditor grepping `package.json` diffs for new packages would miss
  that `pdf-lib` was ever on disk during this sprint's proof scripts.
- **Novo pravilo (kandidat):** when a Director-supplied document ID (short
  hash prefix) doesn't match any row in the live `documents` table, don't
  block on it — fall back to matching by filename in the known source
  directory (`repo/ASSETS/` here) and note the mismatch in the report. The
  IDs `de22f60c`/`36bc0bec` in this sprint's brief didn't correspond to any
  `documents.id` in the `web-app-idss-handbook` Supabase project; the actual
  files (`Agenda.png`, `Rjesenje_Maturalna_Komisija.png`) were found by name
  instead and the mismatch is flagged here rather than silently ignored.
