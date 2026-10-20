import subprocess, threading, uuid, json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from uzorak import potpun, rizik, prep
import copy
t = T()
subprocess.run(['bash', os.path.dirname(os.path.abspath(__file__)) + '/reset.sh'], capture_output=True)
PS, DI, P2, ST = [str(uuid.uuid4()) for _ in range(4)]
sql(f"""insert into auth.users(id,email) values ('{PS}','psiholog@idss.ba'),('{DI}','direktor@idss.ba'),('{P2}','psiholog2@idss.ba'),('{ST}','stranac@x.ba');
select psih.dodaj_profil('psiholog@idss.ba','Medina Karaga','psiholog',date '2026-09-01','+38761000000');
select psih.dodaj_profil('direktor@idss.ba','Direktor','direktor',date '2026-09-01',null);
select psih.dodaj_profil('psiholog2@idss.ba','Druga','psiholog',date '2026-09-01',null);""")
D = '2026-10-18'
# --- šta je izloženo u public šemi: samo idss_psih_* funkcije, nijedna tabela
t.check(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m')") == '0', 'u public nema tabela')
fn = sql("select string_agg(proname, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
t.check(all(x.startswith('idss_psih_') for x in fn.split(',')), 'u public samo idss_psih_ funkcije', fn)
# sve funkcije u public: SECURITY DEFINER i search_path prazan
loše = sql("""select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (not prosecdef or proconfig is null or not ('search_path=""' = any(proconfig)))""")
t.check(loše == '0', 'sve javne funkcije su SECURITY DEFINER sa praznim search_path', loše)
# --- prava: anon i authenticated bez ikakvog pristupa šemi psih
for rola in ['anon', 'authenticated']:
    for q in ['select * from psih.izvjestaji', 'select * from psih.profili', 'insert into psih.izvjestaji(psiholog_id,godina,mjesec,rok_podnosenja) values (gen_random_uuid(),2026,10,now())',
              'update psih.profili set uloga=\'direktor\'', 'delete from psih.revizorski_trag', 'select psih.korisnik()', 'select psih.bodovi(\'{}\'::jsonb,\'[]\'::jsonb,\'{}\'::jsonb,2026,9,0,1,0)',
              "select psih.dodaj_profil('x@x.ba','X','direktor',date '2026-09-01',null)", 'create table psih.x(a int)', 'select * from auth.users']:
        out = sql(f"set role {rola}; {q};")
        t.check('permission denied' in out or 'must be owner' in out, f'{rola}: {q[:40]}', out[:100])
# anon ne smije ni RPC
for fn_ in ['idss_psih_profil', 'idss_psih_arhiva']:
    r, e = rpc(PS, fn_, D, role='anon'); t.check(r is None and 'permission denied' in e, f'anon ne zove {fn_}', e)
# --- RLS uključen na svim tabelama
t.check(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='psih' and c.relkind='r' and not c.relrowsecurity") == '0', 'RLS na svim tabelama')

def R(sub, fn, danas=D, **kw):
    r, e = rpc(sub, fn, danas, **kw)
    if r is None: print('SQL-GREŠKA', fn, e[:300])
    return r or {}
# --- uloge
r = R(PS, 'idss_psih_kreiraj', p_godina=2026, p_mjesec=9); ID = r['izvjestaj']['id']
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=1, p_sadrzaj=J(potpun()), p_rizici=J([]), p_preporuke=J([])); rev = r['izvjestaj']['revizija']
t.check(R(PS, 'idss_psih_odobri', p_id=ID, p_revizija=rev, p_ocjena=5).get('kod') == 'ZABRANJENO', 'psiholog ne odobrava')
t.check(R(DI, 'idss_psih_podnesi', p_id=ID, p_revizija=rev).get('kod') == 'ZABRANJENO', 'direktor ne podnosi')
t.check(R(P2, 'idss_psih_podnesi', p_id=ID, p_revizija=rev).get('kod') == 'ZABRANJENO', 'tuđi izvještaj se ne podnosi')
t.check(R(P2, 'idss_psih_spremi', p_id=ID, p_revizija=rev, p_sadrzaj=J({})).get('kod') == 'ZABRANJENO', 'tuđi izvještaj se ne sprema')
t.check(R(DI, 'idss_psih_odobri', p_id=ID, p_revizija=rev, p_ocjena=5).get('kod') == 'POGRESNO_STANJE', 'nacrt se ne odobrava')
# --- ubacivanje: SQL injection i XSS tekst ostaju samo podaci
ink = potpun(); ink['zakljucak']['postignuca'] = "'; drop table psih.izvjestaji; -- <script>alert(1)</script> " + 'x' * 120
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=rev, p_sadrzaj=J(ink), p_rizici=J([]), p_preporuke=J([])); t.check(r.get('ok'), 'tekst sa SQL/HTML znakovima se sprema kao podatak', r.get('poruka')); rev = r['izvjestaj']['revizija']
t.check(sql("select to_regclass('psih.izvjestaji') is not null") == 't', 'tabela postoji')
# kontrolni znakovi, prevelik izvještaj, pogrešni tipovi
kz = potpun(); kz['zakljucak']['postignuca'] = 'a\x01' + 'x' * 100
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=rev, p_sadrzaj=J(kz), p_rizici=J([]), p_preporuke=J([])); t.check(r.get('kod') == 'VALIDACIJA', 'kontrolni znakovi odbijeni')
veliki = potpun(); veliki['zakljucak']['postignuca'] = 'x' * 300000
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=rev, p_sadrzaj=J(veliki), p_rizici=J([]), p_preporuke=J([])); t.check(r.get('kod') == 'VALIDACIJA', 'prevelik izvještaj odbijen')
for loš in [J([]), J('x'), J(5), None]:
    r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=rev, p_sadrzaj=loš, p_rizici=J([]), p_preporuke=J([])); t.check(r.get('kod') == 'VALIDACIJA', f'sadržaj {loš} odbijen', r)
