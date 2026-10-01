/**
 * Shared RBAC guard for API routes.
 * Checked at API level first (per Constitution P-4) — every mutating admin route must call this.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import type { UserRole } from "@/lib/permissions";

type RequireRoleResult =
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getUserByEmailDirect>>> }
  | { ok: false; response: NextResponse };

export async function requireRole(
  check: (role: UserRole) => boolean,
  forbiddenMessage = "Nemate ovlaštenje za ovu akciju.",
): Promise<RequireRoleResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Niste prijavljeni." },
        { status: 401 },
      ),
    };
  }

  const dbUser = await getUserByEmailDirect(user.email);
  if (!dbUser || !check(dbUser.role as UserRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: forbiddenMessage },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user: dbUser };
}
