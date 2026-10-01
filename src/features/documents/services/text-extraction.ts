/**
 * Text Extraction Service
 * Extracts text from uploaded DOCX/XLSX/PDF/PNG/JPEG files and converts it to
 * basic Markdown.
 *
 * OCR is transparent and automatic: images always go through Gemini OCR
 * (there is no text layer to try first); PDFs try pdf-parse first and fall
 * back to per-page Gemini OCR (via services/ocr.ts) whenever the extracted
 * text is implausibly thin relative to page count. Callers never need to
 * know or decide whether a document was text or scanned.
 *
 * Reliability net: if a document still yields implausibly little text after
 * the OCR fallback, it is never silently accepted — manualReviewNeeded is
 * set and the reason is logged loudly (console.error). Such documents stay
 * in 'staging' until a super_admin reviews them (see DocumentReviewPanel);
 * chapter generation only ever reads 'active' documents, so a flagged
 * document can never silently become a fabricated chapter.
 */

export type ExtractionResult = {
  markdown: string;
  plainText: string;
  manualReviewNeeded: boolean;
  extractionError?: string;
  // True when Gemini OCR (image or PDF-page-render fallback) produced the
  // returned text, rather than a direct text-layer extraction.
  ocrUsed: boolean;
};

const MIN_TEXT_LENGTH_FOR_OCR = 100;
// Below this average characters-per-page, a multi-page PDF's text layer is
// almost certainly a scan with at most a stray watermark/page-number text
// element — real text pages run into the hundreds/thousands of characters.
const MIN_CHARS_PER_PAGE = 50;

/**
 * True when extracted text is too thin to be a real text layer — either in
 * absolute terms, or relative to page count for multi-page documents.
 */
function isTextImplausiblyThin(plainText: string, pageCount?: number): boolean {
  const length = plainText.trim().length;
  if (length < MIN_TEXT_LENGTH_FOR_OCR) return true;
  if (pageCount && pageCount > 0 && length / pageCount < MIN_CHARS_PER_PAGE) return true;
  return false;
}

function htmlToBasicMarkdown(html: string): string {
  let out = html;
  out = out.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  out = out.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  out = out.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  out = out.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  out = out.replace(/<\/p>/gi, "\n\n");
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<[^>]+>/g, "");
  out = out
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

export async function extractDocxToMarkdown(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const mammoth = await import("mammoth");
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const textResult = await mammoth.extractRawText({ buffer });
    const markdown = htmlToBasicMarkdown(htmlResult.value);
    const plainText = textResult.value.trim();
    return { markdown: markdown || plainText, plainText, manualReviewNeeded: false, ocrUsed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[TextExtraction] DOCX extraction failed:", message);
    return { markdown: "", plainText: "", manualReviewNeeded: true, extractionError: message, ocrUsed: false };
  }
}

export async function extractXlsxToMarkdown(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet).trim();
      if (csv) parts.push(`## ${sheetName}\n\n${csv}`);
    }

    const markdown = parts.join("\n\n").trim();
    return { markdown, plainText: markdown, manualReviewNeeded: false, ocrUsed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[TextExtraction] XLSX extraction failed:", message);
    return { markdown: "", plainText: "", manualReviewNeeded: true, extractionError: message, ocrUsed: false };
  }
}

/**
 * Extract a PDF's text layer via pdf-parse, falling back to rendering each
 * page to an image and OCR-ing it via Gemini when the text layer is missing
 * or implausibly thin (scanned/image-only PDFs produce exactly this shape:
 * pdf-parse succeeds but returns near-empty text).
 */
export async function extractPdfToMarkdown(buffer: Buffer): Promise<ExtractionResult> {
  let text = "";
  let pageCount: number | undefined;
  let pdfParseError: string | undefined;

  try {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default;
    const result = await pdfParse(buffer);
    text = result.text.trim();
    pageCount = result.numpages;
  } catch (err) {
    pdfParseError = err instanceof Error ? err.message : String(err);
    console.error("[TextExtraction] pdf-parse nije uspio:", pdfParseError);
  }

  if (!isTextImplausiblyThin(text, pageCount)) {
    return { markdown: text, plainText: text, manualReviewNeeded: false, ocrUsed: false };
  }

  console.warn(
    `[TextExtraction] PDF tekst je implausibly kratak (${text.length} znakova` +
      `${pageCount ? ` na ${pageCount} stranica` : ""}) — pokrećem OCR fallback (render stranica + Gemini).`,
  );

  try {
    const { transcribePdfViaOcr } = await import("./ocr");
    const ocrResult = await transcribePdfViaOcr(buffer);

    if (isTextImplausiblyThin(ocrResult.text, ocrResult.pagesProcessed)) {
      const message =
        `OCR je obradio ${ocrResult.pagesProcessed} stranica, ali je rezultat i dalje ` +
        `prekratak (${ocrResult.text.length} znakova) — dokument označen za ručni pregled.`;
      console.error(`[TextExtraction] ${message}`);
      return {
        markdown: ocrResult.text,
        plainText: ocrResult.text,
        manualReviewNeeded: true,
        extractionError: message,
        ocrUsed: true,
      };
    }

    console.log(
      `[TextExtraction] OCR fallback uspio: ${ocrResult.text.length} znakova iz ${ocrResult.pagesProcessed} stranica.`,
    );
    return { markdown: ocrResult.text, plainText: ocrResult.text, manualReviewNeeded: false, ocrUsed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const combined = pdfParseError ? `pdf-parse: ${pdfParseError}; OCR fallback: ${message}` : `OCR fallback: ${message}`;
    console.error("[TextExtraction] OCR fallback nije uspio, dokument označen za ručni pregled:", combined);
    return {
      markdown: text,
      plainText: text,
      manualReviewNeeded: true,
      extractionError: combined,
      ocrUsed: false,
    };
  }
}

/**
 * Extract a standalone image (PNG/JPEG) via Gemini OCR — there is never a
 * text layer to try first.
 */
export async function extractImageToMarkdown(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
  try {
    const { transcribeImageBuffer } = await import("./ocr");
    const result = await transcribeImageBuffer(buffer, mimeType);

    if (isTextImplausiblyThin(result.text)) {
      const message = `OCR slike je vratio prekratak tekst (${result.text.length} znakova) — dokument označen za ručni pregled.`;
      console.error(`[TextExtraction] ${message}`);
      return {
        markdown: result.text,
        plainText: result.text,
        manualReviewNeeded: true,
        extractionError: message,
        ocrUsed: true,
      };
    }

    return { markdown: result.text, plainText: result.text, manualReviewNeeded: false, ocrUsed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[TextExtraction] OCR slike nije uspio, dokument označen za ručni pregled:", message);
    return { markdown: "", plainText: "", manualReviewNeeded: true, extractionError: message, ocrUsed: false };
  }
}

export async function extractByMimeType(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  switch (mimeType) {
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocxToMarkdown(buffer);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return extractXlsxToMarkdown(buffer);
    case "application/pdf":
      return extractPdfToMarkdown(buffer);
    case "image/png":
    case "image/jpeg":
      return extractImageToMarkdown(buffer, mimeType);
    default:
      throw new Error(`Nepodržan MIME tip za ekstrakciju: ${mimeType}`);
  }
}
