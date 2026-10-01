/**
 * GET /auth/confirm
 * Obrađuje token_hash email linkove (recovery, email verify, invite).
 * Verificira OTP, uspostavlja cookie sesiju, preusmjerava.
 *
 * Koristi POSTOJEĆI createSupabaseServerClient() (A-8, M-7) — nikad inline klijent.
 *
 * NAPOMENA (free tier): Supabase free tier trenutno šalje implicit-flow linkove
 * (#access_token u hashu), koji NE pogađaju ovu rutu — njih hvata AuthHashHandler
 * na klijentu. Ova ruta je ispravan put za token_hash linkove kad projekat pređe
 * na plaćeni plan / custom SMTP. Držimo je spremnu; ne smeta na free tier-u.
 * Vidi corrections/SPRINT_LESSONS_AUTH.md.
 */

import { createSupabaseServerClient } from "@/lib/db/supabase";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "recovery"
    | "email"
    | "signup"
    | "magiclink"
    | "invite"
    | null;

  if (!token_hash || !type) {
    return NextResponse.redirect(
      new URL(
        "/login?error=" +
          encodeURIComponent("Neispravan link. Pokušajte ponovo."),
        request.url,
      ),
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (error) {
      console.error("[auth/confirm] verifyOtp failed:", error.message);
      return NextResponse.redirect(
        new URL(
          "/login?error=" +
            encodeURIComponent(
              "Link je istekao ili je već iskorišten. Zatražite novi.",
            ),
          request.url,
        ),
      );
    }

    if (type === "recovery") {
      return NextResponse.redirect(new URL("/reset-password", request.url));
    }

    return NextResponse.redirect(new URL("/handbook", request.url));
  } catch (err) {
    console.error("[auth/confirm] unexpected error:", err);
    return NextResponse.redirect(
      new URL(
        "/login?error=" +
          encodeURIComponent(
            "Neočekivana greška pri potvrdi. Pokušajte ponovo.",
          ),
        request.url,
      ),
    );
  }
}
