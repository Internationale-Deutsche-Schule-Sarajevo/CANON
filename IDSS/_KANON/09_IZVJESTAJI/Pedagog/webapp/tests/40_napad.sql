\i 00_pomocno.sql
-- Napadni, granični i stres scenariji (uloge, unos, mašina stanja, nepromjenjivost, rokovi)
\echo === A. Kontrola pristupa
do $$ declare r jsonb; iid uuid; f text; p jsonb := '{}'; begin
  perform t.dan('2026-10-02');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  r := public.idss_kreiraj(2026, 9); iid := (r -> 'izvjestaj' ->> 'id')::uuid; perform t.sp('iz9', r -> 'izvjestaj');
  -- tuđi pedagog
  perform t.kao('00000000-0000-0000-0000-0000000000a3');
  perform t.ok(public.idss_ucitaj(iid) -> 'izvjestaj' is null or (public.idss_ucitaj(iid) ->> 'ok')::boolean is not true, 'pedagog2 ne može učitati tuđ izvještaj');
  perform t.ok((public.idss_spremi(iid, 1, t.fix(2026,9), '[]', '[]', gen_random_uuid()) ->> 'kod') = 'ZABRANJENO', 'pedagog2 ne može spremiti tuđ izvještaj');
  perform t.ok((public.idss_podnesi(iid, 1, gen_random_uuid()) ->> 'kod') = 'ZABRANJENO', 'pedagog2 ne može podnijeti tuđ izvještaj');
  perform t.ok((public.idss_trag(iid) ->> 'ok')::boolean is not true, 'pedagog2 ne vidi historiju tuđeg izvještaja');
  perform t.ok(jsonb_array_length(public.idss_arhiva() -> 'izvjestaji') = 0, 'arhiva pedagoga2 ne sadrži tuđe izvještaje');
  -- direktor ne piše nacrt
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  perform t.ok((public.idss_spremi(iid, 1, t.fix(2026,9), '[]', '[]', gen_random_uuid()) ->> 'kod') = 'ZABRANJENO', 'direktor ne može spremati nacrt');
  perform t.ok((public.idss_kreiraj(2026, 8) ->> 'ok')::boolean is not true, 'direktor ne može kreirati izvještaj');
  perform t.ok((public.idss_ucitaj(iid) ->> 'ok')::boolean is not true or public.idss_ucitaj(iid) -> 'izvjestaj' is null or public.idss_ucitaj(iid) ->> 'kod' is not null, 'direktor ne vidi nacrt');
  perform t.ok(jsonb_array_length(public.idss_arhiva() -> 'izvjestaji') = 0, 'direktorova arhiva ne sadrži nacrte');
  -- pedagog ne odlučuje
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  perform t.ok((public.idss_vrati(iid, 1, 'Pokušaj vraćanja bez ovlaštenja', gen_random_uuid()) ->> 'ok')::boolean is not true, 'pedagog ne može vratiti');
  perform t.ok((public.idss_odobri(iid, 1, 5, null, gen_random_uuid()) ->> 'ok')::boolean is not true, 'pedagog ne može odobriti');
  perform t.ok((public.idss_odluka(gen_random_uuid(), 'Odobreno', null) ->> 'ok')::boolean is not true, 'pedagog ne može odlučivati o preporukama');
  -- neaktivan profil
  update public.profili set aktivan = false where id = '00000000-0000-0000-0000-0000000000a3';
  perform t.kao('00000000-0000-0000-0000-0000000000a3');
  perform t.ok((public.idss_profil() ->> 'kod') = 'NEOVLASTEN', 'neaktivan profil: NEOVLASTEN');
  perform t.ok((public.idss_pocetna() ->> 'kod') = 'NEOVLASTEN', 'neaktivan profil: početna zabranjena');
  update public.profili set aktivan = true where id = '00000000-0000-0000-0000-0000000000a3';
  -- korisnik bez profila: sve funkcije
  perform t.kao('00000000-0000-0000-0000-0000000000a4');
  perform t.ok((public.idss_ucitaj(iid) ->> 'kod') = 'NEOVLASTEN', 'stranac: ucitaj');
  perform t.ok((public.idss_arhiva() ->> 'kod') = 'NEOVLASTEN', 'stranac: arhiva');
  perform t.ok((public.idss_trag(iid) ->> 'kod') = 'NEOVLASTEN', 'stranac: trag');
  perform t.ok((public.idss_kreiraj(2026,9) ->> 'kod') = 'NEOVLASTEN', 'stranac: kreiraj');
  perform t.ok((public.idss_spremi(iid,1,'{}','[]','[]',null) ->> 'kod') = 'NEOVLASTEN', 'stranac: spremi');
  perform t.ok((public.idss_podnesi(iid,1,null) ->> 'kod') = 'NEOVLASTEN', 'stranac: podnesi');
  perform t.ok((public.idss_vrati(iid,1,'xxxxxxxxxxxxxxxxxxxx',null) ->> 'kod') = 'NEOVLASTEN', 'stranac: vrati');
  perform t.ok((public.idss_odobri(iid,1,3,null,null) ->> 'kod') = 'NEOVLASTEN', 'stranac: odobri');
  perform t.ok((public.idss_odluka(gen_random_uuid(),'Odobreno',null) ->> 'kod') = 'NEOVLASTEN', 'stranac: odluka');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
