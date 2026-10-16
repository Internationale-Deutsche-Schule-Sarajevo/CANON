from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    for naziv,w,h_,rm in [('mobilni',390,844,'no-preference'),('tablet',820,1100,'no-preference'),('mirno',1280,900,'reduce')]:
        pg=b.new_page(viewport={'width':w,'height':h_}, reduced_motion=rm); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file:///home/claude/idss-pedagog/index.html'); pg.click('#demo-ped'); pg.wait_for_selector('.hero'); pg.wait_for_timeout(800)
        sw=pg.evaluate('document.documentElement.scrollWidth'); print(naziv,'scrollWidth',sw,'viewport',w,'errs',errs)
        pg.screenshot(path=f'slike/m_{naziv}_pocetna.png')
        pg.click('.hero >> text=Započni izvještaj'); pg.wait_for_selector('.uredjivac'); pg.wait_for_timeout(500)
        print(naziv,'editor scrollWidth',pg.evaluate('document.documentElement.scrollWidth'))
        pg.screenshot(path=f'slike/m_{naziv}_urednik.png')
        # tastatura: Tab do prvog polja
        pg.keyboard.press('Tab'); print(naziv,'fokus:',pg.evaluate('document.activeElement.className||document.activeElement.tagName'))
        pg.close()
    b.close()
