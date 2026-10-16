\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
create schema if not exists t;
drop table if exists t.stanje; create table t.stanje (k text primary key, v jsonb);
drop table if exists t.fix;   create table t.fix (k text primary key, j jsonb);
\set fx `cat fixtures/potpun.json`
insert into t.fix values ('potpun', :'fx'::jsonb);

create or replace function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'NEUSPJEH: %', msg; end if;
  raise notice 'PASS  %', msg;
end $$;
create or replace function t.kao(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false) $$;
create or replace function t.dan(d text) returns void language sql as $$ select set_config('idss.danas', d, false) $$;
create or replace function t.sp(k text, v jsonb) returns void language sql as $$
  insert into t.stanje values (k, v) on conflict (k) do update set v = excluded.v $$;
create or replace function t.g(k text) returns jsonb language sql as $$ select v from t.stanje where k = $1 $$;
-- fixture za zadani period (datumi radionica/usavršavanja premješteni u taj mjesec)
create or replace function t.fix(g int, m int) returns jsonb language sql as $$
  select replace((select j from t.fix where k = 'potpun')::text, '2026-09-', format('%s-%s-', g, lpad(m::text, 2, '0')))::jsonb $$;

-- Testni sat: pročitaj GUC (samo u testu; produkcijska funkcija čita sistemski sat)
create or replace function interno.danas() returns date language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('idss.danas', true), '')::date, (now() at time zone 'Europe/Sarajevo')::date) $$;

-- Korisnici
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1', 'pedagog@test.idss'),
 ('00000000-0000-0000-0000-0000000000a2', 'direktor@test.idss'),
 ('00000000-0000-0000-0000-0000000000a3', 'pedagog2@test.idss'),
 ('00000000-0000-0000-0000-0000000000a4', 'stranac@test.idss');
select t.dan('2026-09-01');
select interno.dodaj_profil('pedagog@test.idss',  'Test Pedagog',  'pedagog',  '2026-09-01');
select interno.dodaj_profil('direktor@test.idss', 'Test Direktor', 'direktor', '2026-09-01');
select interno.dodaj_profil('pedagog2@test.idss', 'Drugi Pedagog', 'pedagog',  '2026-09-01');
insert into public.neradni_dani values ('2026-10-05', 'Testni neradni dan');

\echo === 1. Identitet i uloge
do $$ begin
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  perform t.ok((public.idss_profil() ->> 'uloga') = 'pedagog', 'pedagog prepoznat');
  perform t.kao('00000000-0000-0000-0000-0000000000a4');
  perform t.ok((public.idss_profil() ->> 'kod') = 'NEOVLASTEN', 'korisnik bez profila: NEOVLASTEN');
  perform t.kao(null);
  perform t.ok((public.idss_pocetna() ->> 'kod') = 'NEOVLASTEN', 'bez prijave: NEOVLASTEN');
end $$;

\echo === 2. Kreiranje nacrta, rokovi
do $$ declare r jsonb; begin
  perform t.dan('2026-10-02');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  r := public.idss_kreiraj(2026, 9);
  perform t.ok((r ->> 'ok')::boolean, 'nacrt za 09/2026 kreiran');
  perform t.sp('iz9', r -> 'izvjestaj');
  perform t.ok((r -> 'izvjestaj' ->> 'rok_podnosenja') = '2026-10-06', 'rok pomaknut zbog neradnog dana 05.10. -> 06.10.');
  perform t.ok((r -> 'izvjestaj' ->> 'revizija')::int = 1, 'revizija = 1');
  perform t.ok((public.idss_kreiraj(2026, 9) ->> 'ponovljeno')::boolean, 'ponovno kreiranje ne duplira');
  perform t.ok((public.idss_kreiraj(2026, 11) ->> 'kod') = 'BUDUCI_PERIOD', 'budući period odbijen');
  perform t.ok((public.idss_kreiraj(2026, 8) ->> 'kod') = 'PERIOD_PRIJE_POCETKA', 'period prije početka odbijen');
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  perform t.ok((public.idss_kreiraj(2026, 9) ->> 'kod') = 'ZABRANJENO', 'direktor ne kreira izvještaj');
end $$;

