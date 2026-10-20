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
