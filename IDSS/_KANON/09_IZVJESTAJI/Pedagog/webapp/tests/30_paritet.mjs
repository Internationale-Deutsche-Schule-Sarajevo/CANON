// Paritet JS <-> SQL: isti ulazi moraju dati iste greške, KPI i bodove.
// Pokretanje: node tests/30_paritet.mjs  (traži postojeću bazu idss_test, vidi run.sh)
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const L = require(path.join(dir, '../src/logika.js'));
const base = JSON.parse(readFileSync(path.join(dir, 'fixtures/potpun.json'), 'utf8'));

let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const clone = o => JSON.parse(JSON.stringify(o));
const paths = [];
(function walk(o, p) { for (const k of Object.keys(o)) { const q = [...p, k]; paths.push(q); if (o[k] && typeof o[k] === 'object') walk(o[k], q); } })(base, []);
const setPath = (o, p, v) => { let c = o; for (let i = 0; i < p.length - 1; i++) { if (c[p[i]] === undefined || c[p[i]] === null || typeof c[p[i]] !== 'object') return; c = c[p[i]]; } if (v === undefined) delete c[p[p.length - 1]]; else c[p[p.length - 1]] = v; };
const junk = [undefined, null, 'x', '', ' ', 0, -1, 7, 501, 1e3, 2.5, true, [], {}, ['a'], 'Ž'.repeat(60), '😀'.repeat(30), 'a'.repeat(2600), 'tekst\u0001kontrola',
  '2026-09-31', '2026-10-01', '2026-09-15', 'nije datum', 'održano', 'otkazano', 'Uredno', 'učenici', 'QP_03', ['QP_03', 'QP_03'], ['QP_99'], ['Ponašanje'], 20, 15, 480, 481];
const rizik = (o = {}) => ({ kategorija: pick(L.ENUM.kategorija), ozbiljnost: pick(L.ENUM.ozbiljnost), status: pick(L.ENUM.statusRizika),
  opis: 'Opis rizika dovoljne dužine', mjera: pick(['', 'Kratko', 'Mjera dovoljne dužine za provjeru']), rok: pick(['2026-09-10', '2026-10-20', '', null, 'x']),
  prenesen: rnd() < .4, ...o });
const cases = [];
for (let i = 0; i < 500; i++) {
  const s = clone(base); const n = 1 + Math.floor(rnd() * 4);
  for (let j = 0; j < n; j++) setPath(s, pick(paths), pick(junk));
  if (rnd() < .15 && s.radionice && Array.isArray(s.radionice.stavke)) s.radionice.stavke.push({ ciljna_grupa: pick(L.ENUM.grupe), naslov: 'Nova radionica', datum: '2026-09-12', trajanje_min: 45, ucesnika: pick([0, 5]), status: pick(L.ENUM.radStatus), ishod: pick(['', 'Ishod radionice je opisan']) });
  if (rnd() < .1 && s.radionice && typeof s.radionice === 'object') s.radionice.stavke = [];
  if (rnd() < .1 && s.usavrsavanje && Array.isArray(s.usavrsavanje.stavke)) s.usavrsavanje.stavke.push({ naslov: 'Seminar', vrsta: pick(L.ENUM.usavrsavanje), sati: pick([0, 2, 5, 90, 101]), datum: pick(['2026-09-02', '2026-10-02']) });
  const r = Array.from({ length: Math.floor(rnd() * 4) }, () => rizik());
  r.forEach((x, k) => x.id = `00000000-0000-4000-8000-00000000000${k}`);
  if (rnd() < .1 && r[0]) r[0].id = 'nije-uuid';
  if (rnd() < .1 && r[1]) r[1].id = r[0].id;
  const p = Array.from({ length: Math.floor(rnd() * 3) }, (_, k) => ({ id: rnd() < .5 ? `00000000-0000-4000-8000-0000000001${k}0` : undefined, naslov: pick(['Prijedlog', 'Dodatni sat podrške', '']), obrazlozenje: pick(['', 'Kratko', 'Obrazloženje koje je dovoljno dugo za provjeru']), utjecaj: pick([...L.ENUM.utjecaj, 'x']) }));
  cases.push({ s, r, p, strogo: rnd() < .6, g: 2026, m: 9, kas: Math.floor(rnd() * 6), ciklus: 1 + Math.floor(rnd() * 3), kd: pick([null, 0, 1, 3]) });
}
cases.push({ s: base, r: [], p: [], strogo: true, g: 2026, m: 9, kas: 0, ciklus: 1, kd: null });
cases.push({ s: 'nije objekat', r: 'x', p: 'y', strogo: true, g: 2026, m: 9, kas: 0, ciklus: 1, kd: null });
cases.push({ s: [], r: [], p: [], strogo: false, g: 2026, m: 12, kas: 0, ciklus: 1, kd: null });

