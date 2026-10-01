/**
 * POST /api/admin/documents/approve-all
 * Role required: super_admin (canActivateDocuments)
 * Bulk scenario: approves every currently-staged document in one call
 * (see approveAllStagingDocuments in review-pipeline.ts) -- same per-document
 * approve/audit-log/embedding logic as the single-document route, queued at
 * priority='bulk' so a concurrently-approved single urgent document still
 * jumps ahead in the pipeline worker.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { canActivateDocuments } from "@/lib/permissions";
import { listStagingDocuments } from "@/features/documents/upload-repository";
import { approveAllStagingDocuments } from "@/features/documents/review-pipeline";

export async function POST() {
  const auth = await requireRole(canActivateDocuments, "Samo Super Admin može odobriti dokumente.");
  if (!auth.ok) return auth.response;

  try {
    const staging = await listStagingDocuments();
    const documentIds = (staging ?? []).map((d) => d.id);

    if (documentIds.length === 0) {
      return NextResponse.json({ success: true, approved: [], failed: [] });
    }

    const result = await approveAllStagingDocuments(documentIds, auth.user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Greška na serveru.";
    console.error("[API /admin/documents/approve-all] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
