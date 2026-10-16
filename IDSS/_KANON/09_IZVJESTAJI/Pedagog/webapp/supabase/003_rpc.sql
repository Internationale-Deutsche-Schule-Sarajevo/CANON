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