end $$;

\echo === B. Nevaljan i zlonamjeran unos
do $$ declare iid uuid := (t.g('iz9') ->> 'id')::uuid; r jsonb; v text; n int := 0; vrij jsonb[] := array[
  'null'::jsonb, '[]'::jsonb, '"tekst"'::jsonb, '123'::jsonb, 'true'::jsonb, '{"ucenici":"x"}'::jsonb, '{"ucenici":[]}'::jsonb, '{"ucenici":null}'::jsonb,
  '{"radionice":{"stavke":"x"}}'::jsonb, '{"radionice":{"stavke":[1,2,3]}}'::jsonb, '{"radionice":{"stavke":[null]}}'::jsonb,
  '{"usavrsavanje":{"stavke":{"a":1}}}'::jsonb, '{"ucenici":{"teme":"Ponašanje"}}'::jsonb, '{"ucenici":{"teme":[1,2]}}'::jsonb,
  '{"ucenici":{"individualni_razgovori":1e308}}'::jsonb, '{"ucenici":{"individualni_razgovori":1.5}}'::jsonb, '{"ucenici":{"individualni_razgovori":"5"}}'::jsonb,
  '{"ucenici":{"individualni_razgovori":true}}'::jsonb, '{"ucenici":{"sazetak":{"a":1}}}'::jsonb, '{"ucenici":{"sazetak":123}}'::jsonb,
  '{"administracija":{"ednevnik":"uredno"}}'::jsonb, '{"administracija":{"ednevnik":"Uredno "}}'::jsonb, '{"administracija":{"kreativni_odrzano":-1}}'::jsonb,
  '{"administracija":{"kreativni_planirano":201}}'::jsonb, '{"radionice":{"stavke":[{"status":"ODRŽANO"}]}}'::jsonb, '{"radionice":{"stavke":[{"qp05_zapis":"da"}]}}'::jsonb,
  '{"__proto__":{"admin":true}}'::jsonb, '{"constructor":{"prototype":{"x":1}}}'::jsonb];
