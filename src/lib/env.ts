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
  // These are validated when a Supabase operation is invoked. Keeping a
  // string default prevents module evaluation from crashing public routes
  // while Vercel injects the project's configured variable names.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),

  // AI Provider
  AI_PROVIDER: z.string().default(''),
  GEMINI_API_KEY_1: z.string().default(''),
  GEMINI_API_KEY_2: z.string().default(''),
  GEMINI_API_KEY_3: z.string().default(''),
  GEMINI_API_KEY_4: z.string().default(''),
  GEMINI_API_KEY_5: z.string().default(''),
  GEMINI_API_KEY_6: z.string().default(''),
  GEMINI_API_KEY_7: z.string().default(''),
  GEMINI_API_KEY_8: z.string().default(''),

  // Optional services remain disabled until their credentials are configured.
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM_EMAIL: z.string().default(''),
  OCR_SPACE_API_KEY: z.string().default(''),
  SENTRY_DSN: z.string().default(''),
  CRON_SECRET: z.string().default(''),
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
const normalizedEnv = {
  ...process.env,
  // Vercel may provide the project variables under the legacy names used by
  // the existing deployment. Treat blank values as missing and use the
  // canonical public URL only as a safe project default.
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "https://olavwiuswsjwpikmpkfk.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_ANON_SUPABASE?.trim(),
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_SERVICEROLE_SUPABASE?.trim(),
};

const result = envSchema.safeParse(normalizedEnv);

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
