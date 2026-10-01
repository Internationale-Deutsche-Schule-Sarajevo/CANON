/**
 * OCR proof script — Director-approved feasibility step (not part of the
 * permanent pipeline). Transcribes the two pure-image test documents via
 * GeminiProvider.transcribeImage() and prints the result. Writes nothing to
 * the database or Storage.
 *
 * Run (Windows CMD):
 *   npx tsx --env-file=.env scripts\prove-ocr.ts
 */

import * as fs from "fs";
import * as path from "path";
import { getAIProvider } from "../src/lib/ai/ai-provider.factory";
import { OCR_TRANSCRIPTION_PROMPT } from "../src/features/documents/services/ocr";

const REPO_ASSETS = path.join(process.cwd(), "repo", "ASSETS");

const TARGETS = [
  path.join(REPO_ASSETS, "Agenda.png"),
  path.join(REPO_ASSETS, "Rjesenje_Maturalna_Komisija.png"),
];

async function main() {
  const provider = getAIProvider();

  for (const filePath of TARGETS) {
    const filename = path.basename(filePath);
    console.log(`\n${"=".repeat(70)}`);
    console.log(`FILE: ${filename}`);
    console.log("=".repeat(70));

    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString("base64");

    const result = await provider.transcribeImage(base64, "image/png", OCR_TRANSCRIPTION_PROMPT);

    console.log(`tokensUsed: ${result.tokensUsed} | finishReason: ${result.finishReason ?? "n/a"} | keyIndex: ${result.keyIndexUsed}`);
    console.log(`transcribed length: ${result.text.length} chars`);
    console.log("--- TRANSCRIBED TEXT ---");
    console.log(result.text);
  }
}

main().catch((err) => {
  console.error("[prove-ocr] FAILED:", err);
  process.exit(1);
});