const cases0 = cases.splice(0, cases.length, ...JSON.parse(JSON.stringify(cases)));
const lit = x => `$j$${JSON.stringify(x)}$j$::jsonb`;
const sql = `select jsonb_agg(jsonb_build_object('i', ord - 1,
  'e', interno.provjeri_sadrzaj(c -> 's', (c ->> 'strogo')::boolean, (c ->> 'g')::int, (c ->> 'm')::int),
  'er', interno.provjeri_rizike(c -> 'r', (c ->> 'strogo')::boolean),
  'ep', interno.provjeri_preporuke(c -> 'p', (c ->> 'strogo')::boolean),
  'k', case when jsonb_typeof(c -> 'r') = 'array' then interno.kpi(c -> 's', c -> 'r', (c ->> 'g')::int, (c ->> 'm')::int) end,
  'b', case when jsonb_typeof(c -> 'r') = 'array' then interno.bodovi(c -> 's', c -> 'r', interno.kpi(c -> 's', c -> 'r', (c ->> 'g')::int, (c ->> 'm')::int),
        (c ->> 'g')::int, (c ->> 'm')::int, (c ->> 'kas')::int, (c ->> 'ciklus')::int, (c ->> 'kd')::int) end))
  from jsonb_array_elements(${lit(cases)}) with ordinality t(c, ord);`;
const f = '/tmp/paritet.sql'; writeFileSync(f, sql); execFileSync('chmod', ['a+r', f]);
const out = execFileSync('su', ['postgres', '-c', `psql -At -d idss_test -f ${f}`], { maxBuffer: 1 << 28 }).toString();
const sqlRes = JSON.parse(out.trim());

const eq = (a, b) => {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
  return ka.every(k => k in b && eq(a[k], b[k]));
};
let bad = 0, ukupnoGresaka = 0;
cases.forEach((c, i) => {
  const R = sqlRes[i];
  const js = { e: L.provjeriSadrzaj(c.s, c.strogo, c.g, c.m), er: L.provjeriRizike(c.r, c.strogo), ep: L.provjeriPreporuke(c.p, c.strogo) };
  ukupnoGresaka += js.e.length;
  const prov = (kljuc) => { if (!eq(js[kljuc], R[kljuc])) { bad++; if (bad < 6) console.log(`RAZLIKA ${kljuc} u slučaju ${i}\n JS : ${JSON.stringify(js[kljuc])}\n SQL: ${JSON.stringify(R[kljuc])}`); } };
  prov('e'); prov('er'); prov('ep');
  if (Array.isArray(c.r)) {
    const k = L.kpi(c.s, c.r, c.g, c.m); const b = L.bodovi(c.s, c.r, k, c.g, c.m, c.kas, c.ciklus, c.kd);
    if (!eq(k, R.k)) { bad++; if (bad < 6) console.log(`RAZLIKA kpi u slučaju ${i}\n JS : ${JSON.stringify(k)}\n SQL: ${JSON.stringify(R.k)}`); }
    if (!eq(b, R.b)) { bad++; if (bad < 6) { const d = b.stavke.find((x, j) => !eq(x, R.b.stavke[j])); console.log(`RAZLIKA bodovi u slučaju ${i}\n JS : ${JSON.stringify(d)}\n SQL: ${JSON.stringify(R.b.stavke.find((x, j) => !eq(x, b.stavke[j])))}`); } }
  }
});
console.log(`Slučajeva: ${cases.length}, ukupno grešaka sadržaja u uzorku: ${ukupnoGresaka}, razlika JS/SQL: ${bad}`);
process.exit(bad ? 1 : 0);