for loš in [J({}), J('x'), J([5])]:
    r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=rev, p_sadrzaj=J(potpun()), p_rizici=loš, p_preporuke=J([])); t.check(r.get('kod') == 'VALIDACIJA', f'rizici {loš.v} odbijeni')
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=rev, p_sadrzaj=J(potpun()), p_rizici=J([rizik()] * 101), p_preporuke=J([])); t.check(r.get('kod') == 'VALIDACIJA', 'više od 100 rizika odbijeno')
# rizik iz tuđeg psihologa: pripremi rizik kod P2 i pokušaj ga uvesti
R(P2, 'idss_psih_kreiraj', p_godina=2026, p_mjesec=9)
i2 = R(P2, 'idss_psih_ucitaj', p_godina=2026, p_mjesec=9)['izvjestaj']
r2 = R(P2, 'idss_psih_spremi', p_id=i2['id'], p_revizija=i2['revizija'], p_sadrzaj=J(potpun()), p_rizici=J([rizik()]), p_preporuke=J([]))
tudji = r2['izvjestaj']['rizici'][0]['id']
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=rev, p_sadrzaj=J(potpun()), p_rizici=J([rizik(id=tudji)]), p_preporuke=J([]))
t.check(r.get('kod') == 'VALIDACIJA' and any(g['kod'] == 'NEPOZNAT' for g in r['greske']), 'tuđi rizik se ne može uvesti')
# tuđa preporuka u odluci kao psiholog
t.check(R(PS, 'idss_psih_odluka', p_preporuka=str(uuid.uuid4()), p_odluka='Odobreno').get('kod') == 'ZABRANJENO', 'psiholog ne odlučuje')
# --- podnošenje u roku: B1 = 200
r = R(PS, 'idss_psih_podnesi', danas='2026-10-05', p_id=ID, p_revizija=rev); t.check(r.get('ok') and r['izvjestaj']['kasnjenje_prvo'] == 0 and r['izvjestaj']['na_vrijeme'] is True, 'podnošenje na rok (5.10.)', r.get('poruka'))
iz = r['izvjestaj']; st = {s['kod']: s for s in iz['bodovi']['stavke']}
t.check(st['B1']['bodovi'] == 200 and iz['bodovi']['max'] == 900, 'B1=200')
t.check(sql(f"select count(*) from psih.izvjestaj_snimci where izvjestaj_id='{ID}'") == '1', 'jedan snimak')
t.check(R(DI, 'idss_psih_ucitaj', p_id=ID)['izvjestaj']['sadrzaj']['zakljucak']['postignuca'].startswith("'; drop"), 'direktor vidi snimljeni tekst')
# kasnije izmjene žive kopije ne mijenjaju snimak koji vidi direktor: vrati, izmijeni, direktor i dalje vidi snimak dok ne bude ponovo podnesen
d = R(DI, 'idss_psih_ucitaj', p_id=ID)['izvjestaj']
r = R(DI, 'idss_psih_vrati', danas='2026-10-07', p_id=ID, p_revizija=d['revizija'], p_napomena='Dopunite opis radionica i plan.'); t.check(r.get('ok') and r['izvjestaj']['rok_dopune'] == '2026-10-12', 'rok dopune 3 radna dana (7.10. -> 12.10.)', r.get('izvjestaj', {}).get('rok_dopune'))
p = R(PS, 'idss_psih_ucitaj', danas='2026-10-07', p_id=ID)['izvjestaj']
t.check(p['status'] == 'vracen' and p['kasnjenje_dopune_sada'] == 0 and p['bodovi_pregled']['stavke'][1]['bodovi'] == 50, 'vraćen: B2 projekcija 50 u roku')
p13 = R(PS, 'idss_psih_ucitaj', danas='2026-10-13', p_id=ID)['izvjestaj']
t.check(p13['kasnjenje_dopune_sada'] == 1 and p13['bodovi_pregled']['stavke'][1]['bodovi'] == 25, 'dopuna kasni 1 dan: B2=25')
p20 = R(PS, 'idss_psih_ucitaj', danas='2026-10-20', p_id=ID)['izvjestaj']
t.check(p20['bodovi_pregled']['stavke'][1]['bodovi'] == 0, 'dopuna kasni 5+ dana: B2=0')
sn = sql("select sadrzaj #>> '{zakljucak,postignuca}' from psih.izvjestaj_snimci limit 1"); t.check(sn.startswith("'; drop"), 'snimak sadrži podneseno')
ink2 = copy.deepcopy(p['sadrzaj']) if False else json.loads(json.dumps(p['sadrzaj'])); ink2['zakljucak']['postignuca'] = 'Izmijenjeno nakon vraćanja. ' + 'x' * 120
r = R(PS, 'idss_psih_spremi', danas='2026-10-07', p_id=ID, p_revizija=p['revizija'], p_sadrzaj=J(ink2), p_rizici=J([]), p_preporuke=J([])); t.check(r.get('ok'), 'izmjena nakon vraćanja')
t.check(R(DI, 'idss_psih_ucitaj', p_id=ID)['izvjestaj']['sadrzaj']['zakljucak']['postignuca'].startswith("'; drop"), 'direktor i dalje vidi podneseni snimak')
# --- deaktiviran korisnik gubi pristup
sql(f"update psih.profili set aktivan=false where id='{P2}'")
t.check(R(P2, 'idss_psih_profil').get('kod') == 'NEOVLASTEN', 'deaktiviran nema pristup')
# --- paralelno spremanje s istom revizijom: tačno jedan pobjeđuje
IDP = str(uuid.uuid4())
sql("insert into auth.users(id,email) values ('%s','p3@idss.ba'); select psih.dodaj_profil('p3@idss.ba','Treća','psiholog',date '2026-09-01',null);" % IDP)
IP = R(IDP, 'idss_psih_kreiraj', p_godina=2026, p_mjesec=9)['izvjestaj']['id']
rez = []
def radnik(i):
    s = potpun(); s['ucenici']['grupni_rad'] = i
    r, e = rpc(IDP, 'idss_psih_spremi', D, p_id=IP, p_sadrzaj=J(s), p_revizija=1, p_rizici=J([]), p_preporuke=J([]), p_zahtjev=str(uuid.uuid4()))
    rez.append(r)
th = [threading.Thread(target=radnik, args=(i,)) for i in range(1, 9)]
[x.start() for x in th]; [x.join() for x in th]
t.check(sum(1 for r in rez if r and r.get('ok')) == 1 and sum(1 for r in rez if r and r.get('kod') == 'SUKOB_VERZIJA') == 7, 'paralelno: jedan pobjeđuje, ostali sukob', [r.get('kod', 'ok') if r else None for r in rez])
out = sql("select psih.dodaj_profil('p3@idss.ba','Treća','psiholog',date '2026-09-01','<script>')"); t.check(out.startswith('ERR'), 'telefon mora biti ispravan')
sys.exit(1 if t.kraj('30_napad') else 0)
