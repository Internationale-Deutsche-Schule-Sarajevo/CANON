# SPRINT_06 — Authentication System
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Complete authentication: login, logout, registration request, Super Admin approval.
No user can enter the app without explicit Director approval.

---

## Scope — IN

- Login page (email + password via Supabase Auth)
- Registration request form (stores as PENDING, no auto-approval)
- "Pending approval" page shown after registration
- Super Admin approval/rejection interface (basic, full dashboard in Sprint 19)
- Email notification on approval/rejection (Resend)
- Role-based redirect after login (super_admin → /super-admin, admin → /admin, user → /handbook)
- Protected route middleware (redirect to login if no session)
- HTTP-only session cookie via Supabase SSR

## Scope — OUT

- Full Super Admin dashboard (Sprint 19)
- Profile editing
- Password reset flow (document as future work in DECISION_LOG)

---

## Acceptance Criteria

- [ ] User can register with full name, email (@idss.ba), password, role request
- [ ] Registration stores as status=`PENDING` — user cannot log in
- [ ] Super Admin receives email notification of new pending registration
- [ ] Super Admin can approve or reject in dashboard (with rejection reason)
- [ ] Approved user receives email with outcome
- [ ] Rejected user receives email with reason
- [ ] Approved user can log in and is redirected by role
- [ ] Unauthenticated access to any dashboard route → redirected to /login
- [ ] Wrong role access (user accessing /admin) → redirected to correct dashboard
- [ ] Session expires after 8 hours
- [ ] `npx tsc --noEmit` passes

---

## Security Checklist

- [ ] No OAuth, no magic links, no passkeys — email+password only
- [ ] Password hashed by Supabase Auth (bcrypt)
- [ ] Session cookie: HTTP-only, SameSite=Strict
- [ ] Role check happens server-side in middleware
- [ ] No role claim trusted from client
- [ ] `SUPABASE_SERVICE_ROLE_KEY` used only for admin approval action

---

## Email Templates (Resend)

All emails in Bosnian. Sender display: "IDSS Direktor" <direktor@idss.ba>

1. New registration pending (to Super Admin):
   Subject: "Nova registracija čeka odobrenje"

2. Registration approved (to applicant):
   Subject: "Vaša registracija je odobrena"

3. Registration rejected (to applicant):
   Subject: "Vaša registracija nije odobrena"
   Body includes: rejection reason

---

## Files Expected to Change

- `app/(auth)/login/page.tsx`
- `app/(auth)/register/page.tsx`
- `app/(auth)/pending/page.tsx`
- `app/(dashboard)/super-admin/registrations/page.tsx`
- `features/authentication/actions.ts`
- `features/authentication/repository.ts`
- `features/authentication/schemas.ts`
- `lib/email/resend.ts`
- `lib/db/supabase.ts`
- `lib/db/supabase-browser.ts`
- `middleware.ts`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
