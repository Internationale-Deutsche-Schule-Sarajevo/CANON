"use client";

/**
 * AuthHashHandler — hvata Supabase free-tier implicit-flow linkove.
 *
 * Free tier šalje reset linkove s #access_token u URL hashu (ne token_hash query).
 * Supabase browser klijent automatski parsira hash i uspostavlja sesiju, pa emituje
 * PASSWORD_RECOVERY event. Ovaj handler:
 *   1. Pretplaćuje se na onAuthStateChange (hvata event ako stigne nakon mounta)
 *   2. Direktno provjerava window.location.hash na mountu (event može planuti PRIJE
 *      nego se pretplata registruje — tada getSession() potvrdi sesiju)
 * i preusmjerava na /reset-password.
 *
 * Koristi POSTOJEĆI createSupabaseBrowserClient() (A-8, M-7).
 * Montira se kao prvi child <body> u root layoutu.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

export function AuthHashHandler() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.push("/reset-password");
      }
    });

    // Event je mogao planuti prije pretplate — provjeri hash direktno.
    if (
      typeof window !== "undefined" &&
      window.location.hash.includes("type=recovery")
    ) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.push("/reset-password");
        }
      });
    }

    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
