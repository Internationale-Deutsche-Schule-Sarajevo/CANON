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
