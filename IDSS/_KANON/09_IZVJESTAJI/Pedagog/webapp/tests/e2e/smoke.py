import sys, json
from playwright.sync_api import sync_playwright
out = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width':1280,'height':900})
    errs=[]
    pg.on('console', lambda m: errs.append(m.text) if m.type in('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
    pg.goto('file:///home/claude/idss-pedagog/index.html')
    pg.screenshot(path=f'{out}/01_prijava.png')
    pg.click('#demo-ped'); pg.wait_for_selector('.hero', timeout=8000); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{out}/02_pocetna_pedagog.png', full_page=True)
    print('hero tekst:', pg.inner_text('.hero')[:200].replace('\n',' | '))
    print('canvas:', pg.locator('.hero canvas').count(), 'bez-3d:', pg.locator('.bez-3d').count())
    pg.click('text=Započni izvještaj'); pg.wait_for_selector('.uredjivac', timeout=8000)
    pg.screenshot(path=f'{out}/03_urednik.png', full_page=True)
    print('errs', errs)
    b.close()
