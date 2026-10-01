/**
 * RBAC Permission checks — single source of truth
 * Import from here in every API route and Server Action
 * Never write inline role checks
 */

export type UserRole = "super_admin" | "admin" | "user";

export function isSuperAdmin(role: UserRole): boolean {
  return role === "super_admin";
}

export function isAdmin(role: UserRole): boolean {
  return role === "admin" || role === "super_admin";
}

export function isUser(role: UserRole): boolean {
  return true; // all authenticated users have user permissions
}

export function canApproveUsers(role: UserRole): boolean {
  return role === "super_admin";
}

export function canUploadDocuments(role: UserRole): boolean {
  return role === "admin" || role === "super_admin";
}

export function canActivateDocuments(role: UserRole): boolean {
  return role === "super_admin";
}

export function canViewAllProgress(role: UserRole): boolean {
  return role === "admin" || role === "super_admin";
}

// Read-only visibility into the document processing pipeline status
// (embedding/chapter/quiz/summary) -- same tier as canViewAllProgress.
// Triggering/consuming quota (canActivateDocuments' "Pokreni obradu sada")
// stays super_admin-only; this is display-only.
export function canViewPipelineStatus(role: UserRole): boolean {
  return role === "admin" || role === "super_admin";
}

export function canViewChatbotLogs(role: UserRole): boolean {
  return role === "super_admin";
}

export function canViewAuditLog(role: UserRole): boolean {
  return role === "super_admin";
}

export function canAccessArchive(role: UserRole): boolean {
  return role === "super_admin";
}

export function getDashboardRoute(role: UserRole): string {
  switch (role) {
    case "super_admin":
      return "/super-admin/documents";
    case "admin":
      return "/admin";
    case "user":
      return "/handbook";
  }
}
