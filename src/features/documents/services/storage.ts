/**
 * Document Storage Service
 * Manages the 'staging-documents' and 'archived-documents' Supabase Storage buckets.
 * Buckets are created lazily on first use — neither exists by default on a fresh project.
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";
import { STAGING_BUCKET, ARCHIVED_BUCKET } from "../constants";

export { STAGING_BUCKET, ARCHIVED_BUCKET };

const BUCKET_FILE_SIZE_LIMIT = 10 * 1024 * 1024;

const ensuredBuckets = new Set<string>();

async function ensureBucket(bucketName: string): Promise<void> {
  if (ensuredBuckets.has(bucketName)) return;

  const supabase = createSupabaseDirectAdmin();
  const { data: existing } = await supabase.storage.getBucket(bucketName);

  if (!existing) {
    const { error } = await supabase.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
    });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      throw new Error(`Neuspjelo kreiranje bucket-a ${bucketName}: ${error.message}`);
    }
  }

  ensuredBuckets.add(bucketName);
}

export async function uploadToStaging(
  path: string,
  content: Buffer,
  contentType: string,
): Promise<void> {
  await ensureBucket(STAGING_BUCKET);
  const supabase = createSupabaseDirectAdmin();
  const { error } = await supabase.storage
    .from(STAGING_BUCKET)
    .upload(path, content, { contentType, upsert: true });
  if (error) throw new Error(`Upload u staging bucket nije uspio: ${error.message}`);
}

/**
 * Mint a time-limited signed upload URL so the browser can PUT the file
 * directly to Supabase Storage, bypassing the Next.js server (and its
 * request body size limit) entirely. The bucket is created if needed,
 * but no object is written here — that happens client-side.
 */
export async function createStagingUploadUrl(
  path: string,
): Promise<{ signedUrl: string; token: string }> {
  await ensureBucket(STAGING_BUCKET);
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase.storage
    .from(STAGING_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(
      `Kreiranje signed upload URL-a nije uspjelo: ${error?.message ?? "nepoznata greška"}`,
    );
  }

  return { signedUrl: data.signedUrl, token: data.token };
}

export async function downloadFromStaging(path: string): Promise<Buffer | null> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase.storage.from(STAGING_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Best-effort archive of a document's storage files.
 * Returns false (without throwing) when the source object doesn't exist —
 * this is expected for legacy USTAV documents, which live as local files
 * on disk and were never uploaded to Supabase Storage.
 */
export async function moveToArchived(sourcePath: string, archivePath: string): Promise<boolean> {
  const buffer = await downloadFromStaging(sourcePath);
  if (!buffer) return false;

  await ensureBucket(ARCHIVED_BUCKET);
  const supabase = createSupabaseDirectAdmin();

  const { error: uploadError } = await supabase.storage
    .from(ARCHIVED_BUCKET)
    .upload(archivePath, buffer, { upsert: true });
  if (uploadError) {
    throw new Error(`Arhiviranje fajla nije uspjelo: ${uploadError.message}`);
  }

  await supabase.storage.from(STAGING_BUCKET).remove([sourcePath]);
  return true;
}
