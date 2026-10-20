// Pokreće Edge funkciju u Nodeu s lažnim fetch-om: Supabase RPC odgovori dolaze iz fixtures.json, Gemini je lažan.
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let handler; globalThis.Deno = { serve: (h) => { handler = h; }, env: { toObject: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', GEMINI_API_KEY: 'k' }) } };
await import('file://' + process.argv[3]);
const gem = []; const rpcs = [];
const mk = (st, b) => ({ ok: st < 400, status: st, json: async () => b });
const GOOD = { ukupna_ocjena: 'dobra', sazetak: 'Sažetak.', snage: ['a'], zapazanja_i_nedostaci: ['b'], procjena_po_oblastima: [{ oblast: 'Učenici', procjena: 'ok' }],
  preporuka_direktoru: { odluka: 'odobriti uz napomene', obrazlozenje: 'Jer.', koraci: ['k'] }, pitanja_za_psihologa: ['p?'], ogranicenja: 'nema' };
let gemOdg = () => mk(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD) }] } }] });
const f = async (u, i) => {
  if (u.includes('generativelanguage')) { gem.push({ u, i }); return gemOdg(); }
  const ime = u.split('/rpc/')[1]; rpcs.push(ime);
  const o = fx[i.headers.Authorization]?.[ime]; return o === undefined ? mk(401, null) : mk(200, o);
};
const orig = globalThis.fetch; globalThis.fetch = f;
const poziv = async (auth, m = 'POST') => { const r = await handler(new Request('https://x/f', { method: m, headers: auth ? { authorization: auth } : {} })); return r.status === 204 ? {} : await r.json(); };
const out = {};
out.direktor = await poziv('Bearer ' + 'd'.repeat(30));
out.gemini_zahtjev = JSON.parse(gem[0].i.body); out.gemini_zaglavlje = gem[0].i.headers;
out.psiholog = await poziv('Bearer ' + 'p'.repeat(30));
out.bez = await poziv(null);
out.get = await poziv('Bearer ' + 'd'.repeat(30), 'GET');
gemOdg = () => mk(200, { candidates: [{ content: { parts: [{ text: 'nije json' }] }, finishReason: 'MAX_TOKENS' }] });
out.neispravan = await poziv('Bearer ' + 'd'.repeat(30));
gemOdg = () => mk(429, {}); out.limit = await poziv('Bearer ' + 'd'.repeat(30));
console.log(JSON.stringify(out));
