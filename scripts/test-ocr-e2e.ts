/**
 * End-to-end OCR integration test — exercises the actual pipeline functions
 * (extractByMimeType -> chunkDocument), not a reimplementation. No DB writes.
 *
 * Covers:
 *  1. Direct image OCR path (Agenda.png, Rjesenje_Maturalna_Komisija.png)
 *  2. Image-only-PDF render+OCR fallback path (synthetic PDF built from
 *     Agenda.png, same as the feasibility proof)
 *  3. Reliability net: a PDF that yields near-empty text even after OCR
 *     (blank page) must come back manualReviewNeeded=true, not a fabricated
 *     chapter's worth of chunks.
 *
 * Run (Windows CMD):
 *   npx tsx --env-file=.env scripts\test-ocr-e2e.ts
 */

import * as fs from "fs";
import * as path from "path";
import { PDFDocument } from "pdf-lib";
import { extractByMimeType } from "../src/features/documents/services/text-extraction";
import { chunkDocument } from "../src/lib/rag/chunker";

const REPO_ASSETS = path.join(process.cwd(), "repo", "ASSETS");
const SCRATCH_DIR = path.join(process.cwd(), ".scratch");

async function testImage(filename: string) {
  console.log(`\n${"=".repeat(70)}\nIMAGE PATH: ${filename}\n${"=".repeat(70)}`);
  const buffer = fs.readFileSync(path.join(REPO_ASSETS, filename));
  const extraction = await extractByMimeType(buffer, "image/png");
  console.log(`ocrUsed=${extraction.ocrUsed} manualReviewNeeded=${extraction.manualReviewNeeded}`);
  console.log(`extractedTextLength=${extraction.plainText.length}`);

  const chunks = chunkDocument(extraction.markdown);
  console.log(`chunksCreated=${chunks.length}`);
  if (chunks.length > 0) {
    console.log(`chunk[0] preview: ${chunks[0].text.slice(0, 120).replace(/\n/g, " ")}...`);
  }

  if (extraction.manualReviewNeeded || chunks.length === 0) {
    throw new Error(`UNEXPECTED: ${filename} should have produced usable chunks without manual review.`);
  }
  console.log("RESULT: usable chunks produced ✓");
}

async function testImageOnlyPdf() {
  console.log(`\n${"=".repeat(70)}\nPDF FALLBACK PATH: synthetic image-only PDF (from Agenda.png)\n${"=".repeat(70)}`);
  const pngBytes = fs.readFileSync(path.join(REPO_ASSETS, "Agenda.png"));
  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
  page.drawImage(pngImage, { x: 0, y: 0, width: pngImage.width, height: pngImage.height });
  const pdfBytes = Buffer.from(await pdfDoc.save());

  const extraction = await extractByMimeType(pdfBytes, "application/pdf");
  console.log(`ocrUsed=${extraction.ocrUsed} manualReviewNeeded=${extraction.manualReviewNeeded}`);
  console.log(`extractedTextLength=${extraction.plainText.length}`);

  const chunks = chunkDocument(extraction.markdown);
  console.log(`chunksCreated=${chunks.length}`);
  if (chunks.length > 0) {
    console.log(`chunk[0] preview: ${chunks[0].text.slice(0, 120).replace(/\n/g, " ")}...`);
  }

  if (!extraction.ocrUsed || extraction.manualReviewNeeded || chunks.length === 0) {
    throw new Error("UNEXPECTED: image-only PDF should auto-trigger OCR and produce usable chunks.");
  }
  console.log("RESULT: PDF auto-detection triggered OCR, usable chunks produced ✓");
}

async function testReliabilityNet() {
  console.log(`\n${"=".repeat(70)}\nRELIABILITY NET: blank-page PDF (no text possible, even after OCR)\n${"=".repeat(70)}`);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595, 842]); // A4, completely blank — nothing for pdf-parse OR OCR to find
  const pdfBytes = Buffer.from(await pdfDoc.save());

  const extraction = await extractByMimeType(pdfBytes, "application/pdf");
  console.log(`ocrUsed=${extraction.ocrUsed} manualReviewNeeded=${extraction.manualReviewNeeded}`);
  console.log(`extractedTextLength=${extraction.plainText.length}`);
  console.log(`extractionError=${extraction.extractionError ?? "(none)"}`);

  if (!extraction.manualReviewNeeded) {
    throw new Error("UNEXPECTED: a blank/unreadable PDF must be flagged manualReviewNeeded, not silently accepted.");
  }
  console.log("RESULT: reliability net correctly flagged the document for manual review ✓");
}

async function main() {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  await testImage("Agenda.png");
  await testImage("Rjesenje_Maturalna_Komisija.png");
  await testImageOnlyPdf();
  await testReliabilityNet();
  console.log("\nALL E2E CHECKS PASSED.");
}

main().catch((err) => {
  console.error("[test-ocr-e2e] FAILED:", err);
  process.exit(1);
});
