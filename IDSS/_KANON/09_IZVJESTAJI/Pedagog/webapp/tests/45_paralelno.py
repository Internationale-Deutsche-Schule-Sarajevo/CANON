#!/usr/bin/env python3
"""Paralelni zahtjevi nad pravom bazom: pri istoj reviziji smije uspjeti samo jedan; nema duplikata ni grešaka servera."""
import json, subprocess, concurrent.futures as cf, os, tempfile, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
subprocess.run(['./reset.sh'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
TMP = tempfile.mkdtemp(); os.chmod(TMP, 0o755)
def psql(sql, tag):
    f = os.path.join(TMP, tag + '.sql'); open(f, 'w').write(sql); os.chmod(f, 0o644)
    r = subprocess.run(['su', 'postgres', '-c', f'psql -qAt -d idss_test -v ON_ERROR_STOP=1 -f {f}'], capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()
fx = json.dumps(json.load(open('fixtures/potpun.json'), ), ensure_ascii=False).replace('2026-09-', '2026-10-').replace("'", "''")
psql("""create schema if not exists t;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','p@t'),('00000000-0000-0000-0000-0000000000a2','d@t');
select interno.dodaj_profil('p@t','Test Pedagog','pedagog','2026-09-01'); select interno.dodaj_profil('d@t','Test Direktor','direktor','2026-09-01');""", 'setup')
P = "set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1'; set idss.danas='2026-11-02';"
D = "set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a2'; set idss.danas='2026-11-02';"
# test okvir: idss.danas čita samo testni interno.danas(); ugradi ga
psql("""create or replace function interno.danas() returns date language sql stable set search_path = '' as $$
 select coalesce(nullif(current_setting('idss.danas', true), '')::date, (now() at time zone 'Europe/Sarajevo')::date) $$;""", 'sat')
ok = fail = 0
def chk(naziv, dobijeno, ocekivano):
    global ok, fail
    if dobijeno == ocekivano: ok += 1; print('PASS ', naziv)
    else: fail += 1; print('NEUSPJEH', naziv, f'(očekivano {ocekivano}, dobijeno {dobijeno})')
def paralelno(n, sql_fn, prefix):
    with cf.ThreadPoolExecutor(n) as ex: return list(ex.map(lambda i: psql(sql_fn(i), f'{prefix}{i}'), range(n)))
r = paralelno(8, lambda i: P + "select public.idss_kreiraj(2026,10)->>'ok';", 'kr')
chk('paralelno kreiranje: svi uspješni (idempotentno)', sum(x.endswith('true') for x in r), 8)
chk('paralelno kreiranje: tačno jedan red', psql('select count(*) from public.izvjestaji', 'c1').split()[-1], '1')
iid = psql('select id from public.izvjestaji', 'id').split()[-1]
r = paralelno(10, lambda i: P + f"select coalesce(public.idss_spremi('{iid}',1,'{fx}'::jsonb,'[]','[]',gen_random_uuid())->>'kod','OK');", 'sp')
last = [x.split()[-1] for x in r]
chk('paralelno spremanje: tačno jedan uspjeh', last.count('OK'), 1)
chk('paralelno spremanje: ostali SUKOB_VERZIJA', last.count('SUKOB_VERZIJA'), 9)
chk('paralelno spremanje: bez grešaka servera', sum('GRESKA' in x or 'ERROR' in x for x in r), 0)
chk('revizija porasla tačno za 1', psql('select revizija from public.izvjestaji', 'rv').split()[-1], '2')
r = paralelno(8, lambda i: P + f"select coalesce(public.idss_podnesi('{iid}',2,gen_random_uuid())->>'kod','OK');", 'pd')
last = [x.split()[-1] for x in r]
chk('paralelno podnošenje: tačno jedan uspjeh', last.count('OK'), 1)
chk('paralelno podnošenje: ciklus = 1', psql('select ciklus from public.izvjestaji', 'ci').split()[-1], '1')
chk('paralelno podnošenje: tačno jedan snimak', psql('select count(*) from public.izvjestaj_snimci', 'sn').split()[-1], '1')
chk("paralelno podnošenje: tačno jedan zapis PODNESEN", psql("select count(*) from public.revizorski_trag where akcija='PODNESEN'", 'tr').split()[-1], '1')
chk('paralelno podnošenje: bez grešaka servera', sum('GRESKA' in x or 'ERROR' in x for x in r), 0)
rev = psql('select revizija from public.izvjestaji', 'rv2').split()[-1]
def odl(i):
    return D + (f"select coalesce(public.idss_odobri('{iid}',{rev},3,null,gen_random_uuid())->>'kod','OK');" if i % 2 == 0
                else f"select coalesce(public.idss_vrati('{iid}',{rev},'Dopunite opis radionica i planove za sljedeći mjesec.',gen_random_uuid())->>'kod','OK');")
r = paralelno(12, odl, 'od')
last = [x.split()[-1] for x in r]
chk('paralelno odobri/vrati: tačno jedna odluka uspjela', last.count('OK'), 1)
chk('paralelno odobri/vrati: bez grešaka servera', sum('GRESKA' in x or 'ERROR' in x for x in r), 0)
print(f'REZULTAT: {ok} prošlo, {fail} palo'); sys.exit(1 if fail else 0)
