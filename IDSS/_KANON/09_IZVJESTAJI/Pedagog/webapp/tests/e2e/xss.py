from playwright.sync_api import sync_playwright
P='<img src=x onerror="window.__x=1"><script>window.__x=1</script>'
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader']); pg=b.new_page()
    pg.goto('file:///home/claude/idss-pedagog/index.html'); pg.click('#demo-ped'); pg.wait_for_selector('.hero')
    pg.click('.hero >> text=Započni izvještaj'); pg.wait_for_selector('.uredjivac')
    ta=pg.locator('.uredjivac textarea').first; ta.fill(P); pg.wait_for_timeout(2500)
    pg.reload(); pg.wait_for_timeout(1500)
    print('izvršeno:', pg.evaluate('window.__x||null'), '| img[src=x] u DOM-u:', pg.locator('img[src="x"]').count())
    b.close()
