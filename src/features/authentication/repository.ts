/**
 * Authentication repository
 * All database queries for authentication feature
 * Never call these from UI components — only from Server Actions and API routes
 */

import { createSupabaseAdminClient } from "@/lib/db/supabase";
import type { UserRole } from "@/lib/permissions";

export async function createRegistrationRequest(data: {
  email: string;
  full_name: string;
  role_requested: UserRole;
}): Promise<string> {
  const supabase = await createSupabaseAdminClient();

  const { data: request, error } = await supabase
    .from("registration_requests")
    .insert({
      email: data.email,
      full_name: data.full_name,
      role_requested: data.role_requested,
      status: "pending",
    })
    .select("id")
    .single();

  if (error)
    throw new Error(`createRegistrationRequest failed: ${error.message}`);
  return request.id;
}

export async function getPendingRegistrations() {
  const supabase = await createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("registration_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error)
    throw new Error(`getPendingRegistrations failed: ${error.message}`);
  return data;
}

export async function approveRegistration(
  requestId: string,
  reviewedBy: string,
): Promise<{ email: string; full_name: string; role_requested: string }> {
  const supabase = await createSupabaseAdminClient();

  // Get request details
  const { data: request, error: fetchError } = await supabase
    .from("registration_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (fetchError || !request) {
    throw new Error(`approveRegistration: request not found`);
  }

  // Update request status
  const { error: updateError } = await supabase
    .from("registration_requests")
    .update({
      status: "approved",
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError)
    throw new Error(
      `approveRegistration update failed: ${updateError.message}`,
    );

  // Create user record
  const { error: userError } = await supabase.from("users").insert({
    email: request.email,
    full_name: request.full_name,
    role: request.role_requested,
    status: "approved",
    approved_by: reviewedBy,
    approved_at: new Date().toISOString(),
  });

  if (userError)
    throw new Error(
      `approveRegistration user creation failed: ${userError.message}`,
    );

  return {
    email: request.email,
    full_name: request.full_name,
    role_requested: request.role_requested,
  };
}

export async function rejectRegistration(
  requestId: string,
  reviewedBy: string,
  reason: string,
): Promise<{ email: string; full_name: string }> {
  const supabase = await createSupabaseAdminClient();

  const { data: request, error: fetchError } = await supabase
    .from("registration_requests")
    .select("email, full_name")
    .eq("id", requestId)
    .single();

  if (fetchError || !request) {
    throw new Error(`rejectRegistration: request not found`);
  }

  const { error } = await supabase
    .from("registration_requests")
    .update({
      status: "rejected",
      rejection_reason: reason,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) throw new Error(`rejectRegistration failed: ${error.message}`);

  return { email: request.email, full_name: request.full_name };
}

export async function getUserByEmail(email: string) {
  const supabase = await createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, status")
    .eq("email", email)
    .single();

  if (error) return null;
  return data;
}
/**
 * Get user by email using direct admin client (for API routes)
 */
export async function getUserByEmailDirect(email: string) {
  const { createSupabaseDirectAdmin } = await import("@/lib/db/supabase");
  const supabase = createSupabaseDirectAdmin();

  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, status")
    .eq("email", email)
    .single();

  if (error) return null;
  return data;
}