begin
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  foreach v in array array['x'] loop null; end loop;
  for n in 1 .. array_length(vrij, 1) loop
    r := public.idss_spremi(iid, (public.idss_ucitaj(iid) -> 'izvjestaj' ->> 'revizija')::int, vrij[n], '[]', '[]', gen_random_uuid());
    if r ->> 'kod' = 'GRESKA_SERVERA' then raise exception 'NEUSPJEH: unos #% izazvao grešku servera: %', n, vrij[n]; end if;
    if (r ->> 'ok')::boolean and (n between 14 and 25) then raise exception 'NEUSPJEH: nevaljan unos #% prihvaćen: %', n, vrij[n]; end if;
  end loop;
  perform t.ok(true, 'nijedan od ' || array_length(vrij,1) || ' nevaljanih unosa ne izaziva grešku servera');
  -- rizici i preporuke pogrešnog tipa
  foreach v in array array['{}', '"x"', '5', 'null', '[1]', '[null]', '[[]]', '[{"opis":"kratko"}]', '[{"id":"nije-uuid"}]'] loop
    r := public.idss_spremi(iid, (public.idss_ucitaj(iid) -> 'izvjestaj' ->> 'revizija')::int, t.fix(2026,9), v::jsonb, '[]', gen_random_uuid());
    if r ->> 'kod' = 'GRESKA_SERVERA' then raise exception 'NEUSPJEH: rizici % izazvali grešku servera', v; end if;
    r := public.idss_spremi(iid, (public.idss_ucitaj(iid) -> 'izvjestaj' ->> 'revizija')::int, t.fix(2026,9), '[]', v::jsonb, gen_random_uuid());
    if r ->> 'kod' = 'GRESKA_SERVERA' then raise exception 'NEUSPJEH: preporuke % izazvale grešku servera', v; end if;
  end loop;
  perform t.ok(true, 'pogrešni tipovi rizika i preporuka ne ruše server');
  -- revizija null / negativna / ogromna
  perform t.ok((public.idss_spremi(iid, null, t.fix(2026,9), '[]', '[]', gen_random_uuid()) ->> 'kod') = 'SUKOB_VERZIJA', 'revizija null: sukob');
  perform t.ok((public.idss_spremi(iid, -5, t.fix(2026,9), '[]', '[]', gen_random_uuid()) ->> 'kod') = 'SUKOB_VERZIJA', 'revizija negativna: sukob');
  perform t.ok((public.idss_spremi(iid, 2147483647, t.fix(2026,9), '[]', '[]', gen_random_uuid()) ->> 'kod') = 'SUKOB_VERZIJA', 'revizija max int: sukob');
  perform t.ok((public.idss_spremi(null, 1, t.fix(2026,9), '[]', '[]', gen_random_uuid()) ->> 'kod') = 'ZABRANJENO', 'id null: zabranjeno');
  perform t.ok((public.idss_ucitaj(gen_random_uuid()) ->> 'ok')::boolean is not true or public.idss_ucitaj(gen_random_uuid()) -> 'izvjestaj' is null, 'nepostojeći id ne otkriva ništa');
end $$;

