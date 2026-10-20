-- =====================================================================
-- IDSS Psiholog — Mjesečni izvještaj: BAZA (zasebna šema "psih")
-- Pokrenuti jednom u Supabase SQL Editoru. Ne dira nijednu tabelu ni
-- funkciju aplikacije IDSS Pedagog. Dijeli samo Supabase Auth (auth.users).
-- Pravila: sve tabele imaju RLS bez politika; anon i authenticated nemaju
-- nikakva prava nad šemom psih; klijent smije samo pozivati RPC funkcije
-- public.idss_psih_*, koje rade kao SECURITY DEFINER; uloga se uzima
-- isključivo iz psih.profili. Server je mjerodavan za validaciju i bodove.
-- =====================================================================

create schema if not exists psih;
revoke all on schema psih from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then revoke all on schema psih from anon; end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then revoke all on schema psih from authenticated; end if;
end $$;

-- ---------------------------------------------------------------- tabele
create table if not exists psih.profili (
  id          uuid primary key references auth.users(id) on delete cascade,
  ime         text not null check (char_length(ime) between 2 and 120),
  uloga       text not null check (uloga in ('psiholog','direktor')),
  aktivan     boolean not null default true,
  telefon     text check (telefon is null or telefon ~ '^\+?[0-9 ]{6,20}$'),
  prvi_period date not null default date '2026-09-01',
  kreiran     timestamptz not null default now()
);

create table if not exists psih.neradni_dani (
  datum date primary key,
  naziv text not null
);

create table if not exists psih.brojaci (
  godina int primary key,
  n      int not null default 0
);

create table if not exists psih.izvjestaji (
  id                 uuid primary key default gen_random_uuid(),
  psiholog_id        uuid not null references psih.profili(id),
  godina             int  not null check (godina between 2024 and 2100),
  mjesec             int  not null check (mjesec between 1 and 12),
  status             text not null default 'nacrt' check (status in ('nacrt','podnesen','vracen','odobren')),
  revizija           int  not null default 1,
  ciklus             int  not null default 0,
  sadrzaj            jsonb not null default '{}'::jsonb check (pg_column_size(sadrzaj) < 262144),
  rizici             jsonb not null default '[]'::jsonb check (jsonb_typeof(rizici) = 'array'),
  preporuke          jsonb not null default '[]'::jsonb check (jsonb_typeof(preporuke) = 'array'),
  rok_podnosenja     date not null,
  rok_dopune         date,
  podnesen_u         timestamptz,
  vracen_u           timestamptz,
  odobren_u          timestamptz,
  direktor_napomena  text,
  direktor_ocjena    int check (direktor_ocjena between 0 and 5),
  na_vrijeme         boolean,
  prvo_kasnjenje     int,
  kasnjenje_dopune   int,
  bodovi             jsonb,
  posljednji_zahtjev uuid,
  kreiran            timestamptz not null default now(),
  izmijenjen         timestamptz not null default now(),
  unique (psiholog_id, godina, mjesec)
);

create table if not exists psih.izvjestaj_snimci (
  id           bigserial primary key,
  izvjestaj_id uuid not null references psih.izvjestaji(id),
  ciklus       int not null,
  sadrzaj      jsonb not null,
  rizici       jsonb not null,
  preporuke    jsonb not null,
  kpi          jsonb not null,
  bodovi       jsonb not null,
  kreiran      timestamptz not null default now(),
  unique (izvjestaj_id, ciklus)
);

create table if not exists psih.revizorski_trag (
  id           bigserial primary key,
  izvjestaj_id uuid references psih.izvjestaji(id),
  korisnik_id  uuid,
  akter        text,
  uloga        text,
  akcija       text not null,
  sazetak      jsonb not null default '{}'::jsonb,
  kreiran      timestamptz not null default now()
);
create index if not exists psih_trag_izv on psih.revizorski_trag(izvjestaj_id, kreiran);

alter table psih.profili           enable row level security;
alter table psih.neradni_dani      enable row level security;
alter table psih.brojaci           enable row level security;
alter table psih.izvjestaji        enable row level security;
alter table psih.izvjestaj_snimci  enable row level security;
alter table psih.revizorski_trag   enable row level security;

