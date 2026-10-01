# SPRINT_02 — Environment Validation
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

The application must refuse to start if any required environment variable is missing.
Every secret has a named home. No ACA can accidentally run with a broken environment.

---

## Scope — IN

- Startup environment validation for all required `.env` keys
- Clear `FATAL:` error message for each missing variable (includes key name and purpose)
- Validation runs before any route, connection, or service initialisation
- `lib/env.ts` — typed, validated environment module

## Scope — OUT

- No database connection yet (Sprint 05)
- No actual API calls with the keys
- No UI changes

---

## Acceptance Criteria

- [ ] App throws `FATAL: GEMINI_API_KEY_1 is missing. This key is required for AI generation.`
      (and similar) for each missing key when starting
- [ ] App starts normally when all keys are present
- [ ] `lib/env.ts` exports typed environment object used everywhere
      (never `process.env.X` directly in business code)
- [ ] `.env.example` updated if any key was missed in Sprint 01

---

## Implementation

Create `lib/env.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, 'FATAL: NEXT_PUBLIC_SUPABASE_URL is missing.'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'FATAL: NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'FATAL: SUPABASE_SERVICE_ROLE_KEY is missing.'),
  GEMINI_API_KEY_1: z.string().min(1, 'FATAL: GEMINI_API_KEY_1 is missing.'),
  // ... all 8 keys + all other required vars
});

export const env = envSchema.parse(process.env);
```

Import `env` from `lib/env.ts` everywhere. Never use `process.env.X` directly.

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
