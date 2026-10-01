/**
 * POST /api/documents/upload-url
 * Role required: admin or super_admin (canUploadDocuments)
 *
 * Step 1 of the direct-to-storage upload flow. Validates filename/mime/size via Zod,
 * mints a Supabase Storage signed upload URL, and returns it to the client — no file
 * body ever passes through this route, so it stays well under any serverless request
 * body size limit (e.g. Vercel's ~4.5MB default) regardless of the 10MB file cap.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import path from "path";
import { requireRole } from "@/lib/auth/require-role";
import { canUploadDocuments } from "@/lib/permissions";
import { RequestUploadUrlSchema } from "@/features/documents/schemas/document-upload.schema";
import { createStagingUploadUrl } from "@/features/documents/services/storage";

export async function POST(req: NextRequest) {
  const auth = await requireRole(
    canUploadDocuments,
    "Samo Admin i Super Admin mogu uploadovati dokumente.",
  );
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const meta = RequestUploadUrlSchema.safeParse(body);

    if (!meta.success) {
      return NextResponse.json(
        { success: false, error: meta.error.issues[0]?.message ?? "Neispravan fajl." },
        { status: 400 },
      );
    }

    const documentId = randomUUID();
    const ext = path.extname(meta.data.filename) || "";
    const storagePath = `${documentId}/original${ext}`;

    const { signedUrl, token } = await createStagingUploadUrl(storagePath);

    return NextResponse.json({
      success: true,
      documentId,
      storagePath,
      signedUrl,
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Greška na serveru.";
    console.error("[API /documents/upload-url] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
