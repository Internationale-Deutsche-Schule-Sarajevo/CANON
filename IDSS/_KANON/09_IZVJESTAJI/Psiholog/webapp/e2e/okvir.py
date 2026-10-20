"""Probno okruženje: stvarna lokalna baza iza presretnutih Supabase zahtjeva (bez mreže)."""
import json, os, re, subprocess, sys, uuid
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tests'))
from lib import rpc, sql, lit
URL = 'https://mundbastjijqnhpvdtzj.supabase.co'
DANAS = '2026-10-20'
KORISNICI = {}
AI_ODGOVOR = {'ok': True, 'model': 'test', 'generisano': '2026-10-20T10:00:00Z', 'izvjestaj': {'id': 'x', 'godina': 2026, 'mjesec': 9, 'status': 'podnesen', 'podnesen_u': '2026-10-20T01:00:00Z'},
  'ocjena': {'ukupna_ocjena': 'vrlo dobra', 'sazetak': 'Test sažetak procjene.', 'snage': ['Jasan plan'], 'zapazanja_i_nedostaci': ['Nema'], 'procjena_po_oblastima': [{'oblast': 'Rad sa učenicima', 'procjena': 'Dobro.'}],
             'preporuka_direktoru': {'odluka': 'odobriti', 'obrazlozenje': 'Cjelovit izvještaj.', 'koraci': ['Odobriti']}, 'pitanja_za_psihologa': ['Kako ide supervizija?'], 'ograničenja': 'Test.', 'ogranicenja': 'Test.'}}

def priprema():
    subprocess.run(['bash', os.path.join(os.path.dirname(__file__), '..', 'tests', 'reset.sh')], capture_output=True)
    for em, ime, uloga, tel in [('psiholog@idss.ba', 'Medina Karaga', 'psiholog', '+38761000000'),
                                ('direktor@idss.ba', 'Direktor Škole', 'direktor', None)]:
        u = str(uuid.uuid4()); KORISNICI[em] = u
        print(sql(f"insert into auth.users(id,email) values ('{u}','{em}'); select psih.dodaj_profil('{em}','{ime}','{uloga}',date '2026-09-01',{lit(tel)});"))

def rukuj(route):
    req = route.request
    h = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
    if req.method == 'OPTIONS':
        return route.fulfill(status=204, headers=h)
    p = req.url[len(URL):]
    if p.startswith('/auth/v1/token'):
        b = json.loads(req.post_data or '{}')
        if 'refresh_token' in b:
            u = b['refresh_token'].split('.')[1]
        else:
            u = KORISNICI.get(b.get('email'))
            if not u or b.get('password') != 'Lozinka123!':
                return route.fulfill(status=400, headers=h, content_type='application/json', body=json.dumps({'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'}))
        em = [k for k, v in KORISNICI.items() if v == u][0]
        return route.fulfill(status=200, headers=h, content_type='application/json', body=json.dumps(
            {'access_token': 'a.' + u, 'refresh_token': 'r.' + u, 'expires_in': 3600, 'user': {'email': em}}))
    if p.startswith('/auth/v1/logout'):
        return route.fulfill(status=204, headers=h)
    if p.startswith('/functions/v1/psih-ai-ocjena'):
        return route.fulfill(status=200, headers=h, content_type='application/json', body=json.dumps(AI_ODGOVOR))
    m = re.match(r'/rest/v1/rpc/(idss_psih_\w+)$', p)
    if m:
        auth = req.headers.get('authorization', '')
        sub = auth.split('a.')[1] if 'a.' in auth else None
        r, e = rpc(sub, m.group(1), DANAS, **json.loads(req.post_data or '{}'))
        if r is None:
            return route.fulfill(status=400, headers=h, content_type='application/json', body=json.dumps({'message': e}))
        return route.fulfill(status=200, headers=h, content_type='application/json', body=json.dumps(r))
    return route.fulfill(status=404, headers=h, body='{}')

def pokreni(p, vp=None):
    br = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'])
    ctx = br.new_context(viewport=vp or {'width': 1440, 'height': 900}, locale='bs-BA')
    ctx.route(URL + '/**', rukuj)
    pg = ctx.new_page()
    greske = []
    pg.on('pageerror', lambda e: greske.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: greske.append('CONSOLE ' + m.text) if m.type == 'error' else None)
    return br, ctx, pg, greske
