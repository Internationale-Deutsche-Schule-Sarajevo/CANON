/**
 * POST /api/documents/confirm-upload
 * Role required: admin or super_admin (canUploadDocuments)
 *
 * Step 3 of the direct-to-storage upload flow. Receives only JSON metadata (documentId,
 * storagePath, filename, mimeType, sizeBytes) — never a file body — after the browser has
 * already PUT the file straight to Supabase Storage in step 2. Triggers the rest of the
 * pipeline (extraction, hashing, diffing, chunking) by downloading the file from Storage
 * server-side, which has no incoming-request body size limit to worry about.
 *
 * storagePath is re-derived from documentId + filename and checked against the client's
 * value rather than trusted outright, so a client can't point this route at an
 * unrelated object.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { requireRole } from "@/lib/auth/require-role";
import { canUploadDocuments } from "@/lib/permissions";
import { ConfirmUploadSchema } from "@/features/documents/schemas/document-upload.schema";
import { processUpload } from "@/features/documents/upload-pipeline";

export async function POST(req: NextRequest) {
  const auth = await requireRole(
    canUploadDocuments,
    "Samo Admin i Super Admin mogu uploadovati dokumente.",
  );
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ConfirmUploadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Neispravan zahtjev." },
        { status: 400 },
      );
    }

    const { documentId, storagePath, filename, mimeType, sizeBytes } = parsed.data;

    const expectedExt = path.extname(filename) || "";
    const expectedPath = `${documentId}/original${expectedExt}`;
    if (storagePath !== expectedPath) {
      return NextResponse.json(
        { success: false, error: "Putanja u Storage-u ne odgovara očekivanom obrascu." },
        { status: 400 },
      );
    }

    const result = await processUpload({
      documentId,
      storagePath: expectedPath,
      originalFilename: filename,
      mimeType,
      sizeBytes,
      uploadedBy: auth.user.id,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Greška na serveru.";
    console.error("[API /documents/confirm-upload] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
