/**
 * GET /api/admin/documents/pending-count
 * Role required: admin or super_admin
 * Returns the count of documents awaiting Super Admin review.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { isAdmin } from "@/lib/permissions";
import { getPendingDocumentsCount } from "@/features/documents/upload-repository";

export async function GET() {
  const auth = await requireRole(isAdmin);
  if (!auth.ok) return auth.response;

  const count = await getPendingDocumentsCount();
  return NextResponse.json({ success: true, count });
}
