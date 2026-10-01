/**
 * POST /api/admin/documents/[id]/approve
 * Role required: super_admin (canActivateDocuments)
 * Activates a staging document, archiving any previous active version with the same filename.
 * No document may be activated without explicit Super Admin approval (Constitution P-4) —
 * this check is hard-coded here, not just in the UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { canActivateDocuments } from "@/lib/permissions";
import { ApproveDocumentSchema } from "@/features/documents/schemas/document-upload.schema";
import { approveDocument } from "@/features/documents/review-pipeline";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(
    canActivateDocuments,
    "Samo Super Admin može aktivirati dokumente.",
  );
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const parsed = ApproveDocumentSchema.safeParse({ documentId: id });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Neispravan ID dokumenta." },
        { status: 400 },
      );
    }

    const result = await approveDocument(parsed.data.documentId, auth.user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Greška na serveru.";
    console.error("[API /admin/documents/[id]/approve] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
