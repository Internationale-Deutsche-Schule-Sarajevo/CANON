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
