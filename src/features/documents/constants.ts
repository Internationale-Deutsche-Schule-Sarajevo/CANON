/**
 * Client-safe constants for the document upload feature.
 * No server-only imports here (no env access, no Supabase admin client) —
 * this file is imported from both server code and Client Components.
 */

export const STAGING_BUCKET = "staging-documents";
export const ARCHIVED_BUCKET = "archived-documents";
