/**
 * USTAV Import Pipeline
 * Parses INDEX.md, verifies all documents exist,
 * computes SHA-256 hashes, stores manifest in documents table.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const REPO_PATH = path.join(process.cwd(), "repo");
const INDEX_PATH = path.join(REPO_PATH, "INDEX.md");

export type ImportDocument = {
  filename: string;
  relativePath: string;
  absolutePath: string;
  content: string;
  hash: string;
  sizeBytes: number;
  category: string;
};

export type ImportResult = {
  success: boolean;
  total: number;
  documents: ImportDocument[];
  errors: string[];
};

/**
 * Parse all document links from INDEX.md
 */
export function parseIndexMd(): { relativePaths: string[]; error?: string } {
  if (!fs.existsSync(INDEX_PATH)) {
    return { relativePaths: [], error: `INDEX.md not found at: ${INDEX_PATH}` }
  }

  const content = fs.readFileSync(INDEX_PATH, 'utf-8')
  const relativePaths: string[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const linkStart = line.indexOf('](')
    if (linkStart === -1) continue

    const afterStart = linkStart + 2
    const lastParen = line.lastIndexOf(')')
    if (lastParen === -1 || lastParen <= afterStart) continue

    const rawPath = line.slice(afterStart, lastParen)
    if (!rawPath.endsWith('.md')) continue

    let decoded: string
    try {
      decoded = decodeURIComponent(rawPath)
    } catch {
      decoded = rawPath
    }

    const normalized = decoded.replace(/^\.\//, '')
    if (normalized && !relativePaths.includes(normalized)) {
      relativePaths.push(normalized)
    }
  }

  console.log(`[Import] Found ${relativePaths.length} unique links in INDEX.md`)
  return { relativePaths }
}

/**
 * Verify all files exist on disk
 */
export function verifyFiles(relativePaths: string[]): {
  missing: string[];
  countMismatch: boolean;
} {
  const missing: string[] = [];

  for (const relPath of relativePaths) {
    const absolutePath = path.join(REPO_PATH, relPath);
    if (!fs.existsSync(absolutePath)) {
      missing.push(relPath);
    }
  }

  return {
    missing,
    countMismatch: false,
  };
}

/**
 * Compute SHA-256 hash of content
 */
export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Extract category from relative path
 */
export function extractCategory(relativePath: string): string {
  const parts = relativePath.split("/");
  return parts[0] ?? "UNKNOWN";
}

/**
 * Run the full import pipeline
 */
export async function runImportPipeline(): Promise<ImportResult> {
  const errors: string[] = [];

  // Step 1: Parse INDEX.md
  const { relativePaths, error: parseError } = parseIndexMd();
  if (parseError) {
    return { success: false, total: 0, documents: [], errors: [parseError] };
  }

  console.log(`[Import] Parsed ${relativePaths.length} links from INDEX.md`);

  if (relativePaths.length !== 382) {
    const errorMsg = `ABORT: Expected 382 files, found ${relativePaths.length}`;
    console.error(`[Import] ${errorMsg}`);
    return { success: false, total: relativePaths.length, documents: [], errors: [errorMsg] };
  }

  // Step 2: Verify files exist
  const { missing } = verifyFiles(relativePaths);

  if (missing.length > 0) {
    const errorMsg = `ABORT: ${missing.length} files missing:\n${missing.slice(0, 5).join("\n")}`;
    console.error(`[Import] ${errorMsg}`);
    return {
      success: false,
      total: relativePaths.length,
      documents: [],
      errors: [errorMsg],
    };
  }

  console.log(`[Import] All ${relativePaths.length} files verified ✓`);

  // Step 3: Read content and compute hashes
  const documents: ImportDocument[] = [];

  for (const relPath of relativePaths) {
    try {
      const absolutePath = path.join(REPO_PATH, relPath);
      const content = fs.readFileSync(absolutePath, "utf-8");
      const hash = computeHash(content);
      const stats = fs.statSync(absolutePath);
      const filename = path.basename(relPath);
      const category = extractCategory(relPath);

      documents.push({
        filename,
        relativePath: relPath,
        absolutePath,
        content,
        hash,
        sizeBytes: stats.size,
        category,
      });
    } catch (err) {
      const errorMsg = `Failed to read: ${relPath} — ${
        err instanceof Error ? err.message : String(err)
      }`;
      errors.push(errorMsg);
      console.error(`[Import] ${errorMsg}`);
    }
  }

  console.log(
    `[Import] Read ${documents.length} documents, ${errors.length} errors`,
  );

  return {
    success: errors.length === 0,
    total: documents.length,
    documents,
    errors,
  };
}
