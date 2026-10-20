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
