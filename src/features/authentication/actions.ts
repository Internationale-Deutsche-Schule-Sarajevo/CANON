"use server";

import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/db/supabase";
import {
  RegisterSchema,
  LoginSchema,
  ApproveRegistrationSchema,
  RejectRegistrationSchema,
} from "@/lib/validation/schemas";
import {
  createRegistrationRequest,
  approveRegistration,
  rejectRegistration,
  getUserByEmail,
} from "./repository";
import {
  sendNewRegistrationNotification,
  sendRegistrationApproved,
  sendRegistrationRejected,
} from "@/lib/email/resend";
import { canApproveUsers, getDashboardRoute } from "@/lib/permissions";
import { redirect } from "next/navigation";

export async function registerAction(formData: FormData) {
  const raw = {
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role_requested: formData.get("role_requested") ?? "user",
  };

  const result = RegisterSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.issues[0].message };
  }

  const { full_name, email, password, role_requested } = result.data;

  try {
    const supabase = await createSupabaseAdminClient();
    const { error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        return { success: false, error: "Email adresa je već registrovana." };
      }
      throw authError;
    }

    await createRegistrationRequest({
      email,
      full_name,
      role_requested: role_requested as "user" | "admin",
    });

    try {
      await sendNewRegistrationNotification(full_name, email, role_requested);
    } catch (emailError) {
      console.warn(
        "[registerAction] Email notification failed (non-critical):",
        emailError,
      );
    }

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Greška pri registraciji";
    console.error("[registerAction]", message);
    return { success: false, error: "Došlo je do greške. Pokušajte ponovo." };
  }
}

export async function loginAction(formData: FormData) {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const result = LoginSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.issues[0].message };
  }

  const { email, password } = result.data;

  try {
    // Direct Supabase Auth call
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ email, password }),
      },
    );

    if (!response.ok) {
      return { success: false, error: "Neispravni email ili lozinka." };
    }

    // Check if user is approved in our users table
    const supabase = await createSupabaseAdminClient();
    const user = await getUserByEmail(email);

    if (!user || user.status !== "approved") {
      return {
        success: false,
        error: "Vaš račun čeka odobrenje direktora škole.",
      };
    }

    // Create proper session via Supabase SSR client
    const supabaseServer = await createSupabaseServerClient();
    const { error } = await supabaseServer.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: "Neispravni email ili lozinka." };
    }

    return { success: true, redirectTo: getDashboardRoute(user.role) };
  } catch (error) {
    console.error("[loginAction]", error);
    return { success: false, error: "Došlo je do greške. Pokušajte ponovo." };
  }
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function approveRegistrationAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niste prijavljeni." };

  const dbUser = await getUserByEmail(user.email!);
  if (!dbUser || !canApproveUsers(dbUser.role)) {
    return { success: false, error: "Nemate ovlaštenje za ovu akciju." };
  }

  const result = ApproveRegistrationSchema.safeParse({
    request_id: formData.get("request_id"),
  });
  if (!result.success) return { success: false, error: "Neispravan zahtjev." };

  try {
    const approved = await approveRegistration(
      result.data.request_id,
      dbUser.id,
    );
    try {
      await sendRegistrationApproved(approved.email, approved.full_name);
    } catch (emailError) {
      console.warn(
        "[approveRegistrationAction] Email failed (non-critical):",
        emailError,
      );
    }
    return { success: true };
  } catch (error) {
    console.error("[approveRegistrationAction]", error);
    return { success: false, error: "Greška pri odobravanju." };
  }
}

export async function rejectRegistrationAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niste prijavljeni." };

  const dbUser = await getUserByEmail(user.email!);
  if (!dbUser || !canApproveUsers(dbUser.role)) {
    return { success: false, error: "Nemate ovlaštenje za ovu akciju." };
  }

  const result = RejectRegistrationSchema.safeParse({
    request_id: formData.get("request_id"),
    reason: formData.get("reason"),
  });
  if (!result.success)
    return { success: false, error: result.error.issues[0].message };

  try {
    const rejected = await rejectRegistration(
      result.data.request_id,
      dbUser.id,
      result.data.reason,
    );
    try {
      await sendRegistrationRejected(
        rejected.email,
        rejected.full_name,
        result.data.reason,
      );
    } catch (emailError) {
      console.warn(
        "[rejectRegistrationAction] Email failed (non-critical):",
        emailError,
      );
    }
    return { success: true };
  } catch (error) {
    console.error("[rejectRegistrationAction]", error);
    return { success: false, error: "Greška pri odbijanju." };
  }
}
