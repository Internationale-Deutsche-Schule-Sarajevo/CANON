-- LOKALNO: sadrži stvarne lične podatke. NE ŠALJITE u Git repozitorij (CANON: bez stvarnih ličnih podataka u datotekama).
-- Prvo u Supabase: Authentication > Users > Add user (e-pošta + lozinka) za pedagog@idss.ba i za direktora.
select interno.dodaj_profil('pedagog@idss.ba', 'Adnana Agić', 'pedagog', date '2026-09-01', '+38762997155');
-- Direktor (zamijenite e-poštu sa stvarnom adresom direktora):
-- select interno.dodaj_profil('direktor@idss.ba', 'Davor Mulalić', 'direktor', date '2026-09-01');
