import asyncio, sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    for naziv, f in [('generička','/home/claude/idss-pedagog/index.html'),('Supabase','/tmp/claude-0/cfg.html')]:
        pg = b.new_page(); err=[]
        pg.on('console', lambda m: err.append(m.text) if m.type=='error' else None)
        pg.on('pageerror', lambda e: err.append(str(e)))
        pg.goto('file://'+f); pg.wait_for_timeout(1500)
        csp=[e for e in err if 'Content Security' in e or 'Refused' in e]
        print(naziv, 'CSP prekršaji:', csp, '| ostale greške:', [e for e in err if e not in csp][:3], '| ima prijavu:', pg.get_by_role('button').count()>0)
        # rute sa zlonamjernim parametrima
        for h in ['#/izvjestaj/<img src=x onerror=alert(1)>','#/novi/9999999/abc','#/izvjestaj/../../etc','#/__proto__/x']:
            pg.evaluate(f'location.hash={h!r}'); pg.wait_for_timeout(300)
        print('  hash nakon zlonamjernih ruta:', pg.evaluate('location.hash'))
    b.close()