\echo === 3. Povjerljivost nacrta
do $$ declare iid uuid := (t.g('iz9') ->> 'id')::uuid; r jsonb; begin
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  perform t.ok((public.idss_ucitaj(iid) ->> 'kod') = 'ZABRANJENO', 'direktor ne vidi nacrt');
  perform t.ok((public.idss_trag(iid) ->> 'kod') = 'ZABRANJENO', 'direktor ne vidi historiju nacrta');
  perform t.kao('00000000-0000-0000-0000-0000000000a3');
  perform t.ok((public.idss_ucitaj(iid) ->> 'kod') = 'ZABRANJENO', 'drugi pedagog ne vidi tuđ nacrt');
  r := public.idss_spremi(iid, 1, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb);
  perform t.ok((r ->> 'kod') = 'ZABRANJENO', 'drugi pedagog ne može spremiti tuđ nacrt');
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  r := public.idss_pocetna();
  perform t.ok(r::text not like '%Većina razgovora%', 'pregled direktora ne sadrži sadržaj nacrta');
  perform t.ok((r -> 'kasne') = '[]'::jsonb, 'prije roka nema kašnjenja');
end $$;

\echo === 4. Spremanje, sukob verzija, idempotentnost, validacija
do $$ declare iid uuid := (t.g('iz9') ->> 'id')::uuid; r jsonb; rz jsonb; pr jsonb; z uuid := gen_random_uuid(); begin
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  rz := jsonb_build_array(
    jsonb_build_object('kategorija','Akademski','ozbiljnost','Visok','opis','Pad uspjeha u matematici u četvrtom razredu','mjera','Dodatna nastava i praćenje napretka kroz tri sedmice','rok','2026-10-20','status','Otvoreno'),
    jsonb_build_object('kategorija','Pedagoški / Ponašanje','ozbiljnost','Srednji','opis','Učestali sukobi na odmorima u petom razredu','mjera','Radionica o rješavanju sukoba i dežurstva','rok','2026-09-25','status','Riješeno'));
  pr := jsonb_build_array(jsonb_build_object('naslov','Dodatni sat podrške iz matematike','obrazlozenje','Zbog većeg broja učenika sa slabijim rezultatima potreban je dodatni sat.','utjecaj','Potreban budžet'));
  r := public.idss_spremi(iid, 1, t.fix(2026, 9), rz, pr, z);
  perform t.ok((r ->> 'ok')::boolean, 'nacrt spremljen: ' || coalesce(r ->> 'poruka', 'ok'));
  perform t.ok((r -> 'izvjestaj' ->> 'revizija')::int = 2, 'revizija porasla na 2');
  perform t.sp('iz9', r -> 'izvjestaj');
  perform t.ok(jsonb_array_length(r -> 'izvjestaj' -> 'rizici') = 2, 'dva rizika spremljena');
  perform t.ok((r -> 'izvjestaj' -> 'rizici' -> 0 ->> 'kod') like 'RSK-2026-00%', 'serverski generisan kod rizika: ' || (r -> 'izvjestaj' -> 'rizici' -> 0 ->> 'kod'));
  -- ponovljeni zahtjev
  r := public.idss_spremi(iid, 1, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, z);
  perform t.ok((r ->> 'ponovljeno')::boolean and (r -> 'izvjestaj' ->> 'revizija')::int = 2, 'ponovljeni zahtjev ne mijenja stanje');
  -- zastarjela revizija
  r := public.idss_spremi(iid, 1, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, gen_random_uuid());
  perform t.ok((r ->> 'kod') = 'SUKOB_VERZIJA' and (r ->> 'revizija_servera')::int = 2, 'zastarjela revizija: SUKOB_VERZIJA');
  perform t.ok(t.g('iz9') -> 'sadrzaj' -> 'ucenici' ->> 'sazetak' like 'Većina%', 'sukob nije prebrisao sadržaj');
  -- validacija
  r := public.idss_spremi(iid, 2, jsonb_set(t.fix(2026, 9), '{ucenici,teme}', '["Nepostojeca"]'), (t.g('iz9') -> 'rizici'), (t.g('iz9') -> 'preporuke'), gen_random_uuid());
  perform t.ok((r ->> 'kod') = 'VALIDACIJA', 'nedozvoljena vrijednost enuma odbijena');
  r := public.idss_spremi(iid, 2, jsonb_set(t.fix(2026, 9), '{ucenici,individualni_razgovori}', '-3'), (t.g('iz9') -> 'rizici'), (t.g('iz9') -> 'preporuke'), gen_random_uuid());
  perform t.ok((r ->> 'kod') = 'VALIDACIJA', 'negativan broj odbijen');
  r := public.idss_spremi(iid, 2, jsonb_set(t.fix(2026, 9), '{ucenici,sazetak}', to_jsonb(repeat('x', 2501))), (t.g('iz9') -> 'rizici'), (t.g('iz9') -> 'preporuke'), gen_random_uuid());
  perform t.ok((r ->> 'kod') = 'VALIDACIJA', 'predugačak tekst odbijen');
  r := public.idss_spremi(iid, 2, jsonb_set(t.fix(2026, 9), '{radionice,stavke,0,datum}', '"2026-10-18"'), (t.g('iz9') -> 'rizici'), (t.g('iz9') -> 'preporuke'), gen_random_uuid());
  perform t.ok((r ->> 'kod') = 'VALIDACIJA', 'datum radionice van perioda odbijen');
  r := public.idss_spremi(iid, 2, t.fix(2026, 9) || '{"nepoznato": {"x": 1}}', (t.g('iz9') -> 'rizici'), (t.g('iz9') -> 'preporuke'), gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean and not (r -> 'izvjestaj' -> 'sadrzaj' ? 'nepoznato'), 'nepoznata polja se odbacuju pri normalizaciji');
  perform t.sp('iz9', r -> 'izvjestaj');
