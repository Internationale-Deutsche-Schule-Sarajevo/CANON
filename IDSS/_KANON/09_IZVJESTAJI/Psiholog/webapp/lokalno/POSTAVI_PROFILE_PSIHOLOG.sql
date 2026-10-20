-- =====================================================================
-- IDSS Psiholog: profili korisnika (pokrenuti u Supabase SQL Editoru POSLIJE PSIH_1_BAZA.sql)
-- Preduslov: korisnici već postoje u Authentication > Users (isti projekat kao IDSS Pedagog).
--   psiholog@idss.ba   — nov korisnik; kreirajte ga (Add user > Create new user, "Auto Confirm User" uključeno)
--   direktor@idss.ba   — već postoji (isti račun kao u aplikaciji IDSS Pedagog)
-- Ova skripta NE dira aplikaciju IDSS Pedagog.
-- =====================================================================

-- 1) Dijagnostika: da li korisnici postoje i jesu li potvrđeni
select email, email_confirmed_at is not null as potvrdjen, last_sign_in_at
from auth.users where lower(email) in ('psiholog@idss.ba', 'direktor@idss.ba') order by email;

-- 2) Potvrda e-pošte (samo ako gore piše potvrdjen = false)
update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now())
where lower(email) in ('psiholog@idss.ba', 'direktor@idss.ba');

-- 3) Profili
select psih.dodaj_profil('psiholog@idss.ba', 'Medina Karaga', 'psiholog', date '2026-09-01', '+38761074551');
select psih.dodaj_profil('direktor@idss.ba', 'Direktor škole', 'direktor', date '2026-09-01', null);

-- 4) Provjera
select p.ime, p.uloga, p.aktivan, u.email from psih.profili p join auth.users u on u.id = p.id order by p.uloga;
