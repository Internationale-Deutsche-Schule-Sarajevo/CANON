/**
 * GET /api/admin/import/status
 * Role required: super_admin
 * Returns latest import status
 */

import {
  getLatestIntegrityReport,
  getActiveDocumentsCount,
} from "@/features/documents/repository";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [report, count] = await Promise.all([
      getLatestIntegrityReport(),
      getActiveDocumentsCount(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        latestReport: report,
        activeDocumentsCount: count,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