end $$;

\echo === 5. Podnošenje
do $$ declare iid uuid := (t.g('iz9') ->> 'id')::uuid; r jsonb; rev int; z uuid := gen_random_uuid(); begin
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  rev := (t.g('iz9') ->> 'revizija')::int;
  -- nepotpun izvještaj
  r := public.idss_spremi(iid, rev, jsonb_set(t.fix(2026, 9), '{zakljucak,plan_sljedeci}', '"kratko"'), (t.g('iz9') -> 'rizici'), (t.g('iz9') -> 'preporuke'), gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean, 'nacrt dozvoljava nepotpun sadržaj');
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  perform t.ok(not (r -> 'izvjestaj' ->> 'moze_podnijeti')::boolean, 'nepotpun izvještaj: moze_podnijeti = false');
  r := public.idss_podnesi(iid, rev);
  perform t.ok((r ->> 'kod') = 'VALIDACIJA' and jsonb_array_length(r -> 'greske') >= 1, 'podnošenje nepotpunog odbijeno sa popisom grešaka');
  r := public.idss_spremi(iid, rev, t.fix(2026, 9), (t.g('iz9') -> 'rizici'), (t.g('iz9') -> 'preporuke'), gen_random_uuid());
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  perform t.ok((r -> 'izvjestaj' ->> 'moze_podnijeti')::boolean, 'potpun izvještaj: moze_podnijeti = true');
  perform t.sp('pregled9', r -> 'izvjestaj' -> 'bodovi_pregled');
  -- stara revizija pri podnošenju
  perform t.ok((public.idss_podnesi(iid, rev - 1) ->> 'kod') = 'SUKOB_VERZIJA', 'podnošenje sa zastarjelom revizijom odbijeno');
  r := public.idss_podnesi(iid, rev, z);
  perform t.ok((r ->> 'ok')::boolean, 'izvještaj podnesen: ' || coalesce(r ->> 'poruka', ''));
  perform t.ok((r -> 'izvjestaj' ->> 'status') = 'podnesen' and (r -> 'izvjestaj' ->> 'ciklus')::int = 1, 'status podnesen, ciklus 1');
  perform t.ok((r -> 'izvjestaj' ->> 'na_vrijeme')::boolean, 'podneseno u roku (02.10. prije roka 06.10.)');
  perform t.ok((r -> 'izvjestaj' -> 'bodovi' ->> 'zbroj') = (t.g('pregled9') ->> 'zbroj'), 'bodovi pri podnošenju = pregled prije podnošenja (' || (r -> 'izvjestaj' -> 'bodovi' ->> 'zbroj') || ')');
  perform t.sp('iz9', r -> 'izvjestaj');
  perform t.ok((public.idss_podnesi(iid, rev, z) ->> 'ponovljeno')::boolean, 'dupli klik na Podnesi: idempotentno');
  perform t.ok((select count(*) from public.izvjestaj_snimci where izvjestaj_id = iid) = 1, 'tačno jedan snimak');
  r := public.idss_spremi(iid, rev + 1, t.fix(2026, 9), '[]', '[]', gen_random_uuid());
  perform t.ok((r ->> 'kod') = 'POGRESNO_STANJE', 'podnesen izvještaj se ne može mijenjati');
  perform t.ok((r ->> 'kod') <> 'x', 'rizici KPI: 3A=' || (t.g('iz9') -> 'kpi' -> 'kpi03' ->> 'rijeseno_3a') || ' 3B=' || (t.g('iz9') -> 'kpi' -> 'kpi03' ->> 'preneseno_3b') || ' 3C=' || (t.g('iz9') -> 'kpi' -> 'kpi03' ->> 'aktivno_3c'));
  perform t.ok((t.g('iz9') -> 'kpi' -> 'kpi03' ->> 'rijeseno_3a')::int = 1 and (t.g('iz9') -> 'kpi' -> 'kpi03' ->> 'aktivno_3c')::int = 1 and (t.g('iz9') -> 'kpi' -> 'kpi03' ->> 'preneseno_3b')::int = 0, 'KPI-03 u prvom mjesecu: 3A=1, 3B=0, 3C=1');
