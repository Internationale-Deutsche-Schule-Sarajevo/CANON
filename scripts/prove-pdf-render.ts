/**
 * PDF-render feasibility proof (Director's make-or-break check, step 3).
 * NOT part of the permanent pipeline — pdf-lib here is only a test-fixture
 * builder (installed with --no-save, not a project dependency).
 *
 * Builds a single-page, image-only PDF from repo/ASSETS/Agenda.png (no text
 * layer at all — simulates a scanned document), then renders that page back
 * to a PNG buffer using pdfjs-dist + @napi-rs/canvas — both pure npm
 * packages with prebuilt native bindings, no system binary (no ImageMagick/
 * GraphicsMagick) required. Confirms the rendered PNG still OCRs correctly
 * via Gemini, proving the full scanned-PDF -> image -> text path.
 *
 * Run (Windows CMD):
 *   npx tsx --env-file=.env scripts\prove-pdf-render.ts
 */

import * as fs from "fs";
import * as path from "path";
import { PDFDocument } from "pdf-lib";
import { createCanvas, type Canvas as NapiCanvas } from "@napi-rs/canvas";
import { getAIProvider } from "../src/lib/ai/ai-provider.factory";
import { OCR_TRANSCRIPTION_PROMPT } from "../src/features/documents/services/ocr";

const REPO_ASSETS = path.join(process.cwd(), "repo", "ASSETS");
const SCRATCH_DIR = path.join(process.cwd(), ".scratch");
const SOURCE_PNG = path.join(REPO_ASSETS, "Agenda.png");
const FIXTURE_PDF = path.join(SCRATCH_DIR, "agenda-image-only.pdf");
const RENDERED_PNG = path.join(SCRATCH_DIR, "agenda-rendered-from-pdf.png");

async function buildImageOnlyPdf(): Promise<Buffer> {
  const pngBytes = fs.readFileSync(SOURCE_PNG);
  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
  page.drawImage(pngImage, { x: 0, y: 0, width: pngImage.width, height: pngImage.height });
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function renderFirstPageToPng(pdfBuffer: Buffer): Promise<Buffer> {
  // Legacy Node build — no DOM/Worker APIs available.
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const scale = 2; // ~144 DPI-equivalent for a 72pt-based page — good OCR resolution
  const viewport = page.getViewport({ scale });

  const canvas: NapiCanvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  await page.render({
    // @napi-rs/canvas's CanvasRenderingContext2D is API-compatible with the
    // browser one pdfjs-dist expects; the type packages differ, which is why
    // this cast is needed.
    canvas: null,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  return canvas.toBuffer("image/png");
}

async function main() {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });

  console.log("[1/4] Building image-only test PDF from Agenda.png ...");
  const pdfBuffer = await buildImageOnlyPdf();
  fs.writeFileSync(FIXTURE_PDF, pdfBuffer);
  console.log(`      -> ${FIXTURE_PDF} (${pdfBuffer.length} bytes)`);

  console.log("[2/4] Rendering page 1 via pdfjs-dist + @napi-rs/canvas (no system binary) ...");
  const renderedPng = await renderFirstPageToPng(pdfBuffer);
  fs.writeFileSync(RENDERED_PNG, renderedPng);
  console.log(`      -> ${RENDERED_PNG} (${renderedPng.length} bytes)`);

  console.log("[3/4] Sanity-checking PNG signature ...");
  const isPng = renderedPng.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  console.log(`      valid PNG signature: ${isPng}`);
  if (!isPng) throw new Error("Rendered buffer is not a valid PNG.");

  console.log("[4/4] OCRing the rendered page via Gemini to confirm end-to-end quality ...");
  const provider = getAIProvider();
  const base64 = renderedPng.toString("base64");
  const result = await provider.transcribeImage(base64, "image/png", OCR_TRANSCRIPTION_PROMPT);
  console.log(`      tokensUsed=${result.tokensUsed} finishReason=${result.finishReason ?? "n/a"}`);
  console.log("--- TRANSCRIBED TEXT (from PDF-rendered page) ---");
  console.log(result.text);

  console.log("\nFEASIBILITY: CONFIRMED — pdfjs-dist + @napi-rs/canvas render PDF pages to PNG with no system binary.");
}

main().catch((err) => {
  console.error("[prove-pdf-render] FAILED:", err);
  process.exit(1);
});
