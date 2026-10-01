/**
 * GET /api/admin/pipeline/status
 * Role required: admin or super_admin (canViewPipelineStatus) -- read-only.
 * Backs both the admin (read-only) and super-admin (full) pipeline
 * dashboards described in the approved plan (misty-hugging-galaxy.md, tacka 4).
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { canViewPipelineStatus } from "@/lib/permissions";
import { getStatusSummary } from "@/features/pipeline/repository";

export async function GET() {
  const auth = await requireRole(canViewPipelineStatus, "Nemate ovlaštenje za pregled statusa obrade.");
  if (!auth.ok) return auth.response;

  try {
    const summary = await getStatusSummary();
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Greška na serveru.";
    console.error("[API /admin/pipeline/status] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
