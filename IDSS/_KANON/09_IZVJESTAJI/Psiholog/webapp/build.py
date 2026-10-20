#!/usr/bin/env python3
"""Sklapa jednu HTML datoteku: IDSS Psiholog — Mjesečni izvještaj.
Upotreba:
  python3 build.py                       # zadani izlaz index.html
  python3 build.py --slika psiholog.png [--oko1 oko1.png --oko2 oko2.png]   # stvarna slika psihologa
Slika: 447x520 px, prozirna pozadina (PNG/WebP). Zjenice (31x31 px) su zasebni slojevi koji prate miš;
bez --oko1/--oko2 lik se samo blago njiše, bez praćenja očima."""
import argparse, base64, hashlib, json, mimetypes, os, re

D = os.path.dirname(os.path.abspath(__file__))
KLJUC = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bmRiYXN0amlqcW5ocHZkdHpqIiwicm9sZSI6ImFub24i'
         'LCJpYXQiOjE3OTE5MTUwMjgsImV4cCI6MjEwNzQ5MTAyOH0.heAD1dBGnagNd98Np0HuiBE-FEWHXBiDeVZnfHmmOzE')


def citaj(p):
    return open(os.path.join(D, p), encoding='utf-8').read()


def uri(putanja):
    mime = mimetypes.guess_type(putanja)[0] or 'image/png'
    if putanja.endswith('.svg'): mime = 'image/svg+xml'
    b = open(putanja, 'rb').read()
    return f'url("data:{mime};base64,{base64.b64encode(b).decode()}")'


def hash_skripte(s):
    return "'sha256-" + base64.b64encode(hashlib.sha256(s.encode('utf-8')).digest()).decode() + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='https://mundbastjijqnhpvdtzj.supabase.co')
    ap.add_argument('--kljuc', default=KLJUC)
    ap.add_argument('--ai-email', default='direktor@idss.ba')
    ap.add_argument('--slika'); ap.add_argument('--oko1'); ap.add_argument('--oko2')
    ap.add_argument('--out', default=os.path.join(D, 'index.html'))
    a = ap.parse_args()
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', a.url): raise SystemExit('Neispravan --url')

    portret = uri(a.slika or os.path.join(D, 'src/assets/portret.svg'))
    if a.slika:
        oci = [uri(x) for x in (a.oko1, a.oko2) if x]
    else:
        oko = uri(os.path.join(D, 'src/assets/oko.svg')); oci = [oko, oko]
    pozicije = [('128px', '152px'), ('212px', '163px')]

    def slojevi(s):
        r = []
        for u, (x, y) in zip(oci, pozicije):
            r.append(f'{u} calc(({x} + var(--ex,0px))*var(--s)) calc(({y} + var(--ey,0px))*var(--s))/calc(31px*var(--s)) calc(31px*var(--s)) no-repeat')
        r.append(f'{portret} 0 0/100% 100% no-repeat')
        return ','.join(r)
    avatar = citaj('src/avatar.css.in').replace('{{SLOJEVI_HERO}}', slojevi(0)).replace('{{SLOJEVI_PRIJAVA}}', slojevi(1))
    css = citaj('src/stil_a.css') + avatar

    cfg = 'window.IDSS_CONFIG=' + json.dumps({'url': a.url, 'kljuc': a.kljuc, 'produkcija': True, 'ai_email': a.ai_email}) + ';'
    kruh = ("if(window.top!==window.self){document.documentElement.style.display='none';"
            "try{window.top.location=window.self.location}catch(e){}}")
    glavna = '\n'.join(citaj('src/' + f) for f in ['logika.js', 'api.js', 'scena.js', 'ui.js', 'ui_urednik.js', 'ui_stampa.js', 'ui_ai.js'])
    skripte = [kruh, cfg, glavna, 'UI.pokreni();', citaj('src/mis.js')]
    csp = ("default-src 'none'; script-src " + ' '.join(hash_skripte(s) for s in skripte) +
           f"; style-src 'unsafe-inline'; img-src https://idss.edu.ba data:; connect-src {a.url}; base-uri 'none'; form-action 'none'; object-src 'none'")
    html = ('<!doctype html>\n<html lang="bs">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="color-scheme" content="light dark">\n'
            f'<meta http-equiv="Content-Security-Policy" content="{csp}">\n<title>IDSS Psiholog · Mjesečni izvještaj</title>\n'
            f'<style>\n{css}\n</style>\n</head>\n<body>\n'
            '<noscript><p style="padding:1rem">Za rad aplikacije potrebno je uključiti JavaScript.</p></noscript>\n<div id="aplikacija"></div>\n'
            + '\n'.join(f'<script>{s}</script>' for s in skripte) + '\n</body>\n</html>\n')
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    open(a.out, 'w', encoding='utf-8').write(html)
    print('OK', a.out, len(html) // 1024, 'KB')


main()
