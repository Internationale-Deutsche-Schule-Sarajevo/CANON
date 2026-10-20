import json, os, re, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests'))
import okvir
from lib import T, sql, rpc, J
from uzorak import potpun, rizik, prep
from playwright.sync_api import sync_playwright
t = T(); R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = '/tmp/claude-0/e2e2'; os.makedirs(OUT, exist_ok=True)
okvir.priprema(); D = okvir.DANAS
PAGE = 'file://' + R + '/index.html'
PS = okvir.KORISNICI['psiholog@idss.ba']
def r_(fn, **kw):
    r, e = rpc(PS, fn, D, **kw); assert r and r.get('ok'), (fn, r, e); return r
iz = r_('idss_psih_kreiraj', p_godina=2026, p_mjesec=9)['izvjestaj']
iz = r_('idss_psih_spremi', p_id=iz['id'], p_revizija=iz['revizija'], p_sadrzaj=J(potpun()), p_rizici=J([rizik()]), p_preporuke=J([prep()]))['izvjestaj']
iz = r_('idss_psih_podnesi', p_id=iz['id'], p_revizija=iz['revizija'])['izvjestaj']; ID = iz['id']

def prijava(pg, em):
    pg.fill('#p-email', em); pg.fill('#p-loz', 'Lozinka123!'); pg.click('#p-dugme')

