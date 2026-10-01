// src/app/(dashboard)/handbook/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import { ChapterList } from "@/features/handbook/components/ChapterList";

export default async function HandbookPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const dbUser = await getUserByEmailDirect(user.email);
  if (!dbUser) redirect("/login");

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-3xl font-bold text-idss-dark-blue mb-6">
        Priručnik za nastavnike
      </h1>
      <ChapterList userId={dbUser.id} />
    </div>
  );
}
