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
