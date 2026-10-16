\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

-- Pomoćnici: kreiraj period (ako treba), primijeni izmjene prenesenih rizika, dodaj nove, spremi
create or replace function t.mj(g int, m int, izmjene jsonb default '[]', novi jsonb default '[]') returns jsonb
language plpgsql as $$
declare r jsonb; riz jsonb := '[]'; x jsonb; iz jsonb; z jsonb;
begin
  r := public.idss_kreiraj(g, m);
  if not (r ->> 'ok')::boolean then return r; end if;
  iz := r -> 'izvjestaj';
  for x in select e from jsonb_array_elements(iz -> 'rizici') e loop
    z := (select coalesce(jsonb_object_agg(k, v), '{}') from (select key as k, value as v from jsonb_each(x)) q where k in ('id','kategorija','ozbiljnost','opis','mjera','rok','status'));
    select z || coalesce((select i - 'kod' from jsonb_array_elements(izmjene) i where i ->> 'kod' = x ->> 'kod'), '{}') into z;
    riz := riz || jsonb_build_array(z);
  end loop;
  riz := riz || novi;
  return public.idss_spremi((iz ->> 'id')::uuid, (iz ->> 'revizija')::int, t.fix(g, m), riz, iz -> 'preporuke', gen_random_uuid());
end $$;
create or replace function t.pod(g int, m int) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  r := public.idss_ucitaj(null, g, m);
  return public.idss_podnesi((r -> 'izvjestaj' ->> 'id')::uuid, (r -> 'izvjestaj' ->> 'revizija')::int);
end $$;
create or replace function t.bod(r jsonb, kod text) returns int language sql as $$
  select (x ->> 'bodovi')::int from jsonb_array_elements(r -> 'izvjestaj' -> 'bodovi' -> 'stavke') x where x ->> 'kod' = kod $$;

