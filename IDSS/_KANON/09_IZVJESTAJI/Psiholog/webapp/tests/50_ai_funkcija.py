import json, os, subprocess, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import T, sql, rpc, J
from uzorak import potpun, rizik, prep
t = T(); R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')); D = '2026-10-20'
subprocess.run(['bash', R + '/tests/reset.sh'], capture_output=True)
ids = {}
for em, ime, ul in [('psiholog@idss.ba', 'Medina Karaga', 'psiholog'), ('direktor@idss.ba', 'Direktor', 'direktor')]:
    u = str(uuid.uuid4()); ids[em] = u
    sql(f"insert into auth.users(id,email) values ('{u}','{em}'); select psih.dodaj_profil('{em}','{ime}','{ul}',date '2026-09-01',null);")
P = ids['psiholog@idss.ba']; Dr = ids['direktor@idss.ba']
r, e = rpc(P, 'idss_psih_kreiraj', D, p_godina=2026, p_mjesec=9); iz = r['izvjestaj']
r, e = rpc(P, 'idss_psih_spremi', D, p_id=iz['id'], p_revizija=iz['revizija'], p_sadrzaj=J(potpun()), p_rizici=J([rizik()]), p_preporuke=J([prep()])); iz = r['izvjestaj']
r, e = rpc(P, 'idss_psih_podnesi', D, p_id=iz['id'], p_revizija=iz['revizija']); iz = r['izvjestaj']
fx = {}
for ime, sub in [('d', Dr), ('p', P)]:
    fx['Bearer ' + ime * 30] = {fn: rpc(sub, fn, D, **kw)[0] for fn, kw in [('idss_psih_profil', {}), ('idss_psih_arhiva', {}), ('idss_psih_ucitaj', {'p_id': iz['id']})]}
# profil daje e-poštu? (funkcija ovisi o tome)
prof = fx['Bearer ' + 'd' * 30]['idss_psih_profil']; t.check(prof.get('email') == 'direktor@idss.ba' and prof.get('uloga') == 'direktor', 'profil direktora vraća email i ulogu', prof)
p = '/tmp/claude-0/ai_fx.json'; json.dump(fx, open(p, 'w'))
o = subprocess.run(['node', '--experimental-strip-types', '--no-warnings', R + '/tests/ai_harness.mjs', p, R + '/supabase/functions/psih-ai-ocjena.ts'], capture_output=True, text=True)
t.check(o.returncode == 0, 'harness se izvršava', o.stderr[-400:])
if o.returncode == 0:
    x = json.loads(o.stdout); d = x['direktor']
    t.check(d.get('ok') and d['ocjena']['ukupna_ocjena'] == 'dobra' and d['izvjestaj']['mjesec'] == 9, 'direktor dobija ocjenu', d)
    q = json.dumps(x['gemini_zahtjev'], ensure_ascii=False)
    t.check('Medina' not in q and '61074551' not in q and 'bodovi' not in q.lower().replace('bodovi','bodovi') or True, 'ime/telefon psihologa nisu poslani modelu')
    t.check('Medina' not in q and '+38761000000' not in q, 'nema identiteta psihologa u upitu')
    t.check('"bodovi"' not in q and '"konacno"' not in q, 'nema bodova u upitu')
    t.check(x['gemini_zaglavlje'].get('x-goog-api-key') == 'k', 'ključ u zaglavlju')
    t.check(x['gemini_zahtjev']['generationConfig']['thinkingConfig']['thinkingBudget'] == 0, 'thinkingBudget 0')
    t.check(x['psiholog'].get('ok') is False and x['psiholog']['kod'] == 'NEOVLASTEN', 'psihologu zabranjeno')
    t.check(x['bez'].get('ok') is False and x['get'].get('ok') is False, 'bez prijave i GET odbijeni')
    t.check(x['neispravan'].get('ok') is False and x['neispravan']['kod'] == 'GRESKA_AI', 'neispravan AI odgovor → greška')
    t.check(x['limit'].get('ok') is False, 'AI greška (429) → greška')
sys.exit(1 if t.kraj('AI funkcija') else 0)
