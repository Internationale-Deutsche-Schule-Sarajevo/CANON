from playwright.sync_api import sync_playwright
import hashlib
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    for rm in ['reduce','no-preference']:
        pg=b.new_context(viewport={'width':1280,'height':900},reduced_motion=rm).new_page()
        pg.goto('file:///home/claude/idss-pedagog/index.html'); pg.click('#demo-ped'); pg.wait_for_selector('.hero canvas')
        h=[]
        for _ in range(3):
            pg.wait_for_timeout(700); h.append(hashlib.md5(pg.locator('.hero canvas').first.screenshot()).hexdigest()[:6])
        print(rm,'različitih kadrova bez miša:',len(set(h)),'/3')
    b.close()
