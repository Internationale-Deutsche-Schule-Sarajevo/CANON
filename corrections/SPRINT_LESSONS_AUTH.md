# Auth / Password Reset — Lessons Learned

Date: 2026-07-17
Context: Ad-hoc bug-fix izvan sprinta (Faza 6 Authentication već "gotova").
Prilika: direktor@idss.ba zaboravio lozinku, reset link nije radio.

---

## Corrections Applied

- [Reset link vodi na homepage, ne na formu] → [Supabase free tier šalje
  implicit-flow link (#access_token u hashu), koji nijedna ruta nije
  obrađivala. Dodan AuthHashHandler (klijentski) koji hvata hash + PASSWORD_RECOVERY
  event i preusmjerava na /reset-password] → Commander: A-8 (Supabase klijenti),
  M-10 (čitaj prije nego gradiš)

- [Prva verzija reset koda kršila više pravila] → [Ispravljeno na usklađenost s
  postojećim kodom] → relevantna pravila:
  - E-2 / M-7: validacija lozinke prebačena inline → u ResetPasswordSchema
    (lib/validation/schemas.ts), importuje se
  - E-11 / M-5: business logika izvučena iz UI komponente (pravila u schemi)
  - A-8 / M-7: duplirani inline Supabase klijenti → postojeći
    createSupabaseServerClient() i createSupabaseBrowserClient()
  - P-10: em-dash u email subjectu uklonjen

## Gotchas Discovered

- Supabase free tier NE dozvoljava uređivanje email template-a u dashboardu
  (Authentication → Email Templates zaključan). Custom template zahtijeva
  Pro plan ili custom SMTP (npr. Resend). Branded template pripremljen za kasnije.

- Free tier UVIJEK šalje implicit-flow linkove (#access_token u hashu), ne
  token_hash query. Zato:
  - sesija oporavka živi u BROWSER klijentu (localStorage), ne u cookie-ju
  - updateUser() mora ići klijentski (Server Action ne vidi tu sesiju)
  - /auth/confirm ruta (token_hash → cookie sesija) je ispravan put SAMO za
    plaćeni plan / custom SMTP; držimo je spremnu za upgrade

- Recovery link je jednokratan. Ponovni klik na isti URL nakon prve upotrebe
  ne uspostavlja sesiju (izgleda kao "vraća na homepage"). Treba novi link.

- Supabase odbija updateUser ako je nova lozinka ista kao stara
  ("New password should be different") — 422. Vrijedno mapirati u čitljivu
  bosansku poruku umjesto generičke greške.

---

## Commander Improvement Candidates

Dvije stvarne kontradikcije između napisanih pravila i stvarnog stanja koda.
Za Direktora da razriješi na KRAJ (M-22):

- **E-3 / DL-007 (React Hook Form + Zod Resolver) vs. stvarnost:** Cijeli
  src/app/(auth)/ folder (login, register) NE koristi RHF — koristi Server
  Actions + FormData + useState. RHF nije ni instaliran. Pravilo mandira RHF
  "za sve forme", ali projekat ga nikad nije usvojio. Kandidati:
  (a) usvojiti RHF projektno (jedan sprint refaktora), ili
  (b) dodati projektni [DEPRECATED] note u projektni Constitution da IDSS
  Handbook koristi Server Action + FormData obrazac umjesto RHF.
  Nova reset stranica namjerno prati (b) — konzistentnost koda (M-8) i
  Library Discipline (M-12) iznad napisanog pravila koje kod ne poštuje.

- **E-11 (Inline style={{}} zabranjen → koristi Tailwind) vs. stvarnost:**
  Cijeli codebase koristi inline style={{}} s CSS design-tokenima
  (var(--space-_), var(--idss-_)), NE Tailwind klase. login/page.tsx čak
  hardkodira #ffe0e0 (E-11 zabranjuje hardkodirani hex) za error pozadinu.
  Reset stranica prati taj isti obrazac radi konzistentnosti. Kandidat:
  uskladiti E-11 s projektnim DESIGN_SYSTEM.md pristupom (tokeni preko inline
  style su prihvatljivi), i dodati --error-bg token da se makne #ffe0e0.

---

## Proces napomena (M-18)

Ovaj fajl je prvi u projektnom corrections/ folderu — folder ranije nije
postojao, iako ga M-18 zahtijeva. Ubuduće svaki sprint završava svojim
corrections/SPRINT_XX_LESSONS.md, u filesystem-u, ne u ACA memoriji.
