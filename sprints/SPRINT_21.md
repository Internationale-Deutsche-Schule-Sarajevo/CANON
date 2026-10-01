# SPRINT_21 — Final QA
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Every module verified. Every role tested. Build passes clean. App is ready for real use.

---

## Scope — IN

- End-to-end test of all 21 modules across all 3 roles
- All edge cases tested and documented
- `npm run build` clean with zero errors
- `vercel.json` configured with correct timeouts
- `.env.example` complete and accurate
- All Done Checklist items verified across entire codebase
- `CHANGELOG.md` complete
- `DECISION_LOG.md` complete

## Scope — OUT

- New features
- Redesigns

---

## Full QA Checklist

### Super Admin Flow
- [ ] Register → appears as PENDING
- [ ] Super Admin approves registration → user can log in
- [ ] Super Admin rejects registration → user gets email with reason
- [ ] Upload document as Admin → Super Admin sees it in review queue
- [ ] Super Admin approves document → ecosystem updates automatically
- [ ] Super Admin views full chatbot conversation logs
- [ ] Super Admin views audit log (every action is there)
- [ ] Super Admin views user progress across all chapters
- [ ] Super Admin triggers manual reindex → runs correctly
- [ ] Super Admin exports progress report as DOCX

### Admin Flow
- [ ] Admin logs in → redirected to /admin
- [ ] Admin uploads PDF → pipeline runs, status updates in real time
- [ ] Admin uploads file > 10MB → rejected with Bosnian error
- [ ] Admin uploads wrong file type → rejected with Bosnian error
- [ ] Admin sees their document rejected → receives email with reason
- [ ] Admin cannot approve their own document (button not present, API returns 403)

### User Flow
- [ ] User logs in → redirected to /handbook
- [ ] User cannot access /admin or /super-admin (redirected)
- [ ] User opens Chapter 1 → quiz button locked
- [ ] User scrolls 100% + waits 3 minutes → quiz button unlocks
- [ ] User submits quiz without waiting 3 minutes server-side → rejected
- [ ] User answers quiz incorrectly → correct/incorrect states show correctly
- [ ] User answers incorrectly 3 times → empathy animation plays
- [ ] User passes 5/5 → Chapter 2 unlocks, points awarded, celebrate() fires
- [ ] User earns first badge → badge appears in profile
- [ ] User asks chatbot grounded question → gets institutional answer
- [ ] User asks chatbot ungrounded question → gets exact refusal message in Bosnian
- [ ] User sends 21 chatbot messages in 1 hour → 21st is rate limited

### Build and Deploy
- [ ] `npm run build` — zero errors
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Zero console errors in browser (all three roles)
- [ ] `vercel.json` present with: default timeout 60s, OCR/embedding routes 300s
- [ ] `.env.example` has every variable used in the codebase
- [ ] No real secrets in `.env.example`
- [ ] Sentry receives errors correctly

### Done Checklist Final Run
- [ ] Every item in Commander DONE_CHECKLIST.md verified across entire codebase:
      https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md

---

## Final Handoff Note

After this sprint, write a handoff note covering:
- What is complete
- What is NOT yet built (known gaps)
- Known technical debt
- Recommended next development priorities
- How to onboard the next ACA

---

*This sprint marks the completion of Phase 1 of IDSS Handbook v1.0.*
*P.U. Internationale Deutsche Schule Sarajevo — direktor@idss.ba*