\echo === B2. Veličina, dubina, injekcije, znakovi
do $$ declare iid uuid := (t.g('iz9') ->> 'id')::uuid; r jsonb; rev int; big jsonb; s text; d jsonb := '"x"'; i int; broj_prije int; begin
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  rev := (public.idss_ucitaj(iid) -> 'izvjestaj' ->> 'revizija')::int;
  -- ogroman unos (10 MB nepoznatih polja)
  big := jsonb_build_object('ucenici', jsonb_build_object('razno', repeat('A', 10000000)));
  r := public.idss_spremi(iid, rev, big, '[]', '[]', gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean is not true and (r ->> 'kod') <> 'GRESKA_SERVERA', 'ogroman unos odbijen kontrolisano: ' || coalesce(r ->> 'kod', '?'));
  -- ogroman broj rizika
  r := public.idss_spremi(iid, rev, t.fix(2026,9), (select jsonb_agg(jsonb_build_object('kategorija','Akademski','ozbiljnost','Nizak','opis','Opis rizika broj ' || g,'status','Otvoreno')) from generate_series(1,5000) g), '[]', gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean is not true, 'pet hiljada rizika odbijeno');
  -- duboko gniježđenje
  for i in 1 .. 2000 loop d := jsonb_build_array(d); end loop;
  r := public.idss_spremi(iid, rev, jsonb_build_object('ucenici', jsonb_build_object('sazetak', d)), '[]', '[]', gen_random_uuid());
  perform t.ok((r ->> 'kod') <> 'GRESKA_SERVERA', 'duboko gniježđenje ne ruši server');
  -- SQL injekcija u tekstu
  select count(*) into broj_prije from public.izvjestaji;
  r := public.idss_spremi(iid, rev, jsonb_set(t.fix(2026,9), '{ucenici,sazetak}', to_jsonb($q$'); drop table public.izvjestaji; -- Većina razgovora odnosila se na adaptaciju učenika prvog razreda i organizaciju učenja.$q$::text)), '[]', '[]', gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean and (select count(*) from public.izvjestaji) = broj_prije, 'SQL injekcija pohranjena kao običan tekst, tabele netaknute');
  -- HTML/script se čuva doslovno (izlaz se uvijek ispisuje kao tekst)
  r := public.idss_spremi(iid, (r -> 'izvjestaj' ->> 'revizija')::int, jsonb_set(t.fix(2026,9), '{ucenici,sazetak}', to_jsonb('<img src=x onerror=alert(1)><script>alert(2)</script> Većina razgovora odnosila se na adaptaciju učenika prvog razreda.'::text)), '[]', '[]', gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean and (r -> 'izvjestaj' -> 'sadrzaj' -> 'ucenici' ->> 'sazetak') like '<img%', 'HTML se čuva doslovno, ne interpretira');
  -- kontrolni znakovi i emoji, dužina u znakovima
  r := public.idss_spremi(iid, (r -> 'izvjestaj' ->> 'revizija')::int, jsonb_set(t.fix(2026,9), '{ucenici,sazetak}', to_jsonb(E'Kontrola\u0007zvono Većina razgovora odnosila se na adaptaciju učenika prvog razreda i organizaciju.'::text)), '[]', '[]', gen_random_uuid());
  perform t.ok((r ->> 'kod') = 'VALIDACIJA', 'kontrolni znak odbijen');
  r := public.idss_spremi(iid, (public.idss_ucitaj(iid) -> 'izvjestaj' ->> 'revizija')::int, jsonb_set(t.fix(2026,9), '{ucenici,sazetak}', to_jsonb(repeat('😀', 2500)::text)), '[]', '[]', gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean, '2500 emoji = 2500 znakova (ne bajtova) prihvaćeno');
  r := public.idss_spremi(iid, (public.idss_ucitaj(iid) -> 'izvjestaj' ->> 'revizija')::int, jsonb_set(t.fix(2026,9), '{ucenici,sazetak}', to_jsonb(repeat('😀', 2501)::text)), '[]', '[]', gen_random_uuid());
  perform t.ok((r ->> 'kod') = 'VALIDACIJA', '2501 emoji odbijeno');
  -- nevaljani datumi
  foreach s in array array['2026-02-30','2026-13-01','0000-00-00','2026-9-1','26-09-01','2026-09-01T10:00','99999-01-01',' 2026-09-10','2026-09-31'] loop
    r := public.idss_spremi(iid, (public.idss_ucitaj(iid) -> 'izvjestaj' ->> 'revizija')::int, jsonb_set(t.fix(2026,9), '{usavrsavanje,stavke,0,datum}', to_jsonb(s)), '[]', '[]', gen_random_uuid());
    if (r ->> 'ok')::boolean or r ->> 'kod' = 'GRESKA_SERVERA' then raise exception 'NEUSPJEH: datum "%" nije pravilno odbijen (%)', s, r ->> 'kod'; end if;
  end loop;
  perform t.ok(true, 'nevaljani datumi odbijeni');
end $$;

\echo === C. Mašina stanja: nedozvoljeni prelazi
do $$ declare iid uuid := (t.g('iz9') ->> 'id')::uuid; r jsonb; rev int; z uuid := gen_random_uuid(); pid uuid; begin
  perform t.dan('2026-10-02'); perform t.kao('00000000-0000-0000-0000-0000000000a1');
  rev := (public.idss_ucitaj(iid) -> 'izvjestaj' ->> 'revizija')::int;
  -- priprema: potpun nacrt sa jednim rizikom i jednom preporukom
  r := public.idss_spremi(iid, rev, t.fix(2026,9),
    '[{"kategorija":"Akademski","ozbiljnost":"Visok","opis":"Pad uspjeha u matematici u petom razredu","mjera":"Dodatna nastava i praćenje napretka","rok":"2026-10-30","status":"Otvoreno"}]',
    '[{"naslov":"Dodatni sat podrške","obrazlozenje":"Potreban je dodatni sat sedmično zbog slabijih rezultata.","utjecaj":"Potreban budžet"}]', gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean, 'priprema nacrta: ' || coalesce(r ->> 'poruka','ok'));
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  perform t.ok((public.idss_odobri(iid, rev, 3, null, gen_random_uuid()) ->> 'ok')::boolean is not true, 'nacrt se ne može odobriti');
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  perform t.ok((public.idss_vrati(iid, rev, 'Nedovoljno detalja u opisu radionica.', gen_random_uuid()) ->> 'ok')::boolean is not true, 'nacrt se ne može vratiti');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  r := public.idss_podnesi(iid, rev, z);
  perform t.ok((r ->> 'ok')::boolean, 'podnošenje: ' || coalesce(r ->> 'poruka','ok'));
  rev := (r -> 'izvjestaj' ->> 'revizija')::int; pid := (r -> 'izvjestaj' -> 'preporuke' -> 0 ->> 'id')::uuid;
  perform t.ok((public.idss_podnesi(iid, rev, gen_random_uuid()) ->> 'kod') = 'POGRESNO_STANJE', 'dvostruko podnošenje (drugi zahtjev): POGRESNO_STANJE');
  perform t.ok((public.idss_podnesi(iid, rev - 1, z) ->> 'ponovljeno')::boolean, 'isti zahtjev: idempotentno');
  perform t.ok((public.idss_spremi(iid, rev, t.fix(2026,9), '[]', '[]', gen_random_uuid()) ->> 'kod') = 'POGRESNO_STANJE', 'podnesen izvještaj se ne može mijenjati');
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  perform t.ok((public.idss_odobri(iid, rev, 6, null, gen_random_uuid()) ->> 'kod') = 'VALIDACIJA', 'ocjena 6 odbijena');
  perform t.ok((public.idss_odobri(iid, rev, -1, null, gen_random_uuid()) ->> 'kod') = 'VALIDACIJA', 'ocjena -1 odbijena');
  perform t.ok((public.idss_odobri(iid, rev, null, null, gen_random_uuid()) ->> 'kod') = 'VALIDACIJA', 'ocjena null odbijena');
  perform t.ok((public.idss_odobri(iid, rev, 4, null, gen_random_uuid()) ->> 'kod') = 'PREPORUKE_BEZ_ODLUKE', 'odobrenje bez odluke o preporuci blokirano');
  perform t.ok((public.idss_odluka(pid, 'Na čekanju', null) ->> 'kod') = 'VALIDACIJA', 'odluka "Na čekanju" nije odluka');
  perform t.ok((public.idss_odluka(pid, 'Odbijeno', null) ->> 'kod') = 'VALIDACIJA', 'odbijanje bez komentara odbijeno');
  perform t.ok((public.idss_odluka(pid, 'Nešto', 'x') ->> 'kod') = 'VALIDACIJA', 'nepoznata odluka odbijena');
  perform t.ok((public.idss_odluka(pid, 'Potrebna dorada', repeat('x', 1001)) ->> 'kod') = 'VALIDACIJA', 'predugačak komentar odbijen');
  r := public.idss_odluka(pid, 'Potrebna dorada', 'Navedite izvor podataka o rezultatima.');
  perform t.ok((r ->> 'ok')::boolean, 'dorada preporuke'); rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  perform t.ok((public.idss_odobri(iid, rev, 4, null, gen_random_uuid()) ->> 'kod') = 'PREPORUKE_TRAZE_DORADU', 'odobrenje uz preporuku u doradi blokirano');
  perform t.ok((public.idss_vrati(iid, rev, 'kratko', gen_random_uuid()) ->> 'kod') = 'VALIDACIJA', 'prekratko obrazloženje vraćanja odbijeno');
  perform t.ok((public.idss_vrati(iid, rev, repeat('x', 2001), gen_random_uuid()) ->> 'kod') = 'VALIDACIJA', 'predugo obrazloženje vraćanja odbijeno');
  r := public.idss_vrati(iid, rev, 'Navedite izvor podataka i dopunite opis radionica.', gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean and r -> 'izvjestaj' ->> 'status' = 'vracen', 'vraćeno na dopunu'); rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  perform t.ok((public.idss_vrati(iid, rev, 'Ponovo vraćanje istog izvještaja', gen_random_uuid()) ->> 'kod') = 'POGRESNO_STANJE', 'vraćen izvještaj se ne vraća ponovo');
  perform t.ok((public.idss_odobri(iid, rev, 4, null, gen_random_uuid()) ->> 'kod') = 'POGRESNO_STANJE', 'vraćen izvještaj se ne odobrava');
  perform t.ok((public.idss_odluka(pid, 'Odobreno', null) ->> 'kod') = 'POGRESNO_STANJE', 'odluka dok je izvještaj vraćen: zabranjena');
  perform t.sp('rev9', to_jsonb(rev)); perform t.sp('pid9', to_jsonb(pid::text));
end $$;

\echo === D. Dopuna, odobrenje, zaključavanje
do $$ declare iid uuid := (t.g('iz9') ->> 'id')::uuid; r jsonb; rev int := t.g('rev9')::text::int; pid uuid := (t.g('pid9') #>> '{}')::uuid; kas int; begin
  perform t.dan('2026-10-08'); perform t.kao('00000000-0000-0000-0000-0000000000a1');
  r := public.idss_ucitaj(iid); perform t.ok(r -> 'izvjestaj' ->> 'status' = 'vracen' and (r -> 'izvjestaj' ->> 'moze_urediti')::boolean, 'pedagog može dopuniti vraćen izvještaj');
  r := public.idss_podnesi(iid, rev, gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean, 'dopuna podnesena: ' || coalesce(r ->> 'poruka', 'ok'));
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  perform t.ok((r -> 'izvjestaj' ->> 'ciklus')::int = 2, 'ciklus = 2');
  perform t.kao('00000000-0000-0000-0000-0000000000a2');
  r := public.idss_odluka(pid, 'Odobreno', 'Odobreno za prvo polugodište.'); perform t.ok((r ->> 'ok')::boolean, 'preporuka odobrena');
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  r := public.idss_odobri(iid, rev, 5, 'Odličan izvještaj.', gen_random_uuid());
  perform t.ok((r ->> 'ok')::boolean and r -> 'izvjestaj' ->> 'status' = 'odobren', 'odobreno');
  perform t.ok((r -> 'izvjestaj' -> 'bodovi' ->> 'konacno')::boolean and (r -> 'izvjestaj' -> 'bodovi' ->> 'ukupno')::int = (r -> 'izvjestaj' -> 'bodovi' ->> 'zbroj')::int + 100, 'ocjena 5 = +100 bodova');
  perform t.ok((r -> 'izvjestaj' -> 'bodovi' ->> 'ukupno')::int <= 1000, 'ukupno <= 1000');
  rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  perform t.ok((public.idss_odobri(iid, rev, 1, null, gen_random_uuid()) ->> 'kod') = 'POGRESNO_STANJE', 'odobren se ne može ponovo odobriti');
  perform t.ok((public.idss_vrati(iid, rev, 'Pokušaj vraćanja odobrenog izvještaja', gen_random_uuid()) ->> 'kod') = 'POGRESNO_STANJE', 'odobren se ne može vratiti');
  perform t.ok((public.idss_odluka(pid, 'Odbijeno', 'Promjena odluke nakon odobrenja') ->> 'kod') = 'POGRESNO_STANJE', 'odluka nakon odobrenja zabranjena');
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  perform t.ok((public.idss_spremi(iid, rev, t.fix(2026,9), '[]', '[]', gen_random_uuid()) ->> 'kod') = 'POGRESNO_STANJE', 'odobren se ne mijenja');
  -- direktni pokušaji izmjene kao vlasnik baze
  begin update public.izvjestaji set sadrzaj = '{}' where id = iid; perform t.ok(false, 'update odobrenog'); exception when insufficient_privilege then perform t.ok(true, 'DB: update odobrenog zabranjen'); end;
  begin delete from public.izvjestaji where id = iid; perform t.ok(false, 'delete odobrenog'); exception when insufficient_privilege then perform t.ok(true, 'DB: delete odobrenog zabranjen'); end;
  begin update public.revizorski_trag set akcija = 'x'; perform t.ok(false, 'update traga'); exception when insufficient_privilege then perform t.ok(true, 'DB: izmjena revizorskog traga zabranjena'); end;
  begin delete from public.revizorski_trag; perform t.ok(false, 'delete traga'); exception when insufficient_privilege then perform t.ok(true, 'DB: brisanje traga zabranjeno'); end;
  begin truncate public.revizorski_trag; perform t.ok(false, 'truncate traga'); exception when insufficient_privilege then perform t.ok(true, 'DB: truncate traga zabranjen'); end;
  begin update public.izvjestaj_snimci set sadrzaj = '{}'; perform t.ok(false, 'update snimka'); exception when insufficient_privilege then perform t.ok(true, 'DB: izmjena snimka zabranjena'); end;
  perform t.ok(not exists (select 1 from public.revizorski_trag where sazetak::text ~* 'Većina|sazetak|Odličan'), 'revizorski trag ne sadrži tekst izvještaja ni napomena');
end $$;

\echo === E. Rokovi i kalendar
do $$ declare r jsonb; begin
  perform t.kao('00000000-0000-0000-0000-0000000000a1');
  -- rok 5. u mjesecu pada na subotu/nedjelju/praznik
  perform t.ok(interno.rok_podnosenja(2026, 10) = date '2026-11-05', '10/2026 -> 05.11.2026 (četvrtak)');
  perform t.ok(interno.rok_podnosenja(2026, 12) = date '2027-01-05', '12/2026 -> 05.01.2027 (utorak)');
  perform t.ok(interno.rok_podnosenja(2026, 7) = date '2026-08-05', '07/2026 -> 05.08.2026 (srijeda)');
  perform t.ok(interno.rok_podnosenja(2026, 1) = date '2026-02-05', '01/2026 -> 05.02.2026 (četvrtak)');
  perform t.ok(interno.rok_podnosenja(2026, 5) = date '2026-06-05', '05/2026 -> 05.06.2026 (petak)');
  perform t.ok(interno.rok_podnosenja(2026, 2) = date '2026-03-05', '02/2026 -> 05.03.2026 (četvrtak)');
  perform t.ok(interno.rok_podnosenja(2026, 9) = date '2026-10-06', '09/2026 -> 06.10. (05.10. neradni)');
  perform t.ok(interno.rok_podnosenja(2026, 3) = date '2026-04-06', '03/2026 -> ponedjeljak 06.04. (05.04. nedjelja)');
  perform t.ok(interno.rok_podnosenja(2026, 6) = date '2026-07-06', '06/2026 -> ponedjeljak 06.07. (05.07. nedjelja)');
  perform t.ok(interno.rok_podnosenja(2026, 4) = date '2026-05-05', '04/2026 -> 05.05.2026 (utorak)');
  perform t.ok(interno.rok_podnosenja(2026, 11) = date '2026-12-07', '11/2026 -> ponedjeljak 07.12. (05.12. subota)');
  insert into public.neradni_dani values ('2026-11-05','Test'), ('2026-11-06','Test2');
  perform t.ok(interno.rok_podnosenja(2026, 10) = date '2026-11-09', 'dva uzastopna neradna dana + vikend -> 09.11.');
  perform t.ok(interno.dodaj_radne_dane(date '2026-11-04', 3) = date '2026-11-11', '3 radna dana preko praznika i vikenda');
  perform t.ok(interno.radnih_dana_izmedju(date '2026-11-04', date '2026-11-11') = 3, 'radni dani izmedju: 3');
  perform t.ok(interno.radnih_dana_izmedju(date '2026-11-11', date '2026-11-04') = 0, 'obrnut interval = 0');
  delete from public.neradni_dani where naziv like 'Test%' and datum <> '2026-10-05';
  perform t.ok(interno.period_broj(2026,12) + 1 = interno.period_broj(2027,1), 'decembar -> januar uzastopni');
  perform t.ok(interno.skolska_godina(2026,8) = 2025 and interno.skolska_godina(2026,9) = 2026, 'školska godina počinje u septembru');
  perform t.ok(interno.kraj_mjeseca(2028,2) = date '2028-02-29' and interno.kraj_mjeseca(2026,2) = date '2026-02-28', 'prestupna godina');
  -- kreiranje van granica
  perform t.dan('2026-10-02');
  foreach r in array array['{"g":1900,"m":9}','{"g":2026,"m":0}','{"g":2026,"m":13}','{"g":2100000,"m":1}','{"g":2030,"m":1}','{"g":2026,"m":10}','{"g":2026,"m":8}'] :: jsonb[] loop
    if (public.idss_kreiraj((r ->> 'g')::int, (r ->> 'm')::int) ->> 'kod') = 'GRESKA_SERVERA' then raise exception 'NEUSPJEH: kreiraj % izaziva grešku servera', r; end if;
  end loop;
  perform t.ok(true, 'kreiranje sa graničnim vrijednostima ne ruši server');
  perform t.ok((public.idss_kreiraj(2030, 1) ->> 'ok')::boolean is not true, 'budući period (2030) se ne može kreirati');
  perform t.ok((public.idss_kreiraj(2026, 11) ->> 'ok')::boolean is not true, 'sljedeći mjesec se ne može kreirati unaprijed');
  perform t.ok((public.idss_kreiraj(2025, 1) ->> 'ok')::boolean is not true, 'period prije početka rada pedagoga se ne može kreirati');
end $$;

\echo === F. Revizorski trag ne raste neograničeno
do $$ declare iid uuid; r jsonb; rev int; n0 int; n1 int; i int; begin
  perform t.dan('2026-11-02'); perform t.kao('00000000-0000-0000-0000-0000000000a3');
  r := public.idss_kreiraj(2026, 10); iid := (r -> 'izvjestaj' ->> 'id')::uuid; rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  select count(*) into n0 from public.revizorski_trag where izvjestaj_id = iid;
  for i in 1 .. 60 loop
    r := public.idss_spremi(iid, rev, t.fix(2026,10), '[]', '[]', gen_random_uuid()); rev := (r -> 'izvjestaj' ->> 'revizija')::int;
  end loop;
  select count(*) into n1 from public.revizorski_trag where izvjestaj_id = iid;
  perform t.ok(n1 - n0 <= 8, 'trag ne bilježi svako autosnimanje: ' || (n1 - n0) || ' zapisa za 60 snimanja');
end $$;
\echo === KRAJ napadnih testova
