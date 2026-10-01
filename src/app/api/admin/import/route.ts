/**
 * POST /api/admin/import
 * Role required: super_admin
 * Triggers USTAV import pipeline
 */

import { runImportPipeline } from "@/features/documents/import-pipeline";
import {
  storeImportedDocuments,
  storeIntegrityReport,
} from "@/features/documents/repository";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmail } from "@/features/authentication/repository";
import { isSuperAdmin } from "@/lib/permissions";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    // Auth check
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log(
      "[Import] Auth user:",
      user?.email,
      user?.id,
      "Error:",
      authError?.message,
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Niste prijavljeni." },
        { status: 401 },
      );
    }

    const { getUserByEmailDirect } =
      await import("@/features/authentication/repository");
    const dbUser = await getUserByEmailDirect(user.email!);
    console.log(
      "[Import] DB user:",
      dbUser?.email,
      dbUser?.role,
      dbUser?.status,
    );

    if (!dbUser || !isSuperAdmin(dbUser.role)) {
      return NextResponse.json(
        {
          success: false,
          error: `Debug: user=${user?.email}, dbUser=${JSON.stringify(dbUser)}`,
        },
        { status: 403 },
      );
    }

    console.log("[USTAV Import] Starting pipeline...");

    const result = await runImportPipeline();

    if (!result.success && result.documents.length === 0) {
      await storeIntegrityReport({
        importType: "USTAV_IMPORT",
        total: result.total,
        succeeded: 0,
        failed: result.total,
        status: "FAILED",
        details: { errors: result.errors },
      });

      return NextResponse.json(
        { success: false, error: result.errors[0], details: result.errors },
        { status: 400 },
      );
    }

    const { succeeded, failed, errors } = await storeImportedDocuments(
      result.documents,
      dbUser.id,
    );

    const status =
      failed === 0 ? "COMPLETE" : succeeded > 0 ? "PARTIAL" : "FAILED";

    await storeIntegrityReport({
      importType: "USTAV_IMPORT",
      total: result.total,
      succeeded,
      failed,
      status,
      details: {
        errors,
        categories: [...new Set(result.documents.map((d) => d.category))],
        importedAt: new Date().toISOString(),
      },
    });

    console.log(`[USTAV Import] Complete: ${succeeded}/${result.total}`);

    return NextResponse.json({
      success: true,
      total: result.total,
      succeeded,
      failed,
      status,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("[USTAV Import] Fatal:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
