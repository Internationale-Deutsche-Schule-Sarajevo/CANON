-- =====================================================================
-- IDSS Pedagog — Mjesečni izvještaj :: 001_osnova.sql
-- Tabele, pomoćne funkcije za rokove i nepromjenjivost zapisa.
-- Pokreće se u Supabase SQL Editoru (uloga postgres). Idempotentno.
-- Sav pristup podacima ide ISKLJUČIVO kroz RPC funkcije (003), nikad direktno.
-- =====================================================================

create schema if not exists interno;
revoke all on schema interno from public;

-- ---------- Profili (uloga se čita ISKLJUČIVO iz ove tabele, nikad iz klijenta) ----------
create table if not exists public.profili (
  id           uuid primary key references auth.users(id) on delete restrict,
  ime          text not null check (char_length(btrim(ime)) between 2 and 120),
  uloga        text not null check (uloga in ('pedagog','direktor')),
  aktivan      boolean not null default true,
  telefon      text check (telefon is null or char_length(telefon) between 6 and 30),
  prvi_period  date not null default (date_trunc('month', now() at time zone 'Europe/Sarajevo'))::date
               check (extract(day from prvi_period) = 1),
  kreiran      timestamptz not null default now()
);

alter table public.profili add column if not exists telefon text check (telefon is null or char_length(telefon) between 6 and 30);

-- ---------- Postavke (podesive vrijednosti; zapis samo vlasnik baze) ----------
create table if not exists public.postavke (
  kljuc       text primary key,
  vrijednost  jsonb not null,
  opis        text
);
insert into public.postavke (kljuc, vrijednost, opis) values
  ('rok_dan_sljedeceg_mjeseca', '5',  'Kalendarski dan sljedećeg mjeseca do kojeg se podnosi izvještaj (DEC-05).'),
  ('rok_dopune_radnih_dana',    '3',  'Broj radnih dana za dopunu nakon vraćanja izvještaja (DEC-05).')
on conflict (kljuc) do nothing;

-- ---------- Neradni dani (praznici, ferije, odluke uprave) ----------
create table if not exists public.neradni_dani (
  datum  date primary key,
  naziv  text not null check (char_length(naziv) between 2 and 120)
);

-- ---------- Izvještaji ----------
create table if not exists public.izvjestaji (
  id               uuid primary key default gen_random_uuid(),
  pedagog_id       uuid not null references public.profili(id),
  godina           int  not null check (godina between 2024 and 2100),
  mjesec           int  not null check (mjesec between 1 and 12),
  status           text not null default 'nacrt' check (status in ('nacrt','podnesen','vracen','odobren')),
  revizija         int  not null default 1,            -- optimistično zaključavanje: raste pri SVAKOJ promjeni
  ciklus           int  not null default 0,            -- broj dosadašnjih podnošenja
  sadrzaj          jsonb not null default '{}'::jsonb,
  posljednji_zahtjev uuid,                             -- idempotentnost (ponovljeni zahtjev ne mijenja stanje)
  rok_podnosenja   date not null,
  rok_dopune       date,
  podnesen_u       timestamptz,
  vracen_u         timestamptz,
  odobren_u        timestamptz,
  direktor_napomena text,
  direktor_ocjena  int check (direktor_ocjena between 0 and 5),
  na_vrijeme       boolean,                             -- da li je PRVO podnošenje bilo u roku
  prvo_kasnjenje   int,                                 -- radnih dana kašnjenja PRVOG podnošenja
  kasnjenje_dopune int,                                 -- radnih dana kašnjenja posljednje dopune
  bodovi           jsonb,                               -- posljednji obračun IDSS bodova
  kreiran          timestamptz not null default now(),
  azuriran         timestamptz not null default now(),
  unique (pedagog_id, godina, mjesec)
);

