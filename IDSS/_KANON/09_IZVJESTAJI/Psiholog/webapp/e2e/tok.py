import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests'))
import okvir
from lib import T, sql
from uzorak import potpun, rizik, prep
from playwright.sync_api import sync_playwright
t = T()
R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = '/tmp/claude-0/e2e2'; os.makedirs(OUT, exist_ok=True)
okvir.priprema()
PAGE = 'file://' + R + '/index.html'

def prijava(pg, em, lz='Lozinka123!'):
    pg.fill('#p-email', em); pg.fill('#p-loz', lz); pg.click('#p-dugme')

def fid(put): return 'f-' + re.sub(r'[^a-z0-9]', '-', put, flags=re.I)

def unesi(pg, put, v):
    if isinstance(v, list):   # višestruki izbor
        grp = pg.locator('#' + fid(put) + '-l').locator('xpath=..')
        for x in v: grp.locator('label', has_text=x).locator('input').check()
        return
    el = pg.locator('#' + fid(put))
    tag = el.evaluate('e => e.tagName.toLowerCase()')
    if tag == 'select': el.select_option(label=str(v))
    else: el.fill(str(v))

def sekcija(pg, kor, put, obj):
    pg.click('#kor-' + kor)
    for k, v in obj.items():
        if k in ('stavke',): continue
        unesi(pg, f'{put}.{k}', v)

def izvjestaj(pg, s, riz, pre):
    sekcija(pg, 'ucenici', 'ucenici', s['ucenici']); sekcija(pg, 'nastavnici', 'nastavnici', s['nastavnici']); sekcija(pg, 'roditelji', 'roditelji', s['roditelji'])
    pg.click('#kor-radionice')
    for i, x in enumerate(s['radionice']['stavke']):
        pg.click('text=+ Dodaj radionicu')
        for k, v in x.items(): unesi(pg, f'radionice.stavke.{i}.{k}', v)
    pg.click('#kor-usavrsavanje')
    for i, x in enumerate(s['usavrsavanje']['stavke']):
        pg.click('text=+ Dodaj usavršavanje')
        for k, v in x.items(): unesi(pg, f'usavrsavanje.stavke.{i}.{k}', v)
    pg.click('#kor-rizici')
    for i, x in enumerate(riz):
        pg.click('text=+ Dodaj rizik')
        for k, v in x.items(): unesi(pg, f'rizici.{i}.{k}', v)
    pg.click('#kor-preporuke')
    for i, x in enumerate(pre):
        pg.click('text=+ Dodaj preporuku')
        for k, v in x.items(): unesi(pg, f'preporuke.{i}.{k}', v)
    sekcija(pg, 'administracija', 'administracija', s['administracija']); sekcija(pg, 'zakljucak', 'zakljucak', s['zakljucak'])

with sync_playwright() as p:
    br, ctx, pg, greske = okvir.pokreni(p)
    pg.goto(PAGE); pg.wait_for_selector('#p-email')
    print('inputs', pg.locator('input').count(), pg.locator('#p-dugme').inner_text(), pg.locator('text=Probni').count(), pg.locator('text=Supabase').count())
    t.check(pg.locator('input').count() == 2 and pg.locator('#p-dugme').text_content() == 'Prijavi se' and pg.locator('text=Probni').count() == 0 and pg.locator('text=Supabase').count() == 0, 'prijava: samo e-pošta, lozinka, Prijavi se')
    t.check('Psiholog' in pg.title(), 'naslov stranice', pg.title())
    pg.screenshot(path=OUT + '/01_prijava.png')
    prijava(pg, 'psiholog@idss.ba', 'pogresna'); pg.wait_for_selector('.greska-okvir')
    t.check('nisu ispravni' in pg.inner_text('#p-poruka'), 'pogrešna lozinka', pg.inner_text('#p-poruka'))
    prijava(pg, 'psiholog@idss.ba'); pg.wait_for_selector('.hero')
    pg.wait_for_timeout(1200)
    t.check(pg.locator('.hero canvas').count() == 1, 'hero: 3D platno')
    t.check('Psiholog' in pg.inner_text('header.traka') and 'Medina Karaga' in pg.inner_text('header.traka'), 'zaglavlje: ime i uloga')
    pg.screenshot(path=OUT + '/02_pocetna.png')
    # kreiranje septembra
    pg.goto(PAGE + '#/novi/2026/9'); pg.wait_for_selector('#kor-ucenici', timeout=15000)
    t.check(pg.locator('#kor-ucenici').count() == 1, 'uređivač otvoren')
    s = potpun(2026, 9)
    izvjestaj(pg, s, [rizik()], [prep()])
    pg.wait_for_timeout(2200)
    pg.click('#kor-pregled'); pg.wait_for_selector('#dug-podnesi')
    t.check(pg.locator('.uspjeh').count() == 1 and not pg.locator('#dug-podnesi').is_disabled(), 'pregled: potpun, može se podnijeti', pg.locator('.upozorenje').all_inner_texts())
    pg.screenshot(path=OUT + '/03_pregled.png', full_page=True)
    pg.click('#dug-podnesi'); pg.click('dialog button:has-text("Podnesi")')
    pg.wait_for_selector('dialog[open] >> text=Izvještaj je podnesen', timeout=15000)
    pg.wait_for_timeout(1500); pg.screenshot(path=OUT + '/04_slavlje.png')
    pg.click('dialog button:has-text("Nastavi")'); pg.wait_for_timeout(300)
    st = sql("select status, ciklus, revizija from psih.izvjestaji limit 1"); t.check(st.startswith('podnesen|1'), 'u bazi: podnesen', st)
    # štampa: memorandum bez bodova
    pg.evaluate("window.print = () => { window.__print = 1 }")
    pg.click('text=Štampaj') if pg.locator('text=Štampaj').count() else None
    pg.wait_for_timeout(500)
    if pg.locator('#stampa').count():
        tx = pg.locator('#stampa').inner_text()
        t.check('Mjesečni izvještaj psihologa' in tx and 'bod' not in tx.lower().replace('pokazatelj', ''), 'štampa: naslov, bez bodova', tx[:200])
        pg.pdf(path=OUT + '/izvjestaj.pdf', format='A4', print_background=True)
    else: t.check(False, 'štampa nije pokrenuta')
    t.check(not [g for g in greske if 'ERR_TUNNEL' not in g and '400' not in g], 'nema grešaka u konzoli (psiholog)', greske[:3])
    ctx.clear_cookies(); pg.evaluate("sessionStorage.clear()")
    # --- direktor
    pg.goto(PAGE); pg.wait_for_selector('#p-email'); prijava(pg, 'direktor@idss.ba'); pg.wait_for_selector('main h1, main h2')
    pg.wait_for_timeout(800)
    t.check('Medina Karaga' in pg.inner_text('main'), 'direktor vidi podneseno od psihologa')
    t.check(pg.locator('text=AI').count() > 0, 'direktor@idss.ba vidi AI karticu')
    pg.screenshot(path=OUT + '/05_direktor.png', full_page=True)
    iid = sql("select id from psih.izvjestaji limit 1")
    pg.goto(PAGE + '#/izvjestaj/' + iid); pg.wait_for_selector('text=Odluka', timeout=10000)
    pg.screenshot(path=OUT + '/06_pregled_direktor.png', full_page=True)
    t.check('Medina Karaga' in pg.inner_text('main'), 'pregled: ime psihologa')
    sys.stdout.flush()
    print(pg.inner_text('main')[:600])
    br.close()
sys.exit(1 if t.kraj('e2e tok') else 0)
