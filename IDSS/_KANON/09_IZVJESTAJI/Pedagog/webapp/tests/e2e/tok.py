import sys, json
from playwright.sync_api import sync_playwright
out = sys.argv[1]
fx = json.loads(open('/home/claude/idss-pedagog/tests/fixtures/potpun.json').read().replace('2026-09-','2026-10-'))
def fid(p): return 'f-' + ''.join(c if c.isalnum() else '-' for c in p)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width':1280,'height':900}); errs=[]
    pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'TUNNEL' not in m.text else None)
    pg.goto('file:///home/claude/idss-pedagog/index.html'); pg.click('#demo-ped'); pg.wait_for_selector('.hero')
    pg.click('.hero >> text=Započni izvještaj'); pg.wait_for_selector('.uredjivac')
    def korak(k): pg.click('#kor-'+k); pg.wait_for_timeout(100)
    def unesi(prefix, o):
        for k, v in o.items():
            i = '#'+fid(prefix+'.'+k)
            if isinstance(v, list) and k=='teme':
                for t in v: pg.locator(f'label:has-text("{t}") input').first.check()
            elif isinstance(v,(int,float)): pg.fill(i, str(v))
            elif k in ('ciljna_grupa','status','vrsta','ednevnik','utjecaj','ozbiljnost','kategorija'):
                pg.select_option(i, v)
            elif isinstance(v,str): pg.fill(i, v)
    for sec in ['ucenici','nastavnici','roditelji']:
        korak(sec); unesi(sec, fx[sec])
    korak('radionice')
    for n, st in enumerate(fx['radionice']['stavke']):
        pg.click('text=+ Dodaj radionicu'); pg.wait_for_timeout(50)
        for k in ['ciljna_grupa','status','qp05_zapis']: pg.select_option('#'+fid(f'radionice.stavke.{n}.{k}'), st[k])
        for k,v in st.items():
            if k not in ('ciljna_grupa','status','qp05_zapis'): pg.fill('#'+fid(f'radionice.stavke.{n}.{k}'), str(v))
    korak('usavrsavanje')
    for n, st in enumerate(fx['usavrsavanje']['stavke']):
        pg.click('text=+ Dodaj usavršavanje'); pg.wait_for_timeout(50)
        pg.select_option('#'+fid(f'usavrsavanje.stavke.{n}.vrsta'), st['vrsta'])
        for k,v in st.items():
            if k!='vrsta': pg.fill('#'+fid(f'usavrsavanje.stavke.{n}.{k}'), str(v))
    korak('administracija'); unesi('administracija', fx['administracija'])
    korak('zakljucak'); unesi('zakljucak', fx['zakljucak'])
    korak('rizici'); pg.screenshot(path=f'{out}/04_rizici.png', full_page=True)
    print('rizici tekst:', pg.inner_text('#glavno .kartica:nth-of-type(1)')[:50] if False else '')
    korak('pregled'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{out}/05_pregled.png', full_page=True)
    print(pg.inner_text('.uredjivac > section')[:900])
    print('bodovi panel:', pg.inner_text('#pan-uk'))
    print('dugme podnesi disabled:', pg.is_disabled('#dug-podnesi'))
    pg.click('#dug-podnesi'); pg.wait_for_selector('dialog[open]'); pg.screenshot(path=f'{out}/06_potvrda.png')
    pg.get_by_role('button', name='Podnesi', exact=True).click(); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{out}/07_slavlje.png')
    print('dialog naslov:', pg.inner_text('dialog h2') if pg.locator('dialog').count() else 'nema')
    if pg.locator('dialog').count(): pg.click('dialog >> text=Nastavi')
    pg.wait_for_timeout(300); pg.screenshot(path=f'{out}/08_podnesen.png', full_page=True)
    print('status:', pg.inner_text('.naslov-stranice')[:120].replace('\n',' | '))
    pg.click('text=Odjava'); pg.click('#demo-dir'); pg.wait_for_selector('.mreza'); pg.screenshot(path=f'{out}/09_direktor.png', full_page=True)
    print(pg.inner_text('.mreza')[:200].replace('\n',' | '))
    pg.locator('tr:has-text("Septembar") a:has-text("Pregledaj")').click(); pg.wait_for_selector('#dug-odobri')
    pg.click('#dug-odobri'); pg.locator('.ocjena label').nth(4).click(); pg.get_by_role('button', name='Odobri', exact=True).click(); pg.wait_for_timeout(500)
    print('blokirano:', pg.inner_text('dialog [role=alert]'))
    pg.click('dialog >> text=Odustani')
    pg.select_option('#od-0', 'Odobreno'); pg.click('text=Spremi odluku'); pg.wait_for_timeout(500)
    pg.click('#dug-odobri'); pg.locator('.ocjena label').nth(4).click(); pg.get_by_role('button', name='Odobri', exact=True).click(); pg.wait_for_timeout(800)
    print('toast:', pg.inner_text('.toast-sp'))
    pg.screenshot(path=f'{out}/12_nakon_odobrenja.png', full_page=True)
    pg.click('text=Arhiva'); pg.wait_for_selector('table'); print(pg.inner_text('table')[:400].replace('\n',' | '))
    pg.click('text=Kako se boduje'); pg.wait_for_selector('h1'); pg.screenshot(path=f'{out}/13_pravila.png', full_page=True)
    print('errs', errs); b.close()