-- ---------- Nepromjenjivi snimci podnesenih verzija ----------
create table if not exists public.izvjestaj_snimci (
  id           bigint generated always as identity primary key,
  izvjestaj_id uuid not null references public.izvjestaji(id),
  ciklus       int  not null,
  sadrzaj      jsonb not null,
  rizici       jsonb not null,
  preporuke    jsonb not null,
  kpi          jsonb not null,
  bodovi       jsonb not null,
  kreiran      timestamptz not null default now(),
  unique (izvjestaj_id, ciklus)
);

-- ---------- Rizici: identitet (jednom) + stanje po periodu ----------
create table if not exists public.rizici (
  id            uuid primary key default gen_random_uuid(),
  pedagog_id    uuid not null references public.profili(id),
  kod           text not null unique,
  kreiran_godina int not null,
  kreiran_mjesec int not null,
  kategorija    text not null check (kategorija in ('Pedagoški / Ponašanje','Akademski','Sigurnosni / Zaštita djece','Organizacijski')),
  opis          text not null check (char_length(opis) between 10 and 500),
  kreiran       timestamptz not null default now()
);
create table if not exists public.rizik_stanja (
  rizik_id  uuid not null references public.rizici(id),
  godina    int  not null,
  mjesec    int  not null,
  ozbiljnost text not null check (ozbiljnost in ('Nizak','Srednji','Visok','Kritičan')),
  mjera     text not null check (char_length(mjera) between 0 and 500),
  rok       date,
  status    text not null check (status in ('Otvoreno','U toku','Riješeno','Eskalirano')),
  primary key (rizik_id, godina, mjesec)
);
create table if not exists public.rizik_brojac (
  godina int primary key,
  zadnji int not null
);

-- ---------- Preporuke direktoru ----------
create table if not exists public.preporuke (
  id            uuid primary key default gen_random_uuid(),
  redni         bigint generated always as identity,
  izvjestaj_id  uuid not null references public.izvjestaji(id),
  naslov        text not null check (char_length(naslov) between 5 and 150),
  obrazlozenje  text not null check (char_length(obrazlozenje) between 0 and 1000),
  utjecaj       text not null check (utjecaj in ('Nema troškova','Potreban budžet','Kadrovska odluka','Organizacijska izmjena')),
  odluka        text not null default 'Na čekanju' check (odluka in ('Na čekanju','Odobreno','Odbijeno','Potrebna dorada')),
  komentar_direktora text check (char_length(komentar_direktora) <= 1000),
  odlucio_u     timestamptz,
  kreirana      timestamptz not null default now()
);

-- ---------- Revizorski trag (samo dodavanje; bez sadržaja izvještaja) ----------
create table if not exists public.revizorski_trag (
  id            bigint generated always as identity primary key,
  vrijeme       timestamptz not null default now(),
  akter_id      uuid,
  akter_uloga   text,
  akcija        text not null,
  izvjestaj_id  uuid,
  sazetak       jsonb not null default '{}'::jsonb
);

create index if not exists izvjestaji_period_idx on public.izvjestaji (godina, mjesec);
create index if not exists rizik_stanja_period_idx on public.rizik_stanja (godina, mjesec);
create index if not exists preporuke_izv_idx on public.preporuke (izvjestaj_id);
create index if not exists trag_izv_idx on public.revizorski_trag (izvjestaj_id, vrijeme);

-- ---------- Nepromjenjivost snimaka i traga ----------
create or replace function interno.zabrani_izmjenu() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Zapis je nepromjenjiv (%.%).', tg_table_schema, tg_table_name using errcode = '42501';
end $$;

drop trigger if exists snimci_nepromjenjivi on public.izvjestaj_snimci;
create trigger snimci_nepromjenjivi before update or delete on public.izvjestaj_snimci
  for each row execute function interno.zabrani_izmjenu();
drop trigger if exists snimci_bez_truncate on public.izvjestaj_snimci;
create trigger snimci_bez_truncate before truncate on public.izvjestaj_snimci
  for each statement execute function interno.zabrani_izmjenu();

drop trigger if exists trag_nepromjenjiv on public.revizorski_trag;
create trigger trag_nepromjenjiv before update or delete on public.revizorski_trag
  for each row execute function interno.zabrani_izmjenu();
