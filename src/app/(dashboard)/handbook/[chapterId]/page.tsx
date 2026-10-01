// src/app/(dashboard)/handbook/[chapterId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import {
  getAllChapters,
  getChapterById,
  getUserProgressMap,
  upsertChapterOpened,
} from "@/features/handbook/repository";
import { computeChapterUnlockState } from "@/features/handbook/chapter-lock";
import { ChapterIdParamSchema } from "@/features/handbook/schemas/reader.schema";
import { ChapterReader } from "@/features/handbook/components/ChapterReader";

export default async function ChapterPage({
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

  // Server-side lock enforcement: the UI hides links to locked chapters, but
  // that's trivially bypassed by navigating to the URL directly, so the
  // same shared lock logic used by ChapterList is re-checked here.
  const progressMap = await getUserProgressMap(dbUser.id);
  const stateMap = computeChapterUnlockState(chapters, progressMap);
  const state = stateMap.get(chapterId);
  if (state === "locked") {
    redirect("/handbook");
  }

  const chapter = await getChapterById(chapterId);
  if (!chapter) notFound();

  const isPracticeMode = state === "completed";

  // Practice mode is a free re-read — no server writes, no timer/scroll
  // requirements. Otherwise, record the open (first-open-only; see
  // upsertChapterOpened) and use the server's timestamp to drive the timer.
  const chapterOpenedAt = isPracticeMode
    ? null
    : (await upsertChapterOpened(dbUser.id, chapterId)).chapterOpenedAt;

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <ChapterReader
        chapter={{
          id: chapter.id,
          title: chapter.title,
          content: chapter.content,
          summary: chapter.summary,
        }}
        isPracticeMode={isPracticeMode}
        chapterOpenedAt={chapterOpenedAt}
      />
    </div>
  );
}
