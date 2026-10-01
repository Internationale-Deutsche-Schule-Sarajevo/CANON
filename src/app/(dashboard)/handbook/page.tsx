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
    <main className="container mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-idss-teal">
              IDSS Handbook
            </p>
            <h1 className="text-3xl font-bold text-idss-dark-blue">
              Priručnik za nastavnike
            </h1>
          </div>
          <a
            href="https://github.com/Internationale-Deutsche-Schule-Sarajevo/CANON"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-idss-dark-blue underline decoration-idss-teal decoration-2 underline-offset-4 hover:text-idss-teal"
          >
            Kanonski izvor
          </a>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
          Sadržaj priručnika dolazi isključivo iz odobrenih dokumenata u IDSS
          CANON repozitoriju. Ako dokument nije u kanonu, ne pripada ovom
          priručniku.
        </p>
      </header>
      <ChapterList userId={dbUser.id} />
    </main>
  );
}