-- Snimci i revizorski trag su samo za dodavanje.
create or replace function psih.zabrani_izmjenu() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Zapis je nepromjenjiv.' using errcode='42501'; end $$;

drop trigger if exists snimci_nepromjenjivi on psih.izvjestaj_snimci;
create trigger snimci_nepromjenjivi before update or delete on psih.izvjestaj_snimci
  for each row execute function psih.zabrani_izmjenu();
drop trigger if exists trag_nepromjenjiv on psih.revizorski_trag;
create trigger trag_nepromjenjiv before update or delete on psih.revizorski_trag
  for each row execute function psih.zabrani_izmjenu();

-- Odobren izvještaj se ne mijenja; brisanje izvještaja nije moguće.
create or replace function psih.zakljucaj_izvjestaj() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Izvještaj se ne briše.' using errcode='42501';
  end if;
  if old.status = 'odobren' then
    raise exception 'Odobren izvještaj je zaključan.' using errcode='42501';
  end if;
  if new.psiholog_id <> old.psiholog_id or new.godina <> old.godina or new.mjesec <> old.mjesec then
    raise exception 'Vlasnik i period izvještaja se ne mijenjaju.' using errcode='42501';
  end if;
  new.izmijenjen := now();
  return new;
end $$;
drop trigger if exists izvjestaj_zakljucan on psih.izvjestaji;
create trigger izvjestaj_zakljucan before update or delete on psih.izvjestaji
  for each row execute function psih.zakljucaj_izvjestaj();

-- ------------------------------------------------------- datumi i rokovi
create or replace function psih.danas() returns date
language sql stable set search_path='' as $$
  select coalesce(nullif(current_setting('psih.danas_test', true), '')::date,
                  (now() at time zone 'Europe/Sarajevo')::date)
$$;

create or replace function psih.radni_dan(d date) returns boolean
language sql stable set search_path='' as $$
  select extract(isodow from d) < 6 and not exists (select 1 from psih.neradni_dani n where n.datum = d)
$$;

create or replace function psih.sljedeci_radni_dan(d date) returns date
language plpgsql stable set search_path='' as $$
declare x date := d; i int := 0;
begin
  while not psih.radni_dan(x) and i < 60 loop x := x + 1; i := i + 1; end loop;
  return x;
end $$;

create or replace function psih.dodaj_radne_dane(d date, n int) returns date
language plpgsql stable set search_path='' as $$
declare x date := d; k int := 0; i int := 0;
begin
  while k < n and i < 200 loop
    x := x + 1; i := i + 1;
    if psih.radni_dan(x) then k := k + 1; end if;
  end loop;
  return x;
end $$;

create or replace function psih.radnih_dana_izmedju(a date, b date) returns int
language sql stable set search_path='' as $$
  select case when a is null or b is null or b <= a then 0 else
    (select count(*)::int from generate_series(a + 1, b, interval '1 day') g(d) where psih.radni_dan(g.d::date))
  end
$$;

-- Rok: 5. u sljedećem mjesecu; ako je neradni dan, sljedeći radni dan.
create or replace function psih.rok_podnosenja(g int, m int) returns date
language sql stable set search_path='' as $$
  select psih.sljedeci_radni_dan((make_date(g, m, 1) + interval '1 month')::date + 4)
$$;

create or replace function psih.pb(g int, m int) returns int
language sql immutable set search_path='' as $$ select g * 12 + m $$;
create or replace function psih.pb_g(b int) returns int
language sql immutable set search_path='' as $$ select (b - 1) / 12 $$;
create or replace function psih.pb_m(b int) returns int
language sql immutable set search_path='' as $$ select b - ((b - 1) / 12) * 12 $$;
create or replace function psih.skolska(g int, m int) returns int
language sql immutable set search_path='' as $$ select case when m >= 9 then g else g - 1 end $$;
create or replace function psih.kraj_mjeseca(g int, m int) returns date
language sql immutable set search_path='' as $$ select ((make_date(g, m, 1) + interval '1 month')::date - 1) $$;