end $$;

\echo === 6. Direktor: pregled, preporuke, vraćanje, odobrenje
do $$ declare iid uuid := (t.g('iz9') ->> 'id')::uuid; r jsonb; rev int; pid uuid; begin
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  r := public.idss_ucitaj(iid);
  perform t.ok((r ->> 'ok')::boolean and (r -> 'izvjestaj' -> 'sadrzaj' -> 'ucenici' ->> 'sazetak') like 'Većina%', 'direktor vidi podneseni sadržaj');
  perform t.ok((r -> 'izvjestaj' ->> 'moze_odluciti')::boolean and not (r -> 'izvjestaj' ->> 'moze_urediti')::boolean, 'direktor može odlučiti, ne i uređivati');
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  perform t.ok((public.idss_spremi(iid, rev, '{}', '[]', '[]') ->> 'kod') = 'ZABRANJENO', 'direktor ne može spremati sadržaj');
  perform t.ok((public.idss_odobri(iid, rev, 4) ->> 'kod') = 'PREPORUKE_BEZ_ODLUKE', 'odobrenje blokirano dok preporuka čeka odluku');
  pid := (r -> 'izvjestaj' -> 'preporuke' -> 0 ->> 'id')::uuid;
  perform t.ok((public.idss_odluka(pid, 'Odbijeno', null) ->> 'kod') = 'VALIDACIJA', 'odbijanje traži komentar');
  r := public.idss_odluka(pid, 'Potrebna dorada', 'Navedite broj učenika i očekivani učinak.');
  perform t.ok((r ->> 'ok')::boolean, 'odluka „Potrebna dorada“ zabilježena');
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  perform t.ok((public.idss_odobri(iid, rev, 4) ->> 'kod') = 'PREPORUKE_TRAZE_DORADU', 'odobrenje blokirano uz „Potrebna dorada“');
  perform t.ok((public.idss_vrati(iid, rev, 'kratko') ->> 'kod') = 'VALIDACIJA', 'vraćanje traži obrazloženje od najmanje 15 znakova');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  perform t.ok((public.idss_vrati(iid, rev, 'Pedagog ne smije vratiti izvještaj sam sebi') ->> 'kod') = 'ZABRANJENO', 'pedagog ne može vratiti izvještaj');
  perform t.ok((public.idss_odobri(iid, rev, 5) ->> 'kod') = 'ZABRANJENO', 'pedagog ne može odobriti izvještaj');
  perform t.ok((public.idss_odluka(pid, 'Odobreno') ->> 'kod') = 'ZABRANJENO', 'pedagog ne može odlučiti o preporuci');
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  r := public.idss_vrati(iid, rev, 'Dopunite obrazloženje preporuke i navedite broj učenika.');
  perform t.ok((r ->> 'ok')::boolean and (r -> 'izvjestaj' ->> 'status') = 'vracen', 'izvještaj vraćen na dopunu');
  perform t.ok((r -> 'izvjestaj' ->> 'rok_dopune') = '2026-10-08', 'rok dopune = 3 radna dana (05.10. neradni): 08.10.');
  perform t.sp('iz9', r -> 'izvjestaj');
