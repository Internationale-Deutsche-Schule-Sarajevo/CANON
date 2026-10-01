/**
 * POST /api/admin/pipeline/run-now
 * Role required: super_admin (canActivateDocuments) -- triggering consumes
 * Gemini quota, so who gets to spend it stays a Director-only decision, same
 * tier as document approval itself. Read-only status (canViewPipelineStatus)
 * is deliberately a lower, broader bar -- see /api/admin/pipeline/status.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { canActivateDocuments } from "@/lib/permissions";
import { runPipelineWorker } from "@/features/pipeline/worker";

export async function POST() {
  const auth = await requireRole(canActivateDocuments, "Samo Super Admin može pokrenuti obradu.");
  if (!auth.ok) return auth.response;

  try {
    const result = await runPipelineWorker();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Greška na serveru.";
    console.error("[API /admin/pipeline/run-now] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
