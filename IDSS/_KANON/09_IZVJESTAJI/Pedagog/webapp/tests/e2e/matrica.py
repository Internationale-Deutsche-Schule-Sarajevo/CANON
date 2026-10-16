from playwright.sync_api import sync_playwright
V=[(320,640),(390,844),(768,1024),(1024,768),(1366,768),(1920,1080),(2560,1440)]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    for w,h in V:
        pg=b.new_page(viewport={'width':w,'height':h}); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file:///home/claude/idss-pedagog/index.html'); pg.click('#demo-ped'); pg.wait_for_selector('.hero'); pg.wait_for_timeout(500)
        r=[pg.evaluate('document.documentElement.scrollWidth')]
        pg.click('.hero >> text=Započni izvještaj'); pg.wait_for_selector('.uredjivac'); pg.click('#kor-administracija'); pg.wait_for_timeout(300)
        r.append(pg.evaluate('document.documentElement.scrollWidth'))
        mw=pg.evaluate("(()=>{const m=document.querySelector('main').getBoundingClientRect();return [Math.round(m.left),Math.round(window.innerWidth-m.right)]})()")
        print(w,h,'scrollWidth home/editor',r,'rubovi main',mw,'errs',errs)
        if w in (390,1920): pg.screenshot(path=f'slike/mx_{w}_admin.png', full_page=False)
        pg.close()
    b.close()