end $$;

\echo === 7. Dopuna, ponovno podnošenje i odobrenje
do $$ declare iid uuid := (t.g('iz9') ->> 'id')::uuid; r jsonb; rev int; pr jsonb; begin
  perform t.dan('2026-10-07');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  r := public.idss_ucitaj(iid);
  perform t.ok((r -> 'izvjestaj' ->> 'moze_urediti')::boolean, 'pedagog može urediti vraćeni izvještaj');
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  pr := jsonb_build_array(jsonb_build_object('id', r -> 'izvjestaj' -> 'preporuke' -> 0 ->> 'id', 'naslov','Dodatni sat podrške iz matematike',
          'obrazlozenje','Dvanaest učenika petog razreda ima slabije rezultate; očekujemo napredak do kraja polugodišta.','utjecaj','Potreban budžet'));
  r := public.idss_spremi(iid, rev, t.fix(2026, 9), (r -> 'izvjestaj' -> 'rizici'), pr, gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean, 'dopuna spremljena');
  perform t.ok((r -> 'izvjestaj' -> 'preporuke' -> 0 ->> 'odluka') = 'Na čekanju', 'dopunjena preporuka vraćena na čekanje');
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  r := public.idss_podnesi(iid, rev);
  perform t.ok((r ->> 'ok')::boolean and (r -> 'izvjestaj' ->> 'ciklus')::int = 2, 'ponovno podneseno (ciklus 2)');
  perform t.ok((r -> 'izvjestaj' -> 'bodovi' -> 'stavke' -> 2 ->> 'bodovi')::int >= 0, 'bodovi preračunati');
  perform t.ok((select (x ->> 'bodovi')::int from jsonb_array_elements(r -> 'izvjestaj' -> 'bodovi' -> 'stavke') x where x ->> 'kod' = 'E3') = 20, 'E3 = 20 (drugo podnošenje)');
  perform t.ok((select (x ->> 'bodovi')::int from jsonb_array_elements(r -> 'izvjestaj' -> 'bodovi' -> 'stavke') x where x ->> 'kod' = 'B1') = 200, 'B1 = 200 (prvo podnošenje u roku, nije kažnjeno dopunom)');
  perform t.ok((select (x ->> 'bodovi')::int from jsonb_array_elements(r -> 'izvjestaj' -> 'bodovi' -> 'stavke') x where x ->> 'kod' = 'B2') = 50, 'B2 = 50 (dopuna u roku)');
  perform t.ok((select count(*) from public.izvjestaj_snimci where izvjestaj_id = iid) = 2, 'dva nepromjenjiva snimka (po jedan za svako podnošenje)');
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  r := public.idss_ucitaj(iid);
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  r := public.idss_odluka((r -> 'izvjestaj' -> 'preporuke' -> 0 ->> 'id')::uuid, 'Odobreno', 'Odobreno uz izvještavanje o učinku.');
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  perform t.ok((public.idss_odobri(iid, rev, 6) ->> 'kod') = 'VALIDACIJA', 'ocjena veća od 5 odbijena');
  r := public.idss_odobri(iid, rev, 4, 'Izvještaj je cjelovit i konkretan.');
  perform t.ok((r ->> 'ok')::boolean and (r -> 'izvjestaj' ->> 'status') = 'odobren', 'izvještaj odobren');
  perform t.ok((r -> 'izvjestaj' -> 'bodovi' ->> 'ukupno')::int = (r -> 'izvjestaj' -> 'bodovi' ->> 'zbroj')::int + 80 and (r -> 'izvjestaj' -> 'bodovi' ->> 'konacno')::boolean,
               'konačni bodovi = zbroj + 80 (ocjena 4): ' || (r -> 'izvjestaj' -> 'bodovi' ->> 'ukupno'));
  perform t.sp('iz9', r -> 'izvjestaj');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  perform t.ok((public.idss_spremi(iid, rev + 1, t.fix(2026, 9), '[]', '[]') ->> 'kod') = 'POGRESNO_STANJE', 'odobren izvještaj se ne mijenja');
