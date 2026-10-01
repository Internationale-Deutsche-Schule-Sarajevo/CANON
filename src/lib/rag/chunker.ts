/**
 * Document Chunker
 * Splits documents into 512-token chunks with 64-token overlap
 */

import { getEncoding } from "js-tiktoken";

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;

export type Chunk = {
  text: string;
  chunkIndex: number;
  charOffsetStart: number;
  charOffsetEnd: number;
};

/**
 * Split document content into overlapping chunks
 */
export function chunkDocument(content: string): Chunk[] {
  const encoding = getEncoding("cl100k_base");
  const chunks: Chunk[] = [];

  const tokens = encoding.encode(content);

  if (tokens.length === 0) return [];

  let chunkIndex = 0;
  let startToken = 0;
  let charOffset = 0;

  while (startToken < tokens.length) {
    const endToken = Math.min(startToken + CHUNK_SIZE, tokens.length);
    const chunkTokens = tokens.slice(startToken, endToken);

    // Decode tokens — js-tiktoken returns Uint8Array
    const decoded = encoding.decode(chunkTokens);
    const chunkText = Buffer.from(decoded).toString("utf-8").trim();

    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        chunkIndex,
        charOffsetStart: charOffset,
        charOffsetEnd: charOffset + chunkText.length,
      });
      charOffset += chunkText.length;
      chunkIndex++;
    }

    startToken += CHUNK_SIZE - CHUNK_OVERLAP;
    if (startToken >= tokens.length) break;
  }

  return chunks;
}
