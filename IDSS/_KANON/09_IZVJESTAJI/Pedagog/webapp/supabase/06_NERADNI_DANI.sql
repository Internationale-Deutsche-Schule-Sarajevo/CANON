-- Neradni dani (praznici, ferije, odluke uprave). Rokovi se računaju u radnim danima:
-- rok podnošenja = 5. u sljedećem mjesecu; ako je to neradni dan, pomjera se na prvi radni dan.
-- Tabela se nalazi u: Table Editor -> šema "public" -> tabela "neradni_dani" (kolone: datum, naziv).
-- Subote i nedjelje se ne unose, računaju se automatski. Datume uskladite sa školskim kalendarom i zakonom FBiH/KS.
insert into public.neradni_dani (datum, naziv) values
  ('2026-11-25', 'Dan državnosti Bosne i Hercegovine'),
  ('2027-01-01', 'Nova godina')
on conflict (datum) do nothing;
-- Dodavanje jednog dana: insert into public.neradni_dani (datum, naziv) values ('GGGG-MM-DD', 'Naziv');