\echo === 10. Preneseni rizici (Okt 2026) i KPI-03
do $$ declare r jsonb; k jsonb; riz jsonb; r1 jsonb; begin
  perform t.dan('2026-11-02');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  r := public.idss_kreiraj(2026, 10);
  perform t.ok((r ->> 'ok')::boolean, 'nacrt za 10/2026 kreiran');
  perform t.ok(jsonb_array_length(r -> 'izvjestaj' -> 'rizici') = 1 and (r -> 'izvjestaj' -> 'rizici' -> 0 ->> 'prenesen')::boolean, 'otvoreni rizik iz septembra automatski prenesen');
  perform t.ok((r -> 'izvjestaj' -> 'kpi' -> 'kpi03' ->> 'preneseno_3b') = '1' and (r -> 'izvjestaj' -> 'kpi' -> 'kpi03' ->> 'aktivno_3c') = '1', 'KPI: 3B=1, 3C=1 odmah po kreiranju');
  perform t.sp('iz10', r -> 'izvjestaj');
  -- izostavljanje prenesenog rizika
  k := public.idss_spremi((t.g('iz10') ->> 'id')::uuid, (t.g('iz10') ->> 'revizija')::int, t.fix(2026, 10), '[]', '[]', gen_random_uuid());
  perform t.ok((k ->> 'kod') = 'VALIDACIJA' and k::text like '%PRENESENI_RIZIK_NEDOSTAJE%', 'preneseni rizik se ne može izostaviti');
  -- promjena opisa prenesenog rizika
  riz := jsonb_set(t.g('iz10') -> 'rizici', '{0,opis}', '"Potpuno drugačiji opis rizika koji je izmijenjen"');
  k := public.idss_spremi((t.g('iz10') ->> 'id')::uuid, (t.g('iz10') ->> 'revizija')::int, t.fix(2026, 10), riz, '[]', gen_random_uuid());
  perform t.ok(k::text like '%NEPROMJENJIVO%', 'identitet prenesenog rizika (opis) je nepromjenjiv');
  -- ponovno navođenje riješenog rizika
  riz := (t.g('iz10') -> 'rizici') || jsonb_build_array(jsonb_build_object('id', (select id from public.rizici where opis like 'Učestali sukobi%'), 'kategorija','Pedagoški / Ponašanje','ozbiljnost','Srednji',
            'opis','Učestali sukobi na odmorima u petom razredu','mjera','Radionica o rješavanju sukoba i dežurstva','rok','2026-09-25','status','Otvoreno'));
  k := public.idss_spremi((t.g('iz10') ->> 'id')::uuid, (t.g('iz10') ->> 'revizija')::int, t.fix(2026, 10), riz, '[]', gen_random_uuid());
  perform t.ok(k::text like '%RIZIK_RIJESEN%', 'riješen rizik se ne može ponovo otvoriti u novom periodu');
  -- rješavanje R1 i novi rizik R3 sa probijenim rokom
  k := t.mj(2026, 10, '[{"kod":"x"}]'::jsonb, '[]');
  r1 := (t.g('iz10') -> 'rizici' -> 0);
  k := t.mj(2026, 10, jsonb_build_array(r1 || jsonb_build_object('status', 'Riješeno')) , jsonb_build_array(
        jsonb_build_object('kategorija','Organizacijski','ozbiljnost','Srednji','opis','Nedovoljno prostora za grupni rad u popodnevnim satima','mjera','Prerasporediti učionice i dogovoriti raspored sa vodstvom','rok','2026-10-15','status','Otvoreno')));
  perform t.ok((k ->> 'ok')::boolean, 'Okt: R1 riješen + novi R3 spremljeni: ' || coalesce(k ->> 'poruka', ''));
  perform t.sp('iz10', k -> 'izvjestaj');
  k := t.g('iz10') -> 'kpi' -> 'kpi03';
  perform t.ok((k ->> 'rijeseno_3a') = '1' and (k ->> 'preneseno_3b') = '1' and (k ->> 'aktivno_3c') = '1' and (k ->> 'kasne_mjere') = '1' and (k ->> 'novi') = '1',
               'KPI-03 Okt: 3A=1 (riješen), 3B=1 (preneseno), 3C=1 (aktivan), kasne=1, novi=1');
  perform t.ok((k -> 'po_ozbiljnosti' ->> 'Srednji') = '1' and (k -> 'po_ozbiljnosti' ->> 'Visok') = '0', '3C po ozbiljnosti: Srednji=1, Visok=0');
  k := public.idss_podnesi((t.g('iz10') ->> 'id')::uuid, (t.g('iz10') ->> 'revizija')::int);
  perform t.ok((k ->> 'ok')::boolean, 'Okt podnesen: ' || coalesce(k ->> 'poruka', ''));
  perform t.ok(t.bod(k, 'E1') = 30, 'E1 = 30 (1 od 2 rizika riješen)');
  perform t.ok(t.bod(k, 'E2') = 0, 'E2 = 0 (jedini aktivni rizik ima probijen rok)');
  perform t.ok(t.bod(k, 'S4') = 25, 'S4 = 25 (svi rizici imaju mjeru i rok)');
end $$;

