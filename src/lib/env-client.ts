/**
 * Client-safe environment variables — for use in Client Components only.
 *
 * '@/lib/env' validates the whole process.env object through a Zod schema at runtime.
 * That works server-side, but Next.js/Turbopack can only statically inline
 * `process.env.NEXT_PUBLIC_X` when it appears as a direct literal in the source —
 * not when it's read off a dynamically-parsed process.env object. In the browser
 * bundle, process.env ends up effectively empty except for those direct literals,
 * so importing '@/lib/env' from client code throws "NEXT_PUBLIC_X is missing" even
 * when it's set correctly in .env. This file exists so client code has a safe,
 * statically-inlinable source for the two public env vars it's allowed to see.
 */

export const clientEnv = {
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://olavwiuswsjwpikmpkfk.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_ANON_SUPABASE!,
} as const;

if (!clientEnv.NEXT_PUBLIC_SUPABASE_URL || !clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error(
    "FATAL: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. " +
      "These must be set in .env for client-side Supabase access.",
  );
}
