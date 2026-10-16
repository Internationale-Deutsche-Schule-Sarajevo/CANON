-- =====================================================================
-- IDSS Pedagog — Mjesečni izvještaj :: 004_sigurnost.sql
-- Zaključavanje: nijedna tabela nije dostupna klijentu; samo RPC funkcije.
-- =====================================================================

-- RLS uključen na svim tabelama (bez politika = nijedan red nije vidljiv klijentskim ulogama)
alter table public.profili          enable row level security;
alter table public.postavke         enable row level security;
alter table public.neradni_dani     enable row level security;
alter table public.izvjestaji       enable row level security;
alter table public.izvjestaj_snimci enable row level security;
alter table public.rizici           enable row level security;
alter table public.rizik_stanja     enable row level security;
alter table public.rizik_brojac     enable row level security;
alter table public.preporuke        enable row level security;
alter table public.revizorski_trag  enable row level security;

-- Supabase po zadanom daje anon/authenticated sva prava nad tabelama u public šemi: oduzimamo ih.
revoke all on all tables    in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- Interna šema nikome osim vlasniku
revoke all on all functions in schema interno from public, anon, authenticated;
revoke all on schema interno from public, anon, authenticated;

-- Jedina javna površina: RPC funkcije, samo za prijavljene korisnike
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'idss\_%' loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
