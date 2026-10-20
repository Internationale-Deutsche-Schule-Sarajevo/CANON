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
-- ================================================== validacija sadržaja
-- Ogledalo je JS modul Logika (src/logika.js); isti kodovi i poruke.
-- Paritet provjerava tests/40_paritet.mjs.

create or replace function psih.nil(v jsonb) returns boolean
language sql immutable set search_path='' as $$ select v is null or jsonb_typeof(v) = 'null' $$;

create or replace function psih.je_obj(v jsonb) returns boolean
language sql immutable set search_path='' as $$ select v is not null and jsonb_typeof(v) = 'object' $$;

create or replace function psih.obj(s jsonb, k text) returns jsonb
language sql immutable set search_path='' as $$
  select case when psih.je_obj(s) and psih.je_obj(s -> k) then s -> k else '{}'::jsonb end
$$;

create or replace function psih.ci(o jsonb, k text) returns bigint
language sql immutable set search_path='' as $$
  select case when psih.je_obj(o) and jsonb_typeof(o -> k) = 'number'
               and (o ->> k)::numeric = trunc((o ->> k)::numeric) and abs((o ->> k)::numeric) <= 2147483647
              then (o ->> k)::numeric::bigint else null end
$$;

create or replace function psih.tk(o jsonb, k text) returns text
language sql immutable set search_path='' as $$
  select case when psih.je_obj(o) and jsonb_typeof(o -> k) = 'string' then btrim(o ->> k) else null end
$$;

create or replace function psih.g(p text, k text, m text) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_array(jsonb_build_object('polje', p, 'kod', k, 'poruka', m))
$$;

create or replace function psih.je_datum(t text) returns boolean
language plpgsql immutable set search_path='' as $$
declare d date;
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  if substr(t, 1, 4)::int < 100 then return false; end if;
  d := t::date;
  return to_char(d, 'YYYY-MM-DD') = t;
exception when others then return false;
end $$;

create or replace function psih.fmt_datum(t text) returns text
language sql immutable set search_path='' as $$
  select case when t is null or t = '' then '' else substr(t, 9, 2) || '.' || substr(t, 6, 2) || '.' || substr(t, 1, 4) || '.' end
$$;

