/**
 * GET /api/cron/process-pipeline
 * Vercel Cron entry point -- the Hobby-plan daily "did the pipeline get
 * stuck?" safety net described in the approved plan (misty-hugging-galaxy.md).
 * Vercel invokes this with `Authorization: Bearer $CRON_SECRET`, which no
 * other admin route accepts (they're all Supabase-session gated) -- hence a
 * dedicated route rather than reusing /api/admin/pipeline/run-now.
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runPipelineWorker } from "@/features/pipeline/worker";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runPipelineWorker();
    console.log("[Cron ProcessPipeline] Result:", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("[Cron ProcessPipeline] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
