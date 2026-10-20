-- Neradni dani za izračun rokova (5. u mjesecu → sljedeći radni dan; dopuna 3 radna dana).
-- Ako postoji tabela public.neradni_dani aplikacije IDSS Pedagog, kopira se iz nje (isti kalendar škole);
-- uz to se dodaju nepromjenjivi državni praznici BiH. Pokretljive praznike (bajrami, Uskrs i dr.) unesite ručno.
do $$
begin
  if to_regclass('public.neradni_dani') is not null then
    execute 'insert into psih.neradni_dani(datum, naziv) select datum, naziv from public.neradni_dani on conflict (datum) do nothing';
  end if;
end $$;
insert into psih.neradni_dani(datum, naziv) values
  ('2026-11-25', 'Dan državnosti BiH'),
  ('2027-01-01', 'Nova godina'), ('2027-01-02', 'Nova godina'),
  ('2027-03-01', 'Dan nezavisnosti BiH'),
  ('2027-05-01', 'Praznik rada'), ('2027-05-02', 'Praznik rada')
on conflict (datum) do nothing;
select datum, naziv from psih.neradni_dani order by datum;
