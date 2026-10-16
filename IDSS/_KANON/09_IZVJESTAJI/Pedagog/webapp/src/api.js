/* =====================================================================
   API — jedini sloj koji komunicira sa serverom.
   * SupabaseApi: Auth REST (/auth/v1) + PostgREST RPC (/rest/v1/rpc/idss_*).
     Ishod operacije je UVIJEK u tijelu odgovora ({ok, kod, poruka}), ne u HTTP statusu.
   * DemoApi: lokalna simulacija sa SINTETIČKIM podacima (bez mreže), jasno označena u sučelju.
   Sve odluke o ulozi i pravima donosi server; klijent ih samo prikazuje.
   ===================================================================== */
const Api = (() => {
  'use strict';
  const MREZA = { ok: false, kod: 'MREZA', poruka: 'Nema veze sa serverom. Provjerite internet i pokušajte ponovo.', mreza: true };
  const ISTEKLO = { ok: false, kod: 'SESIJA_ISTEKLA', poruka: 'Sesija je istekla. Prijavite se ponovo.' };
  let nacin = 'supabase';           // 'supabase' | 'demo'
  let cfg = { url: '', kljuc: '' };
  let sesija = null;                // { access, refresh, istice }
  const SS = (() => { try { return window.sessionStorage; } catch (e) { return null; } })();
  const ssGet = k => { try { return SS && SS.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { SS && (v === null ? SS.removeItem(k) : SS.setItem(k, v)); } catch (e) { /* privatni prozor */ } };

  function postavi(c) { cfg = { url: String(c.url || '').replace(/\/+$/, ''), kljuc: c.kljuc || '' }; }
  const konfigurisano = () => /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url) && cfg.kljuc.length > 20;

  async function http(putanja, opcije, bezAuth) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
    try {
      const h = { apikey: cfg.kljuc, 'Content-Type': 'application/json' };
      h.Authorization = 'Bearer ' + ((!bezAuth && sesija) ? sesija.access : cfg.kljuc);
      const r = await fetch(cfg.url + putanja, { ...opcije, headers: { ...h, ...(opcije.headers || {}) }, signal: ctl.signal });
      let tijelo = null; try { tijelo = await r.json(); } catch (e) { /* prazno */ }
      return { status: r.status, tijelo };
    } catch (e) { return null; } finally { clearTimeout(t); }
  }
  async function obnoviToken() {
    if (!sesija || !sesija.refresh) return false;
    const r = await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: sesija.refresh }) }, true);
    if (r && r.status === 200 && r.tijelo && r.tijelo.access_token) { spremiSesiju(r.tijelo); return true; }
    return false;
  }
  function spremiSesiju(t) {
    sesija = { access: t.access_token, refresh: t.refresh_token, istice: Date.now() + (t.expires_in || 3600) * 1000 };
    ssSet('idss_sesija', JSON.stringify(sesija));
  }
  async function rpc(ime, args, drugiPut) {
    if (sesija && sesija.istice - Date.now() < 30000 && !drugiPut) { if (!(await obnoviToken())) { sesija = null; ssSet('idss_sesija', null); return ISTEKLO; } }
    const r = await http('/rest/v1/rpc/' + ime, { method: 'POST', body: JSON.stringify(args || {}) });
    if (!r) return MREZA;
    if (r.status === 401 || (r.tijelo && (r.tijelo.code === 'PGRST301' || /JWT/i.test(r.tijelo.message || '')))) {
      if (!drugiPut && await obnoviToken()) return rpc(ime, args, true);
      sesija = null; ssSet('idss_sesija', null); return ISTEKLO;
    }
    if (r.status === 404 || (r.tijelo && r.tijelo.code === 'PGRST202'))
      return { ok: false, kod: 'NIJE_POSTAVLJENO', poruka: 'Baza nije pripremljena: pokrenite SQL datoteku iz mape „supabase“ u Supabase SQL Editoru.' };
    if (r.status === 403 || (r.tijelo && r.tijelo.code === '42501'))
      return { ok: false, kod: 'NEOVLASTEN', poruka: 'Pristup nije dozvoljen.' };
    if (r.status >= 500 || !r.tijelo || typeof r.tijelo.ok !== 'boolean')
      return { ok: false, kod: 'GRESKA_SERVERA', poruka: 'Došlo je do greške na serveru. Pokušajte ponovo.' };
    return r.tijelo;
  }

  const Supa = {
    async obnovi() {
      const s = ssGet('idss_sesija'); if (!s) return false;
      try { sesija = JSON.parse(s); } catch (e) { return false; }
      if (sesija.istice < Date.now() + 5000) return obnoviToken();
      return true;
    },
    async prijava(email, lozinka) {
      const r = await http('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: lozinka }) }, true);
      if (!r) return { ok: false, kod: 'MREZA', poruka: 'Nema veze sa Supabase-om (mreža, adresa projekta ili blokiran pristup). Provjerite adresu projekta i internet vezu.' };
      if (r.status !== 200 || !r.tijelo || !r.tijelo.access_token) {
        const t = r.tijelo || {}, kod = t.error_code || t.code || '', msg = String(t.msg || t.message || t.error_description || '');
        let poruka = 'E-pošta ili lozinka nisu ispravni.';
        if (kod === 'email_not_confirmed' || /not confirmed/i.test(msg)) poruka = 'E-pošta ovog računa nije potvrđena. U Supabase-u (Authentication → Users) potvrdite korisnika ili ga kreirajte uz opciju „Auto Confirm User“.';
        else if (/invalid api key|apikey/i.test(msg) || r.status === 401) poruka = 'Supabase odbija ključ projekta. Provjerite da je unesen javni „anon“ ključ tačnog projekta.';
        else if (kod === 'over_request_rate_limit' || r.status === 429) poruka = 'Previše pokušaja prijave. Pričekajte nekoliko minuta i pokušajte ponovo.';
        else if (kod === 'user_banned') poruka = 'Ovaj račun je onemogućen u Supabase-u.';
        else if (kod === 'validation_failed' || kod === 'bad_json') poruka = 'Unesite ispravnu e-poštu i lozinku.';
        return { ok: false, kod: 'PRIJAVA', poruka: poruka + ` (tehnički podatak: HTTP ${r.status}${kod ? ', ' + kod : ''})` };
      }
      spremiSesiju(r.tijelo); return { ok: true };
    },
    async odjava() {
      if (sesija) await http('/auth/v1/logout', { method: 'POST' });
      sesija = null; ssSet('idss_sesija', null); return { ok: true };
    },
    profil: () => rpc('idss_profil'),
    pocetna: () => rpc('idss_pocetna'),
    ucitaj: a => rpc('idss_ucitaj', { p_id: a.id || null, p_godina: a.godina || null, p_mjesec: a.mjesec || null }),
    kreiraj: (g, m, z) => rpc('idss_kreiraj', { p_godina: g, p_mjesec: m, p_zahtjev: z || null }),
    spremi: (id, rev, s, r, p, z) => rpc('idss_spremi', { p_id: id, p_revizija: rev, p_sadrzaj: s, p_rizici: r, p_preporuke: p, p_zahtjev: z || null }),
    podnesi: (id, rev, z) => rpc('idss_podnesi', { p_id: id, p_revizija: rev, p_zahtjev: z || null }),
    vrati: (id, rev, nap, z) => rpc('idss_vrati', { p_id: id, p_revizija: rev, p_napomena: nap, p_zahtjev: z || null }),
    odluka: (pid, odl, kom) => rpc('idss_odluka', { p_preporuka: pid, p_odluka: odl, p_komentar: kom || null }),
    odobri: (id, rev, ocj, kom, z) => rpc('idss_odobri', { p_id: id, p_revizija: rev, p_ocjena: ocj, p_komentar: kom || null, p_zahtjev: z || null }),
    trag: id => rpc('idss_trag', { p_id: id }),
    arhiva: () => rpc('idss_arhiva'),
  };

  /* ============================ DEMO (sintetički podaci) ============================ */
  const D = (() => {
    const L = Logika; let S = null; let uloga = null;
    const KLJUC = 'idss_demo_v2';
    const danasIso = () => {
      const d = new Date(); const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Sarajevo' }).format(d); return p;   // GGGG-MM-DD
    };
    const kopija = o => JSON.parse(JSON.stringify(o));
    const spremiSve = () => ssSet(KLJUC, JSON.stringify(S));
    const pb = (g, m) => g * 12 + m;
    const period = iso => ({ g: +iso.slice(0, 4), m: +iso.slice(5, 7) });
    const greska = (kod, poruka, extra) => Object.assign({ ok: false, kod, poruka }, extra || {});
    const ISPRAVAN = greska('GRESKA_SERVERA', 'Došlo je do greške u probnom režimu.');

    function sadrzajDemo(g, m, jaci) {
      const p = n => `${g}-${String(m).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      return {
        ucenici: { individualni_razgovori: 22, razliciti_ucenici: 16, grupni_rad: 3, daroviti_ucenici: 2, teme: ['Ponašanje', 'Učenje i ocjene', 'Adaptacija novih učenika'],
          sazetak: 'Većina razgovora odnosila se na organizaciju učenja i prilagodbu novih učenika. Uz podršku razrednika dogovoreni su individualni planovi rada za nekoliko učenika. (Probni podaci)' },
        nastavnici: { posjete_planirano: 8, posjete_realizirano: jaci ? 8 : 6, razredi: 'Razredi 1, 3, 4 i 5', nalazi: 'Posjećeni časovi imaju jasnu strukturu i aktivno uključivanje učenika; preporučena je veća diferencijacija zadataka. (Probni podaci)',
          obrazlozenje_prekoracenja: '', konsultacije: 12, mentorstvo_sati: 5, sastanci_vijeca: 2,
          koordinacija: 'Usklađen je raspored pisanih provjera i dogovorena podrška nastavnicima novim u školi, uz plan posjeta časovima. (Probni podaci)' },
        roditelji: { individualni_razgovori: 8, roditeljski_sastanci: 2, pisana_komunikacija: 10,
          biljeske: 'Roditelji su najviše pitali o kućnim zadacima i prilagodbi djece. Dogovorene su smjernice za dnevni ritam učenja. (Probni podaci)' },
        radionice: { stavke: [
          { ciljna_grupa: 'učenici', naslov: 'Kako učimo: tehnike pamćenja', datum: p(18), trajanje_min: 45, ucesnika: 22, status: 'održano', ishod: 'Učenici su izradili kartice za učenje i dogovorili plan ponavljanja.', qp05_zapis: 'Da' },
          { ciljna_grupa: 'roditelji', naslov: 'Podrška djetetu pri učenju kod kuće', datum: p(25), trajanje_min: 60, ucesnika: 17, status: 'održano', ishod: 'Roditelji su dobili praktične smjernice za razgovor o školi.', qp05_zapis: 'Ne' }], nema_obrazlozenje: '' },
        usavrsavanje: { stavke: [{ naslov: 'Webinar o inkluzivnom obrazovanju', vrsta: 'webinar', sati: 3, datum: p(10) }] },
        administracija: { kreativni_planirano: 3, kreativni_odrzano: 3, kreativni_posjeceno: 2, kreativni_napomena: 'Jedan kreativni čas nije posjećen zbog preklapanja sa posjetom časovima drugog razreda. (Probni podaci)', ednevnik: 'Uredno', mooks_sazetak: 'Dostavljen je mjesečni statistički izvještaj; nije bilo posebnih zahtjeva Ministarstva.', dokumentacija: '' },
        zakljucak: { postignuca: 'Uspostavljeno je praćenje prilagodbe novih učenika, održane su dvije radionice i završen je plan posjeta časovima za polugodište, u skladu s planom.',
          plan_sljedeci: 'U sljedećem mjesecu planiram deset posjeta časovima, radionicu za nastavnike o diferencijaciji, razgovore sa roditeljima i evaluaciju planova podrške za učenike.' },
      };
    }
    function pocetnoStanje() {
      const danas = danasIso(); const { g, m } = period(danas);
      let g2 = g, m2 = m - 2; if (m2 < 1) { m2 += 12; g2--; }
      let g1 = g, m1 = m - 1; if (m1 < 1) { m1 += 12; g1--; }
      S = { danas, neradni: [], izvjestaji: [], brojac: {}, trag: [], prviPeriod: pb(g2, m2) };
      // Odobren izvještaj prije dva mjeseca, sa jednim otvorenim rizikom koji se prenosi
      const rid = L.uuid();
      const i2 = novi(g2, m2); i2.sadrzaj = sadrzajDemo(g2, m2, true);
      i2.rizici = [{ id: rid, kod: `RSK-${g2}-001`, kategorija: 'Akademski', opis: 'Pad uspjeha iz matematike u petom razredu (probni podatak)', ozbiljnost: 'Visok',
        mjera: 'Dodatna nastava i praćenje napretka tokom tri sedmice', rok: L.dodajDane(i2.rok_podnosenja, 20), status: 'U toku', kreiran: pb(g2, m2) }];
      i2.preporuke = [{ id: L.uuid(), naslov: 'Dodatni sat podrške iz matematike', obrazlozenje: 'Veći broj učenika petog razreda ima slabije rezultate; potreban je dodatni sat sedmično.', utjecaj: 'Potreban budžet', odluka: 'Odobreno', komentar_direktora: 'Odobreno za polugodište.', odlucio_u: null }];
      S.brojac[g2] = 1;
      podnesiInterno(i2, i2.rok_podnosenja, 0); odobriInterno(i2, 4, 'Cjelovit i konkretan izvještaj. (probni podatak)'); i2.podnesen_u = L.dodajDane(i2.rok_podnosenja, -1) + 'T09:30:00.000Z'; i2.odobren_u = new Date(Date.now() - 40 * 864e5).toISOString();
      // Podnesen izvještaj prošlog mjeseca (čeka odluku direktora)
      const i1 = novi(g1, m1); i1.sadrzaj = sadrzajDemo(g1, m1, false);
      i1.sadrzaj.nastavnici.obrazlozenje_prekoracenja = '';
      i1.rizici = [{ id: rid, kod: `RSK-${g2}-001`, kategorija: 'Akademski', opis: 'Pad uspjeha iz matematike u petom razredu (probni podatak)', ozbiljnost: 'Visok',
        mjera: 'Dodatna nastava i praćenje napretka tokom tri sedmice', rok: L.dodajDane(i1.rok_podnosenja, -25), status: 'Otvoreno', kreiran: pb(g2, m2) }];
      i1.preporuke = [{ id: L.uuid(), naslov: 'Radionica za nastavnike o diferencijaciji', obrazlozenje: 'Nalazi posjeta časovima pokazuju potrebu za zajedničkom radionicom u okviru stručnog usavršavanja.', utjecaj: 'Nema troškova', odluka: 'Na čekanju', komentar_direktora: null, odlucio_u: null }];
      podnesiInterno(i1, L.dodajDane(i1.rok_podnosenja, -1), 0); i1.podnesen_u = L.dodajDane(i1.rok_podnosenja, -1) + 'T10:15:00.000Z';
      spremiSve();
    }
    function novi(g, m) {
      const i = { id: L.uuid(), godina: g, mjesec: m, status: 'nacrt', revizija: 1, ciklus: 0, sadrzaj: {}, rizici: [], preporuke: [], rok_podnosenja: L.rokPodnosenja(g, m, S.neradni),
        rok_dopune: null, podnesen_u: null, vracen_u: null, odobren_u: null, direktor_napomena: null, direktor_ocjena: null, na_vrijeme: null, prvo_kasnjenje: null, kasnjenje_dopune: null, bodovi: null, snimci: [], zahtjev: null };
      S.izvjestaji.push(i); return i;
    }
    const rizikJson = (i, r) => {
      const pre = predhodnoStanje(r.id, pb(i.godina, i.mjesec));
      return { id: r.id, kod: r.kod, kategorija: r.kategorija, opis: r.opis, ozbiljnost: r.ozbiljnost, mjera: r.mjera, rok: r.rok, status: r.status,
        prenesen: !!(pre && pre.status !== 'Riješeno'), kreiran_period: Math.floor(r.kreiran / 12) * 100 + (r.kreiran % 12 || 12) };
    };
    function predhodnoStanje(rid, brojPerioda) {
      let naj = null, njb = -1;
      for (const i of S.izvjestaji) { const b = pb(i.godina, i.mjesec); if (b >= brojPerioda) continue;
        const r = i.rizici.find(x => x.id === rid); if (r && b > njb) { naj = r; njb = b; } }
      return naj;
    }
    const prenesenih = i => {
      const b = pb(i.godina, i.mjesec); const ids = new Set();
      S.izvjestaji.forEach(x => x.rizici.forEach(r => ids.add(r.id)));
      const out = [];
      ids.forEach(id => { const p = predhodnoStanje(id, b); if (p && p.status !== 'Riješeno') out.push({ id, kod: p.kod }); });
      return out;
    };
    const rizici = i => i.rizici.map(r => rizikJson(i, r)).sort((a, b) => a.kod < b.kod ? -1 : 1);
    const dopuna = i => (i.status === 'vracen' ? L.radnihIzmedju(i.rok_dopune, S.danas, S.neradni) : null);
    const kasnjenjePrvo = i => (i.ciklus === 0 ? L.radnihIzmedju(i.rok_podnosenja, S.danas, S.neradni) : (i.prvo_kasnjenje || 0));

    function stanje(i) {
      const vlasnik = uloga === 'pedagog';
      let sad, riz, prep;
      if (vlasnik) { sad = i.sadrzaj; riz = rizici(i); prep = i.preporuke; }
      else if (uloga === 'direktor' && i.status !== 'nacrt') {
        const sn = i.snimci[i.snimci.length - 1]; sad = sn.sadrzaj; riz = sn.rizici;
        prep = sn.preporuke.map(x => { const z = i.preporuke.find(p => p.id === x.id) || x; return { ...x, odluka: z.odluka, komentar_direktora: z.komentar_direktora, odlucio_u: z.odlucio_u }; });
      } else return null;
      const kp = L.kpi(sad, riz, i.godina, i.mjesec);
      const uredjivo = vlasnik && ['nacrt', 'vracen'].includes(i.status);
      let prov = [], pregled = null;
      const kas = kasnjenjePrvo(i), kd = dopuna(i);
      if (uredjivo) { prov = provjeriSve(i, sad, riz, prep, true); pregled = L.bodovi(sad, riz, kp, i.godina, i.mjesec, kas, i.ciklus + 1, kd); }
      return kopija({ id: i.id, godina: i.godina, mjesec: i.mjesec, status: i.status, revizija: i.revizija, ciklus: i.ciklus,
        rok_podnosenja: i.rok_podnosenja, rok_dopune: i.rok_dopune, podnesen_u: i.podnesen_u, vracen_u: i.vracen_u, odobren_u: i.odobren_u,
        direktor_napomena: i.direktor_napomena, direktor_ocjena: i.direktor_ocjena, na_vrijeme: i.na_vrijeme,
        pedagog: { ime: S.ime }, moje: vlasnik, moze_urediti: uredjivo, moze_podnijeti: uredjivo && prov.length === 0,
        moze_odluciti: !vlasnik && uloga === 'direktor' && i.status === 'podnesen',
        kasnjenje_prvo: kas, kasnjenje_dopune_sada: kd, ciklus_sljedeci: i.ciklus + 1,
        sadrzaj: sad, rizici: riz, preporuke: prep, kpi: kp, provjera: prov, bodovi_pregled: pregled, bodovi: i.bodovi, danas: S.danas });
    }
    function provjeriBaza(i, riz, prep) {
      const e = []; const b = pb(i.godina, i.mjesec); const prisutni = [];
      riz.forEach((x, idx) => {
        const put = `rizici.${idx}`;
        if (!x.id) return;
        let ident = null;
        for (const j of S.izvjestaji) { const r = j.rizici.find(q => q.id === x.id); if (r) { ident = r; break; } }
        if (!ident || pb(...Object.values(period(`${Math.floor(ident.kreiran / 12 - (ident.kreiran % 12 === 0 ? 1 : 0))}-01-01`)).slice(0, 0)) < -1) { /* nastavlja */ }
        if (!ident) { e.push({ polje: put + '.id', kod: 'NEPOZNAT', poruka: 'Rizik ne postoji među Vašim rizicima.' }); return; }
        if (ident.kreiran > b) { e.push({ polje: put + '.id', kod: 'NEPOZNAT', poruka: 'Rizik je kreiran u kasnijem periodu.' }); return; }
        prisutni.push(x.id);
        if (ident.kreiran < b) {
          const pre = predhodnoStanje(x.id, b);
          if (!pre || pre.status === 'Riješeno') e.push({ polje: put + '.id', kod: 'RIZIK_RIJESEN', poruka: `Rizik ${ident.kod} je ranije riješen i ne može se ponovo navoditi.` });
          if (ident.kategorija !== x.kategorija || ident.opis !== L.btrim(x.opis)) e.push({ polje: put + '.opis', kod: 'NEPROMJENJIVO', poruka: `Kategorija i opis rizika ${ident.kod} ne mijenjaju se nakon prvog perioda.` });
        }
        const staro = i.rizici.find(q => q.id === x.id);
        const kasnije = S.izvjestaji.some(j => pb(j.godina, j.mjesec) > b && j.rizici.some(q => q.id === x.id));
        if (kasnije && x.status === 'Riješeno' && !(staro && staro.status === 'Riješeno'))
          e.push({ polje: put + '.status', kod: 'KASNIJI_PERIOD', poruka: `Rizik ${ident.kod} već postoji u kasnijem izvještaju; status se ovdje ne može zatvoriti.` });
      });
      prenesenih(i).forEach(p => { if (!prisutni.includes(p.id)) e.push({ polje: 'rizici', kod: 'PRENESENI_RIZIK_NEDOSTAJE', poruka: `Preneseni otvoreni rizik ${p.kod} mora ostati u izvještaju.` }); });
      i.rizici.forEach(r => { if (!prisutni.includes(r.id) && S.izvjestaji.some(j => pb(j.godina, j.mjesec) > b && j.rizici.some(q => q.id === r.id)))
        e.push({ polje: 'rizici', kod: 'KASNIJI_PERIOD', poruka: `Rizik ${r.kod} postoji u kasnijem izvještaju i ne može se ukloniti.` }); });
      prep.forEach((x, idx) => {
        if (!x.id) return; const p = i.preporuke.find(q => q.id === x.id);
        if (!p) { e.push({ polje: `preporuke.${idx}.id`, kod: 'NEPOZNAT', poruka: 'Preporuka ne postoji u ovom izvještaju.' }); return; }
        if (['Odobreno', 'Odbijeno'].includes(p.odluka) && (p.naslov !== L.btrim(x.naslov) || p.obrazlozenje !== L.btrim(x.obrazlozenje) || p.utjecaj !== x.utjecaj))
          e.push({ polje: `preporuke.${idx}`, kod: 'ODLUKA_ZAKLJUCANA', poruka: 'Preporuka o kojoj je direktor odlučio ne može se mijenjati.' });
      });
      i.preporuke.filter(p => ['Odobreno', 'Odbijeno'].includes(p.odluka)).forEach(p => {
        if (!prep.some(y => y.id === p.id)) e.push({ polje: 'preporuke', kod: 'ODLUKA_ZAKLJUCANA', poruka: `Preporuka „${p.naslov}“ ima odluku direktora i ne može se ukloniti.` });
      });
      return e;
    }
    function provjeriSve(i, sad, riz, prep, strogo) {
      let e = [].concat(L.provjeriSadrzaj(sad, strogo, i.godina, i.mjesec), L.provjeriRizike(riz, strogo), L.provjeriPreporuke(prep, strogo));
      if (!L.provjeriRizike(riz, false).length && !L.provjeriPreporuke(prep, false).length) e = e.concat(provjeriBaza(i, riz, prep));
      return e;
    }
    const upisiTrag = (akcija, i, sazetak) => S.trag.push({ vrijeme: new Date().toISOString(), akcija, izvjestaj_id: i.id, akter: S.ime, uloga, sazetak: sazetak || {} });

    function podnesiInterno(i, danas, kd) {
      const rz = rizici(i); const kp = L.kpi(i.sadrzaj, rz, i.godina, i.mjesec);
      const c = i.ciklus + 1; const kas = i.ciklus === 0 ? L.radnihIzmedju(i.rok_podnosenja, danas, S.neradni) : (i.prvo_kasnjenje || 0);
      const bod = L.bodovi(i.sadrzaj, rz, kp, i.godina, i.mjesec, kas, c, i.status === 'vracen' ? kd : null);
      bod.direktor = 0; bod.ukupno = bod.zbroj; bod.konacno = false;
      i.snimci.push({ ciklus: c, sadrzaj: kopija(i.sadrzaj), rizici: kopija(rz), preporuke: kopija(i.preporuke), kpi: kp, bodovi: bod });
      i.na_vrijeme = i.ciklus === 0 ? kas === 0 : i.na_vrijeme; i.prvo_kasnjenje = kas; i.kasnjenje_dopune = kd;
      i.status = 'podnesen'; i.ciklus = c; i.podnesen_u = new Date().toISOString(); i.revizija++; i.bodovi = bod;
    }
    function odobriInterno(i, ocjena, kom) {
      const bod = kopija(i.bodovi);
      bod.stavke.push({ kod: 'D1', grupa: 'direktor', naziv: 'Ocjena direktora o kvalitetu', bodovi: ocjena * 20, max: 100, napomena: `Ocjena ${ocjena} od 5 (po 20 bodova).` });
      bod.direktor = ocjena * 20; bod.ukupno = bod.zbroj + ocjena * 20; bod.konacno = true; bod.max = 1000;
      i.bodovi = bod; i.status = 'odobren'; i.odobren_u = new Date().toISOString(); i.direktor_ocjena = ocjena; i.direktor_napomena = kom || i.direktor_napomena; i.revizija++;
    }
    function ocisti(s) { return JSON.parse(JSON.stringify(s), (k, v) => typeof v === 'string' ? L.btrim(v) : v); }

    return {
      aktiviraj(u) {
        uloga = u;
        const s = ssGet(KLJUC);
        if (s) { try { S = JSON.parse(s); } catch (e) { S = null; } }
        if (!S) pocetnoStanje();
        S.danas = danasIso(); S.ime = u === 'pedagog' ? 'Amina Demić (probni račun)' : 'Direktor škole (probni račun)'; S.imePedagoga = 'Amina Demić (probni račun)'; S.ime = S.imePedagoga;
      },
      reset() { ssSet(KLJUC, null); S = null; },
      uloga: () => uloga,
      async profil() { return { ok: true, ime: uloga === 'pedagog' ? S.imePedagoga : 'Direktor škole (probni račun)', uloga, danas: S.danas }; },
      async kreiraj(g, m) {
        if (uloga !== 'pedagog') return greska('ZABRANJENO', 'Izvještaj može kreirati samo pedagog.');
        const t = period(S.danas);
        if (pb(g, m) > pb(t.g, t.m)) return greska('BUDUCI_PERIOD', 'Izvještaj se ne može kreirati za period koji još nije počeo.');
        if (pb(g, m) < S.prviPeriod) return greska('PERIOD_PRIJE_POCETKA', 'Period je prije početka izvještavanja u ovom sistemu.');
        const postojeci = S.izvjestaji.find(i => i.godina === g && i.mjesec === m);
        if (postojeci) return { ok: true, ponovljeno: true, izvjestaj: stanje(postojeci) };
        const prev = S.izvjestaji.filter(i => pb(i.godina, i.mjesec) < pb(g, m)).sort((a, b) => pb(b.godina, b.mjesec) - pb(a.godina, a.mjesec))[0];
        if (prev && prev.status === 'nacrt') return greska('PRETHODNI_NACRT', `Prethodni izvještaj (${String(prev.mjesec).padStart(2, '0')}/${prev.godina}) je još nacrt. Podnesite ga prije nastavka.`);
        const i = novi(g, m);
        prenesenih(i).forEach(p => { const pre = predhodnoStanje(p.id, pb(g, m)); i.rizici.push({ ...kopija(pre) }); });
        upisiTrag('KREIRAN_NACRT', i, { godina: g, mjesec: m }); spremiSve();
        return { ok: true, izvjestaj: stanje(i) };
      },
      async ucitaj(a) {
        const i = a.id ? S.izvjestaji.find(x => x.id === a.id) : S.izvjestaji.find(x => x.godina === a.godina && x.mjesec === a.mjesec);
        if (!i) return greska('NE_POSTOJI', 'Izvještaj nije pronađen.');
        const s = stanje(i); if (!s) return greska('ZABRANJENO', 'Nemate pravo pristupa ovom izvještaju.');
        return { ok: true, izvjestaj: s };
      },
      async spremi(id, rev, sad, riz, prep, z) {
        const i = S.izvjestaji.find(x => x.id === id);
        if (!i || uloga !== 'pedagog') return greska('ZABRANJENO', 'Nemate pravo mijenjati ovaj izvještaj.');
        if (z && i.zahtjev === z) return { ok: true, ponovljeno: true, izvjestaj: stanje(i) };
        if (!['nacrt', 'vracen'].includes(i.status)) return greska('POGRESNO_STANJE', `Izvještaj u stanju „${i.status}“ ne može se mijenjati.`);
        if (rev !== i.revizija) return greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen (drugi tab ili uređaj).', { revizija_servera: i.revizija });
        riz = riz || []; prep = prep || [];
        let e = [].concat(L.provjeriSadrzaj(sad, false, i.godina, i.mjesec), L.provjeriRizike(riz, false), L.provjeriPreporuke(prep, false));
        let s2, r2, p2;
        if (!e.length) { s2 = ocisti(sad); r2 = ocisti(riz); p2 = ocisti(prep); e = provjeriBaza(i, r2, p2); }
        if (e.length) return greska('VALIDACIJA', 'Podaci nisu ispravni. Ispravite označena polja.', { greske: e });
        const b = pb(i.godina, i.mjesec);
        const nova = r2.map(x => {
          let ident = null; if (x.id) for (const j of S.izvjestaji) { const r = j.rizici.find(q => q.id === x.id); if (r) { ident = r; break; } }
          let kod, kreiran, id2 = x.id;
          if (ident) { kod = ident.kod; kreiran = ident.kreiran; }
          else { S.brojac[i.godina] = (S.brojac[i.godina] || 0) + 1; kod = `RSK-${i.godina}-${String(S.brojac[i.godina]).padStart(3, '0')}`; kreiran = b; id2 = L.uuid(); }
          const kat = (ident && ident.kreiran < b) ? ident.kategorija : x.kategorija, op = (ident && ident.kreiran < b) ? ident.opis : x.opis;
          return { id: id2, kod, kategorija: kat, opis: op, ozbiljnost: x.ozbiljnost, mjera: x.mjera || '', rok: x.rok || null, status: x.status, kreiran };
        });
        i.rizici = nova;
        const stare = i.preporuke;
        i.preporuke = p2.map(x => {
          const p = x.id && stare.find(q => q.id === x.id);
          if (p) { if (['Odobreno', 'Odbijeno'].includes(p.odluka)) return p; const reset = p.odluka === 'Potrebna dorada'; return { ...p, naslov: x.naslov, obrazlozenje: x.obrazlozenje || '', utjecaj: x.utjecaj, odluka: reset ? 'Na čekanju' : p.odluka, odlucio_u: reset ? null : p.odlucio_u }; }
          return { id: L.uuid(), naslov: x.naslov, obrazlozenje: x.obrazlozenje || '', utjecaj: x.utjecaj, odluka: 'Na čekanju', komentar_direktora: null, odlucio_u: null };
        });
        i.sadrzaj = s2; i.revizija++; i.zahtjev = z || null;
        upisiTrag('SPREMLJEN_NACRT', i, { revizija: i.revizija, rizika: nova.length, preporuka: i.preporuke.length }); spremiSve();
        return { ok: true, izvjestaj: stanje(i) };
      },
      async podnesi(id, rev, z) {
        const i = S.izvjestaji.find(x => x.id === id);
        if (!i || uloga !== 'pedagog') return greska('ZABRANJENO', 'Nemate pravo podnijeti ovaj izvještaj.');
        if (z && i.zahtjev === z) return { ok: true, ponovljeno: true, izvjestaj: stanje(i) };
        if (!['nacrt', 'vracen'].includes(i.status)) return greska('POGRESNO_STANJE', `Izvještaj u stanju „${i.status}“ ne može se podnijeti.`);
        if (rev !== i.revizija) return greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen (drugi tab ili uređaj).', { revizija_servera: i.revizija });
        const e = provjeriSve(i, i.sadrzaj, rizici(i), i.preporuke, true);
        if (e.length) return greska('VALIDACIJA', 'Izvještaj nije potpun. Dopunite označena polja prije podnošenja.', { greske: e });
        const kd = i.status === 'vracen' ? L.radnihIzmedju(i.rok_dopune, S.danas, S.neradni) : null;
        podnesiInterno(i, S.danas, kd); i.zahtjev = z || null;
        upisiTrag(i.ciklus === 1 ? 'PODNESEN' : 'PONOVO_PODNESEN', i, { ciklus: i.ciklus, kasnjenje_radnih_dana: i.prvo_kasnjenje, bodovi_zbroj: i.bodovi.zbroj }); spremiSve();
        return { ok: true, izvjestaj: stanje(i) };
      },
      async vrati(id, rev, nap, z) {
        const i = S.izvjestaji.find(x => x.id === id); nap = L.btrim(nap || '');
        if (uloga !== 'direktor') return greska('ZABRANJENO', 'Izvještaj može vratiti samo direktor.');
        if (!i) return greska('NE_POSTOJI', 'Izvještaj nije pronađen.');
        if (z && i.zahtjev === z) return { ok: true, ponovljeno: true, izvjestaj: stanje(i) };
        if (i.status !== 'podnesen') return greska('POGRESNO_STANJE', 'Vratiti se može samo podnesen izvještaj.');
        if (rev !== i.revizija) return greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen.', { revizija_servera: i.revizija });
        if (L.len(nap) < 15 || L.len(nap) > 2000) return greska('VALIDACIJA', 'Obrazloženje mora imati između 15 i 2000 znakova.', { greske: [{ polje: 'napomena', kod: 'DUZINA', poruka: 'Obrazloženje mora imati između 15 i 2000 znakova.' }] });
        i.status = 'vracen'; i.revizija++; i.vracen_u = new Date().toISOString(); i.rok_dopune = L.dodajRadne(S.danas, 3, S.neradni); i.direktor_napomena = nap; i.zahtjev = z || null;
        upisiTrag('VRACEN_NA_DOPUNU', i, { ciklus: i.ciklus, rok_dopune: i.rok_dopune }); spremiSve();
        return { ok: true, izvjestaj: stanje(i) };
      },
      async odluka(pid, odl, kom) {
        if (uloga !== 'direktor') return greska('ZABRANJENO', 'Odluku o preporuci može donijeti samo direktor.');
        const i = S.izvjestaji.find(x => x.preporuke.some(p => p.id === pid)); if (!i) return greska('NE_POSTOJI', 'Preporuka nije pronađena.');
        if (i.status !== 'podnesen') return greska('POGRESNO_STANJE', 'Odluka se donosi samo dok je izvještaj podnesen.');
        kom = L.btrim(kom || '') || null;
        if (!L.ENUM.odluka.includes(odl) || odl === 'Na čekanju') return greska('VALIDACIJA', 'Odluka nije ispravna.');
        if (kom && L.len(kom) > 1000) return greska('VALIDACIJA', 'Komentar može imati najviše 1000 znakova.');
        if (['Odbijeno', 'Potrebna dorada'].includes(odl) && !kom) return greska('VALIDACIJA', `Uz odluku „${odl}“ komentar je obavezan.`);
        const p = i.preporuke.find(x => x.id === pid); p.odluka = odl; p.komentar_direktora = kom; p.odlucio_u = new Date().toISOString(); i.revizija++;
        upisiTrag('ODLUKA_O_PREPORUCI', i, { preporuka: pid, odluka: odl }); spremiSve();
        return { ok: true, izvjestaj: stanje(i) };
      },
      async odobri(id, rev, ocj, kom, z) {
        const i = S.izvjestaji.find(x => x.id === id); kom = L.btrim(kom || '') || null;
        if (uloga !== 'direktor') return greska('ZABRANJENO', 'Izvještaj može odobriti samo direktor.');
        if (!i) return greska('NE_POSTOJI', 'Izvještaj nije pronađen.');
        if (z && i.zahtjev === z) return { ok: true, ponovljeno: true, izvjestaj: stanje(i) };
        if (i.status !== 'podnesen') return greska('POGRESNO_STANJE', 'Odobriti se može samo podnesen izvještaj.');
        if (rev !== i.revizija) return greska('SUKOB_VERZIJA', 'Izvještaj je u međuvremenu izmijenjen.', { revizija_servera: i.revizija });
        if (!Number.isInteger(ocj) || ocj < 0 || ocj > 5) return greska('VALIDACIJA', 'Ocjena kvaliteta mora biti između 0 i 5.');
        if (i.preporuke.some(p => p.odluka === 'Na čekanju')) return greska('PREPORUKE_BEZ_ODLUKE', 'Prije odobrenja potrebno je odlučiti o svim preporukama.');
        if (i.preporuke.some(p => p.odluka === 'Potrebna dorada')) return greska('PREPORUKE_TRAZE_DORADU', 'Postoji preporuka označena kao „Potrebna dorada“. Vratite izvještaj na dopunu.');
        odobriInterno(i, ocj, kom); i.zahtjev = z || null;
        upisiTrag('ODOBREN', i, { ocjena: ocj, bodovi_ukupno: i.bodovi.ukupno }); spremiSve();
        return { ok: true, izvjestaj: stanje(i) };
      },
      async trag(id) {
        const i = S.izvjestaji.find(x => x.id === id);
        if (!i || (uloga === 'direktor' && i.status === 'nacrt')) return greska('ZABRANJENO', 'Nemate pravo pristupa historiji ovog izvještaja.');
        return { ok: true, dogadjaji: S.trag.filter(t => t.izvjestaj_id === id && (uloga === 'pedagog' || t.akcija !== 'SPREMLJEN_NACRT')) };
      },
      async arhiva() {
        const lista = S.izvjestaji.filter(i => uloga === 'pedagog' || i.status !== 'nacrt').sort((a, b) => pb(b.godina, b.mjesec) - pb(a.godina, a.mjesec))
          .map(i => ({ id: i.id, pedagog: S.imePedagoga, godina: i.godina, mjesec: i.mjesec, status: i.status, podnesen_u: i.podnesen_u, odobren_u: i.odobren_u, ciklus: i.ciklus,
            na_vrijeme: i.na_vrijeme, bodovi_ukupno: i.bodovi ? i.bodovi.ukupno : null, konacno: !!(i.bodovi && i.bodovi.konacno) }));
        return { ok: true, izvjestaji: lista };
      },
      async pocetna() {
        const t = period(S.danas); const danas = S.danas;
        if (uloga === 'pedagog') {
          const start = Math.max(S.prviPeriod, pb(t.g, t.m) - 11); const periodi = [];
          for (let b = pb(t.g, t.m); b >= start; b--) {
            const g = Math.floor((b - 1) / 12), m = b - g * 12; const i = S.izvjestaji.find(x => x.godina === g && x.mjesec === m);
            const rok = L.rokPodnosenja(g, m, S.neradni);
            const kasni = (!i || i.status === 'nacrt') ? danas > rok : (i.status === 'vracen' ? danas > i.rok_dopune : false);
            periodi.push({ godina: g, mjesec: m, id: i ? i.id : null, status: i ? i.status : 'nema', rok, rok_dopune: i ? i.rok_dopune : null, kasni, na_vrijeme: i ? i.na_vrijeme : null,
              bodovi_ukupno: i && i.bodovi ? i.bodovi.ukupno : null, konacno: !!(i && i.bodovi && i.bodovi.konacno) });
          }
          let serija = 0, prekid = false;
          for (let b = pb(t.g, t.m); b >= start && !prekid; b--) {
            const g = Math.floor((b - 1) / 12), m = b - g * 12; const i = S.izvjestaji.find(x => x.godina === g && x.mjesec === m);
            if (i && i.ciklus > 0 && i.na_vrijeme) serija++; else if (b === pb(t.g, t.m)) { /* tekući još nije dospio */ } else prekid = true;
          }
          const sg = L.skolskaGodina(t.g, t.m);
          const odob = S.izvjestaji.filter(i => i.status === 'odobren' && L.skolskaGodina(i.godina, i.mjesec) === sg);
          const prosjek = odob.length ? Math.round(odob.reduce((a, i) => a + i.bodovi.ukupno, 0) / odob.length) : 0;
          const uObradi = S.izvjestaji.filter(i => i.status === 'podnesen' && L.skolskaGodina(i.godina, i.mjesec) === sg).reduce((a, i) => a + i.bodovi.ukupno, 0);
          const sn = S.izvjestaji.filter(i => ['podnesen', 'odobren'].includes(i.status) && L.skolskaGodina(i.godina, i.mjesec) === sg).map(i => i.snimci[i.snimci.length - 1]);
          const znacke = [
            { kod: 'SERIJA_3', naziv: 'Serija od tri', opis: 'Tri uzastopna izvještaja podnesena u roku.', stecena: serija >= 3 },
            { kod: 'BEZ_VRACANJA', naziv: 'Prvi put dobro', opis: 'Izvještaj odobren bez vraćanja na dopunu.', stecena: odob.some(i => i.ciklus === 1) },
            { kod: 'PUNE_POSJETE', naziv: 'Puni plan posjeta', opis: 'Realizirane sve planirane posjete časovima u mjesecu.', stecena: sn.some(x => x.kpi.kpi01.stopa !== null && x.kpi.kpi01.stopa >= 100) },
            { kod: 'RIZICI_ZATVORENI', naziv: 'Zatvoren rizik', opis: 'Barem jedan rizik riješen u mjesečnom izvještaju.', stecena: sn.some(x => x.kpi.kpi03.rijeseno_3a >= 1) },
            { kod: 'KRUG_RADIONICA', naziv: 'Tri kruga radionica', opis: 'U jednom mjesecu održane radionice za učenike, nastavnike i roditelje.', stecena: sn.some(x => new Set(((x.sadrzaj.radionice || {}).stavke || []).filter(r => r.status === 'održano').map(r => r.ciljna_grupa)).size === 3) }];
          const sljedeci = odob.length ? [[500, 'Saradnik'], [650, 'Stručnjak'], [800, 'Majstor'], [900, 'Velemajstor']].filter(x => x[0] > prosjek).map(x => ({ naziv: x[1], prag: x[0] }))[0] || null : null;
          return { ok: true, uloga, ime: S.imePedagoga, danas, tekuci_period: { godina: t.g, mjesec: t.m }, periodi,
            sezona: { skolska_godina: sg, prosjek: odob.length ? prosjek : null, broj_odobrenih: odob.length, zbroj_potvrdjenih: odob.reduce((a, i) => a + i.bodovi.ukupno, 0), u_obradi: uObradi, rang: odob.length ? L.rang(prosjek) : null, sljedeci_rang: sljedeci },
            serija, znacke };
        }
        const cekaju = S.izvjestaji.filter(i => i.status === 'podnesen').map(i => ({ id: i.id, pedagog: S.imePedagoga, godina: i.godina, mjesec: i.mjesec, podnesen_u: i.podnesen_u, ciklus: i.ciklus, rok: i.rok_podnosenja, bodovi_zbroj: i.bodovi.zbroj }));
        const kasne = [];
        const start = Math.max(S.prviPeriod, pb(t.g, t.m) - 11);
        for (let b = start; b <= pb(t.g, t.m); b++) {
          const g = Math.floor((b - 1) / 12), m = b - g * 12; const i = S.izvjestaji.find(x => x.godina === g && x.mjesec === m); const rok = L.rokPodnosenja(g, m, S.neradni);
          if ((!i || i.status === 'nacrt') && danas > rok) kasne.push({ pedagog: S.imePedagoga, godina: g, mjesec: m, status: i ? 'nacrt' : 'nema', rok, kasni_radnih_dana: L.radnihIzmedju(rok, danas, S.neradni) });
          else if (i && i.status === 'vracen' && danas > i.rok_dopune) kasne.push({ pedagog: S.imePedagoga, godina: g, mjesec: m, status: 'vracen', rok: i.rok_dopune, kasni_radnih_dana: L.radnihIzmedju(i.rok_dopune, danas, S.neradni) });
        }
        const stanja = {};
        S.izvjestaji.filter(i => i.snimci.length).sort((a, b) => pb(a.godina, a.mjesec) - pb(b.godina, b.mjesec)).forEach(i => { i.snimci[i.snimci.length - 1].rizici.forEach(r => { stanja[r.id] = r; }); });
        const red = { 'Kritičan': 1, 'Visok': 2, 'Srednji': 3, 'Nizak': 4 };
        const otv = Object.values(stanja).filter(r => r.status !== 'Riješeno').sort((a, b) => red[a.ozbiljnost] - red[b.ozbiljnost] || (a.kod < b.kod ? -1 : 1))
          .map(r => ({ kod: r.kod, opis: r.opis, kategorija: r.kategorija, ozbiljnost: r.ozbiljnost, status: r.status, rok: r.rok, pedagog: S.imePedagoga }));
        const po = { 'Kritičan': 0, 'Visok': 0, 'Srednji': 0, 'Nizak': 0 }; otv.forEach(r => po[r.ozbiljnost]++);
        const prep = []; S.izvjestaji.filter(i => i.status === 'podnesen').forEach(i => i.preporuke.filter(p => p.odluka === 'Na čekanju').forEach(p => prep.push({ preporuka_id: p.id, izvjestaj_id: i.id, naslov: p.naslov, utjecaj: p.utjecaj, godina: i.godina, mjesec: i.mjesec, pedagog: S.imePedagoga })));
        const zadnji = S.izvjestaji.filter(i => i.status !== 'nacrt').sort((a, b) => pb(b.godina, b.mjesec) - pb(a.godina, a.mjesec)).map(i => ({ id: i.id, pedagog: S.imePedagoga, godina: i.godina, mjesec: i.mjesec, status: i.status, podnesen_u: i.podnesen_u, na_vrijeme: i.na_vrijeme, bodovi_ukupno: i.bodovi ? i.bodovi.ukupno : null, konacno: !!(i.bodovi && i.bodovi.konacno) }));
        return { ok: true, uloga, ime: 'Direktor škole (probni račun)', danas, tekuci_period: { godina: t.g, mjesec: t.m }, cekaju, kasne, rizici: otv, rizici_po_ozbiljnosti: po, preporuke_na_cekanju: prep, izvjestaji: zadnji };
      },
    };
  })();

  const trenutni = () => (nacin === 'demo' ? D : Supa);
  const prosljedi = ime => (...a) => trenutni()[ime](...a);
  return {
    postavi, konfigurisano, MREZA,
    nacin: () => nacin,
    uloga: () => (nacin === 'demo' ? D.uloga() : null),
    demo(uloga) { nacin = 'demo'; D.aktiviraj(uloga); },
    demoReset() { D.reset(); },
    supabase() { nacin = 'supabase'; },
    obnovi: () => (nacin === 'demo' ? Promise.resolve(false) : Supa.obnovi()),
    prijava: (e, l) => Supa.prijava(e, l),
    odjava: async () => { if (nacin === 'demo') { nacin = 'supabase'; return { ok: true }; } return Supa.odjava(); },
    profil: prosljedi('profil'), pocetna: prosljedi('pocetna'), ucitaj: prosljedi('ucitaj'), kreiraj: prosljedi('kreiraj'),
    spremi: prosljedi('spremi'), podnesi: prosljedi('podnesi'), vrati: prosljedi('vrati'), odluka: prosljedi('odluka'),
    odobri: prosljedi('odobri'), trag: prosljedi('trag'), arhiva: prosljedi('arhiva'),
  };
})();
if (typeof module !== 'undefined') module.exports = Api;
