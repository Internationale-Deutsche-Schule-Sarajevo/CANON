/**
 * POST /api/admin/generate-quiz-questions
 * Role required: super_admin
 * Generates 15 quiz questions for every chapter that doesn't already have
 * a sufficient pool. Idempotent — generateAllQuizQuestions() skips chapters
 * that already have >= 15 questions.
 */

import { generateAllQuizQuestions } from "@/features/quiz/generator";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import { isSuperAdmin } from "@/lib/permissions";
import { NextResponse } from "next/server";

export async function POST() {
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

    console.log("[Generate Quiz Questions API] Starting quiz generation pipeline...");
    const result = await generateAllQuizQuestions();

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("[Generate Quiz Questions API] Fatal:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
