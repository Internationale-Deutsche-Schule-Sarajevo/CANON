/**
 * Client-safe constants for the Handbook reader feature.
 * No server-only imports here (no env access, no Supabase admin client) —
 * this file is imported from both server code (repository.ts) and the
 * ChapterReader Client Component, so both share one source of truth
 * instead of two magic numbers drifting apart.
 */

export const MINIMUM_READING_SECONDS = 180;
// 1.0 (100%), per the final Director-confirmed spec (2026-09-09): "both
// conditions together" — was 0.95 (95%).
export const SCROLL_THRESHOLD = 1.0;
