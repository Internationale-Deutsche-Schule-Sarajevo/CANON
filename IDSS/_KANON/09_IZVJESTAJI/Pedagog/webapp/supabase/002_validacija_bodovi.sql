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
