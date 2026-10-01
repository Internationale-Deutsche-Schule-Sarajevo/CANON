/**
 * OCR Service
 * Transcribes image content (standalone images, and rendered pages of
 * image-only PDFs) via the same gemini-2.5-flash multimodal model used for
 * generation — no separate OCR API/dependency (Director directive).
 *
 * PDF page rendering uses pdfjs-dist + @napi-rs/canvas — both pure npm
 * packages with prebuilt native bindings (incl. linux-x64-gnu, matching
 * Vercel's serverless runtime). No system binary (ImageMagick/
 * GraphicsMagick) required — confirmed working in this runtime, see
 * corrections/SPRINT_LESSONS_OCR.md.
 */

import { createCanvas } from "@napi-rs/canvas";
import { getAIProvider } from "@/lib/ai/ai-provider.factory";

export const OCR_TRANSCRIPTION_PROMPT =
  "Prepiši DOSLOVNO sav tekstualni sadržaj sa slike, u ispravnom redoslijedu čitanja. " +
  "IZOSTAVI logotipe, zaglavlja i podnožja stranice, brojeve stranica i čisto grafičke " +
  "elemente. Zadrži naslove, reference na članove i brojeve dokumenata. Ne dodaj " +
  "komentar, ne prevodi, ne sažimaj — samo tekst.";

// Render resolution — scale 2 on a 72pt-based PDF page is roughly
// equivalent to 144 DPI, well above the threshold Gemini needs to read
// typical document text reliably (confirmed in the feasibility proof).
const PDF_RENDER_SCALE = 2;

export type ImageTranscriptionResult = {
  text: string;
  tokensUsed: number;
  finishReason?: string;
};

/**
 * Transcribe a single image buffer (PNG/JPEG) to plain text.
 */
export async function transcribeImageBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<ImageTranscriptionResult> {
  const provider = getAIProvider();
  const base64 = buffer.toString("base64");
  const result = await provider.transcribeImage(base64, mimeType, OCR_TRANSCRIPTION_PROMPT);
  return { text: result.text.trim(), tokensUsed: result.tokensUsed, finishReason: result.finishReason };
}

/**
 * Render every page of a PDF to a PNG buffer, in page order.
 * No system binary — pdfjs-dist parses/rasterizes, @napi-rs/canvas backs the
 * Canvas 2D context it renders into.
 */
async function renderPdfPagesToPngBuffers(pdfBuffer: Buffer): Promise<Buffer[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
  });
  const pdf = await loadingTask.promise;

  const pageBuffers: Buffer[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    await page.render({
      // @napi-rs/canvas's 2D context is API-compatible with the browser one
      // pdfjs-dist expects at runtime; the type packages differ structurally,
      // hence the assertion. canvas is explicitly null per pdfjs-dist's own
      // doc comment: "If the context must absolutely be used to render the
      // page, the canvas must be null."
      canvas: null,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    pageBuffers.push(canvas.toBuffer("image/png"));
  }

  return pageBuffers;
}

export type PdfOcrResult = {
  text: string;
  pagesProcessed: number;
  tokensUsed: number;
};

/**
 * Full scanned-PDF fallback: render every page to an image, transcribe each
 * page via Gemini, concatenate in reading order. Pages are processed
 * sequentially — GeminiKeyManager already rotates across 8 keys and handles
 * 429 throttling, and sequential processing keeps page order trivially
 * correct without extra bookkeeping.
 */
export async function transcribePdfViaOcr(pdfBuffer: Buffer): Promise<PdfOcrResult> {
  const pageBuffers = await renderPdfPagesToPngBuffers(pdfBuffer);
  const parts: string[] = [];
  let tokensUsed = 0;

  for (let i = 0; i < pageBuffers.length; i++) {
    const result = await transcribeImageBuffer(pageBuffers[i], "image/png");
    tokensUsed += result.tokensUsed;
    if (result.text) parts.push(result.text);
    console.log(
      `[OCR] Stranica ${i + 1}/${pageBuffers.length} transkribovana (${result.text.length} znakova).`,
    );
  }

  return { text: parts.join("\n\n"), pagesProcessed: pageBuffers.length, tokensUsed };
}