end $$;

\echo === 8. Nepromjenjivost (čak i za vlasnika baze)
do $$ declare iid uuid := (t.g('iz9') ->> 'id')::uuid; begin
  begin update public.izvjestaj_snimci set sadrzaj = '{}' where izvjestaj_id = iid; perform t.ok(false, 'snimak se ne smije mijenjati');
  exception when insufficient_privilege then perform t.ok(true, 'snimak je nepromjenjiv (UPDATE)'); end;
  begin delete from public.izvjestaj_snimci where izvjestaj_id = iid; perform t.ok(false, 'snimak se ne smije brisati');
  exception when insufficient_privilege then perform t.ok(true, 'snimak je nepromjenjiv (DELETE)'); end;
  begin update public.revizorski_trag set akcija = 'X'; perform t.ok(false, 'trag se ne smije mijenjati');
  exception when insufficient_privilege then perform t.ok(true, 'revizorski trag je nepromjenjiv (UPDATE)'); end;
  begin truncate public.revizorski_trag; perform t.ok(false, 'trag se ne smije brisati');
  exception when insufficient_privilege then perform t.ok(true, 'revizorski trag je nepromjenjiv (TRUNCATE)'); end;
  begin update public.izvjestaji set sadrzaj = '{}' where public.izvjestaji.id = iid; perform t.ok(false, 'odobren se ne smije mijenjati');
  exception when insufficient_privilege then perform t.ok(true, 'odobren izvještaj zaključan i na nivou baze'); end;
  begin delete from public.izvjestaji where public.izvjestaji.id = iid; perform t.ok(false, 'odobren se ne briše');
  exception when insufficient_privilege then perform t.ok(true, 'odobren izvještaj se ne može obrisati'); end;
  perform t.ok((select count(*) from public.revizorski_trag where izvjestaj_id = iid) >= 6, 'revizorski trag ima zapise');
  perform t.ok((select bool_and(sazetak::text not like '%Većina%') from public.revizorski_trag), 'revizorski trag ne sadrži tekst izvještaja');
end $$;

\echo === 9. Privilegije klijentskih uloga
grant usage on schema t to anon, authenticated;
grant execute on all functions in schema t to anon, authenticated;
set role anon;
do $$ begin
  begin perform public.idss_profil(); perform t.ok(false, 'anon ne smije pozvati RPC');
  exception when insufficient_privilege then perform t.ok(true, 'anon ne može pozvati RPC'); end;
  begin perform count(*) from public.izvjestaji; perform t.ok(false, 'anon ne smije čitati tabelu');
  exception when insufficient_privilege then perform t.ok(true, 'anon ne može čitati izvještaje'); end;
end $$;
reset role;
set role authenticated;
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
  perform t.ok((public.idss_profil() ->> 'ok')::boolean, 'authenticated može pozvati RPC');
  foreach n in array array[1] loop null; end loop;
  begin perform count(*) from public.izvjestaji; perform t.ok(false, 'authenticated ne smije čitati tabelu');
  exception when insufficient_privilege then perform t.ok(true, 'authenticated ne može čitati izvještaje direktno'); end;
  begin update public.profili set uloga = 'direktor'; perform t.ok(false, 'ne smije se podići uloga');
  exception when insufficient_privilege then perform t.ok(true, 'authenticated ne može mijenjati vlastitu ulogu'); end;
  begin insert into public.rizik_stanja values (gen_random_uuid(), 2026, 9, 'Nizak', '', null, 'Otvoreno'); perform t.ok(false, 'insert');
  exception when insufficient_privilege then perform t.ok(true, 'authenticated ne može pisati rizike direktno'); end;
  begin perform interno.korisnik(); perform t.ok(false, 'interno');
  exception when insufficient_privilege then perform t.ok(true, 'interno šema nedostupna klijentu'); end;
  begin perform interno.dodaj_profil('x@y.z', 'X Y', 'direktor'); perform t.ok(false, 'dodaj_profil');
  exception when insufficient_privilege then perform t.ok(true, 'authenticated ne može dodavati profile'); end;
end $$;
reset role;
\echo === KRAJ 1. dijela