\echo === 11. Kašnjenje, rokovi i pregled direktora
do $$ declare r jsonb; ka jsonb; begin
  perform t.dan('2026-12-09');   -- rok za novembar: 5.12. je subota -> ponedjeljak 7.12.
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  r := public.idss_pocetna();
  select x into ka from jsonb_array_elements(r -> 'kasne') x where x ->> 'pedagog' = 'Test Pedagog' and (x ->> 'mjesec')::int = 11;
  perform t.ok(ka is not null and ka ->> 'rok' = '2026-12-07' and (ka ->> 'kasni_radnih_dana')::int = 2, 'direktor vidi kašnjenje za 11/2026: rok 07.12., kasni 2 radna dana');
  perform t.ok(r::text not like '%Učenici su izradili%', 'pregled direktora ne curi sadržaj nacrta');
  perform t.kao('00000000-0000-0000-0000-0000000000a3');
  r := public.idss_kreiraj(2026, 9);
  perform t.ok((r ->> 'ok')::boolean, 'Drugi pedagog kreirao 09/2026');
  perform t.ok((public.idss_kreiraj(2026, 10) ->> 'kod') = 'PRETHODNI_NACRT', 'kronologija: novi mjesec nije moguć dok je prethodni nacrt');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  r := t.mj(2026, 11, '[]', '[]');
  perform t.ok((r ->> 'ok')::boolean, 'Nov: nacrt spremljen (preneseni R3 prisutan)');
  r := t.pod(2026, 11);
  perform t.ok((r ->> 'ok')::boolean, 'Nov podnesen');
  perform t.ok(not (r -> 'izvjestaj' ->> 'na_vrijeme')::boolean and (r -> 'izvjestaj' ->> 'ciklus')::int = 1, 'Nov: na_vrijeme = false');
  perform t.ok(t.bod(r, 'B1') = 100, 'B1 = 100 (kašnjenje 2 radna dana: 200 - 2*50)');
  perform t.ok((r -> 'izvjestaj' ->> 'kasnjenje_prvo') = '2', 'kasnjenje_prvo = 2');
end $$;

\echo === 12. Prelazak preko granice godine (Dec -> Jan)
do $$ declare r jsonb; k jsonb; nrz jsonb; begin
  perform t.dan('2027-01-04');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  r := t.mj(2026, 12, jsonb_build_array(jsonb_build_object('kod', (select kod from public.rizici where opis like 'Nedovoljno prostora%'), 'status', 'U toku', 'mjera', 'Prerasporedjivanje učionica je u toku uz dogovor sa vodstvom', 'rok', '2027-01-31')), '[]');
  perform t.ok((r ->> 'ok')::boolean, 'Dec spremljen: ' || coalesce(r ->> 'poruka', ''));
  r := t.pod(2026, 12);
  perform t.ok((r ->> 'ok')::boolean and (r -> 'izvjestaj' ->> 'na_vrijeme')::boolean, 'Dec podnesen u roku (rok 05.01.2027.)');
  perform t.ok((r -> 'izvjestaj' -> 'kpi' -> 'kpi03' ->> 'preneseno_3b') = '1' and (r -> 'izvjestaj' -> 'kpi' -> 'kpi03' ->> 'aktivno_3c') = '1', 'Dec: 3B=1, 3C=1');
  perform t.dan('2027-02-03');
  r := public.idss_kreiraj(2027, 1);
  perform t.ok((r ->> 'ok')::boolean, 'Jan 2027 kreiran');
  perform t.ok((r -> 'izvjestaj' -> 'kpi' -> 'kpi03' ->> 'preneseno_3b') = '1' and (r -> 'izvjestaj' -> 'rizici' -> 0 ->> 'prenesen')::boolean,
               'rizik prenesen preko granice godine (Dec 2026 -> Jan 2027): 3B=1');
  perform t.ok((r -> 'izvjestaj' -> 'rizici' -> 0 ->> 'status') = 'U toku', 'prenesen sa posljednjim stanjem (U toku)');
  r := t.mj(2027, 1, jsonb_build_array(jsonb_build_object('kod', (select kod from public.rizici where opis like 'Nedovoljno prostora%'), 'status', 'Riješeno')),
        jsonb_build_array(jsonb_build_object('kategorija','Sigurnosni / Zaštita djece','ozbiljnost','Kritičan','opis','Nedostaje dežurstvo na stepeništu u pauzi','mjera','Uvesti dežurstvo nastavnika odmah','rok','2027-02-10','status','Otvoreno')));
  perform t.ok((r ->> 'ok')::boolean, 'Jan spremljen');
  perform t.ok((select kod from public.rizici where opis like 'Nedostaje dežurstvo%') = 'RSK-2027-001', 'brojač rizika po godini: RSK-2027-001');
  perform t.ok((r -> 'izvjestaj' -> 'kpi' -> 'kpi03' ->> 'rijeseno_3a') = '1' and (r -> 'izvjestaj' -> 'kpi' -> 'kpi03' ->> 'aktivno_3c') = '1', 'Jan: 3A=1, 3C=1');
  r := t.pod(2027, 1);
  perform t.ok((r ->> 'ok')::boolean, 'Jan podnesen');
