/**
 * GET /api/quiz/[chapterId]/questions
 * Role required: any logged-in user
 * Returns the chapter's fixed 5-question test (deterministic "first 5" of the
 * pool, per the final quiz spec — not a random draw; see getFirstFiveQuestions).
 * Deliberately strips correct_index and explanation from the response — those
 * are only revealed via submitQuizAnswers() after the user actually answers,
 * so the correct answers can never be read out of the network response
 * beforehand.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import { getFirstFiveQuestions } from "@/features/quiz/repository";
import { ChapterIdParamSchema } from "@/features/handbook/schemas/reader.schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chapterId: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json(
      { success: false, error: "Niste prijavljeni." },
      { status: 401 },
    );
  }

  const dbUser = await getUserByEmailDirect(user.email);
  if (!dbUser) {
    return NextResponse.json(
      { success: false, error: "Niste prijavljeni." },
      { status: 401 },
    );
  }

  const resolvedParams = await params;
  const parsed = ChapterIdParamSchema.safeParse(resolvedParams);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Neispravan ID poglavlja." },
      { status: 400 },
    );
  }

  try {
    const questions = await getFirstFiveQuestions(parsed.data.chapterId);
    const sanitized = questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
    }));

    return NextResponse.json({ success: true, questions: sanitized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Greška na serveru.";
    console.error("[API /quiz/[chapterId]/questions] Fatal:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
