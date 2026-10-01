/**
 * POST /api/admin/documents/[id]/reject
 * Role required: super_admin (canActivateDocuments)
 * Body: { reason: string } — minimum 10 characters, required.
 * Rejected documents are stored as status='archived' with rejection_reason set
 * (document_status has no dedicated 'rejected' value).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { canActivateDocuments } from "@/lib/permissions";
import { RejectDocumentSchema } from "@/features/documents/schemas/document-upload.schema";
import { rejectDocument } from "@/features/documents/review-pipeline";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(
    canActivateDocuments,
    "Samo Super Admin može odbiti dokumente.",
  );
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const parsed = RejectDocumentSchema.safeParse({ documentId: id, reason: body.reason });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Neispravan zahtjev." },
        { status: 400 },
      );
    }

    const result = await rejectDocument(parsed.data.documentId, parsed.data.reason, auth.user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Greška na serveru.";
    console.error("[API /admin/documents/[id]/reject] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
