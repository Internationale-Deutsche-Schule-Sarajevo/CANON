/**
 * POST /api/admin/generate-chapters
 * Role required: super_admin
 * Triggers Handbook chapter generation for all active documents.
 * Body (optional): { forceRegenerate?: boolean } — defaults to false (idempotent:
 * only documents without an existing chapter are processed).
 */

import { generateAllChapters } from "@/features/handbook/generator";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import { isSuperAdmin } from "@/lib/permissions";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Niste prijavljeni." },
        { status: 401 },
      );
    }

    const dbUser = await getUserByEmailDirect(user.email!);
    if (!dbUser || !isSuperAdmin(dbUser.role)) {
      return NextResponse.json(
        { success: false, error: "Samo Super Admin." },
        { status: 403 },
      );
    }

    let forceRegenerate = false;
    try {
      const body = await req.json();
      forceRegenerate = body?.forceRegenerate === true;
    } catch {
      // No JSON body sent — default to idempotent mode.
    }

    console.log(
      `[Generate Chapters API] Starting chapter generation pipeline (forceRegenerate=${forceRegenerate})...`,
    );
    const result = await generateAllChapters(forceRegenerate);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("[Generate Chapters API] Fatal:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
