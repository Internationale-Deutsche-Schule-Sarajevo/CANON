/**
 * RAG Indexing Pipeline
 * Chunks all active documents and generates embeddings
 * Stores chunks in document_chunks table
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";
import { chunkDocument } from "@/lib/rag/chunker";
import { embedTexts } from "@/lib/rag/embedder";

export type RagPipelineResult = {
  documentId: string;
  filename: string;
  chunksCreated: number;
  error?: string;
};

/**
 * Index a single document — chunk and embed
 */
export async function indexDocument(
  documentId: string,
  filename: string,
  content: string,
): Promise<RagPipelineResult> {
  const supabase = createSupabaseDirectAdmin();

  try {
    // Step 1: Chunk the document
    const chunks = chunkDocument(content);
    console.log(`[RAG] ${filename}: ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return {
        documentId,
        filename,
        chunksCreated: 0,
        error: "No chunks generated",
      };
    }

    // Step 2: Generate embeddings
    const texts = chunks.map((c) => c.text);
    const vectors = await embedTexts(texts, "RETRIEVAL_DOCUMENT");

    // Step 3: Store chunks in database
    const rows = chunks.map((chunk, i) => ({
      document_id: documentId,
      chunk_index: chunk.chunkIndex,
      text: chunk.text,
      embedding: vectors[i],
      document_status: "active" as const,
      char_offset_start: chunk.charOffsetStart,
      char_offset_end: chunk.charOffsetEnd,
    }));

    // Delete existing chunks for this document first
    await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);

    // Insert new chunks in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase.from("document_chunks").insert(batch);

      if (error) throw new Error(error.message);
    }

    return { documentId, filename, chunksCreated: chunks.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[RAG] Failed to index ${filename}:`, message);
    return { documentId, filename, chunksCreated: 0, error: message };
  }
}

/**
 * Index all active documents that have content stored
 */
export async function indexAllDocuments(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  totalChunks: number;
  errors: string[];
}> {
  const supabase = createSupabaseDirectAdmin();

  // Get all active documents
  const { data: documents, error } = await supabase
    .from("documents")
    .select("id, filename, storage_path, metadata")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch documents: ${error.message}`);
  if (!documents || documents.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, totalChunks: 0, errors: [] };
  }

  console.log(`[RAG] Starting indexing of ${documents.length} documents`);

  let succeeded = 0;
  let failed = 0;
  let totalChunks = 0;
  const errors: string[] = [];

  // Read content from local repo and index
  const fs = await import("fs");
  const path = await import("path");
  const REPO_PATH = path.join(process.cwd(), "repo");

  for (const doc of documents) {
    try {
      // Get relative path from metadata
      const relativePath = doc.metadata?.relative_path as string;
      if (!relativePath) {
        errors.push(`${doc.filename}: no relative_path in metadata`);
        failed++;
        continue;
      }

      const absolutePath = path.join(REPO_PATH, relativePath);
      if (!fs.existsSync(absolutePath)) {
        errors.push(`${doc.filename}: file not found at ${absolutePath}`);
        failed++;
        continue;
      }

      const content = fs.readFileSync(absolutePath, "utf-8");
      const result = await indexDocument(doc.id, doc.filename, content);

      if (result.error) {
        errors.push(`${doc.filename}: ${result.error}`);
        failed++;
      } else {
        succeeded++;
        totalChunks += result.chunksCreated;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${doc.filename}: ${message}`);
      failed++;
    }
  }

  console.log(
    `[RAG] Complete: ${succeeded}/${documents.length} documents, ` +
      `${totalChunks} total chunks, ${failed} failed`,
  );

  return { total: documents.length, succeeded, failed, totalChunks, errors };
}
