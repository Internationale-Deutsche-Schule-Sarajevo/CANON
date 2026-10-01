// src/app/(dashboard)/quiz/[chapterId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import {
  getAllChapters,
  getUserProgressMap,
  hasMinimumReadingTimeElapsed,
  hasScrolledToEnd,
} from "@/features/handbook/repository";
import { computeChapterUnlockState } from "@/features/handbook/chapter-lock";
import { ChapterIdParamSchema } from "@/features/handbook/schemas/reader.schema";
import { QuizCard } from "@/features/quiz/components/QuizCard";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ chapterId: string }>;
}) {
  const resolvedParams = await params;
  const parsedParam = ChapterIdParamSchema.safeParse(resolvedParams);
  if (!parsedParam.success) notFound();
  const { chapterId } = parsedParam.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const dbUser = await getUserByEmailDirect(user.email);
  if (!dbUser) redirect("/login");

  const chapters = await getAllChapters();
  if (!chapters.some((c) => c.id === chapterId)) notFound();

  // Reuse the same lock logic as the handbook reader — a chapter's quiz is
  // reachable whenever the chapter itself is (unlocked or already completed).
  const progressMap = await getUserProgressMap(dbUser.id);
  const stateMap = computeChapterUnlockState(chapters, progressMap);
  const state = stateMap.get(chapterId);

  if (state === "locked") {
    redirect("/handbook");
  }

  // Closes the direct-URL-navigation gap: a chapter being "unlocked" only
  // means the PREVIOUS chapter is done — it says nothing about whether THIS
  // chapter's own 3-minute/100%-scroll reading requirement has been met. A
  // user could otherwise open this page the instant the chapter unlocks,
  // wait out 180s elsewhere without ever visiting /handbook/[chapterId], and
  // reach the quiz having never read a word. Retaking an already-completed
  // chapter's quiz (practice mode in the reader) is exempt, same exemption
  // submitQuizAnswers applies for the same reason.
  if (state !== "completed") {
    const [timeElapsed, scrolledToEnd] = await Promise.all([
      hasMinimumReadingTimeElapsed(dbUser.id, chapterId),
      hasScrolledToEnd(dbUser.id, chapterId),
    ]);
    if (!timeElapsed || !scrolledToEnd) {
      redirect(`/handbook/${chapterId}`);
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-idss-dark-blue mb-6">Kviz</h1>
      <QuizCard chapterId={chapterId} />
    </div>
  );
}