with sync_playwright() as p:
    br, ctx, pg, greske = okvir.pokreni(p)
    pg.goto(PAGE); pg.wait_for_selector('#p-email'); prijava(pg, 'direktor@idss.ba'); pg.wait_for_selector('text=Čekaju Vašu odluku', timeout=10000) if False else pg.wait_for_selector('.kartica')
    # AI kartica (stub funkcije): samo direktor@idss.ba
    pg.click('text=Zatraži AI ocjenu'); pg.wait_for_selector('text=Test sažetak procjene', timeout=10000)
    t.check(pg.locator('text=Kako ide supervizija').count() == 1 and pg.locator('text=Pitanja za psihologa').count() == 1, 'AI kartica prikazuje odgovor (pitanja za psihologa)')
    pg.screenshot(path=OUT + '/07_ai.png', full_page=True)
    pg.goto(PAGE + '#/izvjestaj/' + ID); pg.wait_for_selector('#dug-vrati')
    # odobravanje blokirano dok preporuka čeka
    pg.click('#dug-odobri'); pg.click('input[name=ocj][value="4"]', force=True); pg.click('dialog button:has-text("Odobri")')
    pg.wait_for_selector('dialog[open] >> text=odluči', timeout=5000) if False else pg.wait_for_timeout(700)
    t.check('preporukama' in pg.inner_text('dialog[open]'), 'odobrenje blokirano dok preporuka nema odluku', pg.inner_text('dialog[open]')[-200:])
    pg.click('dialog button:has-text("Odustani")')
    # odluka: dorada traži komentar
    pg.select_option('#od-0', 'Potrebna dorada'); pg.click('text=Spremi odluku'); pg.wait_for_timeout(600)
    t.check(sql("select preporuke->0->>'odluka' from psih.izvjestaji") == 'Na čekanju', 'dorada bez komentara odbijena')
    pg.fill('#ok-0', 'Navedite okvirni trošak.'); pg.click('text=Spremi odluku'); pg.wait_for_timeout(900)
    t.check(sql("select preporuke->0->>'odluka' from psih.izvjestaji") == 'Potrebna dorada', 'dorada spremljena')
    pg.click('#dug-vrati'); pg.fill('#vr-nap', 'kratko'); pg.click('dialog button:has-text("Vrati na dopunu")'); pg.wait_for_timeout(300)
    t.check(sql("select status from psih.izvjestaji") == 'podnesen', 'prekratko obrazloženje odbijeno')
    pg.fill('#vr-nap', 'Dopunite preporuku i navedite trošak.'); pg.click('dialog button:has-text("Vrati na dopunu")'); pg.wait_for_timeout(1000)
    t.check(sql("select status from psih.izvjestaji") == 'vracen', 'vraćen na dopunu')
    pg.click('text=Odjava'); pg.wait_for_selector('#p-email')
    # psiholog dopunjuje
    prijava(pg, 'psiholog@idss.ba'); pg.wait_for_selector('.hero')
    pg.screenshot(path=OUT + '/08_vracen_pocetna.png', full_page=True)
    t.check(pg.locator('text=Vraćen').count() + pg.locator('text=dopun').count() > 0, 'psiholog vidi vraćeno')
    pg.goto(PAGE + '#/izvjestaj/' + ID); pg.wait_for_selector('#kor-ucenici', timeout=15000)
    t.check('Dopunite preporuku' in pg.inner_text('main'), 'psiholog vidi napomenu direktora')
    pg.click('#kor-preporuke'); pg.fill('#f-preporuke-0-obrazlozenje', 'Potreban stalni mirni prostor; trošak je nula jer se koristi postojeća prostorija.')
    pg.select_option('#f-preporuke-0-utjecaj', label='Nema troškova'); pg.wait_for_timeout(2300)
    pg.click('#kor-pregled'); pg.wait_for_selector('#dug-podnesi:not([disabled])'); pg.click('#dug-podnesi'); pg.click('dialog button:has-text("Podnesi")')
    pg.wait_for_selector('dialog[open] >> text=podnesen', timeout=15000); pg.click('dialog button:has-text("Nastavi")')
    t.check(sql("select status||ciklus from psih.izvjestaji") == 'podnesen2', 'ponovo podnesen (ciklus 2)')
    pg.click('text=Odjava'); pg.wait_for_selector('#p-email')
    prijava(pg, 'direktor@idss.ba'); pg.wait_for_selector('.kartica'); pg.goto(PAGE + '#/izvjestaj/' + ID); pg.wait_for_selector('#dug-odobri')
    pg.select_option('#od-0', 'Odobreno'); pg.click('text=Spremi odluku'); pg.wait_for_timeout(900)
    pg.click('#dug-odobri'); pg.click('input[name=ocj][value="4"]', force=True); pg.fill('#od-kom', 'Dobar izvještaj.'); pg.click('dialog button:has-text("Odobri")'); pg.wait_for_timeout(1200)
    t.check(sql("select status from psih.izvjestaji") == 'odobren', 'odobren')
    b = json.loads(sql("select bodovi from psih.izvjestaji"))
    t.check(b['konacno'] and b['direktor'] == 80 and b['ukupno'] == b['zbroj'] + 80 and b['max'] == 1000, 'konačni bodovi s ocjenom 4', (b['ukupno'], b['zbroj']))
    pg.goto(PAGE + '#/izvjestaj/' + ID); pg.wait_for_selector('.uspjeh'); pg.screenshot(path=OUT + '/09_odobren.png', full_page=True)
    pg.click('text=Odjava'); pg.wait_for_selector('#p-email'); prijava(pg, 'psiholog@idss.ba'); pg.wait_for_selector('.hero'); pg.wait_for_timeout(1500)
    t.check(pg.locator('dialog[open]').count() == 1, 'slavlje pri odobrenju')
    pg.screenshot(path=OUT + '/10_slavlje_odobreno.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.goto(PAGE + '#/bodovi'); pg.wait_for_selector('text=Kako se boduje'); tx = pg.inner_text('main')
    t.check('Opservacije u razredu' in tx and 'Povjerljivost i saglasnosti' in tx and 'QP 09' not in tx and 'eDnevnik' not in tx and 'Pedagog' not in tx, 'stranica bodovanja za psihologa')
    pg.goto(PAGE + '#/arhiva'); pg.wait_for_selector('table'); t.check('Septembar' in pg.inner_text('main'), 'arhiva')
    # mobilni prikaz
    pg.set_viewport_size({'width': 390, 'height': 800}); pg.goto(PAGE); pg.wait_for_selector('.hero'); pg.wait_for_timeout(800)
    t.check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'mobilni: bez vodoravnog skrola')
    pg.screenshot(path=OUT + '/11_mobilni.png', full_page=True)
    t.check(not [g for g in greske if 'ERR_TUNNEL' not in g and '400' not in g], 'nema grešaka u konzoli', greske[:3])
    br.close()
sys.exit(1 if t.kraj('e2e direktor') else 0)
