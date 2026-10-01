import { z } from 'zod';

/**
 * Environment Variable Validation
 * 
 * This module validates all required environment variables at startup.
 * The application will refuse to start if any required variable is missing.
 * 
 * All environment access should go through this module - never use process.env directly.
 */

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // AI Provider
  AI_PROVIDER: z.string().min(1),
  GEMINI_API_KEY_1: z.string().min(1),
  GEMINI_API_KEY_2: z.string().min(1),
  GEMINI_API_KEY_3: z.string().min(1),
  GEMINI_API_KEY_4: z.string().min(1),
  GEMINI_API_KEY_5: z.string().min(1),
  GEMINI_API_KEY_6: z.string().min(1),
  GEMINI_API_KEY_7: z.string().min(1),
  GEMINI_API_KEY_8: z.string().min(1),

  // Email
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),

  // OCR
  OCR_SPACE_API_KEY: z.string().min(1),

  // Error tracking
  SENTRY_DSN: z.string().min(1),

  // Pipeline automation -- shared secret Vercel Cron sends as
  // `Authorization: Bearer <CRON_SECRET>`; every other admin route is
  // session-gated only, which a cron invocation cannot satisfy.
  CRON_SECRET: z.string().min(1),
});

// Custom error messages for each missing key
const errorMessages: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'FATAL: NEXT_PUBLIC_SUPABASE_URL is missing. This key is required for Supabase connection.',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'FATAL: NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. This key is required for Supabase client authentication.',
  SUPABASE_SERVICE_ROLE_KEY: 'FATAL: SUPABASE_SERVICE_ROLE_KEY is missing. This key is required for Supabase server-side operations.',
  AI_PROVIDER: 'FATAL: AI_PROVIDER is missing. This key is required to specify the AI provider.',
  GEMINI_API_KEY_1: 'FATAL: GEMINI_API_KEY_1 is missing. This key is required for AI generation.',
  GEMINI_API_KEY_2: 'FATAL: GEMINI_API_KEY_2 is missing. This key is required for AI generation key rotation.',
  GEMINI_API_KEY_3: 'FATAL: GEMINI_API_KEY_3 is missing. This key is required for AI generation key rotation.',
  GEMINI_API_KEY_4: 'FATAL: GEMINI_API_KEY_4 is missing. This key is required for AI generation key rotation.',
  GEMINI_API_KEY_5: 'FATAL: GEMINI_API_KEY_5 is missing. This key is required for AI generation key rotation.',
  GEMINI_API_KEY_6: 'FATAL: GEMINI_API_KEY_6 is missing. This key is required for AI generation key rotation.',
  GEMINI_API_KEY_7: 'FATAL: GEMINI_API_KEY_7 is missing. This key is required for AI generation key rotation.',
  GEMINI_API_KEY_8: 'FATAL: GEMINI_API_KEY_8 is missing. This key is required for AI generation key rotation.',
  RESEND_API_KEY: 'FATAL: RESEND_API_KEY is missing. This key is required for email sending.',
  RESEND_FROM_EMAIL: 'FATAL: RESEND_FROM_EMAIL is missing. This key is required to specify the sender email address.',
  OCR_SPACE_API_KEY: 'FATAL: OCR_SPACE_API_KEY is missing. This key is required for OCR processing.',
  SENTRY_DSN: 'FATAL: SENTRY_DSN is missing. This key is required for error tracking.',
  CRON_SECRET: 'FATAL: CRON_SECRET is missing. This key is required to authorize Vercel Cron pipeline requests.',
};

/**
 * Parse and validate environment variables.
 * Throws an error with clear FATAL message if any required variable is missing.
 */
const result = envSchema.safeParse(process.env);

if (!result.success) {
  const errors = result.error.issues;
  // Get the first missing key and throw its custom error message
  if (errors && errors.length > 0) {
    const firstError = errors[0];
    const key = firstError.path[0] as string;
    const message = errorMessages[key] || `FATAL: ${key} is missing.`;
    throw new Error(message);
  }
  throw new Error('FATAL: One or more required environment variables are missing.');
}

export const env = result.data;

/**
 * Type-safe environment variables object.
 * Import this everywhere instead of using process.env directly.
 */
export type Env = z.infer<typeof envSchema>;
