/**
 * Diff Summary Service
 * Deliberately simple: line-count comparison + first differing line.
 * A full diff algorithm is not required for Sprint 09 (see SPRINT_09.md).
 */

export type DiffSummary =
  | { hasExistingDocument: false }
  | {
      hasExistingDocument: true;
      contentAvailable: false;
      hashChanged: boolean;
    }
  | {
      hasExistingDocument: true;
      contentAvailable: true;
      oldLineCount: number;
      newLineCount: number;
      firstDifferentLine: number | null;
      isIdentical: boolean;
    };

/**
 * Compare new markdown content against an existing active document's markdown.
 * `oldMarkdown` is null when no prior content is available for diffing
 * (e.g. the existing active document predates this upload pipeline —
 * legacy USTAV imports are local files, never stored as Markdown in Supabase Storage).
 */
export function computeDiffSummary(
  oldMarkdown: string | null,
  newMarkdown: string,
  hasExistingDocument: boolean,
  hashChanged?: boolean,
): DiffSummary {
  if (!hasExistingDocument) {
    return { hasExistingDocument: false };
  }

  if (oldMarkdown === null) {
    return {
      hasExistingDocument: true,
      contentAvailable: false,
      hashChanged: hashChanged ?? true,
    };
  }

  const oldLines = oldMarkdown.split("\n");
  const newLines = newMarkdown.split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);

  let firstDifferentLine: number | null = null;
  for (let i = 0; i < maxLen; i++) {
    if (oldLines[i] !== newLines[i]) {
      firstDifferentLine = i + 1;
      break;
    }
  }

  return {
    hasExistingDocument: true,
    contentAvailable: true,
    oldLineCount: oldLines.length,
    newLineCount: newLines.length,
    firstDifferentLine,
    isIdentical: firstDifferentLine === null && oldLines.length === newLines.length,
  };
}
