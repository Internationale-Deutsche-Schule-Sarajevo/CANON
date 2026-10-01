/**
 * GET /api/admin/documents/staging
 * Role required: super_admin
 * Lists documents pending review (status = 'staging'), including diff summaries.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { isSuperAdmin } from "@/lib/permissions";
import { listStagingDocuments } from "@/features/documents/upload-repository";

export async function GET() {
  const auth = await requireRole(
    isSuperAdmin,
    "Samo Super Admin može pregledati dokumente na čekanju.",
  );
  if (!auth.ok) return auth.response;

  try {
    const documents = await listStagingDocuments();
    return NextResponse.json({ success: true, documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Greška na serveru.";
    console.error("[API /admin/documents/staging] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