end $$;

\echo === 13. Kasniji period štiti dosljednost
do $$ declare r jsonb; id10 uuid; d jsonb; rid uuid; riz jsonb; k jsonb; begin
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  r := public.idss_ucitaj(null, null, null);
  d := (select x from jsonb_array_elements(public.idss_pocetna() -> 'izvjestaji') x where (x ->> 'godina')::int = 2026 and (x ->> 'mjesec')::int = 12);
  r := public.idss_ucitaj((d ->> 'id')::uuid);
  r := public.idss_vrati((d ->> 'id')::uuid, (r -> 'izvjestaj' ->> 'revizija')::int, 'Dopunite mjeru za rizik prostora.');
  perform t.ok((r ->> 'ok')::boolean, 'direktor vratio Dec na dopunu');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  r := public.idss_ucitaj((d ->> 'id')::uuid);
  riz := jsonb_set(r -> 'izvjestaj' -> 'rizici', '{0,status}', '"Riješeno"');
  k := public.idss_spremi((d ->> 'id')::uuid, (r -> 'izvjestaj' ->> 'revizija')::int, r -> 'izvjestaj' -> 'sadrzaj', riz, '[]', gen_random_uuid());
  perform t.ok(k::text like '%KASNIJI_PERIOD%', 'rizik se ne može zatvoriti u ranijem izvještaju ako postoji u kasnijem');
  riz := '[]';
  k := public.idss_spremi((d ->> 'id')::uuid, (r -> 'izvjestaj' ->> 'revizija')::int, r -> 'izvjestaj' -> 'sadrzaj', riz, '[]', gen_random_uuid());
  perform t.ok(k::text like '%PRENESENI_RIZIK_NEDOSTAJE%' or k::text like '%KASNIJI_PERIOD%', 'uklanjanje rizika iz ranijeg izvještaja odbijeno');
end $$;

\echo === 14. Početna: sezona, rang, značke; pregled rizika direktora
do $$ declare r jsonb; begin
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  r := public.idss_pocetna();
  perform t.ok((r -> 'sezona' ->> 'broj_odobrenih') = '1', 'sezona: jedan odobren izvještaj (09/2026)');
  perform t.ok((r -> 'sezona' ->> 'rang') = interno.rang((r -> 'sezona' ->> 'prosjek')::int), 'rang = funkcija prosjeka (' || (r -> 'sezona' ->> 'rang') || ', ' || (r -> 'sezona' ->> 'prosjek') || ')');
  perform t.ok((select (x ->> 'stecena')::boolean from jsonb_array_elements(r -> 'znacke') x where x ->> 'kod' = 'RIZICI_ZATVORENI'), 'značka „Zatvoren rizik“ stečena');
  perform t.ok((select (x ->> 'stecena')::boolean from jsonb_array_elements(r -> 'znacke') x where x ->> 'kod' = 'PUNE_POSJETE'), 'značka „Puni plan posjeta“ stečena');
  perform t.ok((select not (x ->> 'stecena')::boolean from jsonb_array_elements(r -> 'znacke') x where x ->> 'kod' = 'SERIJA_3'), 'serija od tri nije stečena (Nov je kasnio)');
  perform t.ok(jsonb_array_length(r -> 'periodi') = 6, 'prikazano 6 perioda (09/2026–02/2027)');
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  r := public.idss_pocetna();
  perform t.ok(jsonb_array_length(r -> 'rizici') = 1 and (r -> 'rizici' -> 0 ->> 'ozbiljnost') = 'Kritičan', 'direktor: jedan aktivan (kritičan) rizik; riješeni nisu prikazani');
  perform t.ok((r -> 'rizici_po_ozbiljnosti' ->> 'Kritičan') = '1', 'brojač kritičnih rizika = 1');
end $$;
\echo === KRAJ 2. dijela