drop trigger if exists trag_bez_truncate on public.revizorski_trag;
create trigger trag_bez_truncate before truncate on public.revizorski_trag
  for each statement execute function interno.zabrani_izmjenu();

-- Odobren izvještaj se ne mijenja ni direktnim SQL-om (osim polja koja nastaju pri odobrenju).
create or replace function interno.zakljucaj_odobren() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'odobren' then
    raise exception 'Odobren izvještaj je zaključan.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'nacrt' or old.ciklus > 0 then
      raise exception 'Podneseni izvještaj se ne briše.' using errcode = '42501';
    end if;
    return old;
  end if;
  return new;
end $$;
drop trigger if exists izvjestaj_zakljucan on public.izvjestaji;
create trigger izvjestaj_zakljucan before update or delete on public.izvjestaji
  for each row execute function interno.zakljucaj_odobren();

-- ---------- Datum i rokovi (Europe/Sarajevo) ----------
create or replace function interno.danas() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Sarajevo')::date $$;

create or replace function interno.radni_dan(d date) returns boolean
language sql stable set search_path = '' as $$
  select extract(isodow from d) < 6
     and not exists (select 1 from public.neradni_dani n where n.datum = d) $$;

-- prvi radni dan >= d
create or replace function interno.sljedeci_radni_dan(d date) returns date
language plpgsql stable set search_path = '' as $$
declare x date := d; i int := 0;
begin
  while not interno.radni_dan(x) loop
    x := x + 1; i := i + 1;
    if i > 400 then raise exception 'Kalendar neradnih dana nije ispravan.'; end if;
  end loop;
  return x;
end $$;

-- n radnih dana NAKON d
create or replace function interno.dodaj_radne_dane(d date, n int) returns date
language plpgsql stable set search_path = '' as $$
declare x date := d; k int := 0; i int := 0;
begin
  while k < n loop
    x := x + 1; i := i + 1;
    if interno.radni_dan(x) then k := k + 1; end if;
    if i > 800 then raise exception 'Kalendar neradnih dana nije ispravan.'; end if;
  end loop;
  return x;
end $$;

-- broj radnih dana u intervalu (od, do]; 0 ako do <= od
create or replace function interno.radnih_dana_izmedju(od date, do_ date) returns int
language sql stable set search_path = '' as $$
  select case when do_ <= od then 0 else
    (select count(*)::int from generate_series(od + 1, do_, interval '1 day') g(d)
      where interno.radni_dan(g.d::date)) end $$;

create or replace function interno.postavka_int(p_kljuc text, p_zadano int) returns int
language sql stable set search_path = '' as $$
  select coalesce((select (vrijednost #>> '{}')::int from public.postavke where kljuc = p_kljuc), p_zadano) $$;

-- Rok podnošenja za period: rok_dan-ti dan sljedećeg mjeseca, pomaknut na prvi radni dan
create or replace function interno.rok_podnosenja(p_godina int, p_mjesec int) returns date
language sql stable set search_path = '' as $$
  select interno.sljedeci_radni_dan(
    (make_date(p_godina, p_mjesec, 1) + interval '1 month')::date
    + (interno.postavka_int('rok_dan_sljedeceg_mjeseca', 5) - 1)) $$;

create or replace function interno.kraj_mjeseca(p_godina int, p_mjesec int) returns date
language sql immutable set search_path = '' as $$
  select (make_date(p_godina, p_mjesec, 1) + interval '1 month - 1 day')::date $$;

-- redni broj perioda radi poređenja preko granice godine (prosinac -> januar)
create or replace function interno.period_broj(p_godina int, p_mjesec int) returns int
language sql immutable set search_path = '' as $$ select p_godina * 12 + p_mjesec $$;

-- Školska godina počinje u septembru
create or replace function interno.skolska_godina(p_godina int, p_mjesec int) returns int
language sql immutable set search_path = '' as $$
  select case when p_mjesec >= 9 then p_godina else p_godina - 1 end $$;