create or replace function psih.e_cijeli(o jsonb, k text, naziv text, mn int, mx int, ob boolean, put text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb := o -> k; n numeric;
begin
  if psih.nil(v) then
    return case when ob then psih.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje (unesite 0 ako nema aktivnosti).') else '[]'::jsonb end;
  end if;
  if jsonb_typeof(v) <> 'number' then return psih.g(put || '.' || k, 'TIP', naziv || ' mora biti cijeli broj.'); end if;
  n := (v #>> '{}')::numeric;
  if n <> trunc(n) then return psih.g(put || '.' || k, 'TIP', naziv || ' mora biti cijeli broj.'); end if;
  if n < mn or n > mx then return psih.g(put || '.' || k, 'RASPON', naziv || ' mora biti između ' || mn || ' i ' || mx || '.'); end if;
  return '[]'::jsonb;
end $$;

create or replace function psih.e_tekst(o jsonb, k text, naziv text, mn int, mx int, ob boolean, put text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb := o -> k; t text; tt text;
begin
  if psih.nil(v) then
    return case when ob then psih.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje.') else '[]'::jsonb end;
  end if;
  if jsonb_typeof(v) <> 'string' then return psih.g(put || '.' || k, 'TIP', naziv || ' mora biti tekst.'); end if;
  t := v #>> '{}'; tt := btrim(t);
  if t ~ ('[' || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || ']') then
    return psih.g(put || '.' || k, 'ZNAKOVI', naziv || ' sadrži nedozvoljene kontrolne znakove.');
  end if;
  if char_length(t) > mx then return psih.g(put || '.' || k, 'PRODUGO', naziv || ' može imati najviše ' || mx || ' znakova.'); end if;
  if ob then
    if tt = '' then return psih.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje.'); end if;
    if char_length(tt) < mn then
      return psih.g(put || '.' || k, 'PREKRATKO', naziv || ' mora imati najmanje ' || mn || ' znakova (trenutno ' || char_length(tt) || ').');
    end if;
  end if;
  return '[]'::jsonb;
end $$;

create or replace function psih.e_enum(o jsonb, k text, naziv text, dozv text[], ob boolean, put text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb := o -> k;
begin
  if psih.nil(v) then
    return case when ob then psih.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje.') else '[]'::jsonb end;
  end if;
  if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = any (dozv)) then
    return psih.g(put || '.' || k, 'VRIJEDNOST', naziv || ' ima nedozvoljenu vrijednost.');
  end if;
  return '[]'::jsonb;
end $$;

create or replace function psih.e_vise(o jsonb, k text, naziv text, dozv text[], mn int, ob boolean, put text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb := o -> k; ukupno int; dobri int; razl int;
begin
  if psih.nil(v) then
    return case when ob then psih.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje.') else '[]'::jsonb end;
  end if;
  if jsonb_typeof(v) <> 'array' then return psih.g(put || '.' || k, 'TIP', naziv || ' mora biti lista.'); end if;
  select count(*), count(*) filter (where jsonb_typeof(x) = 'string' and (x #>> '{}') = any (dozv)), count(distinct x)
    into ukupno, dobri, razl from jsonb_array_elements(v) x;
  if dobri <> ukupno then return psih.g(put || '.' || k, 'VRIJEDNOST', naziv || ' sadrži nedozvoljenu vrijednost.'); end if;
  if razl <> ukupno then return psih.g(put || '.' || k, 'DUPLIKAT', naziv || ' sadrži ponovljene vrijednosti.'); end if;
  if ob and ukupno < mn then return psih.g(put || '.' || k, 'OBAVEZNO', naziv || ': odaberite najmanje ' || mn || '.'); end if;
  return '[]'::jsonb;
end $$;

create or replace function psih.e_datum(o jsonb, k text, naziv text, ob boolean, put text, od text, doo text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb := o -> k; t text;
begin
  if psih.nil(v) or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
    return case when ob then psih.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje.') else '[]'::jsonb end;
  end if;
  if jsonb_typeof(v) <> 'string' or not psih.je_datum(v #>> '{}') then
    return psih.g(put || '.' || k, 'TIP', naziv || ' mora biti ispravan datum (GGGG-MM-DD).');
  end if;
  t := v #>> '{}';
  if od is not null and t < od then return psih.g(put || '.' || k, 'RASPON', naziv || ' ne smije biti prije ' || psih.fmt_datum(od) || '.'); end if;
  if doo is not null and t > doo then return psih.g(put || '.' || k, 'RASPON', naziv || ' ne smije biti poslije ' || psih.fmt_datum(doo) || '.'); end if;
  return '[]'::jsonb;
end $$;

-- Dozvoljene vrijednosti (isti redoslijed kao ENUM u Logika)
create or replace function psih.enum_teme() returns text[] language sql immutable set search_path='' as $$
  select array['Emocionalne teškoće','Vršnjački odnosi i nasilje','Učenje i motivacija','Ponašanje i samoregulacija','Pažnja i koncentracija',
               'Prilagodba i prelazak','Porodične okolnosti','Razvojne teškoće i inkluzija','Profesionalna orijentacija','Krizne situacije i zaštita djece'] $$;
create or replace function psih.enum_da_ne() returns text[] language sql immutable set search_path='' as $$ select array['Da','Ne'] $$;
create or replace function psih.enum_dokumentacija() returns text[] language sql immutable set search_path='' as $$ select array['Uredno','U toku','Zahtijeva intervenciju'] $$;
create or replace function psih.enum_saglasnosti() returns text[] language sql immutable set search_path='' as $$ select array['Da, za sve','Djelimično','Ne','Nije bilo procjena'] $$;
create or replace function psih.enum_grupe() returns text[] language sql immutable set search_path='' as $$ select array['učenici','nastavnici','roditelji'] $$;
create or replace function psih.enum_rad_status() returns text[] language sql immutable set search_path='' as $$ select array['održano','otkazano','prebačeno'] $$;
create or replace function psih.enum_usavrsavanje() returns text[] language sql immutable set search_path='' as $$
  select array['seminar','webinar','stručni skup','supervizija','intervizija','samostalno učenje','ostalo'] $$;
create or replace function psih.enum_kategorija() returns text[] language sql immutable set search_path='' as $$
  select array['Psihološki / Emocionalni','Vršnjački odnosi / Nasilje','Sigurnosni / Zaštita djece','Akademski','Organizacijski'] $$;
create or replace function psih.enum_ozbiljnost() returns text[] language sql immutable set search_path='' as $$ select array['Nizak','Srednji','Visok','Kritičan'] $$;
create or replace function psih.enum_status_rizika() returns text[] language sql immutable set search_path='' as $$ select array['Otvoreno','U toku','Riješeno','Eskalirano'] $$;
create or replace function psih.enum_utjecaj() returns text[] language sql immutable set search_path='' as $$
  select array['Nema troškova','Potreban budžet','Kadrovska odluka','Organizacijska izmjena'] $$;
create or replace function psih.enum_odluka() returns text[] language sql immutable set search_path='' as $$ select array['Na čekanju','Odobreno','Odbijeno','Potrebna dorada'] $$;

create or replace function psih.provjeri_sadrzaj(s jsonb, strogo boolean, godina int, mjesec int) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  e jsonb := '[]'::jsonb; od text; doo text; sek text;
  u jsonb; n jsonb; r jsonb; rad jsonb; usv jsonb; a jsonb; z jsonb;
  ind bigint; raz bigint; kri bigint; pl bigint; re bigint;
  stavke jsonb; x jsonb; i int; put text; st text; sv jsonb;
begin
  if not psih.je_obj(s) then return psih.g('sadrzaj', 'TIP', 'Sadržaj izvještaja mora biti objekat.'); end if;
  od := make_date(godina, mjesec, 1)::text; doo := psih.kraj_mjeseca(godina, mjesec)::text;
  foreach sek in array array['ucenici','nastavnici','roditelji','radionice','usavrsavanje','administracija','zakljucak'] loop
    if s ? sek and not (psih.je_obj(s -> sek) or jsonb_typeof(s -> sek) = 'null') then
      e := e || psih.g(sek, 'TIP', 'Odjeljak „' || sek || '“ mora biti objekat.');
    end if;
  end loop;
  u := psih.obj(s, 'ucenici'); n := psih.obj(s, 'nastavnici'); r := psih.obj(s, 'roditelji'); rad := psih.obj(s, 'radionice');
  usv := psih.obj(s, 'usavrsavanje'); a := psih.obj(s, 'administracija'); z := psih.obj(s, 'zakljucak');

  e := e || psih.e_cijeli(u, 'individualni_razgovori', 'Broj individualnih savjetovanja', 0, 500, strogo, 'ucenici')
         || psih.e_cijeli(u, 'razliciti_ucenici', 'Broj različitih učenika', 0, 500, strogo, 'ucenici')
         || psih.e_cijeli(u, 'grupni_rad', 'Broj grupnih i razrednih aktivnosti', 0, 200, strogo, 'ucenici')
         || psih.e_cijeli(u, 'procjene', 'Broj psiholoških procjena i opservacija učenika', 0, 300, strogo, 'ucenici')
         || psih.e_cijeli(u, 'krizne_intervencije', 'Broj kriznih intervencija', 0, 200, strogo, 'ucenici');
  ind := psih.ci(u, 'individualni_razgovori'); raz := psih.ci(u, 'razliciti_ucenici'); kri := psih.ci(u, 'krizne_intervencije');
  e := e || psih.e_vise(u, 'teme', 'Teme rada sa učenicima', psih.enum_teme(), 1, strogo and coalesce(ind, 0) > 0, 'ucenici')
         || psih.e_tekst(u, 'sazetak', 'Sažetak rada sa učenicima', 50, 2500, strogo, 'ucenici')
         || psih.e_tekst(u, 'krizne_opis', 'Opis kriznih intervencija i postupanja po protokolu zaštite', 50, 2000, strogo and coalesce(kri, 0) > 0, 'ucenici');
  if ind is not null and raz is not null and raz > ind then
    e := e || psih.g('ucenici.razliciti_ucenici', 'NEUSKLADJENO', 'Broj različitih učenika ne može biti veći od broja individualnih savjetovanja.');
  end if;

  e := e || psih.e_cijeli(n, 'opservacije_planirano', 'Planirane opservacije u razredu', 0, 200, strogo, 'nastavnici')
         || psih.e_cijeli(n, 'opservacije_realizirano', 'Realizirane opservacije u razredu', 0, 200, strogo, 'nastavnici')
         || psih.e_cijeli(n, 'konsultacije', 'Broj konsultacija sa nastavnicima', 0, 500, strogo, 'nastavnici')
         || psih.e_cijeli(n, 'podrska_sati', 'Sati stručne podrške nastavnicima', 0, 200, strogo, 'nastavnici')
         || psih.e_cijeli(n, 'sjednice_tima', 'Broj sjednica stručnog tima i vijeća', 0, 50, strogo, 'nastavnici');
  pl := psih.ci(n, 'opservacije_planirano'); re := psih.ci(n, 'opservacije_realizirano');
  e := e || psih.e_tekst(n, 'razredi', 'Razredi u kojima su provedene opservacije', 1, 250, strogo and coalesce(re, 0) > 0, 'nastavnici')
         || psih.e_tekst(n, 'nalazi', 'Nalazi opservacija', 50, 2500, strogo and coalesce(re, 0) > 0, 'nastavnici')
         || psih.e_tekst(n, 'obrazlozenje_prekoracenja', 'Obrazloženje prekoračenja plana opservacija', 20, 1000, strogo and re is not null and pl is not null and re > pl, 'nastavnici')
         || psih.e_tekst(n, 'koordinacija', 'Saradnja sa nastavnicima i stručnim timom', 30, 2000, strogo, 'nastavnici');

  e := e || psih.e_cijeli(r, 'individualni_razgovori', 'Broj savjetodavnih razgovora sa roditeljima', 0, 500, strogo, 'roditelji')
         || psih.e_cijeli(r, 'roditeljski_sastanci', 'Broj roditeljskih sastanaka i predavanja', 0, 50, strogo, 'roditelji')
         || psih.e_cijeli(r, 'upucivanja', 'Broj porodica upućenih vanjskim službama', 0, 500, strogo, 'roditelji')
         || psih.e_tekst(r, 'biljeske', 'Sažetak saradnje sa roditeljima', 30, 2000, strogo, 'roditelji');

  -- Radionice
  if rad ? 'stavke' and jsonb_typeof(rad -> 'stavke') <> 'array' then
    e := e || psih.g('radionice.stavke', 'TIP', 'Radionice moraju biti lista.'); stavke := '[]'::jsonb;
  elsif rad ? 'stavke' then stavke := rad -> 'stavke';
  else stavke := '[]'::jsonb; end if;
  if jsonb_array_length(stavke) > 30 then
    e := e || psih.g('radionice.stavke', 'PREVISE', 'Najviše 30 radionica po izvještaju.');
  else
    i := 0;
    for x in select value from jsonb_array_elements(stavke) loop
      put := 'radionice.stavke.' || i;
      if not psih.je_obj(x) then
        e := e || psih.g(put, 'TIP', 'Radionica mora biti objekat.');
      else
        st := psih.tk(x, 'status');
        e := e || psih.e_enum(x, 'ciljna_grupa', 'Ciljna grupa radionice', psih.enum_grupe(), true, put)
               || psih.e_tekst(x, 'naslov', 'Naslov radionice', 5, 150, true, put)
               || psih.e_datum(x, 'datum', 'Datum radionice', true, put, od, doo)
               || psih.e_cijeli(x, 'trajanje_min', 'Trajanje radionice (minute)', 15, 480, true, put)
               || psih.e_enum(x, 'status', 'Status radionice', psih.enum_rad_status(), true, put)
               || psih.e_cijeli(x, 'ucesnika', 'Broj učesnika', 0, 500, strogo or st = 'održano', put)
               || psih.e_tekst(x, 'ishod', 'Ishod radionice', 20, 1000, strogo and st = 'održano', put)
               || psih.e_enum(x, 'qp05_zapis', 'Zavedeno u zapis QP 05 (Evidencija obuke, QP 05.EO-02)', psih.enum_da_ne(), strogo or st = 'održano', put);
        if st = 'održano' and coalesce(psih.ci(x, 'ucesnika'), 0) < 1 and x ? 'ucesnika' then
          e := e || psih.g(put || '.ucesnika', 'RASPON', 'Održana radionica mora imati najmanje jednog učesnika.');
        end if;
      end if;
      i := i + 1;
    end loop;
    e := e || psih.e_tekst(rad, 'nema_obrazlozenje', 'Obrazloženje izostanka radionica', 20, 1000, strogo and jsonb_array_length(stavke) = 0, 'radionice');
  end if;

  -- Stručno usavršavanje i supervizija
  if usv ? 'stavke' and jsonb_typeof(usv -> 'stavke') <> 'array' then
    e := e || psih.g('usavrsavanje.stavke', 'TIP', 'Stručno usavršavanje mora biti lista.');
  else
    sv := case when usv ? 'stavke' then usv -> 'stavke' else '[]'::jsonb end;
    if jsonb_array_length(sv) > 30 then
      e := e || psih.g('usavrsavanje.stavke', 'PREVISE', 'Najviše 30 stavki stručnog usavršavanja.');
    else
      i := 0;
      for x in select value from jsonb_array_elements(sv) loop
        put := 'usavrsavanje.stavke.' || i;
        if not psih.je_obj(x) then
          e := e || psih.g(put, 'TIP', 'Stavka mora biti objekat.');
        else
          e := e || psih.e_tekst(x, 'naslov', 'Naslov usavršavanja', 5, 150, true, put)
                 || psih.e_enum(x, 'vrsta', 'Vrsta usavršavanja', psih.enum_usavrsavanje(), true, put)
                 || psih.e_cijeli(x, 'sati', 'Broj sati', 1, 100, true, put)
                 || psih.e_datum(x, 'datum', 'Datum usavršavanja', true, put, od, doo);
        end if;
        i := i + 1;
      end loop;
    end if;
  end if;

  e := e || psih.e_enum(a, 'povjerljivost', 'Povjerljivost i zaštita psihološke dokumentacije', psih.enum_da_ne(), strogo, 'administracija')
         || psih.e_enum(a, 'saglasnosti', 'Saglasnosti roditelja za procjene i rad', psih.enum_saglasnosti(), strogo, 'administracija')
         || psih.e_enum(a, 'dokumentacija_stanje', 'Stanje psihološke dokumentacije', psih.enum_dokumentacija(), strogo, 'administracija')
         || psih.e_tekst(a, 'mooks_sazetak', 'Sažetak saradnje sa vanjskim službama i MOOKS-om', 20, 1500, strogo, 'administracija')
         || psih.e_tekst(a, 'dokumentacija', 'Napomene o dokumentaciji', 1, 1500, false, 'administracija')
         || psih.e_tekst(z, 'postignuca', 'Ključna postignuća u mjesecu', 50, 2000, strogo, 'zakljucak')
         || psih.e_tekst(z, 'plan_sljedeci', 'Plan za sljedeći mjesec', 50, 2000, strogo, 'zakljucak');
  return e;
end $$;

create or replace function psih.provjeri_rizike(r jsonb, strogo boolean) returns jsonb
language plpgsql stable set search_path='' as $$
declare e jsonb := '[]'::jsonb; ids text[] := '{}'; x jsonb; i int := 0; put text; idv jsonb;
begin
  if jsonb_typeof(r) <> 'array' then return psih.g('rizici', 'TIP', 'Rizici moraju biti lista.'); end if;
  if jsonb_array_length(r) > 100 then return psih.g('rizici', 'PREVISE', 'Najviše 100 rizika po izvještaju.'); end if;
  for x in select value from jsonb_array_elements(r) loop
    put := 'rizici.' || i;
    if not psih.je_obj(x) then
      e := e || psih.g(put, 'TIP', 'Rizik mora biti objekat.');
    else
      if x ? 'id' and jsonb_typeof(x -> 'id') <> 'null' then
        idv := x -> 'id';
        if jsonb_typeof(idv) <> 'string' or (idv #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          e := e || psih.g(put || '.id', 'TIP', 'Identifikator rizika nije ispravan.');
        elsif (idv #>> '{}') = any (ids) then
          e := e || psih.g(put || '.id', 'DUPLIKAT', 'Isti rizik je naveden više puta.');
        else ids := ids || (idv #>> '{}'); end if;
      end if;
      e := e || psih.e_enum(x, 'kategorija', 'Kategorija rizika', psih.enum_kategorija(), true, put)
             || psih.e_enum(x, 'ozbiljnost', 'Ozbiljnost rizika', psih.enum_ozbiljnost(), true, put)
             || psih.e_enum(x, 'status', 'Status rizika', psih.enum_status_rizika(), true, put)
             || psih.e_tekst(x, 'opis', 'Opis rizika', 10, 500, true, put)
             || psih.e_tekst(x, 'mjera', 'Korektivna mjera', 10, 500, strogo, put)
             || psih.e_datum(x, 'rok', 'Rok mjere', strogo, put, null, null);
    end if;
    i := i + 1;
  end loop;
  return e;
end $$;

create or replace function psih.provjeri_preporuke(p jsonb, strogo boolean) returns jsonb
language plpgsql stable set search_path='' as $$
declare e jsonb := '[]'::jsonb; ids text[] := '{}'; x jsonb; i int := 0; put text; idv jsonb;
begin
  if jsonb_typeof(p) <> 'array' then return psih.g('preporuke', 'TIP', 'Preporuke moraju biti lista.'); end if;
  if jsonb_array_length(p) > 50 then return psih.g('preporuke', 'PREVISE', 'Najviše 50 preporuka po izvještaju.'); end if;
  for x in select value from jsonb_array_elements(p) loop
    put := 'preporuke.' || i;
    if not psih.je_obj(x) then
      e := e || psih.g(put, 'TIP', 'Preporuka mora biti objekat.');
    else
      if x ? 'id' and jsonb_typeof(x -> 'id') <> 'null' then
        idv := x -> 'id';
        if jsonb_typeof(idv) <> 'string' or (idv #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          e := e || psih.g(put || '.id', 'TIP', 'Identifikator preporuke nije ispravan.');
        elsif (idv #>> '{}') = any (ids) then
          e := e || psih.g(put || '.id', 'DUPLIKAT', 'Ista preporuka je navedena više puta.');
        else ids := ids || (idv #>> '{}'); end if;
      end if;
      e := e || psih.e_tekst(x, 'naslov', 'Naslov preporuke', 5, 150, true, put)
             || psih.e_tekst(x, 'obrazlozenje', 'Obrazloženje preporuke', 20, 1000, strogo, put)
             || psih.e_enum(x, 'utjecaj', 'Utjecaj na resurse', psih.enum_utjecaj(), true, put);
    end if;
    i := i + 1;
  end loop;
  return e;
end $$;
-- ====================================================== čišćenje, KPI, bodovi
create or replace function psih.ocisti(v jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare o jsonb;
begin
  case jsonb_typeof(v)
    when 'string' then return to_jsonb(btrim(v #>> '{}'));
    when 'object' then
      select coalesce(jsonb_object_agg(k, psih.ocisti(val)), '{}'::jsonb) into o from jsonb_each(v) as t(k, val);
      return o;
    when 'array' then
      select coalesce(jsonb_agg(psih.ocisti(val) order by ord), '[]'::jsonb) into o from jsonb_array_elements(v) with ordinality as t(val, ord);
      return o;
    else return v;
  end case;
end $$;

-- Zadržava samo poznata polja (nepoznata se odbacuju, ne pohranjuju).
create or replace function psih.filtriraj_obj(o jsonb, dozv text[]) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce(jsonb_object_agg(k, val), '{}'::jsonb) from jsonb_each(o) as t(k, val) where k = any (dozv)
$$;

create or replace function psih.filtriraj(s jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare o jsonb := '{}'::jsonb; sek jsonb; st jsonb; x jsonb; lista jsonb;
begin
  if not psih.je_obj(s) then return s; end if;
  if s ? 'ucenici' then
    sek := s -> 'ucenici';
    o := o || jsonb_build_object('ucenici', case when psih.je_obj(sek) then psih.filtriraj_obj(sek, array['individualni_razgovori','razliciti_ucenici','grupni_rad','procjene','krizne_intervencije','teme','sazetak','krizne_opis']) else sek end);
  end if;
  if s ? 'nastavnici' then
    sek := s -> 'nastavnici';
    o := o || jsonb_build_object('nastavnici', case when psih.je_obj(sek) then psih.filtriraj_obj(sek, array['opservacije_planirano','opservacije_realizirano','konsultacije','podrska_sati','sjednice_tima','razredi','nalazi','obrazlozenje_prekoracenja','koordinacija']) else sek end);
  end if;
  if s ? 'roditelji' then
    sek := s -> 'roditelji';
    o := o || jsonb_build_object('roditelji', case when psih.je_obj(sek) then psih.filtriraj_obj(sek, array['individualni_razgovori','roditeljski_sastanci','upucivanja','biljeske']) else sek end);
  end if;
  if s ? 'administracija' then
    sek := s -> 'administracija';
    o := o || jsonb_build_object('administracija', case when psih.je_obj(sek) then psih.filtriraj_obj(sek, array['povjerljivost','saglasnosti','dokumentacija_stanje','mooks_sazetak','dokumentacija']) else sek end);
  end if;
  if s ? 'zakljucak' then
    sek := s -> 'zakljucak';
    o := o || jsonb_build_object('zakljucak', case when psih.je_obj(sek) then psih.filtriraj_obj(sek, array['postignuca','plan_sljedeci']) else sek end);
  end if;
  if s ? 'radionice' then
    sek := s -> 'radionice';
    if psih.je_obj(sek) then
      st := psih.filtriraj_obj(sek, array['nema_obrazlozenje']);
      if sek ? 'stavke' then
        if jsonb_typeof(sek -> 'stavke') = 'array' then
          select coalesce(jsonb_agg(case when psih.je_obj(e) then psih.filtriraj_obj(e, array['ciljna_grupa','naslov','datum','trajanje_min','status','ucesnika','ishod','qp05_zapis']) else e end order by ord), '[]'::jsonb)
            into lista from jsonb_array_elements(sek -> 'stavke') with ordinality as t(e, ord);
          st := st || jsonb_build_object('stavke', lista);
        else st := st || jsonb_build_object('stavke', sek -> 'stavke'); end if;
      end if;
      o := o || jsonb_build_object('radionice', st);
    else o := o || jsonb_build_object('radionice', sek); end if;
  end if;
  if s ? 'usavrsavanje' then
    sek := s -> 'usavrsavanje';
    if psih.je_obj(sek) then
      st := '{}'::jsonb;
      if sek ? 'stavke' then
        if jsonb_typeof(sek -> 'stavke') = 'array' then
          select coalesce(jsonb_agg(case when psih.je_obj(e) then psih.filtriraj_obj(e, array['naslov','vrsta','sati','datum']) else e end order by ord), '[]'::jsonb)
            into lista from jsonb_array_elements(sek -> 'stavke') with ordinality as t(e, ord);
          st := jsonb_build_object('stavke', lista);
        else st := jsonb_build_object('stavke', sek -> 'stavke'); end if;
      end if;
      o := o || jsonb_build_object('usavrsavanje', st);
    else o := o || jsonb_build_object('usavrsavanje', sek); end if;
  end if;
  return o;
end $$;

-- KPI -----------------------------------------------------------------
create or replace function psih.kpi(s jsonb, r jsonb, godina int, mjesec int) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  n jsonb := psih.obj(s, 'nastavnici'); u jsonb := psih.obj(s, 'ucenici');
  pl bigint := psih.ci(n, 'opservacije_planirano'); re bigint := psih.ci(n, 'opservacije_realizirano');
  kraj text := psih.kraj_mjeseca(godina, mjesec)::text;
  lista jsonb := case when jsonb_typeof(r) = 'array' then r else '[]'::jsonb end;
  x jsonb; k int := 0; po_k int := 0; po_v int := 0; po_s int := 0; po_n int := 0;
  rijeseno int := 0; preneseno int := 0; aktivno int := 0; kasne int := 0; novi int := 0; otvoren boolean;
  stopa jsonb;
begin
  for x in select value from jsonb_array_elements(lista) loop
    otvoren := (x ->> 'status') is distinct from 'Riješeno';
    if otvoren then
      case x ->> 'ozbiljnost'
        when 'Kritičan' then po_k := po_k + 1; when 'Visok' then po_v := po_v + 1;
        when 'Srednji' then po_s := po_s + 1; when 'Nizak' then po_n := po_n + 1; else null; end case;
      aktivno := aktivno + 1;
      if jsonb_typeof(x -> 'rok') = 'string' and psih.je_datum(x ->> 'rok') and (x ->> 'rok') < kraj then kasne := kasne + 1; end if;
    end if;
    if (x ->> 'status') = 'Riješeno' then rijeseno := rijeseno + 1; end if;
    if (x -> 'prenesen') = 'true'::jsonb then preneseno := preneseno + 1; else novi := novi + 1; end if;
  end loop;
  stopa := case when pl is null or re is null or pl = 0 then 'null'::jsonb
                else to_jsonb(floor(1000.0 * re / pl + 0.5) / 10) end;
  return jsonb_build_object(
    'kpi01', jsonb_build_object('planirano', pl, 'realizirano', re, 'stopa', stopa,
               'nije_planirano', coalesce(pl = 0, false),
               'premaseno', case when pl is not null and re is not null and re > pl then re - pl else 0 end),
    'kpi02', jsonb_build_object('sesije', psih.ci(u, 'individualni_razgovori')),
    'kpi03', jsonb_build_object('rijeseno_3a', rijeseno, 'preneseno_3b', preneseno, 'aktivno_3c', aktivno,
               'po_ozbiljnosti', jsonb_build_object('Kritičan', po_k, 'Visok', po_v, 'Srednji', po_s, 'Nizak', po_n),
               'kasne_mjere', kasne, 'novi', novi));
end $$;

-- IDSS bodovi -----------------------------------------------------------
create or replace function psih.rnd(a int, b int, c int) returns int
language sql immutable set search_path='' as $$ select ((2 * a * b + c) / (2 * c))::int $$;

create or replace function psih.stavka(kod text, grupa text, naziv text, bodovi int, mx int, napomena text) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('kod', kod, 'grupa', grupa, 'naziv', naziv, 'bodovi', bodovi, 'max', mx, 'napomena', napomena)
$$;

create or replace function psih.tekst_od(v jsonb) returns text
language sql immutable set search_path='' as $$
  select case when v is null or jsonb_typeof(v) = 'null' then ''
              when jsonb_typeof(v) = 'string' then v #>> '{}' else v::text end
$$;

create or replace function psih.nar_bodovi(t jsonb, vrh int, sred int, vrh_b int, sred_b int) returns int
language sql immutable set search_path='' as $$
  select case when l >= vrh then vrh_b when l >= sred then sred_b else 0 end
  from (select char_length(btrim(psih.tekst_od(t))) as l) q
$$;

create or replace function psih.rang(p int) returns text
language sql immutable set search_path='' as $$
  select case when p >= 900 then 'Velemajstor' when p >= 800 then 'Majstor' when p >= 650 then 'Stručnjak'
              when p >= 500 then 'Saradnik' else 'Pripravnik' end
$$;

create or replace function psih.bodovi(s jsonb, r jsonb, k jsonb, godina int, mjesec int, kasnjenje int, ciklus int, kasnjenje_dopune int) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  u jsonb := psih.obj(s, 'ucenici'); n jsonb := psih.obj(s, 'nastavnici'); ro jsonb := psih.obj(s, 'roditelji');
  rad jsonb := psih.obj(s, 'radionice'); usv jsonb := psih.obj(s, 'usavrsavanje'); a jsonb := psih.obj(s, 'administracija');
  z jsonb := psih.obj(s, 'zakljucak');
  greske jsonb := psih.provjeri_sadrzaj(s, true, godina, mjesec);
  kas int := greatest(coalesce(kasnjenje, 0), 0); kd int := greatest(coalesce(kasnjenje_dopune, 0), 0);
  st jsonb := '[]'::jsonb;
  b1 int; b2 int; s1 int := 0; s2 int; lp int; s3 int; rl jsonb; ukupno_r int; kompletno int; s4 int;
  pl bigint; re bigint; t1 int; rs jsonb; odr int; gr int; ukupno_rad int; t2 int; sati bigint; t3 int; q5 int; t4 int; t5 int; t6 int;
  k3 jsonb; ra int; rb int; rc int; rk int; rn int; base int; e1 int; e2 int; e3 int; e4 int;
  sekcije text[] := array['ucenici','nastavnici','roditelji','radionice','administracija','zakljucak'];
  tezine int[] := array[20,20,15,15,15,15]; i int; sek text;
  g_b int; g_s int; g_t int; g_e int;
begin
  b1 := greatest(0, 200 - 50 * least(kas, 4));
  b2 := case when ciklus <= 1 then 50 else greatest(0, 50 - 25 * least(kd, 2)) end;
  st := st || psih.stavka('B1', 'blagovremenost', 'Podnošenje izvještaja u roku', b1, 200,
        case when kas = 0 then 'Podneseno u roku.' else 'Kašnjenje: ' || kas || ' radnih dana.' end);
  st := st || psih.stavka('B2', 'blagovremenost', 'Dopuna u roku nakon vraćanja', b2, 50,
        case when ciklus <= 1 then 'Izvještaj nije vraćen na dopunu.' when kd = 0 then 'Dopuna u roku.' else 'Kašnjenje dopune: ' || kd || ' radnih dana.' end);

  for i in 1..6 loop
    sek := sekcije[i];
    if not exists (select 1 from jsonb_array_elements(greske) g where (g ->> 'polje') = sek or (g ->> 'polje') like sek || '.%') then
      s1 := s1 + tezine[i];
    end if;
  end loop;
  st := st || psih.stavka('S1', 'sadrzaj', 'Cjelovitost odjeljaka', s1, 100, 'Odjeljak je cjelovit kada nema nedostataka pri provjeri.');
  s2 := psih.nar_bodovi(u -> 'sazetak', 150, 80, 15, 8) + psih.nar_bodovi(n -> 'koordinacija', 150, 80, 15, 8)
      + psih.nar_bodovi(ro -> 'biljeske', 150, 80, 15, 8) + psih.nar_bodovi(a -> 'mooks_sazetak', 150, 80, 15, 8)
      + psih.nar_bodovi(z -> 'postignuca', 150, 80, 15, 8);
  st := st || psih.stavka('S2', 'sadrzaj', 'Konkretnost opisa', s2, 75, 'Opisi od 80 znakova donose dio, a od 150 znakova pun broj bodova.');
  lp := char_length(btrim(psih.tekst_od(z -> 'plan_sljedeci')));
  s3 := case when lp >= 200 then 50 when lp >= 120 then 35 when lp >= 50 then 20 else 0 end;
  st := st || psih.stavka('S3', 'sadrzaj', 'Konkretnost plana za sljedeći mjesec', s3, 50, 'Plan od 50, 120 i 200 znakova: 20, 35 i 50 bodova.');
  rl := case when jsonb_typeof(r) = 'array' then r else '[]'::jsonb end;
  ukupno_r := jsonb_array_length(rl);
  select count(*) into kompletno from jsonb_array_elements(rl) x
   where psih.tekst_od(x -> 'mjera') <> '' and jsonb_typeof(x -> 'rok') = 'string' and psih.je_datum(x ->> 'rok');
  s4 := case when ukupno_r = 0 then 25 else psih.rnd(25, kompletno, ukupno_r) end;
  st := st || psih.stavka('S4', 'sadrzaj', 'Mjere uz rizike', s4, 25,
        case when ukupno_r = 0 then 'Nema evidentiranih rizika.' else kompletno || ' od ' || ukupno_r || ' rizika ima mjeru i rok.' end);

  pl := psih.ci(n, 'opservacije_planirano'); re := psih.ci(n, 'opservacije_realizirano');
  t1 := case when coalesce(pl, 0) = 0 then 30 else psih.rnd(60, least(coalesce(re, 0), pl)::int, pl::int) end;
  st := st || psih.stavka('T1', 'strucnost', 'Opservacije u razredu', t1, 60,
        case when coalesce(pl, 0) = 0 then 'Opservacije nisu planirane: polovina bodova.'
             else 'Realizirano ' || coalesce(re, 0) || ' od ' || pl || ' planiranih opservacija (računa se najviše do punog plana).' end);
  rs := case when jsonb_typeof(rad -> 'stavke') = 'array' then rad -> 'stavke' else '[]'::jsonb end;
  select count(*) into odr from jsonb_array_elements(rs) x where psih.je_obj(x) and x ->> 'status' = 'održano';
  select count(distinct x -> 'ciljna_grupa') into gr from jsonb_array_elements(rs) x
   where psih.je_obj(x) and x ->> 'status' = 'održano' and jsonb_typeof(x -> 'ciljna_grupa') = 'string';
  ukupno_rad := jsonb_array_length(rs);
  t2 := least(40, 20 * odr) + case when gr >= 2 then 10 else 0 end;
  st := st || psih.stavka('T2', 'strucnost', 'Održane radionice', t2, 50,
        'Održano radionica: ' || odr || '; ciljnih grupa: ' || gr || ' (po 20 bodova za prve dvije radionice, +10 za dvije ili više ciljnih grupa).');
  select coalesce(sum(coalesce(psih.ci(x, 'sati'), 0)), 0) into sati from jsonb_array_elements(case when jsonb_typeof(usv -> 'stavke') = 'array' then usv -> 'stavke' else '[]'::jsonb end) x where psih.je_obj(x);
  t3 := least(40, 10 * sati)::int;
  st := st || psih.stavka('T3', 'strucnost', 'Stručno usavršavanje i supervizija', t3, 40, 'Sati usavršavanja i supervizije: ' || sati || ' (10 bodova po satu, najviše 40).');
  select count(*) into q5 from jsonb_array_elements(rs) x where psih.je_obj(x) and x ->> 'status' = 'održano' and x ->> 'qp05_zapis' = 'Da';
  t4 := case when odr = 0 then 10 else psih.rnd(20, least(q5, odr), odr) end;
  st := st || psih.stavka('T4', 'strucnost', 'QP 05: radionice i obuke zavedene u zapis', t4, 20,
        case when odr = 0 then 'Nema održanih radionica ni obuka: polovina bodova.'
             else 'U zapis QP 05 zavedeno ' || least(q5, odr) || ' od ' || odr || ' održanih radionica i obuka.' end);
  t5 := (case when a ->> 'povjerljivost' = 'Da' then 10 else 0 end)
      + (case a ->> 'saglasnosti' when 'Da, za sve' then 10 when 'Nije bilo procjena' then 10 when 'Djelimično' then 5 else 0 end);
  st := st || psih.stavka('T5', 'strucnost', 'Povjerljivost i saglasnosti roditelja', t5, 20, 'Povjerljivost dokumentacije 10 bodova; saglasnosti za sve procjene 10, djelimično 5 bodova.');
  t6 := case a ->> 'dokumentacija_stanje' when 'Uredno' then 10 when 'U toku' then 6 when 'Zahtijeva intervenciju' then 4 else 0 end;
  st := st || psih.stavka('T6', 'strucnost', 'Stanje psihološke dokumentacije', t6, 10, 'Uredno 10, u toku 6, zahtijeva intervenciju 4 boda.');

  k3 := case when psih.je_obj(k -> 'kpi03') then k -> 'kpi03' else '{}'::jsonb end;
  ra := coalesce((k3 ->> 'rijeseno_3a')::int, 0); rb := coalesce((k3 ->> 'preneseno_3b')::int, 0);
  rc := coalesce((k3 ->> 'aktivno_3c')::int, 0); rk := coalesce((k3 ->> 'kasne_mjere')::int, 0); rn := coalesce((k3 ->> 'novi')::int, 0);
  base := rb + rn;
  e1 := case when base = 0 then 60 else psih.rnd(60, least(ra, base), base) end;
  st := st || psih.stavka('E1', 'efikasnost', 'Rješavanje rizika', e1, 60,
        case when base = 0 then 'Nema rizika za rješavanje.' else 'Riješeno ' || ra || ' od ' || base || ' rizika u razmatranju.' end);
  e2 := case when rc = 0 then 60 else psih.rnd(60, greatest(rc - rk, 0), rc) end;
  st := st || psih.stavka('E2', 'efikasnost', 'Mjere u roku', e2, 60,
        case when rc = 0 then 'Nema aktivnih rizika.' else rk || ' od ' || rc || ' aktivnih rizika ima probijen rok mjere.' end);
  e3 := case when ciklus <= 1 then 40 when ciklus = 2 then 20 else 0 end;
  st := st || psih.stavka('E3', 'efikasnost', 'Prihvaćeno bez vraćanja', e3, 40, 'Podnošenje br. ' || ciklus || '.');
  e4 := case when ukupno_rad = 0 then 20 else psih.rnd(40, odr, ukupno_rad) end;
  st := st || psih.stavka('E4', 'efikasnost', 'Realizacija radionica', e4, 40,
        case when ukupno_rad = 0 then 'Nema evidentiranih radionica: polovina bodova.' else odr || ' od ' || ukupno_rad || ' evidentiranih radionica je održano.' end);

  select coalesce(sum((x ->> 'bodovi')::int) filter (where x ->> 'grupa' = 'blagovremenost'), 0),
         coalesce(sum((x ->> 'bodovi')::int) filter (where x ->> 'grupa' = 'sadrzaj'), 0),
         coalesce(sum((x ->> 'bodovi')::int) filter (where x ->> 'grupa' = 'strucnost'), 0),
         coalesce(sum((x ->> 'bodovi')::int) filter (where x ->> 'grupa' = 'efikasnost'), 0)
    into g_b, g_s, g_t, g_e from jsonb_array_elements(st) x;
  return jsonb_build_object('stavke', st, 'zbroj', g_b + g_s + g_t + g_e, 'max', 900,
    'po_grupama', jsonb_build_object(
      'blagovremenost', jsonb_build_object('bodovi', g_b, 'max', 250),
      'sadrzaj', jsonb_build_object('bodovi', g_s, 'max', 250),
      'strucnost', jsonb_build_object('bodovi', g_t, 'max', 200),
      'efikasnost', jsonb_build_object('bodovi', g_e, 'max', 200)));
end $$;
-- ========================================================= pomoćne funkcije
create or replace function psih.greska(kod text, poruka text, extra jsonb default '{}'::jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('ok', false, 'kod', kod, 'poruka', poruka) || coalesce(extra, '{}'::jsonb)
$$;

create or replace function psih.korisnik() returns psih.profili
language sql stable security definer set search_path='' as $$
  select p from psih.profili p where p.id = auth.uid() and p.aktivan
$$;

create or replace function psih.trag(izv uuid, pr psih.profili, radnja text, saz jsonb) returns void
language plpgsql set search_path='' as $$
begin
  -- Spremanje nacrta bilježi se najviše jednom u 15 minuta.
  if radnja = 'SPREMLJEN_NACRT' and exists (
       select 1 from psih.revizorski_trag t where t.izvjestaj_id = izv and t.akcija = radnja and t.kreiran > now() - interval '15 minutes') then
    return;
  end if;
  insert into psih.revizorski_trag(izvjestaj_id, korisnik_id, akter, uloga, akcija, sazetak)
  values (izv, pr.id, pr.ime, pr.uloga, radnja, coalesce(saz, '{}'::jsonb));
end $$;

-- Stanje rizika prije perioda b (posljednje poznato među ranijim izvještajima istog psihologa).
create or replace function psih.rizik_prije(pid uuid, rid text, b int) returns jsonb
language sql stable set search_path='' as $$
  select r.value from psih.izvjestaji i, jsonb_array_elements(i.rizici) r
   where i.psiholog_id = pid and psih.pb(i.godina, i.mjesec) < b and r.value ->> 'id' = rid
   order by psih.pb(i.godina, i.mjesec) desc limit 1
$$;

create or replace function psih.rizik_ident(pid uuid, rid text) returns jsonb
language sql stable set search_path='' as $$
  select r.value from psih.izvjestaji i, jsonb_array_elements(i.rizici) r
   where i.psiholog_id = pid and r.value ->> 'id' = rid
   order by psih.pb(i.godina, i.mjesec) asc limit 1
$$;

create or replace function psih.rizik_kasnije(pid uuid, rid text, b int) returns boolean
language sql stable set search_path='' as $$
  select exists (select 1 from psih.izvjestaji i, jsonb_array_elements(i.rizici) r
   where i.psiholog_id = pid and psih.pb(i.godina, i.mjesec) > b and r.value ->> 'id' = rid)
$$;

-- Otvoreni rizici koji se prenose u period b.
create or replace function psih.preneseni(pid uuid, b int) returns setof jsonb
language sql stable set search_path='' as $$
  select s.r from (
    select distinct on (r.value ->> 'id') r.value as r
      from psih.izvjestaji i, jsonb_array_elements(i.rizici) r
     where i.psiholog_id = pid and psih.pb(i.godina, i.mjesec) < b
     order by r.value ->> 'id', psih.pb(i.godina, i.mjesec) desc) s
  where (s.r ->> 'status') <> 'Riješeno'
$$;

-- Rizici izvještaja u obliku koji vidi klijent (sa oznakom "prenesen").
create or replace function psih.rizici_izlaz(i psih.izvjestaji) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(o order by o ->> 'kod'), '[]'::jsonb) from (
    select jsonb_build_object('id', r.value ->> 'id', 'kod', r.value ->> 'kod', 'kategorija', r.value ->> 'kategorija',
             'opis', r.value ->> 'opis', 'ozbiljnost', r.value ->> 'ozbiljnost', 'mjera', r.value ->> 'mjera',
             'rok', r.value -> 'rok', 'status', r.value ->> 'status',
             'prenesen', coalesce((p ->> 'status') <> 'Riješeno', false),
             'kreiran_period', psih.pb_g((r.value ->> 'kreiran')::int) * 100 + psih.pb_m((r.value ->> 'kreiran')::int)) as o
      from jsonb_array_elements(i.rizici) r
      left join lateral (select psih.rizik_prije(i.psiholog_id, r.value ->> 'id', psih.pb(i.godina, i.mjesec)) as p) q on true
  ) t
$$;

create or replace function psih.greske_baza(i psih.izvjestaji, riz jsonb, prep jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  e jsonb := '[]'::jsonb; b int := psih.pb(i.godina, i.mjesec); x jsonb; idx int := 0; put text;
  ident jsonb; pre jsonb; staro jsonb; prisutni text[] := '{}'; rid text; p jsonb; pr jsonb;
begin
  for x in select value from jsonb_array_elements(riz) loop
    put := 'rizici.' || idx; idx := idx + 1;
    rid := x ->> 'id';
    if rid is null then continue; end if;
    ident := psih.rizik_ident(i.psiholog_id, rid);
    if ident is null then e := e || psih.g(put || '.id', 'NEPOZNAT', 'Rizik ne postoji među Vašim rizicima.'); continue; end if;
    if (ident ->> 'kreiran')::int > b then e := e || psih.g(put || '.id', 'NEPOZNAT', 'Rizik je kreiran u kasnijem periodu.'); continue; end if;
    prisutni := prisutni || rid;
    if (ident ->> 'kreiran')::int < b then
      pre := psih.rizik_prije(i.psiholog_id, rid, b);
      if pre is null or (pre ->> 'status') = 'Riješeno' then
        e := e || psih.g(put || '.id', 'RIZIK_RIJESEN', 'Rizik ' || (ident ->> 'kod') || ' je ranije riješen i ne može se ponovo navoditi.');
      end if;
      if (ident ->> 'kategorija') is distinct from (x ->> 'kategorija') or (ident ->> 'opis') is distinct from btrim(x ->> 'opis') then
        e := e || psih.g(put || '.opis', 'NEPROMJENJIVO', 'Kategorija i opis rizika ' || (ident ->> 'kod') || ' ne mijenjaju se nakon prvog perioda.');
      end if;
    end if;
    select r.value into staro from jsonb_array_elements(i.rizici) r where r.value ->> 'id' = rid limit 1;
    if psih.rizik_kasnije(i.psiholog_id, rid, b) and (x ->> 'status') = 'Riješeno'
       and not (staro is not null and (staro ->> 'status') = 'Riješeno') then
      e := e || psih.g(put || '.status', 'KASNIJI_PERIOD', 'Rizik ' || (ident ->> 'kod') || ' već postoji u kasnijem izvještaju; status se ovdje ne može zatvoriti.');
    end if;
  end loop;
  for p in select * from psih.preneseni(i.psiholog_id, b) loop
    if not ((p ->> 'id') = any (prisutni)) then
      e := e || psih.g('rizici', 'PRENESENI_RIZIK_NEDOSTAJE', 'Preneseni otvoreni rizik ' || (p ->> 'kod') || ' mora ostati u izvještaju.');
    end if;
  end loop;
  for p in select value from jsonb_array_elements(i.rizici) loop
    if not ((p ->> 'id') = any (prisutni)) and psih.rizik_kasnije(i.psiholog_id, p ->> 'id', b) then
      e := e || psih.g('rizici', 'KASNIJI_PERIOD', 'Rizik ' || (p ->> 'kod') || ' postoji u kasnijem izvještaju i ne može se ukloniti.');
    end if;
  end loop;
  idx := 0;
  for x in select value from jsonb_array_elements(prep) loop
    if x ->> 'id' is not null then
      select q.value into pr from jsonb_array_elements(i.preporuke) q where q.value ->> 'id' = x ->> 'id' limit 1;
      if pr is null then
        e := e || psih.g('preporuke.' || idx || '.id', 'NEPOZNAT', 'Preporuka ne postoji u ovom izvještaju.');
      elsif (pr ->> 'odluka') in ('Odobreno', 'Odbijeno') and (
             (pr ->> 'naslov') is distinct from btrim(x ->> 'naslov') or (pr ->> 'obrazlozenje') is distinct from btrim(x ->> 'obrazlozenje')
             or (pr ->> 'utjecaj') is distinct from (x ->> 'utjecaj')) then
        e := e || psih.g('preporuke.' || idx, 'ODLUKA_ZAKLJUCANA', 'Preporuka o kojoj je direktor odlučio ne može se mijenjati.');
      end if;
    end if;
    idx := idx + 1;
  end loop;
  for p in select value from jsonb_array_elements(i.preporuke) loop
    if (p ->> 'odluka') in ('Odobreno', 'Odbijeno') and not exists (select 1 from jsonb_array_elements(prep) y where y.value ->> 'id' = p ->> 'id') then
      e := e || psih.g('preporuke', 'ODLUKA_ZAKLJUCANA', 'Preporuka „' || (p ->> 'naslov') || '“ ima odluku direktora i ne može se ukloniti.');
    end if;
  end loop;
  return e;
end $$;

create or replace function psih.greske_sve(i psih.izvjestaji, sad jsonb, riz jsonb, prep jsonb, strogo boolean) returns jsonb
language plpgsql stable set search_path='' as $$
declare e jsonb;
begin
  e := psih.provjeri_sadrzaj(sad, strogo, i.godina, i.mjesec) || psih.provjeri_rizike(riz, strogo) || psih.provjeri_preporuke(prep, strogo);
  if jsonb_array_length(psih.provjeri_rizike(riz, false)) = 0 and jsonb_array_length(psih.provjeri_preporuke(prep, false)) = 0 then
    e := e || psih.greske_baza(i, riz, prep);
  end if;
  return e;
end $$;

create or replace function psih.kasnjenje_prvo(i psih.izvjestaji) returns int
language sql stable set search_path='' as $$
  select case when i.ciklus = 0 then psih.radnih_dana_izmedju(i.rok_podnosenja, psih.danas()) else coalesce(i.prvo_kasnjenje, 0) end
$$;

create or replace function psih.stanje(i psih.izvjestaji, uloga text, uid uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  vlasnik boolean := uloga = 'psiholog' and i.psiholog_id = uid;
  sad jsonb; riz jsonb; prep jsonb; sn psih.izvjestaj_snimci; kp jsonb; uredjivo boolean;
  prov jsonb := '[]'::jsonb; pregled jsonb := null; kas int; kd int;
begin
  if vlasnik then
    sad := i.sadrzaj; riz := psih.rizici_izlaz(i); prep := i.preporuke;
  elsif uloga = 'direktor' and i.status <> 'nacrt' then
    select * into sn from psih.izvjestaj_snimci s where s.izvjestaj_id = i.id order by s.ciklus desc limit 1;
    if sn.id is null then return null; end if;
    sad := sn.sadrzaj; riz := sn.rizici;
    -- ako preporuka više ne postoji u živom izvještaju, ostaje snimljeno stanje
    select coalesce(jsonb_agg(case when z.value is null then x.value else x.value || jsonb_build_object(
             'odluka', z.value -> 'odluka', 'komentar_direktora', z.value -> 'komentar_direktora', 'odlucio_u', z.value -> 'odlucio_u') end
             order by x.ord), '[]'::jsonb)
      into prep
      from jsonb_array_elements(sn.preporuke) with ordinality x(value, ord)
      left join lateral (select q.value from jsonb_array_elements(i.preporuke) q where q.value ->> 'id' = x.value ->> 'id' limit 1) z on true;
  else
    return null;
  end if;
  kp := psih.kpi(sad, riz, i.godina, i.mjesec);
  uredjivo := vlasnik and i.status in ('nacrt', 'vracen');
  kas := psih.kasnjenje_prvo(i);
  kd := case when i.status = 'vracen' then psih.radnih_dana_izmedju(i.rok_dopune, psih.danas()) else null end;
  if uredjivo then
    prov := psih.greske_sve(i, sad, riz, prep, true);
    pregled := psih.bodovi(sad, riz, kp, i.godina, i.mjesec, kas, i.ciklus + 1, kd);
  end if;
  return jsonb_build_object(
    'id', i.id, 'godina', i.godina, 'mjesec', i.mjesec, 'status', i.status, 'revizija', i.revizija, 'ciklus', i.ciklus,
    'rok_podnosenja', i.rok_podnosenja, 'rok_dopune', i.rok_dopune, 'podnesen_u', i.podnesen_u, 'vracen_u', i.vracen_u, 'odobren_u', i.odobren_u,
    'direktor_napomena', i.direktor_napomena, 'direktor_ocjena', i.direktor_ocjena, 'na_vrijeme', i.na_vrijeme,
    'psiholog', (select jsonb_build_object('ime', p.ime, 'telefon', p.telefon, 'email', (select u.email from auth.users u where u.id = p.id))
                   from psih.profili p where p.id = i.psiholog_id),
    'moje', vlasnik, 'moze_urediti', uredjivo, 'moze_podnijeti', uredjivo and jsonb_array_length(prov) = 0,
    'moze_odluciti', (not vlasnik) and uloga = 'direktor' and i.status = 'podnesen',
    'kasnjenje_prvo', kas, 'kasnjenje_dopune_sada', kd, 'ciklus_sljedeci', i.ciklus + 1,
    'sadrzaj', sad, 'rizici', riz, 'preporuke', prep, 'kpi', kp, 'provjera', prov, 'bodovi_pregled', pregled,
    'bodovi', i.bodovi, 'danas', psih.danas());
end $$;

-- Snimak i bodovi pri podnošenju
create or replace function psih.podnesi_interno(i psih.izvjestaji) returns psih.izvjestaji
language plpgsql set search_path='' as $$
declare rz jsonb := psih.rizici_izlaz(i); kp jsonb; c int := i.ciklus + 1; kas int; kd int; bod jsonb;
begin
  kp := psih.kpi(i.sadrzaj, rz, i.godina, i.mjesec);
  kas := case when i.ciklus = 0 then psih.radnih_dana_izmedju(i.rok_podnosenja, psih.danas()) else coalesce(i.prvo_kasnjenje, 0) end;
  kd := case when i.status = 'vracen' then psih.radnih_dana_izmedju(i.rok_dopune, psih.danas()) else null end;
  bod := psih.bodovi(i.sadrzaj, rz, kp, i.godina, i.mjesec, kas, c, kd) || jsonb_build_object('direktor', 0);
  bod := bod || jsonb_build_object('ukupno', (bod ->> 'zbroj')::int, 'konacno', false);
  insert into psih.izvjestaj_snimci(izvjestaj_id, ciklus, sadrzaj, rizici, preporuke, kpi, bodovi)
  values (i.id, c, i.sadrzaj, rz, i.preporuke, kp, bod);
  i.na_vrijeme := case when i.ciklus = 0 then kas = 0 else i.na_vrijeme end;
  i.prvo_kasnjenje := kas; i.kasnjenje_dopune := kd;
  i.status := 'podnesen'; i.ciklus := c; i.podnesen_u := now(); i.revizija := i.revizija + 1; i.bodovi := bod;
  return i;
end $$;
-- ================================================================== RPC
create or replace function public.idss_psih_profil() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p psih.profili;
begin
  p := psih.korisnik();
  if p.id is null then
    return psih.greska('NEOVLASTEN', 'Ovaj račun nema pristup aplikaciji IDSS Psiholog. Obratite se upravi škole.');
  end if;
  return jsonb_build_object('ok', true, 'ime', p.ime, 'uloga', p.uloga, 'telefon', p.telefon,
           'email', (select u.email from auth.users u where u.id = p.id), 'danas', psih.danas());
end $$;

create or replace function public.idss_psih_ucitaj(p_id uuid default null, p_godina int default null, p_mjesec int default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p psih.profili := psih.korisnik(); i psih.izvjestaji; s jsonb;
begin
  if p.id is null then return psih.greska('NEOVLASTEN', 'Pristup nije dozvoljen.'); end if;
  if p_id is not null then
    select * into i from psih.izvjestaji x where x.id = p_id;
  elsif p.uloga = 'psiholog' and p_godina is not null and p_mjesec is not null then
    select * into i from psih.izvjestaji x where x.psiholog_id = p.id and x.godina = p_godina and x.mjesec = p_mjesec;
  end if;
  if i.id is null then return psih.greska('NE_POSTOJI', 'Izvještaj nije pronađen.'); end if;
  s := psih.stanje(i, p.uloga, p.id);
  if s is null then return psih.greska('ZABRANJENO', 'Nemate pravo pristupa ovom izvještaju.'); end if;
  return jsonb_build_object('ok', true, 'izvjestaj', s);
end $$;

create or replace function public.idss_psih_kreiraj(p_godina int, p_mjesec int, p_zahtjev uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  p psih.profili := psih.korisnik(); i psih.izvjestaji; prev psih.izvjestaji; t date := psih.danas(); b int; r jsonb;
begin
  if p.id is null then return psih.greska('NEOVLASTEN', 'Pristup nije dozvoljen.'); end if;
  if p.uloga <> 'psiholog' then return psih.greska('ZABRANJENO', 'Izvještaj može kreirati samo psiholog.'); end if;
  if p_godina is null or p_mjesec is null or p_godina not between 2024 and 2100 or p_mjesec not between 1 and 12 then
    return psih.greska('VALIDACIJA', 'Period nije ispravan.');
  end if;
  b := psih.pb(p_godina, p_mjesec);
  if b > psih.pb(extract(year from t)::int, extract(month from t)::int) then
    return psih.greska('BUDUCI_PERIOD', 'Izvještaj se ne može kreirati za period koji još nije počeo.');
  end if;
  if b < psih.pb(extract(year from p.prvi_period)::int, extract(month from p.prvi_period)::int) then
    return psih.greska('PERIOD_PRIJE_POCETKA', 'Period je prije početka izvještavanja u ovom sistemu.');
  end if;
  select * into i from psih.izvjestaji x where x.psiholog_id = p.id and x.godina = p_godina and x.mjesec = p_mjesec;
  if i.id is not null then
    return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
  end if;
  select * into prev from psih.izvjestaji x where x.psiholog_id = p.id and psih.pb(x.godina, x.mjesec) < b
   order by psih.pb(x.godina, x.mjesec) desc limit 1;
  if prev.id is not null and prev.status = 'nacrt' then
    return psih.greska('PRETHODNI_NACRT', 'Prethodni izvještaj (' || lpad(prev.mjesec::text, 2, '0') || '/' || prev.godina || ') je još nacrt. Podnesite ga prije nastavka.');
  end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into r from psih.preneseni(p.id, b) x;
  insert into psih.izvjestaji(psiholog_id, godina, mjesec, rok_podnosenja, rizici, posljednji_zahtjev)
  values (p.id, p_godina, p_mjesec, psih.rok_podnosenja(p_godina, p_mjesec), r, p_zahtjev)
  returning * into i;
  perform psih.trag(i.id, p, 'KREIRAN_NACRT', jsonb_build_object('godina', p_godina, 'mjesec', p_mjesec));
  return jsonb_build_object('ok', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
exception when unique_violation then
  select * into i from psih.izvjestaji x where x.psiholog_id = p.id and x.godina = p_godina and x.mjesec = p_mjesec;
  return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
end $$;

create or replace function public.idss_psih_spremi(p_id uuid, p_revizija int, p_sadrzaj jsonb, p_rizici jsonb default '[]', p_preporuke jsonb default '[]', p_zahtjev uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  p psih.profili := psih.korisnik(); i psih.izvjestaji; e jsonb; sad jsonb; riz jsonb; prep jsonb;
  b int; x jsonb; ident jsonb; nova jsonb := '[]'::jsonb; nove_prep jsonb := '[]'::jsonb; pr jsonb;
  kod text; kreiran int; rid text; kat text; op text; broj int; reset boolean;
begin
  if p.id is null then return psih.greska('NEOVLASTEN', 'Pristup nije dozvoljen.'); end if;
  select * into i from psih.izvjestaji x where x.id = p_id for update;
  if i.id is null or p.uloga <> 'psiholog' or i.psiholog_id <> p.id then
    return psih.greska('ZABRANJENO', 'Nemate pravo mijenjati ovaj izvještaj.');
  end if;
  if p_zahtjev is not null and i.posljednji_zahtjev = p_zahtjev then
    return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
  end if;
  if i.status not in ('nacrt', 'vracen') then
    return psih.greska('POGRESNO_STANJE', 'Izvještaj u stanju „' || i.status || '“ ne može se mijenjati.');
  end if;
  if p_revizija is distinct from i.revizija then
    return psih.greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen (drugi tab ili uređaj).', jsonb_build_object('revizija_servera', i.revizija));
  end if;
  sad := coalesce(p_sadrzaj, 'null'::jsonb); riz := coalesce(p_rizici, '[]'::jsonb); prep := coalesce(p_preporuke, '[]'::jsonb);
  if length(sad::text) + length(riz::text) + length(prep::text) > 250000 then
    return psih.greska('VALIDACIJA', 'Izvještaj je prevelik.', jsonb_build_object('greske', psih.g('sadrzaj', 'PRODUGO', 'Izvještaj je prevelik.')));
  end if;
  e := psih.provjeri_sadrzaj(sad, false, i.godina, i.mjesec) || psih.provjeri_rizike(riz, false) || psih.provjeri_preporuke(prep, false);
  if jsonb_array_length(e) = 0 then
    sad := psih.ocisti(psih.filtriraj(sad)); riz := psih.ocisti(riz); prep := psih.ocisti(prep);
    e := psih.greske_baza(i, riz, prep);
  end if;
  if jsonb_array_length(e) > 0 then
    return psih.greska('VALIDACIJA', 'Podaci nisu ispravni. Ispravite označena polja.', jsonb_build_object('greske', e));
  end if;
  b := psih.pb(i.godina, i.mjesec);
  for x in select value from jsonb_array_elements(riz) loop
    ident := case when x ->> 'id' is not null then psih.rizik_ident(i.psiholog_id, x ->> 'id') else null end;
    rid := x ->> 'id';
    if ident is not null then
      kod := ident ->> 'kod'; kreiran := (ident ->> 'kreiran')::int;
    else
      insert into psih.brojaci(godina, n) values (i.godina, 1) on conflict (godina) do update set n = psih.brojaci.n + 1 returning n into broj;
      kod := 'RSK-' || i.godina || '-' || lpad(broj::text, 3, '0'); kreiran := b; rid := gen_random_uuid()::text;
    end if;
    if ident is not null and (ident ->> 'kreiran')::int < b then kat := ident ->> 'kategorija'; op := ident ->> 'opis';
    else kat := x ->> 'kategorija'; op := x ->> 'opis'; end if;
    nova := nova || jsonb_build_array(jsonb_build_object('id', rid, 'kod', kod, 'kategorija', kat, 'opis', op,
              'ozbiljnost', x ->> 'ozbiljnost', 'mjera', coalesce(nullif(x ->> 'mjera', ''), ''),
              'rok', case when coalesce(x ->> 'rok', '') = '' then null else to_jsonb(x ->> 'rok') end,
              'status', x ->> 'status', 'kreiran', kreiran));
  end loop;
  for x in select value from jsonb_array_elements(prep) loop
    pr := null;
    if x ->> 'id' is not null then select q.value into pr from jsonb_array_elements(i.preporuke) q where q.value ->> 'id' = x ->> 'id' limit 1; end if;
    if pr is not null then
      if (pr ->> 'odluka') in ('Odobreno', 'Odbijeno') then
        nove_prep := nove_prep || jsonb_build_array(pr);
      else
        reset := (pr ->> 'odluka') = 'Potrebna dorada';
        nove_prep := nove_prep || jsonb_build_array(pr || jsonb_build_object('naslov', x ->> 'naslov',
            'obrazlozenje', coalesce(x ->> 'obrazlozenje', ''), 'utjecaj', x ->> 'utjecaj',
            'odluka', case when reset then 'Na čekanju' else pr ->> 'odluka' end,
            'odlucio_u', case when reset then null else pr -> 'odlucio_u' end));
      end if;
    else
      nove_prep := nove_prep || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'naslov', x ->> 'naslov',
          'obrazlozenje', coalesce(x ->> 'obrazlozenje', ''), 'utjecaj', x ->> 'utjecaj', 'odluka', 'Na čekanju',
          'komentar_direktora', null, 'odlucio_u', null));
    end if;
  end loop;
  update psih.izvjestaji set sadrzaj = sad, rizici = nova, preporuke = nove_prep, revizija = revizija + 1, posljednji_zahtjev = p_zahtjev
   where id = i.id returning * into i;
  perform psih.trag(i.id, p, 'SPREMLJEN_NACRT', jsonb_build_object('revizija', i.revizija, 'rizika', jsonb_array_length(nova), 'preporuka', jsonb_array_length(nove_prep)));
  return jsonb_build_object('ok', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
end $$;

create or replace function public.idss_psih_podnesi(p_id uuid, p_revizija int, p_zahtjev uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare p psih.profili := psih.korisnik(); i psih.izvjestaji; e jsonb;
begin
  if p.id is null then return psih.greska('NEOVLASTEN', 'Pristup nije dozvoljen.'); end if;
  select * into i from psih.izvjestaji x where x.id = p_id for update;
  if i.id is null or p.uloga <> 'psiholog' or i.psiholog_id <> p.id then
    return psih.greska('ZABRANJENO', 'Nemate pravo podnijeti ovaj izvještaj.');
  end if;
  if p_zahtjev is not null and i.posljednji_zahtjev = p_zahtjev then
    return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
  end if;
  if i.status not in ('nacrt', 'vracen') then
    return psih.greska('POGRESNO_STANJE', 'Izvještaj u stanju „' || i.status || '“ ne može se podnijeti.');
  end if;
  if p_revizija is distinct from i.revizija then
    return psih.greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen (drugi tab ili uređaj).', jsonb_build_object('revizija_servera', i.revizija));
  end if;
  e := psih.greske_sve(i, i.sadrzaj, psih.rizici_izlaz(i), i.preporuke, true);
  if jsonb_array_length(e) > 0 then
    return psih.greska('VALIDACIJA', 'Izvještaj nije potpun. Dopunite označena polja prije podnošenja.', jsonb_build_object('greske', e));
  end if;
  i := psih.podnesi_interno(i);
  update psih.izvjestaji set status = i.status, ciklus = i.ciklus, podnesen_u = i.podnesen_u, revizija = i.revizija, bodovi = i.bodovi,
         na_vrijeme = i.na_vrijeme, prvo_kasnjenje = i.prvo_kasnjenje, kasnjenje_dopune = i.kasnjenje_dopune, posljednji_zahtjev = p_zahtjev
   where id = i.id returning * into i;
  perform psih.trag(i.id, p, case when i.ciklus = 1 then 'PODNESEN' else 'PONOVO_PODNESEN' end,
     jsonb_build_object('ciklus', i.ciklus, 'kasnjenje_radnih_dana', i.prvo_kasnjenje, 'bodovi_zbroj', i.bodovi -> 'zbroj'));
  return jsonb_build_object('ok', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
end $$;

create or replace function public.idss_psih_vrati(p_id uuid, p_revizija int, p_napomena text, p_zahtjev uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare p psih.profili := psih.korisnik(); i psih.izvjestaji; nap text := btrim(coalesce(p_napomena, ''));
begin
  if p.id is null then return psih.greska('NEOVLASTEN', 'Pristup nije dozvoljen.'); end if;
  if p.uloga <> 'direktor' then return psih.greska('ZABRANJENO', 'Izvještaj može vratiti samo direktor.'); end if;
  select * into i from psih.izvjestaji x where x.id = p_id for update;
  if i.id is null then return psih.greska('NE_POSTOJI', 'Izvještaj nije pronađen.'); end if;
  if p_zahtjev is not null and i.posljednji_zahtjev = p_zahtjev then
    return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
  end if;
  if i.status <> 'podnesen' then return psih.greska('POGRESNO_STANJE', 'Vratiti se može samo podnesen izvještaj.'); end if;
  if p_revizija is distinct from i.revizija then
    return psih.greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen.', jsonb_build_object('revizija_servera', i.revizija));
  end if;
  if char_length(nap) < 15 or char_length(nap) > 2000 then
    return psih.greska('VALIDACIJA', 'Obrazloženje mora imati između 15 i 2000 znakova.',
      jsonb_build_object('greske', psih.g('napomena', 'DUZINA', 'Obrazloženje mora imati između 15 i 2000 znakova.')));
  end if;
  update psih.izvjestaji set status = 'vracen', revizija = revizija + 1, vracen_u = now(),
         rok_dopune = psih.dodaj_radne_dane(psih.danas(), 3), direktor_napomena = nap, posljednji_zahtjev = p_zahtjev
   where id = i.id returning * into i;
  perform psih.trag(i.id, p, 'VRACEN_NA_DOPUNU', jsonb_build_object('ciklus', i.ciklus, 'rok_dopune', i.rok_dopune));
  return jsonb_build_object('ok', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
end $$;

create or replace function public.idss_psih_odluka(p_preporuka uuid, p_odluka text, p_komentar text default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare p psih.profili := psih.korisnik(); i psih.izvjestaji; kom text := nullif(btrim(coalesce(p_komentar, '')), ''); idx int; el jsonb;
begin
  if p.id is null then return psih.greska('NEOVLASTEN', 'Pristup nije dozvoljen.'); end if;
  if p.uloga <> 'direktor' then return psih.greska('ZABRANJENO', 'Odluku o preporuci može donijeti samo direktor.'); end if;
  select x.* into i from psih.izvjestaji x
   where exists (select 1 from jsonb_array_elements(x.preporuke) q where q.value ->> 'id' = p_preporuka::text) for update;
  if i.id is null then return psih.greska('NE_POSTOJI', 'Preporuka nije pronađena.'); end if;
  if i.status <> 'podnesen' then return psih.greska('POGRESNO_STANJE', 'Odluka se donosi samo dok je izvještaj podnesen.'); end if;
  if p_odluka is null or not (p_odluka = any (psih.enum_odluka())) or p_odluka = 'Na čekanju' then
    return psih.greska('VALIDACIJA', 'Odluka nije ispravna.');
  end if;
  if kom is not null and char_length(kom) > 1000 then return psih.greska('VALIDACIJA', 'Komentar može imati najviše 1000 znakova.'); end if;
  if p_odluka in ('Odbijeno', 'Potrebna dorada') and kom is null then
    return psih.greska('VALIDACIJA', 'Uz odluku „' || p_odluka || '“ komentar je obavezan.');
  end if;
  select (q.ordinality - 1)::int into idx from jsonb_array_elements(i.preporuke) with ordinality q(value, ordinality) where q.value ->> 'id' = p_preporuka::text;
  el := (i.preporuke -> idx) || jsonb_build_object('odluka', p_odluka, 'komentar_direktora', to_jsonb(kom), 'odlucio_u', to_jsonb(now()));
  update psih.izvjestaji set preporuke = jsonb_set(preporuke, array[idx::text], el), revizija = revizija + 1 where id = i.id returning * into i;
  perform psih.trag(i.id, p, 'ODLUKA_O_PREPORUCI', jsonb_build_object('preporuka', p_preporuka, 'odluka', p_odluka));
  return jsonb_build_object('ok', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
end $$;

create or replace function public.idss_psih_odobri(p_id uuid, p_revizija int, p_ocjena int, p_komentar text default null, p_zahtjev uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare p psih.profili := psih.korisnik(); i psih.izvjestaji; kom text := nullif(btrim(coalesce(p_komentar, '')), ''); bod jsonb;
begin
  if p.id is null then return psih.greska('NEOVLASTEN', 'Pristup nije dozvoljen.'); end if;
  if p.uloga <> 'direktor' then return psih.greska('ZABRANJENO', 'Izvještaj može odobriti samo direktor.'); end if;
  select * into i from psih.izvjestaji x where x.id = p_id for update;
  if i.id is null then return psih.greska('NE_POSTOJI', 'Izvještaj nije pronađen.'); end if;
  if p_zahtjev is not null and i.posljednji_zahtjev = p_zahtjev then
    return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
  end if;
  if i.status <> 'podnesen' then return psih.greska('POGRESNO_STANJE', 'Odobriti se može samo podnesen izvještaj.'); end if;
  if p_revizija is distinct from i.revizija then
    return psih.greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen.', jsonb_build_object('revizija_servera', i.revizija));
  end if;
  if p_ocjena is null or p_ocjena < 0 or p_ocjena > 5 then return psih.greska('VALIDACIJA', 'Ocjena kvaliteta mora biti između 0 i 5.'); end if;
  if kom is not null and char_length(kom) > 2000 then return psih.greska('VALIDACIJA', 'Komentar može imati najviše 2000 znakova.'); end if;
  if exists (select 1 from jsonb_array_elements(i.preporuke) q where q.value ->> 'odluka' = 'Na čekanju') then
    return psih.greska('PREPORUKE_BEZ_ODLUKE', 'Prije odobrenja potrebno je odlučiti o svim preporukama.');
  end if;
  if exists (select 1 from jsonb_array_elements(i.preporuke) q where q.value ->> 'odluka' = 'Potrebna dorada') then
    return psih.greska('PREPORUKE_TRAZE_DORADU', 'Postoji preporuka označena kao „Potrebna dorada“. Vratite izvještaj na dopunu.');
  end if;
  bod := i.bodovi;
  bod := jsonb_set(bod, '{stavke}', (bod -> 'stavke') || jsonb_build_array(psih.stavka('D1', 'direktor', 'Ocjena direktora o kvalitetu', p_ocjena * 20, 100,
            'Ocjena ' || p_ocjena || ' od 5 (po 20 bodova).')));
  bod := bod || jsonb_build_object('direktor', p_ocjena * 20, 'ukupno', (bod ->> 'zbroj')::int + p_ocjena * 20, 'konacno', true, 'max', 1000);
  update psih.izvjestaji set bodovi = bod, status = 'odobren', odobren_u = now(), direktor_ocjena = p_ocjena,
         direktor_napomena = coalesce(kom, direktor_napomena), revizija = revizija + 1, posljednji_zahtjev = p_zahtjev
   where id = i.id returning * into i;
  perform psih.trag(i.id, p, 'ODOBREN', jsonb_build_object('ocjena', p_ocjena, 'bodovi_ukupno', bod -> 'ukupno'));
  return jsonb_build_object('ok', true, 'izvjestaj', psih.stanje(i, p.uloga, p.id));
end $$;

create or replace function public.idss_psih_trag(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p psih.profili := psih.korisnik(); i psih.izvjestaji;
begin
  if p.id is null then return psih.greska('NEOVLASTEN', 'Pristup nije dozvoljen.'); end if;
  select * into i from psih.izvjestaji x where x.id = p_id;
  if i.id is null or not ((p.uloga = 'psiholog' and i.psiholog_id = p.id) or (p.uloga = 'direktor' and i.status <> 'nacrt')) then
    return psih.greska('ZABRANJENO', 'Nemate pravo pristupa historiji ovog izvještaja.');
  end if;
  return jsonb_build_object('ok', true, 'dogadjaji', coalesce((
    select jsonb_agg(jsonb_build_object('vrijeme', t.kreiran, 'akcija', t.akcija, 'izvjestaj_id', t.izvjestaj_id, 'akter', t.akter, 'uloga', t.uloga, 'sazetak', t.sazetak) order by t.id)
      from psih.revizorski_trag t where t.izvjestaj_id = p_id and (p.uloga = 'psiholog' or t.akcija <> 'SPREMLJEN_NACRT')), '[]'::jsonb));
end $$;

create or replace function public.idss_psih_arhiva() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p psih.profili := psih.korisnik();
begin
  if p.id is null then return psih.greska('NEOVLASTEN', 'Pristup nije dozvoljen.'); end if;
  return jsonb_build_object('ok', true, 'izvjestaji', coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'psiholog', pr.ime, 'godina', i.godina, 'mjesec', i.mjesec, 'status', i.status,
             'podnesen_u', i.podnesen_u, 'odobren_u', i.odobren_u, 'ciklus', i.ciklus, 'na_vrijeme', i.na_vrijeme,
             'bodovi_ukupno', i.bodovi -> 'ukupno', 'konacno', coalesce((i.bodovi ->> 'konacno')::boolean, false))
             order by psih.pb(i.godina, i.mjesec) desc)
      from psih.izvjestaji i join psih.profili pr on pr.id = i.psiholog_id
     where (p.uloga = 'psiholog' and i.psiholog_id = p.id) or (p.uloga = 'direktor' and i.status <> 'nacrt')), '[]'::jsonb));
end $$;

create or replace function public.idss_psih_pocetna() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  p psih.profili := psih.korisnik(); danas date := psih.danas(); tg int := extract(year from psih.danas())::int; tm int := extract(month from psih.danas())::int;
  tb int; sb int; b int; g int; m int; i psih.izvjestaji; rok date; kasni boolean; periodi jsonb := '[]'::jsonb; serija int := 0; prekid boolean := false;
  sg int; odob int; prosjek int; zbroj int; u_obradi int; sljedeci jsonb; znacke jsonb; r jsonb; pf psih.profili;
  cekaju jsonb; kasne jsonb := '[]'::jsonb; otv jsonb; po jsonb; prep jsonb; zadnji jsonb; ima_bez boolean; ima_pune boolean; ima_rizik boolean; ima_krug boolean;
begin
  if p.id is null then return psih.greska('NEOVLASTEN', 'Pristup nije dozvoljen.'); end if;
  tb := psih.pb(tg, tm); sg := psih.skolska(tg, tm);
  if p.uloga = 'psiholog' then
    sb := greatest(psih.pb(extract(year from p.prvi_period)::int, extract(month from p.prvi_period)::int), tb - 11);
    for b in reverse tb..sb loop
      g := psih.pb_g(b); m := psih.pb_m(b);
      select * into i from psih.izvjestaji x where x.psiholog_id = p.id and x.godina = g and x.mjesec = m;
      rok := psih.rok_podnosenja(g, m);
      kasni := case when i.id is null or i.status = 'nacrt' then danas > rok when i.status = 'vracen' then danas > i.rok_dopune else false end;
      periodi := periodi || jsonb_build_array(jsonb_build_object('godina', g, 'mjesec', m, 'id', i.id, 'status', coalesce(i.status, 'nema'),
         'rok', rok, 'rok_dopune', i.rok_dopune, 'kasni', kasni, 'na_vrijeme', i.na_vrijeme,
         'bodovi_ukupno', i.bodovi -> 'ukupno', 'konacno', coalesce((i.bodovi ->> 'konacno')::boolean, false)));
    end loop;
    for b in reverse tb..sb loop
      exit when prekid;
      g := psih.pb_g(b); m := psih.pb_m(b);
      select * into i from psih.izvjestaji x where x.psiholog_id = p.id and x.godina = g and x.mjesec = m;
      if i.id is not null and i.ciklus > 0 and coalesce(i.na_vrijeme, false) then serija := serija + 1;
      elsif b = tb then null; else prekid := true; end if;
    end loop;
    select count(*), coalesce(floor(avg((x.bodovi ->> 'ukupno')::numeric) + 0.5), 0)::int, coalesce(sum((x.bodovi ->> 'ukupno')::int), 0)
      into odob, prosjek, zbroj from psih.izvjestaji x
     where x.psiholog_id = p.id and x.status = 'odobren' and psih.skolska(x.godina, x.mjesec) = sg;
    select coalesce(sum((x.bodovi ->> 'ukupno')::int), 0) into u_obradi from psih.izvjestaji x
     where x.psiholog_id = p.id and x.status = 'podnesen' and psih.skolska(x.godina, x.mjesec) = sg;
    sljedeci := null;
    if odob > 0 then
      select jsonb_build_object('naziv', v.n, 'prag', v.t) into sljedeci from (values (500, 'Saradnik'), (650, 'Stručnjak'), (800, 'Majstor'), (900, 'Velemajstor')) v(t, n)
       where v.t > prosjek order by v.t limit 1;
    end if;
    -- značke
    select exists (select 1 from psih.izvjestaji x where x.psiholog_id = p.id and x.status = 'odobren' and x.ciklus = 1 and psih.skolska(x.godina, x.mjesec) = sg) into ima_bez;
    with sn as (
      select distinct on (s.izvjestaj_id) s.* from psih.izvjestaj_snimci s join psih.izvjestaji x on x.id = s.izvjestaj_id
       where x.psiholog_id = p.id and x.status in ('podnesen', 'odobren') and psih.skolska(x.godina, x.mjesec) = sg order by s.izvjestaj_id, s.ciklus desc)
    select coalesce(bool_or(coalesce((kpi -> 'kpi01' ->> 'stopa')::numeric >= 100, false)), false),
           coalesce(bool_or(coalesce((kpi -> 'kpi03' ->> 'rijeseno_3a')::int >= 1, false)), false),
           coalesce(bool_or((select count(distinct w.value ->> 'ciljna_grupa') = 3 from jsonb_array_elements(case when jsonb_typeof(sadrzaj -> 'radionice' -> 'stavke') = 'array' then sadrzaj -> 'radionice' -> 'stavke' else '[]'::jsonb end) w
                              where w.value ->> 'status' = 'održano')), false)
      into ima_pune, ima_rizik, ima_krug from sn;
    znacke := jsonb_build_array(
      jsonb_build_object('kod', 'SERIJA_3', 'naziv', 'Serija od tri', 'opis', 'Tri uzastopna izvještaja podnesena u roku.', 'stecena', serija >= 3),
      jsonb_build_object('kod', 'BEZ_VRACANJA', 'naziv', 'Prvi put dobro', 'opis', 'Izvještaj odobren bez vraćanja na dopunu.', 'stecena', ima_bez),
      jsonb_build_object('kod', 'PUNE_OPSERVACIJE', 'naziv', 'Puni plan opservacija', 'opis', 'Realizirane sve planirane opservacije u razredu u mjesecu.', 'stecena', ima_pune),
      jsonb_build_object('kod', 'RIZICI_ZATVORENI', 'naziv', 'Zatvoren rizik', 'opis', 'Barem jedan rizik riješen u mjesečnom izvještaju.', 'stecena', ima_rizik),
      jsonb_build_object('kod', 'KRUG_RADIONICA', 'naziv', 'Tri kruga radionica', 'opis', 'U jednom mjesecu održane radionice za učenike, nastavnike i roditelje.', 'stecena', ima_krug));
    return jsonb_build_object('ok', true, 'uloga', p.uloga, 'ime', p.ime, 'danas', danas,
      'tekuci_period', jsonb_build_object('godina', tg, 'mjesec', tm), 'periodi', periodi,
      'sezona', jsonb_build_object('skolska_godina', sg, 'prosjek', case when odob > 0 then to_jsonb(prosjek) else 'null'::jsonb end,
         'broj_odobrenih', odob, 'zbroj_potvrdjenih', zbroj, 'u_obradi', u_obradi,
         'rang', case when odob > 0 then to_jsonb(psih.rang(prosjek)) else 'null'::jsonb end, 'sljedeci_rang', sljedeci),
      'serija', serija, 'znacke', znacke);
  end if;
  -- direktor
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'psiholog', pr.ime, 'godina', x.godina, 'mjesec', x.mjesec, 'podnesen_u', x.podnesen_u,
           'ciklus', x.ciklus, 'rok', x.rok_podnosenja, 'bodovi_zbroj', x.bodovi -> 'zbroj') order by x.podnesen_u), '[]'::jsonb)
    into cekaju from psih.izvjestaji x join psih.profili pr on pr.id = x.psiholog_id where x.status = 'podnesen';
  for pf in select * from psih.profili where uloga = 'psiholog' and aktivan order by ime loop
    sb := greatest(psih.pb(extract(year from pf.prvi_period)::int, extract(month from pf.prvi_period)::int), tb - 11);
    for b in sb..tb loop
      g := psih.pb_g(b); m := psih.pb_m(b);
      select * into i from psih.izvjestaji x where x.psiholog_id = pf.id and x.godina = g and x.mjesec = m;
      rok := psih.rok_podnosenja(g, m);
      if (i.id is null or i.status = 'nacrt') and danas > rok then
        kasne := kasne || jsonb_build_array(jsonb_build_object('psiholog', pf.ime, 'godina', g, 'mjesec', m, 'status', case when i.id is null then 'nema' else 'nacrt' end,
                   'rok', rok, 'kasni_radnih_dana', psih.radnih_dana_izmedju(rok, danas)));
      elsif i.id is not null and i.status = 'vracen' and danas > i.rok_dopune then
        kasne := kasne || jsonb_build_array(jsonb_build_object('psiholog', pf.ime, 'godina', g, 'mjesec', m, 'status', 'vracen',
                   'rok', i.rok_dopune, 'kasni_radnih_dana', psih.radnih_dana_izmedju(i.rok_dopune, danas)));
      end if;
    end loop;
  end loop;
  with zs as (
    select distinct on (x.psiholog_id, rr.value ->> 'id') rr.value as riz, pr.ime as ime
      from psih.izvjestaji x join psih.profili pr on pr.id = x.psiholog_id
      join lateral (select s.* from psih.izvjestaj_snimci s where s.izvjestaj_id = x.id order by s.ciklus desc limit 1) sn on true
      join lateral jsonb_array_elements(sn.rizici) rr on true
     order by x.psiholog_id, rr.value ->> 'id', psih.pb(x.godina, x.mjesec) desc),
  ot as (select * from zs where (riz ->> 'status') <> 'Riješeno')
  select coalesce(jsonb_agg(jsonb_build_object('kod', riz ->> 'kod', 'opis', riz ->> 'opis', 'kategorija', riz ->> 'kategorija', 'ozbiljnost', riz ->> 'ozbiljnost',
           'status', riz ->> 'status', 'rok', riz -> 'rok', 'psiholog', ime)
           order by case riz ->> 'ozbiljnost' when 'Kritičan' then 1 when 'Visok' then 2 when 'Srednji' then 3 else 4 end, riz ->> 'kod'), '[]'::jsonb),
         jsonb_build_object('Kritičan', count(*) filter (where riz ->> 'ozbiljnost' = 'Kritičan'), 'Visok', count(*) filter (where riz ->> 'ozbiljnost' = 'Visok'),
                            'Srednji', count(*) filter (where riz ->> 'ozbiljnost' = 'Srednji'), 'Nizak', count(*) filter (where riz ->> 'ozbiljnost' = 'Nizak'))
    into otv, po from ot;
  select coalesce(jsonb_agg(jsonb_build_object('preporuka_id', q.value ->> 'id', 'izvjestaj_id', x.id, 'naslov', q.value ->> 'naslov', 'utjecaj', q.value ->> 'utjecaj',
           'godina', x.godina, 'mjesec', x.mjesec, 'psiholog', pr.ime) order by psih.pb(x.godina, x.mjesec), q.value ->> 'naslov'), '[]'::jsonb)
    into prep from psih.izvjestaji x join psih.profili pr on pr.id = x.psiholog_id, jsonb_array_elements(x.preporuke) q
   where x.status = 'podnesen' and q.value ->> 'odluka' = 'Na čekanju';
  select coalesce(jsonb_agg(o), '[]'::jsonb) into zadnji from (
    select jsonb_build_object('id', x.id, 'psiholog', pr.ime, 'godina', x.godina, 'mjesec', x.mjesec, 'status', x.status, 'podnesen_u', x.podnesen_u,
             'na_vrijeme', x.na_vrijeme, 'bodovi_ukupno', x.bodovi -> 'ukupno', 'konacno', coalesce((x.bodovi ->> 'konacno')::boolean, false)) as o
      from psih.izvjestaji x join psih.profili pr on pr.id = x.psiholog_id where x.status <> 'nacrt'
     order by psih.pb(x.godina, x.mjesec) desc, pr.ime limit 24) t;
  return jsonb_build_object('ok', true, 'uloga', p.uloga, 'ime', p.ime, 'danas', danas, 'tekuci_period', jsonb_build_object('godina', tg, 'mjesec', tm),
     'cekaju', cekaju, 'kasne', kasne, 'rizici', otv, 'rizici_po_ozbiljnosti', po, 'preporuke_na_cekanju', prep, 'izvjestaji', zadnji);
end $$;

-- Dodavanje profila (poziva se ručno u SQL Editoru, nikad iz aplikacije).
create or replace function psih.dodaj_profil(p_email text, p_ime text, p_uloga text, p_prvi date, p_telefon text)
returns text language plpgsql set search_path='' as $$
declare u uuid;
begin
  select id into u from auth.users where lower(email) = lower(p_email);
  if u is null then return 'Korisnik ' || p_email || ' ne postoji u Authentication > Users.'; end if;
  insert into psih.profili(id, ime, uloga, telefon, prvi_period) values (u, p_ime, p_uloga, p_telefon, p_prvi)
  on conflict (id) do update set ime = excluded.ime, uloga = excluded.uloga, telefon = excluded.telefon,
                                 prvi_period = excluded.prvi_period, aktivan = true;
  return 'OK: ' || p_email || ' → ' || p_uloga;
end $$;

-- ---------------------------------------------------------- sigurnost
revoke all on all tables in schema psih from public;
revoke all on all functions in schema psih from public;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'idss\_psih\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', r.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
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
-- Dijagnostika: sve tri stavke moraju biti u redu
select 'korisnik u Authentication' as stavka, email, (email_confirmed_at is not null)::text as stanje from auth.users where lower(email) in ('psiholog@idss.ba','direktor@idss.ba')
union all
select 'profil u aplikaciji', u.email, p.uloga || ' / aktivan=' || p.aktivan from psih.profili p join auth.users u on u.id = p.id
union all
select 'neradnih dana u kalendaru', '', count(*)::text from psih.neradni_dani
order by 1, 2;
