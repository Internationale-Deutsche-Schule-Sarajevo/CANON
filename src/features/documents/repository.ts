import { createSupabaseDirectAdmin } from "@/lib/db/supabase";
import type { ImportDocument } from "./import-pipeline";

export async function storeImportedDocuments(
  documents: ImportDocument[],
  importedBy: string,
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const supabase = createSupabaseDirectAdmin();
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const doc of documents) {
    try {
      const { data: existing } = await supabase
        .from("documents")
        .select("id, content_hash")
        .eq("filename", doc.filename)
        .eq("content_hash", doc.hash)
        .maybeSingle();

      if (existing) {
        succeeded++;
        continue;
      }

      const { error } = await supabase.from("documents").upsert(
        {
          filename: doc.filename,
          original_name: doc.filename,
          status: "active",
          content_hash: doc.hash,
          file_size_bytes: doc.sizeBytes,
          mime_type: "text/markdown",
          storage_path: doc.relativePath,
          metadata: {
            category: doc.category,
            relative_path: doc.relativePath,
            imported_from: "USTAV",
          },
          uploaded_by: importedBy,
          approved_by: importedBy,
          approved_at: new Date().toISOString(),
        },
        {
          onConflict: "filename",
        },
      );

      if (error) throw new Error(error.message);
      succeeded++;
    } catch (err) {
      const errorMsg = `Failed to store ${doc.filename}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(errorMsg);
      failed++;
    }
  }

  return { succeeded, failed, errors };
}

export async function storeIntegrityReport(data: {
  importType: string;
  total: number;
  succeeded: number;
  failed: number;
  status: "COMPLETE" | "PARTIAL" | "FAILED";
  details: Record<string, unknown>;
}): Promise<void> {
  const supabase = createSupabaseDirectAdmin();

  const { error } = await supabase.from("system_integrity").insert({
    import_type: data.importType,
    total: data.total,
    succeeded: data.succeeded,
    failed: data.failed,
    status: data.status,
    details: data.details,
  });

  if (error) throw new Error(`storeIntegrityReport failed: ${error.message}`);
}

export async function getLatestIntegrityReport() {
  const supabase = createSupabaseDirectAdmin();

  const { data, error } = await supabase
    .from("system_integrity")
    .select("*")
    .eq("import_type", "USTAV_IMPORT")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data;
}

export async function getActiveDocumentsCount(): Promise<number> {
  const supabase = createSupabaseDirectAdmin();

  const { count, error } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  if (error) return 0;
  return count ?? 0;
}
