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
-- =====================================================================
-- IDSS Pedagog — Mjesečni izvještaj :: 002_validacija_bodovi.sql
-- Validacija sadržaja, KPI pokazatelji i obračun IDSS bodova.
-- Sve funkcije su ČISTE (bez pristupa tabelama) osim tamo gdje je navedeno,
-- pa ih je moguće paritetno testirati naspram JavaScript implementacije.
-- =====================================================================

-- ---------- Opšti pomoćnici ----------
create or replace function interno.g(p_polje text, p_kod text, p_poruka text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_array(jsonb_build_object('polje', p_polje, 'kod', p_kod, 'poruka', p_poruka)) $$;

create or replace function interno.dolje(t text) returns int
language sql immutable set search_path = '' as $$ select char_length(coalesce(t, '')) $$;

create or replace function interno.obj(s jsonb, k text) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(s -> k) = 'object' then s -> k else '{}'::jsonb end $$;

create or replace function interno.je_datum(t text) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  perform t::date;
  return true;
exception when others then return false;
end $$;

create or replace function interno.je_uuid(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' $$;

-- Cijeli broj u rasponu
create or replace function interno.e_cijeli(o jsonb, k text, naziv text, mn int, mx int, obavezno boolean, put text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v jsonb := o -> k; n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if obavezno then return interno.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje (unesite 0 ako nema aktivnosti).'); end if;
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(v) <> 'number' then
    return interno.g(put || '.' || k, 'TIP', naziv || ' mora biti cijeli broj.');
  end if;
  n := (v #>> '{}')::numeric;
  if n <> trunc(n) then return interno.g(put || '.' || k, 'TIP', naziv || ' mora biti cijeli broj.'); end if;
  if n < mn or n > mx then
    return interno.g(put || '.' || k, 'RASPON', naziv || ' mora biti između ' || mn || ' i ' || mx || '.');
  end if;
  return '[]'::jsonb;
end $$;

-- Tekst: najveća dužina uvijek; najmanja samo kada je polje obavezno
create or replace function interno.e_tekst(o jsonb, k text, naziv text, mn int, mx int, obavezno boolean, put text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v jsonb := o -> k; t text; tt text;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if obavezno then return interno.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje.'); end if;
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(v) <> 'string' then
    return interno.g(put || '.' || k, 'TIP', naziv || ' mora biti tekst.');
  end if;
  t := v #>> '{}'; tt := btrim(t);
  if t ~ '[\x01-\x08\x0B\x0C\x0E-\x1F]' then
    return interno.g(put || '.' || k, 'ZNAKOVI', naziv || ' sadrži nedozvoljene kontrolne znakove.');
  end if;
  if char_length(t) > mx then
    return interno.g(put || '.' || k, 'PRODUGO', naziv || ' može imati najviše ' || mx || ' znakova.');
  end if;
  if obavezno then
    if tt = '' then return interno.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje.'); end if;
    if char_length(tt) < mn then
      return interno.g(put || '.' || k, 'PREKRATKO', naziv || ' mora imati najmanje ' || mn || ' znakova (trenutno ' || char_length(tt) || ').');
    end if;
  end if;
  return '[]'::jsonb;
end $$;

create or replace function interno.e_enum(o jsonb, k text, naziv text, dozvoljeno text[], obavezno boolean, put text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v jsonb := o -> k;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if obavezno then return interno.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje.'); end if;
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = any (dozvoljeno)) then
    return interno.g(put || '.' || k, 'VRIJEDNOST', naziv || ' ima nedozvoljenu vrijednost.');
  end if;
  return '[]'::jsonb;
end $$;

create or replace function interno.e_vise(o jsonb, k text, naziv text, dozvoljeno text[], mn int, obavezno boolean, put text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v jsonb := o -> k; n int; ukupno int; razl int;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if obavezno then return interno.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje.'); end if;
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(v) <> 'array' then
    return interno.g(put || '.' || k, 'TIP', naziv || ' mora biti lista.');
  end if;
  select count(*), count(distinct e), count(*) filter (where e = any (dozvoljeno))
    into ukupno, razl, n
    from (select jsonb_typeof(x) as t, case when jsonb_typeof(x) = 'string' then x #>> '{}' end as e
            from jsonb_array_elements(v) x) q;
  if n <> ukupno then return interno.g(put || '.' || k, 'VRIJEDNOST', naziv || ' sadrži nedozvoljenu vrijednost.'); end if;
  if razl <> ukupno then return interno.g(put || '.' || k, 'DUPLIKAT', naziv || ' sadrži ponovljene vrijednosti.'); end if;
  if obavezno and ukupno < mn then
    return interno.g(put || '.' || k, 'OBAVEZNO', naziv || ': odaberite najmanje ' || mn || '.');
  end if;
  return '[]'::jsonb;
end $$;

create or replace function interno.e_datum(o jsonb, k text, naziv text, obavezno boolean, put text, od date, do_ date)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v jsonb := o -> k; d date;
begin
  if v is null or jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
    if obavezno then return interno.g(put || '.' || k, 'OBAVEZNO', naziv || ' je obavezno polje.'); end if;
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(v) <> 'string' or not interno.je_datum(v #>> '{}') then
    return interno.g(put || '.' || k, 'TIP', naziv || ' mora biti ispravan datum (GGGG-MM-DD).');
  end if;
  d := (v #>> '{}')::date;
  if od is not null and d < od then return interno.g(put || '.' || k, 'RASPON', naziv || ' ne smije biti prije ' || to_char(od, 'DD.MM.YYYY.') || '.'); end if;
  if do_ is not null and d > do_ then return interno.g(put || '.' || k, 'RASPON', naziv || ' ne smije biti poslije ' || to_char(do_, 'DD.MM.YYYY.') || '.'); end if;
  return '[]'::jsonb;
end $$;

-- Cijela vrijednost kao int (ili null) iz objekta
create or replace function interno.ci(o jsonb, k text) returns int
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(o -> k) = 'number' and ((o -> k) #>> '{}')::numeric = trunc(((o -> k) #>> '{}')::numeric)
                   and abs(((o -> k) #>> '{}')::numeric) <= 2147483647
              then ((o -> k) #>> '{}')::numeric::int end $$;

create or replace function interno.tk(o jsonb, k text) returns text
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(o -> k) = 'string' then btrim(o #>> array[k]) end $$;

-- ---------- Dozvoljene vrijednosti (JEDAN izvor istine; ista lista je u index.html) ----------
create or replace function interno.enum_teme() returns text[] language sql immutable set search_path = '' as $$
  select array['Ponašanje','Učenje i ocjene','Emocionalna podrška','Socijalna integracija','Daroviti učenici',
               'Inkluzivna podrška','Adaptacija novih učenika','Prelazak u viši razred',
               'Vršnjačko nasilje i sigurnost','Profesionalna orijentacija'] $$;
create or replace function interno.enum_da_ne() returns text[] language sql immutable set search_path = '' as $$
  select array['Da','Ne'] $$;
create or replace function interno.enum_ednevnik() returns text[] language sql immutable set search_path = '' as $$
  select array['Uredno','U toku','Zahtijeva intervenciju'] $$;
create or replace function interno.enum_grupe() returns text[] language sql immutable set search_path = '' as $$
  select array['učenici','nastavnici','roditelji'] $$;
create or replace function interno.enum_radionica_status() returns text[] language sql immutable set search_path = '' as $$
  select array['održano','otkazano','prebačeno'] $$;
create or replace function interno.enum_usavrsavanje() returns text[] language sql immutable set search_path = '' as $$
  select array['seminar','webinar','stručni skup','mentorski rad','samostalno učenje','ostalo'] $$;
create or replace function interno.enum_kategorija() returns text[] language sql immutable set search_path = '' as $$
  select array['Pedagoški / Ponašanje','Akademski','Sigurnosni / Zaštita djece','Organizacijski'] $$;
create or replace function interno.enum_ozbiljnost() returns text[] language sql immutable set search_path = '' as $$
  select array['Nizak','Srednji','Visok','Kritičan'] $$;
create or replace function interno.enum_status_rizika() returns text[] language sql immutable set search_path = '' as $$
  select array['Otvoreno','U toku','Riješeno','Eskalirano'] $$;
create or replace function interno.enum_utjecaj() returns text[] language sql immutable set search_path = '' as $$
  select array['Nema troškova','Potreban budžet','Kadrovska odluka','Organizacijska izmjena'] $$;
create or replace function interno.enum_odluka() returns text[] language sql immutable set search_path = '' as $$
  select array['Na čekanju','Odobreno','Odbijeno','Potrebna dorada'] $$;

-- ---------- Validacija sadržaja izvještaja ----------
-- strogo = false  -> čuvanje nacrta (samo tip, raspon, dužina)
-- strogo = true   -> podnošenje (obaveznost i najmanje dužine)
create or replace function interno.provjeri_sadrzaj(s jsonb, strogo boolean, p_godina int, p_mjesec int)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  e jsonb := '[]'::jsonb;
  od date := make_date(p_godina, p_mjesec, 1);
  doo date := interno.kraj_mjeseca(p_godina, p_mjesec);
  sek text; v jsonb;
  u jsonb; n jsonb; r jsonb; rad jsonb; usv jsonb; a jsonb; z jsonb;
  ind int; raz int; pl int; re int; x jsonb; ord bigint; put text; stavke jsonb; broj int; kp_ int; ko_ int; kv_ int;
  st text;
begin
  if jsonb_typeof(s) is distinct from 'object' then
    return interno.g('sadrzaj', 'TIP', 'Sadržaj izvještaja mora biti objekat.');
  end if;
  if octet_length(s::text) > 200000 then
    return interno.g('sadrzaj', 'PREVELIKO', 'Sadržaj izvještaja je prevelik.');
  end if;
  foreach sek in array array['ucenici','nastavnici','roditelji','radionice','usavrsavanje','administracija','zakljucak'] loop
    if s ? sek and jsonb_typeof(s -> sek) not in ('object', 'null') then
      e := e || interno.g(sek, 'TIP', 'Odjeljak „' || sek || '“ mora biti objekat.');
    end if;
  end loop;
  u := interno.obj(s, 'ucenici'); n := interno.obj(s, 'nastavnici'); r := interno.obj(s, 'roditelji');
  rad := interno.obj(s, 'radionice'); usv := interno.obj(s, 'usavrsavanje'); a := interno.obj(s, 'administracija');
  z := interno.obj(s, 'zakljucak');

  -- 1. Rad sa učenicima
  e := e || interno.e_cijeli(u, 'individualni_razgovori', 'Broj individualnih razgovora', 0, 500, strogo, 'ucenici')
         || interno.e_cijeli(u, 'razliciti_ucenici', 'Broj različitih učenika', 0, 500, strogo, 'ucenici')
         || interno.e_cijeli(u, 'grupni_rad', 'Broj grupnih/razrednih aktivnosti', 0, 200, strogo, 'ucenici')
         || interno.e_cijeli(u, 'daroviti_ucenici', 'Broj darovitih učenika u radu', 0, 200, strogo, 'ucenici');
  ind := interno.ci(u, 'individualni_razgovori'); raz := interno.ci(u, 'razliciti_ucenici');
  e := e || interno.e_vise(u, 'teme', 'Teme rada sa učenicima', interno.enum_teme(), 1, strogo and coalesce(ind, 0) > 0, 'ucenici')
         || interno.e_tekst(u, 'sazetak', 'Sažetak rada sa učenicima', 50, 2500, strogo, 'ucenici');
  if ind is not null and raz is not null and raz > ind then
    e := e || interno.g('ucenici.razliciti_ucenici', 'NEUSKLADJENO', 'Broj različitih učenika ne može biti veći od broja individualnih razgovora.');
  end if;

  -- 2. Rad sa nastavnicima
  e := e || interno.e_cijeli(n, 'posjete_planirano', 'Planirane posjete časovima', 0, 200, strogo, 'nastavnici')
         || interno.e_cijeli(n, 'posjete_realizirano', 'Realizirane posjete časovima', 0, 200, strogo, 'nastavnici')
         || interno.e_cijeli(n, 'konsultacije', 'Broj konsultacija sa nastavnicima', 0, 500, strogo, 'nastavnici')
         || interno.e_cijeli(n, 'mentorstvo_sati', 'Sati mentorstva i stručne pomoći', 0, 200, strogo, 'nastavnici')
         || interno.e_cijeli(n, 'sastanci_vijeca', 'Broj sjednica vijeća', 0, 50, strogo, 'nastavnici');
  pl := interno.ci(n, 'posjete_planirano'); re := interno.ci(n, 'posjete_realizirano');
  e := e || interno.e_tekst(n, 'razredi', 'Razredi u kojima su posjećeni časovi', 1, 250, strogo and coalesce(re, 0) > 0, 'nastavnici')
         || interno.e_tekst(n, 'nalazi', 'Nalazi posjeta časovima', 50, 2500, strogo and coalesce(re, 0) > 0, 'nastavnici')
         || interno.e_tekst(n, 'obrazlozenje_prekoracenja', 'Obrazloženje prekoračenja plana posjeta', 20, 1000,
                            strogo and re is not null and pl is not null and re > pl, 'nastavnici')
         || interno.e_tekst(n, 'koordinacija', 'Koordinacija sa nastavnicima i stručnim organima', 30, 2000, strogo, 'nastavnici');

  -- 3. Rad sa roditeljima
  e := e || interno.e_cijeli(r, 'individualni_razgovori', 'Broj individualnih razgovora sa roditeljima', 0, 500, strogo, 'roditelji')
         || interno.e_cijeli(r, 'roditeljski_sastanci', 'Broj roditeljskih sastanaka', 0, 50, strogo, 'roditelji')
         || interno.e_cijeli(r, 'pisana_komunikacija', 'Broj pisanih komunikacija sa roditeljima', 0, 1000, strogo, 'roditelji')
         || interno.e_tekst(r, 'biljeske', 'Sažetak saradnje sa roditeljima', 30, 2000, strogo, 'roditelji');

  -- 4. Radionice
  if rad ? 'stavke' and jsonb_typeof(rad -> 'stavke') <> 'array' then
    e := e || interno.g('radionice.stavke', 'TIP', 'Radionice moraju biti lista.');
    stavke := '[]'::jsonb;
  else
    stavke := coalesce(rad -> 'stavke', '[]'::jsonb);
  end if;
  if jsonb_array_length(stavke) > 30 then
    e := e || interno.g('radionice.stavke', 'PREVISE', 'Najviše 30 radionica po izvještaju.');
  else
    for x, ord in select t.x, t.ord from jsonb_array_elements(stavke) with ordinality t(x, ord) loop
      put := 'radionice.stavke.' || (ord - 1);
      if jsonb_typeof(x) <> 'object' then e := e || interno.g(put, 'TIP', 'Radionica mora biti objekat.'); continue; end if;
      st := interno.tk(x, 'status');
      e := e || interno.e_enum(x, 'ciljna_grupa', 'Ciljna grupa radionice', interno.enum_grupe(), true, put)
             || interno.e_tekst(x, 'naslov', 'Naslov radionice', 5, 150, true, put)
             || interno.e_datum(x, 'datum', 'Datum radionice', true, put, od, doo)
             || interno.e_cijeli(x, 'trajanje_min', 'Trajanje radionice (minute)', 15, 480, true, put)
             || interno.e_enum(x, 'status', 'Status radionice', interno.enum_radionica_status(), true, put)
             || interno.e_cijeli(x, 'ucesnika', 'Broj učesnika', 0, 500, strogo or st = 'održano', put)
             || interno.e_tekst(x, 'ishod', 'Ishod radionice', 20, 1000, strogo and st = 'održano', put)
             || interno.e_enum(x, 'qp05_zapis', 'Zavedeno u zapis QP 05 (Evidencija obuke, QP 05.EO-02)', interno.enum_da_ne(), strogo or st = 'održano', put);
      if st = 'održano' and coalesce(interno.ci(x, 'ucesnika'), 0) < 1 and x ? 'ucesnika' then
        e := e || interno.g(put || '.ucesnika', 'RASPON', 'Održana radionica mora imati najmanje jednog učesnika.');
      end if;
    end loop;
    if strogo and jsonb_array_length(stavke) = 0 then
      e := e || interno.e_tekst(rad, 'nema_obrazlozenje', 'Obrazloženje izostanka radionica', 20, 1000, true, 'radionice');
    else
      e := e || interno.e_tekst(rad, 'nema_obrazlozenje', 'Obrazloženje izostanka radionica', 20, 1000, false, 'radionice');
    end if;
  end if;

  -- 5. Stručno usavršavanje pedagoga
  if usv ? 'stavke' and jsonb_typeof(usv -> 'stavke') <> 'array' then
    e := e || interno.g('usavrsavanje.stavke', 'TIP', 'Stručno usavršavanje mora biti lista.');
  else
    stavke := coalesce(usv -> 'stavke', '[]'::jsonb);
    if jsonb_array_length(stavke) > 30 then
      e := e || interno.g('usavrsavanje.stavke', 'PREVISE', 'Najviše 30 stavki stručnog usavršavanja.');
    else
      for x, ord in select t.x, t.ord from jsonb_array_elements(stavke) with ordinality t(x, ord) loop
        put := 'usavrsavanje.stavke.' || (ord - 1);
        if jsonb_typeof(x) <> 'object' then e := e || interno.g(put, 'TIP', 'Stavka mora biti objekat.'); continue; end if;
        e := e || interno.e_tekst(x, 'naslov', 'Naslov usavršavanja', 5, 150, true, put)
               || interno.e_enum(x, 'vrsta', 'Vrsta usavršavanja', interno.enum_usavrsavanje(), true, put)
               || interno.e_cijeli(x, 'sati', 'Broj sati', 1, 100, true, put)
               || interno.e_datum(x, 'datum', 'Datum usavršavanja', true, put, od, doo);
      end loop;
    end if;
  end if;

  -- 6. QMS, eDnevnik, MOOKS
  e := e || interno.e_cijeli(a, 'kreativni_planirano', 'Kreativni časovi planirani (QP 09.PO-01)', 0, 200, strogo, 'administracija')
         || interno.e_cijeli(a, 'kreativni_odrzano', 'Održani kreativni časovi', 0, 200, strogo, 'administracija')
         || interno.e_cijeli(a, 'kreativni_posjeceno', 'Posjećeni kreativni časovi evidentirani na QP 09.PC-02', 0, 200, strogo, 'administracija')
         || interno.e_enum(a, 'ednevnik', 'Stanje eDnevnika', interno.enum_ednevnik(), strogo, 'administracija')
         || interno.e_tekst(a, 'mooks_sazetak', 'Sažetak prepiske sa MOOKS-om', 20, 1500, strogo, 'administracija')
         || interno.e_tekst(a, 'dokumentacija', 'Napomene o dokumentaciji', 1, 1500, false, 'administracija');
  -- 7. Zaključak i plan
  e := e || interno.e_tekst(z, 'postignuca', 'Ključna postignuća u mjesecu', 50, 2000, strogo, 'zakljucak')
         || interno.e_tekst(z, 'plan_sljedeci', 'Plan za sljedeći mjesec', 50, 2000, strogo, 'zakljucak');
  kp_ := interno.ci(a, 'kreativni_planirano'); ko_ := interno.ci(a, 'kreativni_odrzano'); kv_ := interno.ci(a, 'kreativni_posjeceno');
  if ko_ is not null and kv_ is not null and kv_ > ko_ then
    e := e || interno.g('administracija.kreativni_posjeceno', 'NEUSKLADJENO', 'Broj posjećenih kreativnih časova ne može biti veći od broja održanih.');
  end if;
  e := e || interno.e_tekst(a, 'kreativni_napomena', 'Obrazloženje odstupanja kod kreativnih časova', 20, 1000,
              strogo and kp_ is not null and ko_ is not null and kv_ is not null and (kp_ <> ko_ or kv_ < ko_), 'administracija');
  return e;
end $$;

-- Normalizacija: samo poznata polja, tekstovi bez razmaka na rubovima
create or replace function interno.trim_json(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case jsonb_typeof(j)
    when 'string' then to_jsonb(btrim(j #>> '{}'))
    when 'object' then (select coalesce(jsonb_object_agg(key, interno.trim_json(value)), '{}'::jsonb) from jsonb_each(j))
    when 'array'  then (select coalesce(jsonb_agg(interno.trim_json(x) order by ord), '[]'::jsonb) from jsonb_array_elements(j) with ordinality t(x, ord))
    else j end $$;

create or replace function interno.uzmi(o jsonb, kljucevi text[]) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(o) where key = any (kljucevi) $$;

create or replace function interno.ocisti_sadrzaj(s jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(interno.trim_json(jsonb_build_object(
    'ucenici', interno.uzmi(interno.obj(s, 'ucenici'),
        array['individualni_razgovori','razliciti_ucenici','grupni_rad','daroviti_ucenici','teme','sazetak']),
    'nastavnici', interno.uzmi(interno.obj(s, 'nastavnici'),
        array['posjete_planirano','posjete_realizirano','razredi','nalazi','obrazlozenje_prekoracenja','konsultacije','mentorstvo_sati','sastanci_vijeca','koordinacija']),
    'roditelji', interno.uzmi(interno.obj(s, 'roditelji'),
        array['individualni_razgovori','roditeljski_sastanci','pisana_komunikacija','biljeske']),
    'radionice', jsonb_build_object(
        'stavke', coalesce((select jsonb_agg(interno.uzmi(x, array['ciljna_grupa','naslov','datum','trajanje_min','ucesnika','status','ishod','qp05_zapis']) order by ord)
                              from jsonb_array_elements(coalesce(interno.obj(s, 'radionice') -> 'stavke', '[]'::jsonb)) with ordinality t(x, ord)), '[]'::jsonb),
        'nema_obrazlozenje', interno.obj(s, 'radionice') -> 'nema_obrazlozenje'),
    'usavrsavanje', jsonb_build_object(
        'stavke', coalesce((select jsonb_agg(interno.uzmi(x, array['naslov','vrsta','sati','datum']) order by ord)
                              from jsonb_array_elements(coalesce(interno.obj(s, 'usavrsavanje') -> 'stavke', '[]'::jsonb)) with ordinality t(x, ord)), '[]'::jsonb)),
    'administracija', interno.uzmi(interno.obj(s, 'administracija'), array['kreativni_planirano','kreativni_odrzano','kreativni_posjeceno','kreativni_napomena','ednevnik','mooks_sazetak','dokumentacija']),
    'zakljucak', interno.uzmi(interno.obj(s, 'zakljucak'), array['postignuca','plan_sljedeci'])
  ))) $$;

-- ---------- Validacija rizika i preporuka (strukturna; provjere nad bazom su u RPC-ju) ----------
create or replace function interno.provjeri_rizike(r jsonb, strogo boolean)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare e jsonb := '[]'::jsonb; x jsonb; ord bigint; put text; ids text[] := '{}'; idv text;
begin
  if jsonb_typeof(r) is distinct from 'array' then
    return interno.g('rizici', 'TIP', 'Rizici moraju biti lista.');
  end if;
  if jsonb_array_length(r) > 100 then return interno.g('rizici', 'PREVISE', 'Najviše 100 rizika po izvještaju.'); end if;
  for x, ord in select t.x, t.ord from jsonb_array_elements(r) with ordinality t(x, ord) loop
    put := 'rizici.' || (ord - 1);
    if jsonb_typeof(x) <> 'object' then e := e || interno.g(put, 'TIP', 'Rizik mora biti objekat.'); continue; end if;
    if x ? 'id' and jsonb_typeof(x -> 'id') not in ('null') then
      idv := x #>> '{id}';
      if jsonb_typeof(x -> 'id') <> 'string' or not interno.je_uuid(idv) then
        e := e || interno.g(put || '.id', 'TIP', 'Identifikator rizika nije ispravan.');
      elsif idv = any (ids) then
        e := e || interno.g(put || '.id', 'DUPLIKAT', 'Isti rizik je naveden više puta.');
      else ids := ids || idv; end if;
    end if;
    e := e || interno.e_enum(x, 'kategorija', 'Kategorija rizika', interno.enum_kategorija(), true, put)
           || interno.e_enum(x, 'ozbiljnost', 'Ozbiljnost rizika', interno.enum_ozbiljnost(), true, put)
           || interno.e_enum(x, 'status', 'Status rizika', interno.enum_status_rizika(), true, put)
           || interno.e_tekst(x, 'opis', 'Opis rizika', 10, 500, true, put)
           || interno.e_tekst(x, 'mjera', 'Korektivna mjera', 10, 500, strogo, put)
           || interno.e_datum(x, 'rok', 'Rok mjere', strogo, put, null, null);
  end loop;
  return e;
end $$;

create or replace function interno.provjeri_preporuke(p jsonb, strogo boolean)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare e jsonb := '[]'::jsonb; x jsonb; ord bigint; put text; ids text[] := '{}'; idv text;
begin
  if jsonb_typeof(p) is distinct from 'array' then
    return interno.g('preporuke', 'TIP', 'Preporuke moraju biti lista.');
  end if;
  if jsonb_array_length(p) > 50 then return interno.g('preporuke', 'PREVISE', 'Najviše 50 preporuka po izvještaju.'); end if;
  for x, ord in select t.x, t.ord from jsonb_array_elements(p) with ordinality t(x, ord) loop
    put := 'preporuke.' || (ord - 1);
    if jsonb_typeof(x) <> 'object' then e := e || interno.g(put, 'TIP', 'Preporuka mora biti objekat.'); continue; end if;
    if x ? 'id' and jsonb_typeof(x -> 'id') not in ('null') then
      idv := x #>> '{id}';
      if jsonb_typeof(x -> 'id') <> 'string' or not interno.je_uuid(idv) then
        e := e || interno.g(put || '.id', 'TIP', 'Identifikator preporuke nije ispravan.');
      elsif idv = any (ids) then
        e := e || interno.g(put || '.id', 'DUPLIKAT', 'Ista preporuka je navedena više puta.');
      else ids := ids || idv; end if;
    end if;
    e := e || interno.e_tekst(x, 'naslov', 'Naslov preporuke', 5, 150, true, put)
           || interno.e_tekst(x, 'obrazlozenje', 'Obrazloženje preporuke', 20, 1000, strogo, put)
           || interno.e_enum(x, 'utjecaj', 'Utjecaj na resurse', interno.enum_utjecaj(), true, put);
  end loop;
  return e;
end $$;

-- ---------- KPI pokazatelji (čista funkcija nad sadržajem i listom rizika perioda) ----------
-- rizici: [{id,kod,kategorija,opis,ozbiljnost,mjera,rok,status,prenesen}]
-- prenesen = rizik je na POČETKU perioda bio otvoren (stvoren u ranijem periodu, bez statusa Riješeno)
create or replace function interno.kpi(s jsonb, r jsonb, p_godina int, p_mjesec int) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  n jsonb := interno.obj(s, 'nastavnici'); u jsonb := interno.obj(s, 'ucenici');
  pl int := interno.ci(n, 'posjete_planirano'); re int := interno.ci(n, 'posjete_realizirano');
  kraj date := interno.kraj_mjeseca(p_godina, p_mjesec);
  a int; b int; c int; kasne int; novi int; k1 jsonb; po jsonb;
begin
  select count(*) filter (where x ->> 'status' = 'Riješeno'),
         count(*) filter (where coalesce((x ->> 'prenesen')::boolean, false)),
         count(*) filter (where x ->> 'status' <> 'Riješeno'),
         count(*) filter (where x ->> 'status' <> 'Riješeno' and interno.je_datum(x ->> 'rok') and (x ->> 'rok')::date < kraj),
         count(*) filter (where not coalesce((x ->> 'prenesen')::boolean, false))
    into a, b, c, kasne, novi
    from jsonb_array_elements(coalesce(r, '[]'::jsonb)) x;
  select jsonb_build_object(
      'Kritičan', count(*) filter (where x ->> 'status' <> 'Riješeno' and x ->> 'ozbiljnost' = 'Kritičan'),
      'Visok',    count(*) filter (where x ->> 'status' <> 'Riješeno' and x ->> 'ozbiljnost' = 'Visok'),
      'Srednji',  count(*) filter (where x ->> 'status' <> 'Riješeno' and x ->> 'ozbiljnost' = 'Srednji'),
      'Nizak',    count(*) filter (where x ->> 'status' <> 'Riješeno' and x ->> 'ozbiljnost' = 'Nizak'))
    into po from jsonb_array_elements(coalesce(r, '[]'::jsonb)) x;
  k1 := jsonb_build_object(
      'planirano', pl, 'realizirano', re,
      'stopa', case when pl is null or re is null or pl = 0 then null else round(100.0 * re / pl, 1) end,
      'nije_planirano', coalesce(pl = 0, false),
      'premaseno', case when pl is not null and re is not null and re > pl then re - pl else 0 end);
  return jsonb_build_object(
    'kpi01', k1,
    'kpi02', jsonb_build_object('sesije', interno.ci(u, 'individualni_razgovori')),
    'kpi03', jsonb_build_object('rijeseno_3a', a, 'preneseno_3b', b, 'aktivno_3c', c,
                                'po_ozbiljnosti', po, 'kasne_mjere', kasne, 'novi', novi));
end $$;

-- ---------- IDSS bodovi ----------
-- Cjelobrojno zaokruživanje a*b/c (isto u JavaScript-u): floor((2ab + c) / 2c)
create or replace function interno.rnd(a int, b int, c int) returns int
language sql immutable set search_path = '' as $$ select ((2 * a * b + c) / (2 * c))::int $$;

create or replace function interno.stavka(p_kod text, p_grupa text, p_naziv text, p_bodovi int, p_max int, p_napomena text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('kod', p_kod, 'grupa', p_grupa, 'naziv', p_naziv, 'bodovi', p_bodovi, 'max', p_max, 'napomena', p_napomena) $$;

create or replace function interno.nar_bodovi(t text, p_vrh int, p_srednje int, p_vrh_b int, p_srednje_b int) returns int
language sql immutable set search_path = '' as $$
  select case when interno.dolje(btrim(t)) >= p_vrh then p_vrh_b when interno.dolje(btrim(t)) >= p_srednje then p_srednje_b else 0 end $$;

-- p_kasnjenje: radnih dana kašnjenja PRVOG podnošenja; p_ciklus: redni broj ovog podnošenja (1 = prvo);
-- p_kasnjenje_dopune: radnih dana kašnjenja dopune nakon vraćanja (null ako nije dopuna)
create or replace function interno.bodovi(s jsonb, r jsonb, k jsonb, p_godina int, p_mjesec int, p_kasnjenje int, p_ciklus int, p_kasnjenje_dopune int)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  st jsonb := '[]'::jsonb;
  u jsonb := interno.obj(s, 'ucenici'); n jsonb := interno.obj(s, 'nastavnici'); ro jsonb := interno.obj(s, 'roditelji');
  rad jsonb := interno.obj(s, 'radionice'); usv jsonb := interno.obj(s, 'usavrsavanje');
  a jsonb := interno.obj(s, 'administracija'); z jsonb := interno.obj(s, 'zakljucak');
  greske jsonb := interno.provjeri_sadrzaj(s, true, p_godina, p_mjesec);
  kas int := greatest(coalesce(p_kasnjenje, 0), 0);
  kd int := greatest(coalesce(p_kasnjenje_dopune, 0), 0);
  b1 int; b2 int; s1 int := 0; s2 int; s3 int; s4 int;
  t1 int; t2 int; t3 int; t4 int; t5 int; t6 int; q5 int; kp_ int; ko_ int; kv_ int; e1 int; e2 int; e3 int; e4 int;
  pl int; re int; odr int; gr int; ukupno_rad int; sati int; q int; ed int; base int;
  k3 jsonb := k -> 'kpi03'; ra int; rb int; rc int; rk int; rn int; kompletno int; ukupno_r int;
  sek text; w int;
  sekcije text[] := array['ucenici','nastavnici','roditelji','radionice','administracija','zakljucak'];
  tezine int[] := array[20, 20, 15, 15, 15, 15];
  i int;
begin
  -- Blagovremenost (250)
  b1 := greatest(0, 200 - 50 * least(kas, 4));
  b2 := case when p_ciklus <= 1 then 50 else greatest(0, 50 - 25 * least(kd, 2)) end;
  st := st || interno.stavka('B1', 'blagovremenost', 'Podnošenje izvještaja u roku', b1, 200,
          case when kas = 0 then 'Podneseno u roku.' else 'Kašnjenje: ' || kas || ' radnih dana.' end)
          || interno.stavka('B2', 'blagovremenost', 'Dopuna u roku nakon vraćanja', b2, 50,
          case when p_ciklus <= 1 then 'Izvještaj nije vraćen na dopunu.' when kd = 0 then 'Dopuna u roku.' else 'Kašnjenje dopune: ' || kd || ' radnih dana.' end);

  -- Sadržaj (250)
  -- S1: cjelovitost odjeljaka (100)
  for i in 1 .. array_length(sekcije, 1) loop
    sek := sekcije[i];
    if not exists (select 1 from jsonb_array_elements(greske) g
                    where (g ->> 'polje') like sek || '.%' or (g ->> 'polje') = sek) then
      s1 := s1 + tezine[i];
    end if;
  end loop;
  st := st || interno.stavka('S1', 'sadrzaj', 'Cjelovitost odjeljaka', s1, 100, 'Odjeljak je cjelovit kada nema nedostataka pri provjeri.');
  s2 := interno.nar_bodovi(u ->> 'sazetak', 150, 80, 15, 8)
      + interno.nar_bodovi(n ->> 'koordinacija', 150, 80, 15, 8)
      + interno.nar_bodovi(ro ->> 'biljeske', 150, 80, 15, 8)
      + interno.nar_bodovi(a ->> 'mooks_sazetak', 150, 80, 15, 8)
      + interno.nar_bodovi(z ->> 'postignuca', 150, 80, 15, 8);
  st := st || interno.stavka('S2', 'sadrzaj', 'Konkretnost opisa', s2, 75, 'Opisi od 80 znakova donose dio, a od 150 znakova pun broj bodova.');
  s3 := case when interno.dolje(btrim(z ->> 'plan_sljedeci')) >= 200 then 50
             when interno.dolje(btrim(z ->> 'plan_sljedeci')) >= 120 then 35
             when interno.dolje(btrim(z ->> 'plan_sljedeci')) >= 50 then 20 else 0 end;
  st := st || interno.stavka('S3', 'sadrzaj', 'Konkretnost plana za sljedeći mjesec', s3, 50, 'Plan od 50, 120 i 200 znakova: 20, 35 i 50 bodova.');
  select count(*), count(*) filter (where coalesce(x ->> 'mjera', '') <> '' and interno.je_datum(x ->> 'rok'))
    into ukupno_r, kompletno from jsonb_array_elements(coalesce(r, '[]'::jsonb)) x;
  s4 := case when ukupno_r = 0 then 25 else interno.rnd(25, kompletno, ukupno_r) end;
  st := st || interno.stavka('S4', 'sadrzaj', 'Korektivne mjere uz rizike', s4, 25,
          case when ukupno_r = 0 then 'Nema evidentiranih rizika.' else kompletno || ' od ' || ukupno_r || ' rizika ima mjeru i rok.' end);

  -- Stručnost (200)
  pl := interno.ci(n, 'posjete_planirano'); re := interno.ci(n, 'posjete_realizirano');
  t1 := case when coalesce(pl, 0) = 0 then 30 else interno.rnd(60, least(coalesce(re, 0), pl), pl) end;
  st := st || interno.stavka('T1', 'strucnost', 'Posjete časovima', t1, 60,
          case when coalesce(pl, 0) = 0 then 'Posjete nisu planirane: polovina bodova.' else 'Realizirano ' || coalesce(re, 0) || ' od ' || pl || ' planiranih posjeta (računa se najviše do punog plana).' end);
  select count(*) filter (where x ->> 'status' = 'održano'),
         count(distinct x ->> 'ciljna_grupa') filter (where x ->> 'status' = 'održano' and jsonb_typeof(x -> 'ciljna_grupa') = 'string'),
         count(*)
    into odr, gr, ukupno_rad
    from jsonb_array_elements(case when jsonb_typeof(rad -> 'stavke') = 'array' then rad -> 'stavke' else '[]'::jsonb end) x;
  t2 := least(40, 20 * odr) + case when gr >= 2 then 10 else 0 end;
  st := st || interno.stavka('T2', 'strucnost', 'Održane radionice', t2, 50,
          'Održano radionica: ' || odr || '; ciljnih grupa: ' || gr || ' (po 20 bodova za prve dvije radionice, +10 za dvije ili više ciljnih grupa).');
  select coalesce(sum((x ->> 'sati')::int) filter (where interno.ci(x, 'sati') is not null), 0)::int
    into sati from jsonb_array_elements(case when jsonb_typeof(usv -> 'stavke') = 'array' then usv -> 'stavke' else '[]'::jsonb end) x;
  t3 := least(40, 10 * sati);
  st := st || interno.stavka('T3', 'strucnost', 'Stručno usavršavanje', t3, 40, 'Sati usavršavanja: ' || sati || ' (10 bodova po satu, najviše 40).');
  -- T4: QP 05 (zavedene održane radionice/obuke u zapis QP 05)
  select count(*) filter (where x ->> 'qp05_zapis' = 'Da') into q5
    from jsonb_array_elements(case when jsonb_typeof(rad -> 'stavke') = 'array' then rad -> 'stavke' else '[]'::jsonb end) x
   where x ->> 'status' = 'održano';
  t4 := case when odr = 0 then 10 else interno.rnd(20, least(q5, odr), odr) end;
  st := st || interno.stavka('T4', 'strucnost', 'QP 05: radionice i obuke zavedene u zapis', t4, 20,
          case when odr = 0 then 'Nema održanih radionica ni obuka: polovina bodova.' else 'U zapis QP 05 zavedeno ' || least(q5, odr) || ' od ' || odr || ' održanih radionica i obuka.' end);
  -- T5: QP 09 (kreativni časovi: posjete evidentirane na QP 09.PC-02)
  kp_ := interno.ci(a, 'kreativni_planirano'); ko_ := coalesce(interno.ci(a, 'kreativni_odrzano'), 0); kv_ := coalesce(interno.ci(a, 'kreativni_posjeceno'), 0);
  t5 := case when ko_ = 0 then (case when coalesce(kp_, 0) > 0 then 0 else 10 end) else interno.rnd(20, least(kv_, ko_), ko_) end;
  st := st || interno.stavka('T5', 'strucnost', 'QP 09: posjete kreativnim časovima evidentirane', t5, 20,
          case when ko_ = 0 and coalesce(kp_, 0) > 0 then 'Planirani kreativni časovi nisu održani.'
               when ko_ = 0 then 'Nema planiranih ni održanih kreativnih časova: polovina bodova.'
               else 'Evidentirano ' || least(kv_, ko_) || ' posjeta od ' || ko_ || ' održanih kreativnih časova.' end);
  -- T6: eDnevnik
  ed := case a ->> 'ednevnik' when 'Uredno' then 10 when 'U toku' then 6 when 'Zahtijeva intervenciju' then 4 else 0 end;
  t6 := ed;
  st := st || interno.stavka('T6', 'strucnost', 'Stanje eDnevnika', t6, 10, 'Uredno 10, u toku 6, zahtijeva intervenciju 4 boda.');

  -- Efikasnost (200)
  ra := coalesce((k3 ->> 'rijeseno_3a')::int, 0); rb := coalesce((k3 ->> 'preneseno_3b')::int, 0);
  rc := coalesce((k3 ->> 'aktivno_3c')::int, 0); rk := coalesce((k3 ->> 'kasne_mjere')::int, 0); rn := coalesce((k3 ->> 'novi')::int, 0);
  base := rb + rn;
  e1 := case when base = 0 then 60 else interno.rnd(60, least(ra, base), base) end;
  st := st || interno.stavka('E1', 'efikasnost', 'Rješavanje rizika', e1, 60,
          case when base = 0 then 'Nema rizika za rješavanje.' else 'Riješeno ' || ra || ' od ' || base || ' rizika u razmatranju.' end);
  e2 := case when rc = 0 then 60 else interno.rnd(60, greatest(rc - rk, 0), rc) end;
  st := st || interno.stavka('E2', 'efikasnost', 'Mjere u roku', e2, 60,
          case when rc = 0 then 'Nema aktivnih rizika.' else rk || ' od ' || rc || ' aktivnih rizika ima probijen rok mjere.' end);
  e3 := case when p_ciklus <= 1 then 40 when p_ciklus = 2 then 20 else 0 end;
  st := st || interno.stavka('E3', 'efikasnost', 'Prihvaćeno bez vraćanja', e3, 40, 'Podnošenje br. ' || p_ciklus || '.');
  e4 := case when ukupno_rad = 0 then 20 else interno.rnd(40, odr, ukupno_rad) end;
  st := st || interno.stavka('E4', 'efikasnost', 'Realizacija radionica', e4, 40,
          case when ukupno_rad = 0 then 'Nema evidentiranih radionica: polovina bodova.' else odr || ' od ' || ukupno_rad || ' evidentiranih radionica je održano.' end);

  return jsonb_build_object(
    'stavke', st,
    'zbroj', b1 + b2 + s1 + s2 + s3 + s4 + t1 + t2 + t3 + t4 + t5 + t6 + e1 + e2 + e3 + e4,
    'max', 900,
    'po_grupama', jsonb_build_object(
      'blagovremenost', jsonb_build_object('bodovi', b1 + b2, 'max', 250),
      'sadrzaj', jsonb_build_object('bodovi', s1 + s2 + s3 + s4, 'max', 250),
      'strucnost', jsonb_build_object('bodovi', t1 + t2 + t3 + t4 + t5 + t6, 'max', 200),
      'efikasnost', jsonb_build_object('bodovi', e1 + e2 + e3 + e4, 'max', 200)));
end $$;

-- Rang prema prosjeku konačnih bodova izvještaja u školskoj godini (0–1000)
create or replace function interno.rang(p_prosjek int) returns text
language sql immutable set search_path = '' as $$
  select case when p_prosjek >= 900 then 'Velemajstor'
              when p_prosjek >= 800 then 'Majstor'
              when p_prosjek >= 650 then 'Stručnjak'
              when p_prosjek >= 500 then 'Saradnik'
              else 'Pripravnik' end $$;
-- =====================================================================
-- IDSS Pedagog — Mjesečni izvještaj :: 003_rpc.sql
-- Javne RPC funkcije (jedini put do podataka). Svaka funkcija:
--   * je SECURITY DEFINER sa praznim search_path-om,
--   * identitet i ulogu čita iz auth.uid() + tabele profili (nikad iz klijenta),
--   * vraća jsonb {ok:true,...} ili {ok:false,kod,poruka,...} (HTTP 200; ishod je u tijelu).
-- =====================================================================

-- ---------- Pomoćnici ----------
create or replace function interno.greska(p_kod text, p_poruka text, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', false, 'kod', p_kod, 'poruka', p_poruka) || coalesce(p_extra, '{}'::jsonb) $$;

create or replace function interno.korisnik() returns public.profili
language plpgsql stable security definer set search_path = '' as $$
declare k public.profili;
begin
  select * into k from public.profili where id = auth.uid() and aktivan;
  return k;
end $$;

create or replace function interno.trag(p_k public.profili, p_akcija text, p_izv uuid, p_sazetak jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.revizorski_trag (akter_id, akter_uloga, akcija, izvjestaj_id, sazetak)
  values (p_k.id, p_k.uloga, p_akcija, p_izv, coalesce(p_sazetak, '{}'::jsonb)) $$;

create or replace function interno.preporuke_json(p_izv uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'naslov', p.naslov, 'obrazlozenje', p.obrazlozenje, 'utjecaj', p.utjecaj,
      'odluka', p.odluka, 'komentar_direktora', p.komentar_direktora, 'odlucio_u', p.odlucio_u)
    order by p.redni), '[]'::jsonb)
  from public.preporuke p where p.izvjestaj_id = p_izv $$;

-- Rizici u izvještaju perioda (stanje po periodu + identitet)
create or replace function interno.rizici_perioda(p_pedagog uuid, p_g int, p_m int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'kod', r.kod, 'kategorija', r.kategorija, 'opis', r.opis,
      'ozbiljnost', s.ozbiljnost, 'mjera', s.mjera, 'rok', s.rok, 'status', s.status,
      'prenesen', coalesce((select pr.status <> 'Riješeno' from public.rizik_stanja pr
                             where pr.rizik_id = r.id and interno.period_broj(pr.godina, pr.mjesec) < interno.period_broj(p_g, p_m)
                             order by interno.period_broj(pr.godina, pr.mjesec) desc limit 1), false),
      'kreiran_period', r.kreiran_godina * 100 + r.kreiran_mjesec
    ) order by r.kod), '[]'::jsonb)
  from public.rizik_stanja s join public.rizici r on r.id = s.rizik_id
  where r.pedagog_id = p_pedagog and s.godina = p_g and s.mjesec = p_m $$;

-- Otvoreni rizici koji se prenose u period (zadnje stanje prije perioda nije Riješeno)
create or replace function interno.preneseni_rizici(p_pedagog uuid, p_g int, p_m int) returns table (id uuid, kod text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.kod from public.rizici r
   where r.pedagog_id = p_pedagog
     and coalesce((select pr.status from public.rizik_stanja pr
                    where pr.rizik_id = r.id and interno.period_broj(pr.godina, pr.mjesec) < interno.period_broj(p_g, p_m)
                    order by interno.period_broj(pr.godina, pr.mjesec) desc limit 1), 'Riješeno') <> 'Riješeno' $$;

-- Provjere koje zahtijevaju bazu (vlasništvo, preneseni rizici, kasniji periodi, zaključane odluke)
create or replace function interno.provjeri_baza(p_izv public.izvjestaji, p_riz jsonb, p_prep jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e jsonb := '[]'::jsonb; x jsonb; ord bigint; put text; rid uuid; r public.rizici; stari text;
  pb int := interno.period_broj(p_izv.godina, p_izv.mjesec);
  pr record; pid uuid; p public.preporuke; ima_kasnije boolean; prisutni uuid[] := '{}';
begin
  -- rizici koji su u listi
  for x, ord in select t.x, t.ord from jsonb_array_elements(p_riz) with ordinality t(x, ord) loop
    put := 'rizici.' || (ord - 1);
    if (x ->> 'id') is null then continue; end if;
    rid := (x ->> 'id')::uuid;
    select * into r from public.rizici where id = rid;
    if r.id is null or r.pedagog_id <> p_izv.pedagog_id then
      e := e || interno.g(put || '.id', 'NEPOZNAT', 'Rizik ne postoji među Vašim rizicima.'); continue;
    end if;
    if interno.period_broj(r.kreiran_godina, r.kreiran_mjesec) > pb then
      e := e || interno.g(put || '.id', 'NEPOZNAT', 'Rizik je kreiran u kasnijem periodu.'); continue;
    end if;
    prisutni := prisutni || rid;
    if interno.period_broj(r.kreiran_godina, r.kreiran_mjesec) < pb then
      if not exists (select 1 from interno.preneseni_rizici(p_izv.pedagog_id, p_izv.godina, p_izv.mjesec) q where q.id = rid) then
        e := e || interno.g(put || '.id', 'RIZIK_RIJESEN', 'Rizik ' || r.kod || ' je ranije riješen i ne može se ponovo navoditi.');
      end if;
      if r.kategorija <> x ->> 'kategorija' or r.opis <> btrim(x ->> 'opis') then
        e := e || interno.g(put || '.opis', 'NEPROMJENJIVO', 'Kategorija i opis rizika ' || r.kod || ' ne mijenjaju se nakon prvog perioda.');
      end if;
    end if;
    -- kasniji periodi: status se ne smije vratiti niti zatvoriti unazad
    select s.status into stari from public.rizik_stanja s
      where s.rizik_id = rid and s.godina = p_izv.godina and s.mjesec = p_izv.mjesec;
    select exists (select 1 from public.rizik_stanja s where s.rizik_id = rid and interno.period_broj(s.godina, s.mjesec) > pb) into ima_kasnije;
    if ima_kasnije and (x ->> 'status') = 'Riješeno' and coalesce(stari, '') <> 'Riješeno' then
      e := e || interno.g(put || '.status', 'KASNIJI_PERIOD', 'Rizik ' || r.kod || ' već postoji u kasnijem izvještaju; status se ovdje ne može zatvoriti.');
    end if;
  end loop;
  -- preneseni rizici moraju biti u listi
  for pr in select q.id, q.kod from interno.preneseni_rizici(p_izv.pedagog_id, p_izv.godina, p_izv.mjesec) q loop
    if not (pr.id = any (prisutni)) then
      e := e || interno.g('rizici', 'PRENESENI_RIZIK_NEDOSTAJE', 'Preneseni otvoreni rizik ' || pr.kod || ' mora ostati u izvještaju.');
    end if;
  end loop;
  -- postojeća stanja u ovom periodu koja se brišu iz liste
  for pr in select s.rizik_id, r2.kod, r2.kreiran_godina, r2.kreiran_mjesec
              from public.rizik_stanja s join public.rizici r2 on r2.id = s.rizik_id
             where r2.pedagog_id = p_izv.pedagog_id and s.godina = p_izv.godina and s.mjesec = p_izv.mjesec loop
    if not (pr.rizik_id = any (prisutni)) and exists (select 1 from public.rizik_stanja s2 where s2.rizik_id = pr.rizik_id
                                                       and interno.period_broj(s2.godina, s2.mjesec) > pb) then
      e := e || interno.g('rizici', 'KASNIJI_PERIOD', 'Rizik ' || pr.kod || ' postoji u kasnijem izvještaju i ne može se ukloniti.');
    end if;
  end loop;
  -- preporuke: odluke direktora su zaključane
  for x, ord in select t.x, t.ord from jsonb_array_elements(p_prep) with ordinality t(x, ord) loop
    if (x ->> 'id') is null then continue; end if;
    pid := (x ->> 'id')::uuid;
    select * into p from public.preporuke where id = pid and izvjestaj_id = p_izv.id;
    if p.id is null then
      e := e || interno.g('preporuke.' || (ord - 1) || '.id', 'NEPOZNAT', 'Preporuka ne postoji u ovom izvještaju.'); continue;
    end if;
    if p.odluka in ('Odobreno', 'Odbijeno') and (p.naslov <> btrim(x ->> 'naslov') or p.obrazlozenje <> btrim(x ->> 'obrazlozenje') or p.utjecaj <> x ->> 'utjecaj') then
      e := e || interno.g('preporuke.' || (ord - 1), 'ODLUKA_ZAKLJUCANA', 'Preporuka o kojoj je direktor odlučio ne može se mijenjati.');
    end if;
  end loop;
  for p in select * from public.preporuke where izvjestaj_id = p_izv.id and odluka in ('Odobreno', 'Odbijeno') loop
    if not exists (select 1 from jsonb_array_elements(p_prep) y where (y ->> 'id') = p.id::text) then
      e := e || interno.g('preporuke', 'ODLUKA_ZAKLJUCANA', 'Preporuka „' || p.naslov || '“ ima odluku direktora i ne može se ukloniti.');
    end if;
  end loop;
  return e;
end $$;

-- Cjelovita provjera (strukturna + bazna)
create or replace function interno.provjeri_sve(p_izv public.izvjestaji, p_sad jsonb, p_riz jsonb, p_prep jsonb, p_strogo boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e jsonb;
begin
  e := interno.provjeri_sadrzaj(p_sad, p_strogo, p_izv.godina, p_izv.mjesec)
    || interno.provjeri_rizike(p_riz, p_strogo)
    || interno.provjeri_preporuke(p_prep, p_strogo);
  if jsonb_array_length(interno.provjeri_rizike(p_riz, false)) = 0 and jsonb_array_length(interno.provjeri_preporuke(p_prep, false)) = 0 then
    e := e || interno.provjeri_baza(p_izv, p_riz, p_prep);
  end if;
  return e;
end $$;

-- Stanje izvještaja za konkretnog korisnika (vlasnik vidi nacrt; direktor samo podnesene snimke)
create or replace function interno.izvjestaj_stanje(p_id uuid, k public.profili) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  i public.izvjestaji; ped public.profili; vlasnik boolean; sn public.izvjestaj_snimci;
  sad jsonb; riz jsonb; prep jsonb; kp jsonb; prov jsonb := '[]'::jsonb; pregled jsonb;
  danas date := interno.danas(); kas int; kd int; uredjivo boolean; bod jsonb;
begin
  select * into i from public.izvjestaji where id = p_id;
  if i.id is null then return null; end if;
  select * into ped from public.profili where id = i.pedagog_id;
  vlasnik := (i.pedagog_id = k.id);
  if vlasnik then
    sad := i.sadrzaj;
    riz := interno.rizici_perioda(i.pedagog_id, i.godina, i.mjesec);
    prep := interno.preporuke_json(i.id);
  elsif k.uloga = 'direktor' and i.status <> 'nacrt' then
    select * into sn from public.izvjestaj_snimci where izvjestaj_id = i.id order by ciklus desc limit 1;
    if sn.id is null then return null; end if;
    sad := sn.sadrzaj; riz := sn.rizici;
    select coalesce(jsonb_agg(x || jsonb_build_object(
             'odluka', coalesce(p.odluka, x ->> 'odluka'),
             'komentar_direktora', coalesce(p.komentar_direktora, x ->> 'komentar_direktora'),
             'odlucio_u', coalesce(p.odlucio_u::text, x ->> 'odlucio_u')) order by ord), '[]'::jsonb)
      into prep
      from jsonb_array_elements(sn.preporuke) with ordinality t(x, ord)
      left join public.preporuke p on p.id = (x ->> 'id')::uuid and p.izvjestaj_id = i.id;
  else
    return null;
  end if;
  kp := interno.kpi(sad, riz, i.godina, i.mjesec);
  uredjivo := vlasnik and i.status in ('nacrt', 'vracen');
  kas := case when i.ciklus = 0 then interno.radnih_dana_izmedju(i.rok_podnosenja, danas) else coalesce(i.prvo_kasnjenje, 0) end;
  kd  := case when i.status = 'vracen' then interno.radnih_dana_izmedju(i.rok_dopune, danas) else null end;
  if uredjivo then
    prov := interno.provjeri_sve(i, sad, riz, prep, true);
    pregled := interno.bodovi(sad, riz, kp, i.godina, i.mjesec, kas, i.ciklus + 1, kd);
  end if;
  return jsonb_build_object(
    'id', i.id, 'godina', i.godina, 'mjesec', i.mjesec, 'status', i.status, 'revizija', i.revizija, 'ciklus', i.ciklus,
    'rok_podnosenja', i.rok_podnosenja, 'rok_dopune', i.rok_dopune,
    'podnesen_u', i.podnesen_u, 'vracen_u', i.vracen_u, 'odobren_u', i.odobren_u,
    'direktor_napomena', i.direktor_napomena, 'direktor_ocjena', i.direktor_ocjena,
    'na_vrijeme', i.na_vrijeme,
    'pedagog', jsonb_build_object('ime', ped.ime, 'telefon', ped.telefon, 'email', (select u.email from auth.users u where u.id = ped.id)),
    'moje', vlasnik, 'moze_urediti', uredjivo,
    'moze_podnijeti', uredjivo and jsonb_array_length(prov) = 0,
    'moze_odluciti', (not vlasnik) and k.uloga = 'direktor' and i.status = 'podnesen',
    'kasnjenje_prvo', kas, 'kasnjenje_dopune_sada', kd, 'ciklus_sljedeci', i.ciklus + 1,
    'sadrzaj', sad, 'rizici', riz, 'preporuke', prep, 'kpi', kp,
    'provjera', prov, 'bodovi_pregled', pregled, 'bodovi', i.bodovi,
    'danas', danas);
end $$;

-- ---------- Javne RPC funkcije ----------

create or replace function public.idss_profil() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.profili := interno.korisnik();
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;
  return jsonb_build_object('ok', true, 'ime', k.ime, 'uloga', k.uloga, 'telefon', k.telefon,
    'email', (select u.email from auth.users u where u.id = k.id), 'danas', interno.danas());
exception when others then
  raise warning 'idss_profil: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

-- Pregled (početna): pedagog vidi svoje periode i bodove; direktor vidi preglede svih pedagoga
create or replace function public.idss_pocetna() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.profili := interno.korisnik(); danas date := interno.danas();
  tg int := extract(year from interno.danas())::int; tm int := extract(month from interno.danas())::int;
  start_pb int; i int; g int; m int; periodi jsonb := '[]'::jsonb; iz public.izvjestaji; rok date; kasni boolean;
  sg int; prosjek int; n_odobreno int; zbroj_potv int; u_obradi int; serija int := 0; prekinuta boolean := false;
  znacke jsonb; sk record; stopa numeric; ima3a boolean := false; ima100 boolean := false; krug boolean := false; bez_vracanja boolean := false;
  rang text; sljedeci jsonb;
  cekaju jsonb; kasne jsonb := '[]'::jsonb; rizici jsonb; prep jsonb; zadnji jsonb; po jsonb;
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;

  if k.uloga = 'pedagog' then
    start_pb := greatest(interno.period_broj(extract(year from k.prvi_period)::int, extract(month from k.prvi_period)::int),
                         interno.period_broj(tg, tm) - 11);
    for i in start_pb .. interno.period_broj(tg, tm) loop
      g := (i - 1) / 12; m := i - g * 12;
      select * into iz from public.izvjestaji where pedagog_id = k.id and godina = g and mjesec = m;
      rok := interno.rok_podnosenja(g, m);
      kasni := case when iz.id is null or iz.status = 'nacrt' then danas > rok
                    when iz.status = 'vracen' then danas > iz.rok_dopune else false end;
      periodi := jsonb_build_array(jsonb_build_object(
          'godina', g, 'mjesec', m, 'id', iz.id, 'status', coalesce(iz.status, 'nema'), 'rok', rok, 'rok_dopune', iz.rok_dopune,
          'kasni', kasni, 'na_vrijeme', iz.na_vrijeme,
          'bodovi_ukupno', case when iz.bodovi is not null then (iz.bodovi ->> 'ukupno')::int end,
          'konacno', coalesce((iz.bodovi ->> 'konacno')::boolean, false))) || periodi;
    end loop;
    -- serija uzastopnih perioda (unazad) sa prvim podnošenjem u roku
    for i in reverse interno.period_broj(tg, tm) .. greatest(start_pb, interno.period_broj(tg, tm) - 11) loop
      exit when prekinuta;
      g := (i - 1) / 12; m := i - g * 12;
      select * into iz from public.izvjestaji where pedagog_id = k.id and godina = g and mjesec = m;
      if iz.id is not null and iz.ciklus > 0 and coalesce(iz.na_vrijeme, false) then serija := serija + 1;
      elsif i = interno.period_broj(tg, tm) then null;  -- tekući mjesec još nije dospio
      else prekinuta := true; end if;
    end loop;
    sg := interno.skolska_godina(tg, tm);
    select coalesce(round(avg((bodovi ->> 'ukupno')::int))::int, 0), count(*)::int, coalesce(sum((bodovi ->> 'ukupno')::int), 0)::int
      into prosjek, n_odobreno, zbroj_potv
      from public.izvjestaji where pedagog_id = k.id and status = 'odobren' and interno.skolska_godina(godina, mjesec) = sg;
    select coalesce(sum((bodovi ->> 'ukupno')::int), 0)::int into u_obradi
      from public.izvjestaji where pedagog_id = k.id and status = 'podnesen' and interno.skolska_godina(godina, mjesec) = sg;
    for sk in select s.sadrzaj, s.kpi, iz2.ciklus, iz2.status
                from public.izvjestaji iz2
                join lateral (select * from public.izvjestaj_snimci x where x.izvjestaj_id = iz2.id order by x.ciklus desc limit 1) s on true
               where iz2.pedagog_id = k.id and iz2.status in ('podnesen', 'odobren') and interno.skolska_godina(iz2.godina, iz2.mjesec) = sg loop
      stopa := (sk.kpi -> 'kpi01' ->> 'stopa')::numeric;
      if stopa is not null and stopa >= 100 then ima100 := true; end if;
      if coalesce((sk.kpi -> 'kpi03' ->> 'rijeseno_3a')::int, 0) >= 1 then ima3a := true; end if;
      if (select count(distinct x ->> 'ciljna_grupa') from jsonb_array_elements(coalesce(sk.sadrzaj -> 'radionice' -> 'stavke', '[]'::jsonb)) x
           where x ->> 'status' = 'održano') = 3 then krug := true; end if;
    end loop;
    select exists (select 1 from public.izvjestaji where pedagog_id = k.id and status = 'odobren' and ciklus = 1
                    and interno.skolska_godina(godina, mjesec) = sg) into bez_vracanja;
    znacke := jsonb_build_array(
      jsonb_build_object('kod', 'SERIJA_3', 'naziv', 'Serija od tri', 'opis', 'Tri uzastopna izvještaja podnesena u roku.', 'stecena', serija >= 3),
      jsonb_build_object('kod', 'BEZ_VRACANJA', 'naziv', 'Prvi put dobro', 'opis', 'Izvještaj odobren bez vraćanja na dopunu.', 'stecena', bez_vracanja),
      jsonb_build_object('kod', 'PUNE_POSJETE', 'naziv', 'Puni plan posjeta', 'opis', 'Realizirane sve planirane posjete časovima u mjesecu.', 'stecena', ima100),
      jsonb_build_object('kod', 'RIZICI_ZATVORENI', 'naziv', 'Zatvoren rizik', 'opis', 'Barem jedan rizik riješen u mjesečnom izvještaju.', 'stecena', ima3a),
      jsonb_build_object('kod', 'KRUG_RADIONICA', 'naziv', 'Tri kruga radionica', 'opis', 'U jednom mjesecu održane radionice za učenike, nastavnike i roditelje.', 'stecena', krug));
    rang := interno.rang(prosjek);
    sljedeci := case when n_odobreno = 0 then null
      else (select jsonb_build_object('naziv', t.naziv, 'prag', t.prag) from (values (500, 'Saradnik'), (650, 'Stručnjak'), (800, 'Majstor'), (900, 'Velemajstor')) t(prag, naziv)
             where t.prag > prosjek order by t.prag limit 1) end;
    return jsonb_build_object('ok', true, 'uloga', 'pedagog', 'ime', k.ime, 'danas', danas,
      'tekuci_period', jsonb_build_object('godina', tg, 'mjesec', tm), 'periodi', periodi,
      'sezona', jsonb_build_object('skolska_godina', sg, 'prosjek', case when n_odobreno > 0 then prosjek end, 'broj_odobrenih', n_odobreno,
                                    'zbroj_potvrdjenih', zbroj_potv, 'u_obradi', u_obradi, 'rang', case when n_odobreno > 0 then rang end, 'sljedeci_rang', sljedeci),
      'serija', serija, 'znacke', znacke);
  end if;

  -- DIREKTOR
  select coalesce(jsonb_agg(jsonb_build_object('id', i2.id, 'pedagog', p.ime, 'godina', i2.godina, 'mjesec', i2.mjesec, 'podnesen_u', i2.podnesen_u,
            'ciklus', i2.ciklus, 'rok', i2.rok_podnosenja, 'bodovi_zbroj', (i2.bodovi ->> 'zbroj')::int) order by i2.podnesen_u), '[]'::jsonb)
    into cekaju from public.izvjestaji i2 join public.profili p on p.id = i2.pedagog_id where i2.status = 'podnesen';
  for sk in select p.id as pid, p.ime, p.prvi_period from public.profili p where p.uloga = 'pedagog' and p.aktivan loop
    start_pb := greatest(interno.period_broj(extract(year from sk.prvi_period)::int, extract(month from sk.prvi_period)::int),
                         interno.period_broj(tg, tm) - 11);
    for i in start_pb .. interno.period_broj(tg, tm) loop
      g := (i - 1) / 12; m := i - g * 12;
      select * into iz from public.izvjestaji where pedagog_id = sk.pid and godina = g and mjesec = m;
      rok := interno.rok_podnosenja(g, m);
      if (iz.id is null or iz.status = 'nacrt') and danas > rok then
        -- Direktor vidi samo činjenicu da izvještaj nije podnesen, nikad sadržaj nacrta.
        kasne := kasne || jsonb_build_object('pedagog', sk.ime, 'godina', g, 'mjesec', m, 'status', case when iz.id is null then 'nema' else 'nacrt' end,
                   'rok', rok, 'kasni_radnih_dana', interno.radnih_dana_izmedju(rok, danas));
      elsif iz.status = 'vracen' and danas > iz.rok_dopune then
        kasne := kasne || jsonb_build_object('pedagog', sk.ime, 'godina', g, 'mjesec', m, 'status', 'vracen',
                   'rok', iz.rok_dopune, 'kasni_radnih_dana', interno.radnih_dana_izmedju(iz.rok_dopune, danas));
      end if;
    end loop;
  end loop;
  -- aktivni rizici: zadnje podneseno stanje svakog rizika (iz snimaka)
  with zadnji_snimci as (
    select distinct on (s.izvjestaj_id) s.izvjestaj_id, s.rizici, i3.godina, i3.mjesec, i3.pedagog_id
      from public.izvjestaj_snimci s join public.izvjestaji i3 on i3.id = s.izvjestaj_id
     order by s.izvjestaj_id, s.ciklus desc),
  stavke as (
    select distinct on (x ->> 'id') x ->> 'id' as rid, x as r, z.pedagog_id
      from zadnji_snimci z, jsonb_array_elements(z.rizici) x
     order by x ->> 'id', z.godina desc, z.mjesec desc)
  select coalesce(jsonb_agg(jsonb_build_object('kod', r ->> 'kod', 'opis', r ->> 'opis', 'kategorija', r ->> 'kategorija',
            'ozbiljnost', r ->> 'ozbiljnost', 'status', r ->> 'status', 'rok', r ->> 'rok', 'pedagog', p.ime)
          order by case r ->> 'ozbiljnost' when 'Kritičan' then 1 when 'Visok' then 2 when 'Srednji' then 3 else 4 end, r ->> 'kod'), '[]'::jsonb),
         jsonb_build_object('Kritičan', count(*) filter (where r ->> 'ozbiljnost' = 'Kritičan'), 'Visok', count(*) filter (where r ->> 'ozbiljnost' = 'Visok'),
                            'Srednji', count(*) filter (where r ->> 'ozbiljnost' = 'Srednji'), 'Nizak', count(*) filter (where r ->> 'ozbiljnost' = 'Nizak'))
    into rizici, po
    from stavke s2 join public.profili p on p.id = s2.pedagog_id where r ->> 'status' <> 'Riješeno';
  select coalesce(jsonb_agg(jsonb_build_object('preporuka_id', pr.id, 'izvjestaj_id', pr.izvjestaj_id, 'naslov', pr.naslov, 'utjecaj', pr.utjecaj,
            'godina', i4.godina, 'mjesec', i4.mjesec, 'pedagog', p.ime) order by i4.godina, i4.mjesec), '[]'::jsonb)
    into prep from public.preporuke pr join public.izvjestaji i4 on i4.id = pr.izvjestaj_id join public.profili p on p.id = i4.pedagog_id
   where i4.status = 'podnesen' and pr.odluka = 'Na čekanju';
  select coalesce(jsonb_agg(jsonb_build_object('id', i5.id, 'pedagog', p.ime, 'godina', i5.godina, 'mjesec', i5.mjesec, 'status', i5.status,
            'podnesen_u', i5.podnesen_u, 'na_vrijeme', i5.na_vrijeme, 'bodovi_ukupno', (i5.bodovi ->> 'ukupno')::int,
            'konacno', coalesce((i5.bodovi ->> 'konacno')::boolean, false)) order by i5.godina desc, i5.mjesec desc), '[]'::jsonb)
    into zadnji from (select * from public.izvjestaji where status <> 'nacrt' order by godina desc, mjesec desc limit 24) i5
    join public.profili p on p.id = i5.pedagog_id;
  return jsonb_build_object('ok', true, 'uloga', 'direktor', 'ime', k.ime, 'danas', danas,
    'tekuci_period', jsonb_build_object('godina', tg, 'mjesec', tm),
    'cekaju', cekaju, 'kasne', kasne, 'rizici', rizici, 'rizici_po_ozbiljnosti', po, 'preporuke_na_cekanju', prep, 'izvjestaji', zadnji);
exception when others then
  raise warning 'idss_pocetna: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

create or replace function public.idss_ucitaj(p_id uuid default null, p_godina int default null, p_mjesec int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.profili := interno.korisnik(); iz public.izvjestaji; s jsonb;
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;
  if p_id is not null then
    select * into iz from public.izvjestaji where id = p_id;
  elsif k.uloga = 'pedagog' and p_godina is not null and p_mjesec is not null then
    select * into iz from public.izvjestaji where pedagog_id = k.id and godina = p_godina and mjesec = p_mjesec;
  end if;
  if iz.id is null then return interno.greska('NE_POSTOJI', 'Izvještaj nije pronađen.'); end if;
  s := interno.izvjestaj_stanje(iz.id, k);
  if s is null then return interno.greska('ZABRANJENO', 'Nemate pravo pristupa ovom izvještaju.'); end if;
  return jsonb_build_object('ok', true, 'izvjestaj', s);
exception when others then
  raise warning 'idss_ucitaj: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

create or replace function public.idss_kreiraj(p_godina int, p_mjesec int, p_zahtjev uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.profili := interno.korisnik(); iz public.izvjestaji; tg int := extract(year from interno.danas())::int; tm int := extract(month from interno.danas())::int;
  pb int; prev public.izvjestaji; pg int; pm int; novi uuid; s jsonb;
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;
  if k.uloga <> 'pedagog' then return interno.greska('ZABRANJENO', 'Izvještaj može kreirati samo pedagog.'); end if;
  if p_godina is null or p_mjesec is null or p_godina < 2024 or p_godina > 2100 or p_mjesec < 1 or p_mjesec > 12 then
    return interno.greska('VALIDACIJA', 'Period nije ispravan.');
  end if;
  pb := interno.period_broj(p_godina, p_mjesec);
  if pb > interno.period_broj(tg, tm) then return interno.greska('BUDUCI_PERIOD', 'Izvještaj se ne može kreirati za period koji još nije počeo.'); end if;
  if pb < interno.period_broj(extract(year from k.prvi_period)::int, extract(month from k.prvi_period)::int) then
    return interno.greska('PERIOD_PRIJE_POCETKA', 'Period je prije početka izvještavanja u ovom sistemu.');
  end if;
  select * into iz from public.izvjestaji where pedagog_id = k.id and godina = p_godina and mjesec = p_mjesec;
  if iz.id is not null then
    return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
  end if;
  -- kronologija: prethodni postojeći izvještaj ne smije biti nacrt
  select * into prev from public.izvjestaji where pedagog_id = k.id and interno.period_broj(godina, mjesec) < pb
   order by godina desc, mjesec desc limit 1;
  if prev.id is not null and prev.status = 'nacrt' then
    return interno.greska('PRETHODNI_NACRT', 'Prethodni izvještaj (' || lpad(prev.mjesec::text, 2, '0') || '/' || prev.godina || ') je još nacrt. Podnesite ga prije nastavka.');
  end if;
  insert into public.izvjestaji (pedagog_id, godina, mjesec, rok_podnosenja, posljednji_zahtjev)
  values (k.id, p_godina, p_mjesec, interno.rok_podnosenja(p_godina, p_mjesec), p_zahtjev)
  returning id into novi;
  -- preneseni otvoreni rizici ulaze u novi nacrt
  insert into public.rizik_stanja (rizik_id, godina, mjesec, ozbiljnost, mjera, rok, status)
  select r.id, p_godina, p_mjesec, ps.ozbiljnost, ps.mjera, ps.rok, case when ps.status = 'Eskalirano' then 'Eskalirano' else ps.status end
    from interno.preneseni_rizici(k.id, p_godina, p_mjesec) q
    join public.rizici r on r.id = q.id
    join lateral (select * from public.rizik_stanja x where x.rizik_id = r.id and interno.period_broj(x.godina, x.mjesec) < pb
                   order by interno.period_broj(x.godina, x.mjesec) desc limit 1) ps on true;
  perform interno.trag(k, 'KREIRAN_NACRT', novi, jsonb_build_object('godina', p_godina, 'mjesec', p_mjesec));
  s := interno.izvjestaj_stanje(novi, k);
  return jsonb_build_object('ok', true, 'izvjestaj', s);
exception when unique_violation then
  select * into iz from public.izvjestaji where pedagog_id = k.id and godina = p_godina and mjesec = p_mjesec;
  return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
when others then
  raise warning 'idss_kreiraj: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

-- Primjena liste rizika i preporuka u bazu (poziva se tek nakon uspješne provjere)
create or replace function interno.primijeni(p_izv public.izvjestaji, p_riz jsonb, p_prep jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  x jsonb; rid uuid; r public.rizici; pb int := interno.period_broj(p_izv.godina, p_izv.mjesec); kod text; novi_br int;
  prisutni uuid[] := '{}'; pr record; pid uuid; rok date; p public.preporuke; ostaje uuid[] := '{}';
begin
  for x in select e from jsonb_array_elements(p_riz) e loop
    if (x ->> 'id') is not null then
      rid := (x ->> 'id')::uuid;
      select * into r from public.rizici where id = rid;
      if interno.period_broj(r.kreiran_godina, r.kreiran_mjesec) = pb then
        update public.rizici set kategorija = x ->> 'kategorija', opis = x ->> 'opis' where id = rid;
      end if;
    else
      insert into public.rizik_brojac (godina, zadnji) values (p_izv.godina, 1)
        on conflict (godina) do update set zadnji = public.rizik_brojac.zadnji + 1 returning public.rizik_brojac.zadnji into novi_br;
      kod := 'RSK-' || p_izv.godina || '-' || lpad(novi_br::text, 3, '0');
      insert into public.rizici (pedagog_id, kod, kreiran_godina, kreiran_mjesec, kategorija, opis)
      values (p_izv.pedagog_id, kod, p_izv.godina, p_izv.mjesec, x ->> 'kategorija', x ->> 'opis') returning id into rid;
    end if;
    prisutni := prisutni || rid;
    rok := case when interno.je_datum(x ->> 'rok') then (x ->> 'rok')::date end;
    insert into public.rizik_stanja (rizik_id, godina, mjesec, ozbiljnost, mjera, rok, status)
    values (rid, p_izv.godina, p_izv.mjesec, x ->> 'ozbiljnost', coalesce(x ->> 'mjera', ''), rok, x ->> 'status')
    on conflict (rizik_id, godina, mjesec) do update
      set ozbiljnost = excluded.ozbiljnost, mjera = excluded.mjera, rok = excluded.rok, status = excluded.status;
  end loop;
  -- uklanjanje stanja koja više nisu u listi (samo rizici kreirani u ovom periodu; ostalo je odbijeno provjerom)
  for pr in select s.rizik_id, r2.kreiran_godina, r2.kreiran_mjesec from public.rizik_stanja s join public.rizici r2 on r2.id = s.rizik_id
             where r2.pedagog_id = p_izv.pedagog_id and s.godina = p_izv.godina and s.mjesec = p_izv.mjesec loop
    if not (pr.rizik_id = any (prisutni)) then
      delete from public.rizik_stanja where rizik_id = pr.rizik_id and godina = p_izv.godina and mjesec = p_izv.mjesec;
      if not exists (select 1 from public.rizik_stanja where rizik_id = pr.rizik_id) then
        delete from public.rizici where id = pr.rizik_id;
      end if;
    end if;
  end loop;
  -- preporuke
  for x in select e from jsonb_array_elements(p_prep) e loop
    if (x ->> 'id') is not null then
      pid := (x ->> 'id')::uuid;
      select * into p from public.preporuke where id = pid and izvjestaj_id = p_izv.id;
      if p.odluka not in ('Odobreno', 'Odbijeno') then
        update public.preporuke
           set naslov = x ->> 'naslov', obrazlozenje = coalesce(x ->> 'obrazlozenje', ''), utjecaj = x ->> 'utjecaj',
               odluka = case when p.odluka = 'Potrebna dorada' then 'Na čekanju' else p.odluka end,
               odlucio_u = case when p.odluka = 'Potrebna dorada' then null else p.odlucio_u end
         where id = pid;
      end if;
    else
      insert into public.preporuke (izvjestaj_id, naslov, obrazlozenje, utjecaj)
      values (p_izv.id, x ->> 'naslov', coalesce(x ->> 'obrazlozenje', ''), x ->> 'utjecaj') returning id into pid;
    end if;
    ostaje := ostaje || pid;
  end loop;
  delete from public.preporuke where izvjestaj_id = p_izv.id and not (id = any (ostaje));
end $$;

create or replace function interno.ocisti_rizike(r jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(interno.trim_json(
           interno.uzmi(x, array['id','kategorija','ozbiljnost','opis','mjera','rok','status'])
           || case when coalesce(btrim(x ->> 'rok'), '') = '' then jsonb_build_object('rok', null) else '{}'::jsonb end)) order by ord), '[]'::jsonb)
  from jsonb_array_elements(r) with ordinality t(x, ord) $$;

create or replace function interno.ocisti_preporuke(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(interno.trim_json(interno.uzmi(x, array['id','naslov','obrazlozenje','utjecaj']))) order by ord), '[]'::jsonb)
  from jsonb_array_elements(p) with ordinality t(x, ord) $$;

create or replace function public.idss_spremi(p_id uuid, p_revizija int, p_sadrzaj jsonb, p_rizici jsonb, p_preporuke jsonb, p_zahtjev uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.profili := interno.korisnik(); iz public.izvjestaji; sad jsonb; riz jsonb; prep jsonb; e jsonb;
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;
  select * into iz from public.izvjestaji where id = p_id for update;
  if iz.id is null or iz.pedagog_id <> k.id then return interno.greska('ZABRANJENO', 'Nemate pravo mijenjati ovaj izvještaj.'); end if;
  if p_zahtjev is not null and iz.posljednji_zahtjev = p_zahtjev then
    return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
  end if;
  if iz.status not in ('nacrt', 'vracen') then
    return interno.greska('POGRESNO_STANJE', 'Izvještaj u stanju „' || iz.status || '“ ne može se mijenjati.');
  end if;
  if p_revizija is distinct from iz.revizija then
    return interno.greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen (drugi tab ili uređaj).',
                          jsonb_build_object('revizija_servera', iz.revizija));
  end if;
  if coalesce(pg_column_size(p_sadrzaj), 0) > 400000 or coalesce(pg_column_size(p_rizici), 0) > 200000 or coalesce(pg_column_size(p_preporuke), 0) > 100000 then
    return interno.greska('PREVELIK_UNOS', 'Unos je prevelik. Skratite tekstove i pokušajte ponovo.');
  end if;
  e := interno.provjeri_sadrzaj(p_sadrzaj, false, iz.godina, iz.mjesec)
    || interno.provjeri_rizike(coalesce(p_rizici, '[]'::jsonb), false)
    || interno.provjeri_preporuke(coalesce(p_preporuke, '[]'::jsonb), false);
  if jsonb_array_length(e) = 0 then
    sad := interno.ocisti_sadrzaj(p_sadrzaj);
    riz := interno.ocisti_rizike(coalesce(p_rizici, '[]'::jsonb));
    prep := interno.ocisti_preporuke(coalesce(p_preporuke, '[]'::jsonb));
    e := interno.provjeri_baza(iz, riz, prep);
  end if;
  if jsonb_array_length(e) > 0 then
    return interno.greska('VALIDACIJA', 'Podaci nisu ispravni. Ispravite označena polja.', jsonb_build_object('greske', e));
  end if;
  perform interno.primijeni(iz, riz, prep);
  update public.izvjestaji set sadrzaj = sad, revizija = revizija + 1, azuriran = now(), posljednji_zahtjev = p_zahtjev where id = iz.id;
  if not exists (select 1 from public.revizorski_trag t where t.izvjestaj_id = iz.id and t.akcija = 'SPREMLJEN_NACRT' and t.vrijeme > now() - interval '15 minutes') then
  perform interno.trag(k, 'SPREMLJEN_NACRT', iz.id, jsonb_build_object('revizija', iz.revizija + 1, 'rizika', jsonb_array_length(riz), 'preporuka', jsonb_array_length(prep)));
  end if;
  return jsonb_build_object('ok', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
exception when others then
  raise warning 'idss_spremi: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

create or replace function public.idss_podnesi(p_id uuid, p_revizija int, p_zahtjev uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.profili := interno.korisnik(); iz public.izvjestaji; riz jsonb; prep jsonb; kp jsonb; e jsonb; bod jsonb;
  danas date := interno.danas(); kas int; kd int; ciklus_n int; prvi_kas int; nv boolean;
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;
  select * into iz from public.izvjestaji where id = p_id for update;
  if iz.id is null or iz.pedagog_id <> k.id then return interno.greska('ZABRANJENO', 'Nemate pravo podnijeti ovaj izvještaj.'); end if;
  if p_zahtjev is not null and iz.posljednji_zahtjev = p_zahtjev then
    return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
  end if;
  if iz.status not in ('nacrt', 'vracen') then
    return interno.greska('POGRESNO_STANJE', 'Izvještaj u stanju „' || iz.status || '“ ne može se podnijeti.');
  end if;
  if p_revizija is distinct from iz.revizija then
    return interno.greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen (drugi tab ili uređaj).',
                          jsonb_build_object('revizija_servera', iz.revizija));
  end if;
  riz := interno.rizici_perioda(iz.pedagog_id, iz.godina, iz.mjesec);
  prep := interno.preporuke_json(iz.id);
  e := interno.provjeri_sve(iz, iz.sadrzaj, riz, prep, true);
  if jsonb_array_length(e) > 0 then
    return interno.greska('VALIDACIJA', 'Izvještaj nije potpun. Dopunite označena polja prije podnošenja.', jsonb_build_object('greske', e));
  end if;
  kp := interno.kpi(iz.sadrzaj, riz, iz.godina, iz.mjesec);
  ciklus_n := iz.ciklus + 1;
  kas := case when iz.ciklus = 0 then interno.radnih_dana_izmedju(iz.rok_podnosenja, danas) else coalesce(iz.prvo_kasnjenje, 0) end;
  kd := case when iz.status = 'vracen' then interno.radnih_dana_izmedju(iz.rok_dopune, danas) else null end;
  nv := case when iz.ciklus = 0 then kas = 0 else iz.na_vrijeme end;
  bod := interno.bodovi(iz.sadrzaj, riz, kp, iz.godina, iz.mjesec, kas, ciklus_n, kd);
  bod := bod || jsonb_build_object('direktor', 0, 'ukupno', (bod ->> 'zbroj')::int, 'konacno', false);
  insert into public.izvjestaj_snimci (izvjestaj_id, ciklus, sadrzaj, rizici, preporuke, kpi, bodovi)
  values (iz.id, ciklus_n, iz.sadrzaj, riz, prep, kp, bod);
  update public.izvjestaji
     set status = 'podnesen', ciklus = ciklus_n, podnesen_u = now(), revizija = revizija + 1, azuriran = now(),
         prvo_kasnjenje = kas, kasnjenje_dopune = kd, na_vrijeme = nv, bodovi = bod, posljednji_zahtjev = p_zahtjev
   where id = iz.id;
  perform interno.trag(k, case when ciklus_n = 1 then 'PODNESEN' else 'PONOVO_PODNESEN' end, iz.id,
          jsonb_build_object('ciklus', ciklus_n, 'kasnjenje_radnih_dana', kas, 'bodovi_zbroj', (bod ->> 'zbroj')::int));
  return jsonb_build_object('ok', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
exception when others then
  raise warning 'idss_podnesi: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

create or replace function public.idss_vrati(p_id uuid, p_revizija int, p_napomena text, p_zahtjev uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.profili := interno.korisnik(); iz public.izvjestaji; nap text := btrim(coalesce(p_napomena, '')); rd date;
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;
  if k.uloga <> 'direktor' then return interno.greska('ZABRANJENO', 'Izvještaj može vratiti samo direktor.'); end if;
  select * into iz from public.izvjestaji where id = p_id for update;
  if iz.id is null then return interno.greska('NE_POSTOJI', 'Izvještaj nije pronađen.'); end if;
  if p_zahtjev is not null and iz.posljednji_zahtjev = p_zahtjev then
    return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
  end if;
  if iz.status <> 'podnesen' then return interno.greska('POGRESNO_STANJE', 'Vratiti se može samo podnesen izvještaj.'); end if;
  if p_revizija is distinct from iz.revizija then
    return interno.greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen.', jsonb_build_object('revizija_servera', iz.revizija));
  end if;
  if char_length(nap) < 15 or char_length(nap) > 2000 then
    return interno.greska('VALIDACIJA', 'Obrazloženje mora imati između 15 i 2000 znakova.',
      jsonb_build_object('greske', interno.g('napomena', 'DUZINA', 'Obrazloženje mora imati između 15 i 2000 znakova.')));
  end if;
  rd := interno.dodaj_radne_dane(interno.danas(), interno.postavka_int('rok_dopune_radnih_dana', 3));
  update public.izvjestaji
     set status = 'vracen', revizija = revizija + 1, azuriran = now(), vracen_u = now(), rok_dopune = rd,
         direktor_napomena = nap, posljednji_zahtjev = p_zahtjev
   where id = iz.id;
  perform interno.trag(k, 'VRACEN_NA_DOPUNU', iz.id, jsonb_build_object('ciklus', iz.ciklus, 'rok_dopune', rd));
  return jsonb_build_object('ok', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
exception when others then
  raise warning 'idss_vrati: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

create or replace function public.idss_odluka(p_preporuka uuid, p_odluka text, p_komentar text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.profili := interno.korisnik(); p public.preporuke; iz public.izvjestaji; kom text := nullif(btrim(coalesce(p_komentar, '')), '');
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;
  if k.uloga <> 'direktor' then return interno.greska('ZABRANJENO', 'Odluku o preporuci može donijeti samo direktor.'); end if;
  select * into p from public.preporuke where id = p_preporuka for update;
  if p.id is null then return interno.greska('NE_POSTOJI', 'Preporuka nije pronađena.'); end if;
  select * into iz from public.izvjestaji where id = p.izvjestaj_id for update;
  if iz.status <> 'podnesen' then return interno.greska('POGRESNO_STANJE', 'Odluka se donosi samo dok je izvještaj podnesen.'); end if;
  if p_odluka is null or not (p_odluka = any (interno.enum_odluka())) or p_odluka = 'Na čekanju' then
    return interno.greska('VALIDACIJA', 'Odluka nije ispravna.');
  end if;
  if kom is not null and char_length(kom) > 1000 then return interno.greska('VALIDACIJA', 'Komentar može imati najviše 1000 znakova.'); end if;
  if p_odluka in ('Odbijeno', 'Potrebna dorada') and kom is null then
    return interno.greska('VALIDACIJA', 'Uz odluku „' || p_odluka || '“ komentar je obavezan.');
  end if;
  update public.preporuke set odluka = p_odluka, komentar_direktora = kom, odlucio_u = now() where id = p.id;
  update public.izvjestaji set revizija = revizija + 1, azuriran = now() where id = iz.id;
  perform interno.trag(k, 'ODLUKA_O_PREPORUCI', iz.id, jsonb_build_object('preporuka', p.id, 'odluka', p_odluka));
  return jsonb_build_object('ok', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
exception when others then
  raise warning 'idss_odluka: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

create or replace function public.idss_odobri(p_id uuid, p_revizija int, p_ocjena int, p_komentar text default null, p_zahtjev uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.profili := interno.korisnik(); iz public.izvjestaji; bod jsonb; kom text := nullif(btrim(coalesce(p_komentar, '')), ''); st jsonb;
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;
  if k.uloga <> 'direktor' then return interno.greska('ZABRANJENO', 'Izvještaj može odobriti samo direktor.'); end if;
  select * into iz from public.izvjestaji where id = p_id for update;
  if iz.id is null then return interno.greska('NE_POSTOJI', 'Izvještaj nije pronađen.'); end if;
  if p_zahtjev is not null and iz.posljednji_zahtjev = p_zahtjev then
    return jsonb_build_object('ok', true, 'ponovljeno', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
  end if;
  if iz.status <> 'podnesen' then return interno.greska('POGRESNO_STANJE', 'Odobriti se može samo podnesen izvještaj.'); end if;
  if p_revizija is distinct from iz.revizija then
    return interno.greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen.', jsonb_build_object('revizija_servera', iz.revizija));
  end if;
  if p_ocjena is null or p_ocjena < 0 or p_ocjena > 5 then return interno.greska('VALIDACIJA', 'Ocjena kvaliteta mora biti između 0 i 5.'); end if;
  if kom is not null and char_length(kom) > 1000 then return interno.greska('VALIDACIJA', 'Komentar može imati najviše 1000 znakova.'); end if;
  if exists (select 1 from public.preporuke where izvjestaj_id = iz.id and odluka = 'Na čekanju') then
    return interno.greska('PREPORUKE_BEZ_ODLUKE', 'Prije odobrenja potrebno je odlučiti o svim preporukama.');
  end if;
  if exists (select 1 from public.preporuke where izvjestaj_id = iz.id and odluka = 'Potrebna dorada') then
    return interno.greska('PREPORUKE_TRAZE_DORADU', 'Postoji preporuka označena kao „Potrebna dorada“. Vratite izvještaj na dopunu.');
  end if;
  bod := iz.bodovi;
  st := (bod -> 'stavke') || interno.stavka('D1', 'direktor', 'Ocjena direktora o kvalitetu', p_ocjena * 20, 100, 'Ocjena ' || p_ocjena || ' od 5 (po 20 bodova).');
  bod := jsonb_set(jsonb_set(jsonb_set(jsonb_set(bod, '{stavke}', st), '{direktor}', to_jsonb(p_ocjena * 20)),
                             '{ukupno}', to_jsonb((bod ->> 'zbroj')::int + p_ocjena * 20)), '{konacno}', 'true'::jsonb);
  bod := jsonb_set(bod, '{max}', '1000'::jsonb);
  update public.izvjestaji
     set status = 'odobren', revizija = revizija + 1, azuriran = now(), odobren_u = now(),
         direktor_ocjena = p_ocjena, direktor_napomena = coalesce(kom, direktor_napomena), bodovi = bod, posljednji_zahtjev = p_zahtjev
   where id = iz.id;
  perform interno.trag(k, 'ODOBREN', iz.id, jsonb_build_object('ocjena', p_ocjena, 'bodovi_ukupno', (bod ->> 'ukupno')::int));
  return jsonb_build_object('ok', true, 'izvjestaj', interno.izvjestaj_stanje(iz.id, k));
exception when others then
  raise warning 'idss_odobri: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

create or replace function public.idss_trag(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.profili := interno.korisnik(); iz public.izvjestaji;
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;
  select * into iz from public.izvjestaji where id = p_id;
  if iz.id is null or not (iz.pedagog_id = k.id or (k.uloga = 'direktor' and iz.status <> 'nacrt')) then
    return interno.greska('ZABRANJENO', 'Nemate pravo pristupa historiji ovog izvještaja.');
  end if;
  return jsonb_build_object('ok', true, 'dogadjaji', (
    select coalesce(jsonb_agg(jsonb_build_object('vrijeme', t.vrijeme, 'akcija', t.akcija, 'akter', coalesce(p.ime, '—'), 'uloga', t.akter_uloga, 'sazetak', t.sazetak)
                               order by t.vrijeme, t.id), '[]'::jsonb)
      from public.revizorski_trag t left join public.profili p on p.id = t.akter_id
     where t.izvjestaj_id = p_id and (k.uloga = 'pedagog' or t.akcija <> 'SPREMLJEN_NACRT')));
exception when others then
  raise warning 'idss_trag: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

-- Arhiva: pedagog vidi sve svoje, direktor sve podnesene
create or replace function public.idss_arhiva() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.profili := interno.korisnik();
begin
  if k.id is null then return interno.greska('NEOVLASTEN', 'Ovaj račun nema pristup sistemu IDSS Pedagog.'); end if;
  return jsonb_build_object('ok', true, 'izvjestaji', (
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'pedagog', p.ime, 'godina', i.godina, 'mjesec', i.mjesec, 'status', i.status,
             'podnesen_u', i.podnesen_u, 'odobren_u', i.odobren_u, 'ciklus', i.ciklus, 'na_vrijeme', i.na_vrijeme,
             'bodovi_ukupno', (i.bodovi ->> 'ukupno')::int, 'konacno', coalesce((i.bodovi ->> 'konacno')::boolean, false))
           order by i.godina desc, i.mjesec desc), '[]'::jsonb)
      from public.izvjestaji i join public.profili p on p.id = i.pedagog_id
     where (k.uloga = 'pedagog' and i.pedagog_id = k.id) or (k.uloga = 'direktor' and i.status <> 'nacrt')));
exception when others then
  raise warning 'idss_arhiva: %', sqlerrm;
  return interno.greska('GRESKA_SERVERA', 'Došlo je do greške na serveru. Pokušajte ponovo.');
end $$;

-- ---------- Administracija (pokreće vlasnik baze u SQL Editoru; nije dostupno klijentima) ----------
drop function if exists interno.dodaj_profil(text, text, text, date);
create or replace function interno.dodaj_profil(p_email text, p_ime text, p_uloga text, p_prvi_period date default null, p_telefon text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'Korisnik % ne postoji u Authentication > Users. Prvo ga kreirajte.', p_email; end if;
  insert into public.profili (id, ime, uloga, prvi_period, telefon)
  values (uid, p_ime, p_uloga, coalesce(date_trunc('month', p_prvi_period)::date, date_trunc('month', now() at time zone 'Europe/Sarajevo')::date), p_telefon)
  on conflict (id) do update set ime = excluded.ime, uloga = excluded.uloga, aktivan = true,
                                  prvi_period = excluded.prvi_period, telefon = excluded.telefon;
  return 'Profil postavljen: ' || p_ime || ' (' || p_uloga || ')';
end $$;
-- =====================================================================
-- IDSS Pedagog — Mjesečni izvještaj :: 004_sigurnost.sql
-- Zaključavanje: nijedna tabela nije dostupna klijentu; samo RPC funkcije.
-- =====================================================================

-- RLS uključen na svim tabelama (bez politika = nijedan red nije vidljiv klijentskim ulogama)
alter table public.profili          enable row level security;
alter table public.postavke         enable row level security;
alter table public.neradni_dani     enable row level security;
alter table public.izvjestaji       enable row level security;
alter table public.izvjestaj_snimci enable row level security;
alter table public.rizici           enable row level security;
alter table public.rizik_stanja     enable row level security;
alter table public.rizik_brojac     enable row level security;
alter table public.preporuke        enable row level security;
alter table public.revizorski_trag  enable row level security;

-- Supabase po zadanom daje anon/authenticated sva prava nad tabelama u public šemi: oduzimamo ih.
revoke all on all tables    in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- Interna šema nikome osim vlasniku
revoke all on all functions in schema interno from public, anon, authenticated;
revoke all on schema interno from public, anon, authenticated;

-- Jedina javna površina: RPC funkcije, samo za prijavljene korisnike
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'idss\_%' loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
