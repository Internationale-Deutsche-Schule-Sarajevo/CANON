#!/usr/bin/env python3
"""Paritet JS Logika <-> SQL psih.*: provjera sadržaja, KPI i bodovi na istom korpusu."""
import json, random, subprocess, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import psql, J, T, lit
from uzorak import potpun, rizik, prep, mutiraj

R = random.Random(20261019)
slucajevi = []
base = potpun()
slucajevi.append({'s': base, 'r': [], 'g': 2026, 'm': 9})
slucajevi.append({'s': {}, 'r': [], 'g': 2026, 'm': 9})
slucajevi.append({'s': None, 'r': [], 'g': 2026, 'm': 9})
slucajevi.append({'s': [], 'r': [], 'g': 2026, 'm': 9})
for _ in range(900):
    s = mutiraj(base, R)
    r = []
    if R.random() < .4:
        for _ in range(R.randint(1, 3)):
            x = rizik(); k = R.choice(list(x.keys())); 
            if R.random() < .5: x[k] = R.choice([None, '', 'x', 5, '2026-13-01', 'Visok', 'Eskalirano', 'Riješeno'])
            if R.random() < .3: x['prenesen'] = R.choice([True, False])
            r.append(x)
    slucajevi.append({'s': s, 'r': r, 'g': R.choice([2026, 2026, 2027]), 'm': R.choice([9, 9, 2, 12])})

os.makedirs('/tmp/par', exist_ok=True)
json.dump(slucajevi, open('/tmp/par/korpus.json', 'w'))
js = r'''
global.module={};const fs=require('fs');
eval(fs.readFileSync('/home/claude/p2/src/logika.js','utf8')+';global.L=Logika');
const C=JSON.parse(fs.readFileSync('/tmp/par/korpus.json','utf8'));
const out=C.map(c=>{const kp=L.kpi(c.s,c.r,c.g,c.m);
 return {st:L.provjeriSadrzaj(c.s,true,c.g,c.m), ns:L.provjeriSadrzaj(c.s,false,c.g,c.m), rz:L.provjeriRizike(c.r,true), rzn:L.provjeriRizike(c.r,false),
  kpi:kp, bod:L.bodovi(c.s,c.r,kp,c.g,c.m,2,2,1)};});
fs.writeFileSync('/tmp/par/js.json',JSON.stringify(out));
'''
subprocess.run(['node', '-e', js], check=True)
JS = json.load(open('/tmp/par/js.json'))

t = T()
for n, (c, j) in enumerate(zip(slucajevi, JS)):
    sq = f"select jsonb_build_object('st', psih.provjeri_sadrzaj({lit(J(c['s']))}, true, {c['g']}, {c['m']}), 'ns', psih.provjeri_sadrzaj({lit(J(c['s']))}, false, {c['g']}, {c['m']}), 'rz', psih.provjeri_rizike({lit(J(c['r']))}, true), 'rzn', psih.provjeri_rizike({lit(J(c['r']))}, false))"
    if isinstance(c['s'], dict):
        sq += f", psih.kpi({lit(J(c['s']))}, {lit(J(c['r']))}, {c['g']}, {c['m']}) k"
        sq = sq.replace("select jsonb_build_object", "select jsonb_build_object", 1)
    rc, out, err = psql(sq + ';')
    if rc != 0:
        t.check(False, f'SQL greška #{n}', err[:200]); continue
    row = out.splitlines()[-1]
    if isinstance(c['s'], dict):
        a, k = row.rsplit('|', 1); a = json.loads(a); k = json.loads(k)
    else:
        a = json.loads(row); k = None
    for kljuc in ('st', 'ns', 'rz', 'rzn'):
        t.check(a[kljuc] == j[kljuc], f'#{n} {kljuc}', json.dumps({'sql': a[kljuc], 'js': j[kljuc]}, ensure_ascii=False)[:400])
    if k is not None:
        t.check(k == j['kpi'], f'#{n} kpi', json.dumps({'sql': k, 'js': j['kpi']}, ensure_ascii=False)[:300])
        if n % 3 == 0:
            rc, out, err = psql(f"select psih.bodovi({lit(J(c['s']))}, {lit(J(c['r']))}, {lit(J(j['kpi']))}, {c['g']}, {c['m']}, 2, 2, 1);")
            if rc != 0: t.check(False, f'bodovi #{n}', err[:300]); continue
            b = json.loads(out.splitlines()[-1])
            t.check(b == j['bod'], f'#{n} bodovi', json.dumps({'sql': b, 'js': j['bod']}, ensure_ascii=False)[:500])
sys.exit(1 if t.kraj('40_paritet') else 0)
