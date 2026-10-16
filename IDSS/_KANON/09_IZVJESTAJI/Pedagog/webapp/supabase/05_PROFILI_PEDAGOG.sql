-- 1) Dijagnostika: da li korisnik postoji i da li je e-pošta potvrđena (email_confirmed_at ne smije biti prazno)
select email, email_confirmed_at from auth.users order by created_at;

-- 2) Ako je email_confirmed_at prazno, potvrdite račun (inače prijava ne radi):
update auth.users set email_confirmed_at = now()
 where lower(email) = 'pedagog@idss.ba' and email_confirmed_at is null;

-- 3) Profil pedagoga (račun mora prethodno postojati u Authentication > Users)
select interno.dodaj_profil('pedagog@idss.ba', 'Adnana Agić', 'pedagog', date '2026-09-01', '+38762997155');

-- 4) Profil direktora: zamijenite e-poštu stvarnom adresom direktora (račun mora postojati u Authentication > Users), pa uklonite "--"
-- update auth.users set email_confirmed_at = now() where lower(email) = 'DIREKTOR@EPOSTA' and email_confirmed_at is null;
-- select interno.dodaj_profil('DIREKTOR@EPOSTA', 'Davor Mulalić', 'direktor', date '2026-09-01');

-- 5) Provjera: obje uloge moraju biti navedene
select p.ime, p.uloga, p.telefon, u.email from public.profili p join auth.users u on u.id = p.id;
