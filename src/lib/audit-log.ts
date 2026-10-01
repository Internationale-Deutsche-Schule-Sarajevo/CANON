/**
 * Audit Log — single source of truth for writing to public.audit_log
 * Every state-changing admin action must call this.
 * Failures here are logged but never thrown — audit logging must not block the action it records.
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";

export type AuditLogEntry = {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
};

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  const supabase = createSupabaseDirectAdmin();

  const { error } = await supabase.from("audit_log").insert({
    user_id: entry.userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    before_state: entry.beforeState ?? null,
    after_state: entry.afterState ?? null,
  });

  if (error) {
    console.error(`[AuditLog] Failed to log "${entry.action}":`, error.message);
  }
}
