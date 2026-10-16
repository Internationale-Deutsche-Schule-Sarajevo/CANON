from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    c=b.new_context(viewport={'width':1920,'height':1000},reduced_motion='reduce'); pg=c.new_page()
    pg.goto('file:///home/claude/idss-pedagog/index.html'); pg.click('#demo-ped'); pg.wait_for_selector('.hero')
    a=pg.evaluate("document.querySelector('canvas').toDataURL().length"); pg.wait_for_timeout(1200)
    b2=pg.evaluate("document.querySelector('canvas').toDataURL().length"); print('3D mijenja sliku bez miša (reduced-motion):', a!=b2)
    pg.click('.hero >> text=Započni izvještaj'); pg.wait_for_selector('.uredjivac')
    for n in ['Saradnja sa nastavnicima','Radionice','Rad sa učenicima','QMS']:
        pg.locator('.korak-lista >> text='+n).first.click(); pg.wait_for_timeout(400)
        r=pg.evaluate("""()=>[...document.querySelectorAll('.red-polja')].map(g=>{const k=[...g.children].map(c=>{const i=c.querySelector('input,select,textarea');if(!i)return null;const b=i.getBoundingClientRect();return [Math.round(b.top),Math.round(b.height),Math.round(b.width)]}).filter(Boolean);return k})""")
        print(n, r[:3])
        pg.screenshot(path=f'slike/por_{n[:4]}.png')
    b.close()
