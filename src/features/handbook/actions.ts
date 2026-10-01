/**
 * Handbook Reader Server Actions
 * Same auth pattern as quiz/actions.ts: resolve the Supabase auth user to a
 * public.users row via email, never trust a client-supplied user id.
 */

"use server";

import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import { markScrolledToEnd } from "./repository";
import { ChapterIdParamSchema } from "./schemas/reader.schema";

export type ConfirmScrolledToEndResult = { success: true } | { success: false; error: string };

/**
 * Called by ChapterReader once the client-side scroll tracker crosses
 * SCROLL_THRESHOLD (100%) — records it server-side so submitQuizAnswers and
 * the quiz page's access check can require it, not just the UI button state.
 */
export async function confirmScrolledToEnd(chapterId: string): Promise<ConfirmScrolledToEndResult> {
  const parsed = ChapterIdParamSchema.safeParse({ chapterId });
  if (!parsed.success) {
    return { success: false, error: "Neispravan ID poglavlja." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { success: false, error: "Niste prijavljeni." };
  }

  const dbUser = await getUserByEmailDirect(user.email);
  if (!dbUser) {
    return { success: false, error: "Niste prijavljeni." };
  }

  try {
    await markScrolledToEnd(dbUser.id, parsed.data.chapterId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
