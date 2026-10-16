#!/usr/bin/env python3
"""Sastavlja samostalan index.html iz src/ (+ CSP sa SHA-256 hashevima skripti).
Upotreba: build.py [--url URL --kljuc ANON_KLJUC --out PUTANJA]  (druga varijanta ugrađuje Supabase postavke)."""
import pathlib, hashlib, base64, json, argparse
r = pathlib.Path(__file__).parent; s = r / 'src'
ap = argparse.ArgumentParser(); ap.add_argument('--url'); ap.add_argument('--kljuc'); ap.add_argument('--out')
a = ap.parse_args()
js = '\n'.join((s / f).read_text(encoding='utf-8') for f in ['logika.js', 'api.js', 'scena3d.js', 'ui_osnova.js', 'ui_izvjestaj.js'])
js = js.replace('</script', '<\\/script')
frame = "if(window.top!==window.self){document.documentElement.style.display='none';try{window.top.location=window.self.location}catch(e){}}"
cfg = ''
if a.url and a.kljuc:
    cfg = '<script>window.IDSS_CONFIG=' + json.dumps({'url': a.url, 'kljuc': a.kljuc}).replace('<', '\\u003c') + ';</script>\n'
def hs(t): return "'sha256-" + base64.b64encode(hashlib.sha256(t.encode('utf-8')).digest()).decode() + "'"
skripte = [frame, js, 'UI.pokreni();'] + ([cfg[len('<script>'):-len(';</script>\n') - 0] + ';'] if cfg else [])
connect = a.url.rstrip('/') if a.url else 'https://*.supabase.co'
csp = ("default-src 'none'; script-src " + ' '.join(hs(t) for t in skripte) + "; style-src 'unsafe-inline'; "
       "img-src https://idss.edu.ba data:; connect-src " + connect + "; base-uri 'none'; form-action 'none'; object-src 'none'")
out = (s / 'shell.html').read_text(encoding='utf-8')
out = out.replace('/*CSP*/', '<meta http-equiv="Content-Security-Policy" content="' + csp + '">').replace('/*FRAME*/', frame).replace('/*CFG*/', cfg)
out = out.replace('/*CSS*/', (s / 'stil.css').read_text(encoding='utf-8')).replace('/*JS*/', js)
dest = pathlib.Path(a.out) if a.out else r / 'index.html'
dest.write_text(out, encoding='utf-8'); print(dest, len(out.encode()), 'bajtova')
