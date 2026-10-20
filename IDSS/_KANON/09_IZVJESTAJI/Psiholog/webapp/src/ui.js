
/* =====================================================================
   UI — osnova: DOM pomoćnici, ruter, prijava, početne stranice, arhiva, pravila bodovanja.
   Sav korisnički tekst se upisuje isključivo kao textContent (nikad kao HTML).
   ===================================================================== */
const UI = (() => {
  'use strict';
  const L = Logika;
  const U = {};
  U.A = { profil: null, scene: [], animacije: true, cuvar: null };

  /* ---------- DOM ---------- */
  function h(tag, attrs, ...djeca) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'klasa' || k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'open') { if (v) el.setAttribute(k, ''); el[k] = !!v; }
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    const dodaj = d => {
      if (d === null || d === undefined || d === false) return;
      if (Array.isArray(d)) d.forEach(dodaj);
      else if (d instanceof Node) el.appendChild(d);
      else el.appendChild(document.createTextNode(String(d)));
    };
    djeca.forEach(dodaj);
    return el;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const prazni = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  U.h = h; U.$ = $; U.prazni = prazni;

  const SS = { get(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v === null ? window.sessionStorage.removeItem(k) : window.sessionStorage.setItem(k, v); } catch (e) { /* ignorisano */ } } };
  const LS = { get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignorisano */ } } };
  U.SS = SS;

  /* ---------- formatiranje ---------- */
  const fmtVrijeme = iso => { if (!iso) return '—'; try { const d = new Date(iso); if (isNaN(d)) return String(iso); const o = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sarajevo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).forEach(x => { o[x.type] = x.value; }); return `${o.day}.${o.month}.${o.year}. u ${o.hour === '24' ? '00' : o.hour}:${o.minute}`; } catch (e) { return String(iso); } };
  const dana = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const mnozina = (n, jedan, vise) => (n === 1 ? jedan : vise);
  function rokTekst(rok, danas) {
    const d = dana(danas, rok);
    if (d > 0) return `za ${d} ${mnozina(d, 'dan', 'dana')}`;
    if (d === 0) return 'danas je posljednji dan';
    return `istekao prije ${-d} ${mnozina(-d, 'dan', 'dana')}`;
  }
  const STATUS = { nacrt: 'Nacrt', podnesen: 'Podnesen', vracen: 'Vraćen na dopunu', odobren: 'Odobren', nema: 'Nije započet' };
  const cipStatus = (s, extra) => h('span', { class: 'cip ' + s }, STATUS[s] || s, extra ? ` · ${extra}` : '');
  const naslovPerioda = (g, m) => `${L.imeMjeseca(m)} ${g}.`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  U.fmtVrijeme = fmtVrijeme; U.rokTekst = rokTekst; U.cipStatus = cipStatus; U.naslovPerioda = (g, m) => cap(naslovPerioda(g, m)); U.dana = dana; U.cap = cap; U.STATUS = STATUS;
  const GRUPE = [['blagovremenost', 'Blagovremenost', '#FFCB29'], ['sadrzaj', 'Sadržaj', '#08ABE6'], ['strucnost', 'Stručnost', '#ffffff'], ['efikasnost', 'Efikasnost', '#E8262C']];
  U.GRUPE = GRUPE;

  /* ---------- obavijesti i modal ---------- */
  function obavijesti(tekst, greska) {
    const sp = $('#toasti'); if (!sp) return;
    const t = h('div', { class: 'toast' + (greska ? ' greska' : ''), role: greska ? 'alert' : 'status' }, tekst);
    sp.appendChild(t); setTimeout(() => t.remove(), greska ? 7000 : 4000);
  }
  function modal(o) {
    const dlg = h('dialog', { class: o.sirok ? 'sirok' : '', 'aria-labelledby': 'm-naslov' });
    const zatvori = () => { try { dlg.close(); } catch (e) { /* vec zatvoren */ } dlg.remove(); if (o.poZatvaranju) o.poZatvaranju(); };
    const tijelo = h('div', { class: 'okvir' }, h('h2', { id: 'm-naslov' }, o.naslov), o.tijelo,
      h('div', { class: 'dugmad' }, (o.dugmad || [{ tekst: 'Zatvori', klasa: 'sekund' }]).map(d => {
        const b = h('button', { type: 'button', class: 'dugme ' + (d.klasa || ''), disabled: d.onemoguceno, onclick: async () => {
          if (d.klik) { const r = await d.klik(b, dlg); if (r === false) return; }
          zatvori(); } }, d.tekst);
        return b; })));
    dlg.appendChild(tijelo);
    dlg.addEventListener('cancel', e => { e.preventDefault(); zatvori(); });
    document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    const prvo = $('textarea,input,select', dlg) || $('button', dlg); if (prvo) prvo.focus();
    return { dlg, zatvori };
  }
  U.obavijesti = obavijesti; U.modal = modal;

  /* ---------- 3D scena ---------- */
  function prstenoviSvg(model) {
    const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Prikaz bodova po grupama'); svg.style.width = '100%'; svg.style.maxHeight = '260px';
    GRUPE.forEach(([k, , boja], i) => {
      const r = 90 - i * 16, o = 2 * Math.PI * r, g = model.po_grupama[k], f = g && g.max ? Math.min(1, g.bodovi / g.max) : 0;
      const pod = document.createElementNS(ns, 'circle'); pod.setAttribute('cx', 100); pod.setAttribute('cy', 100); pod.setAttribute('r', r); pod.setAttribute('fill', 'none'); pod.setAttribute('stroke', '#000000'); pod.setAttribute('stroke-width', 8);
      const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', 100); c.setAttribute('cy', 100); c.setAttribute('r', r); c.setAttribute('fill', 'none'); c.setAttribute('stroke', boja); c.setAttribute('stroke-width', 8);
      c.setAttribute('stroke-dasharray', `${o * f} ${o}`); c.setAttribute('transform', 'rotate(-90 100 100)'); c.setAttribute('stroke-linecap', 'round');
      svg.appendChild(pod); svg.appendChild(c);
    });
    const t = document.createElementNS(ns, 'text'); t.setAttribute('x', 100); t.setAttribute('y', 108); t.setAttribute('text-anchor', 'middle'); t.setAttribute('fill', '#FFCB29'); t.setAttribute('font-size', 30); t.setAttribute('font-weight', 700);
    t.textContent = String(model.ukupno); svg.appendChild(t); return svg;
  }
  function scena(omot, model, opcije) {
    prazni(omot);
    const canvas = h('canvas', { 'aria-hidden': 'true' }); omot.appendChild(canvas);
    let s = null;
    try { s = Scena.montiraj(canvas, { mirno: !U.A.animacije }); } catch (e) { s = null; }
    if (!s) { prazni(omot); omot.appendChild(h('div', { class: 'bez-3d' }, prstenoviSvg(model))); return { postavi(m) { prazni(omot); omot.appendChild(h('div', { class: 'bez-3d' }, prstenoviSvg(m))); }, slavlje() {}, ugasi() {}, animacija() {} }; }
    s.postavi(model); U.A.scene.push(s); return s;
  }
  function ugasiScene() { U.A.scene.forEach(s => { try { s.ugasi(); } catch (e) { /* ignorisano */ } }); U.A.scene = []; }
  U.scena = scena; U.ugasiScene = ugasiScene;
  function modelBodova(izv) {
    const b = izv && (izv.bodovi_pregled || izv.bodovi);
    if (!b) return { ukupno: 0, max: 1000, po_grupama: {} };
    return { ukupno: b.ukupno !== undefined ? b.ukupno : b.zbroj, max: b.konacno ? 1000 : 900, po_grupama: b.po_grupama };
  }
  U.modelBodova = modelBodova;
  function redGrupa(model, svjetlo) {
    return h('ul', { class: 'rez-grupe' }, GRUPE.map(([k, naziv, boja]) => { const g = model.po_grupama[k] || { bodovi: 0, max: k === 'blagovremenost' || k === 'sadrzaj' ? 250 : 200 };
      return h('li', {}, h('span', {}, naziv), h('span', { class: 'traka-b', role: 'img', 'aria-label': `${naziv}: ${g.bodovi} od ${g.max}` }, h('i', { style: `width:${Math.round(100 * g.bodovi / g.max)}%;background:${boja}` })),
        h('span', { class: 'tabular' }, `${g.bodovi} / ${g.max}`)); }));
  }
  U.redGrupa = redGrupa;

  /* ---------- ljuska aplikacije ---------- */
  function ljuska() {
    const A = U.A, ko = A.profil;
    const nav = [];
    nav.push(h('a', { href: '#/', 'data-ruta': 'pocetna' }, ko.uloga === 'direktor' ? 'Pregled' : 'Moj izvještaj'));
    nav.push(h('a', { href: '#/arhiva', 'data-ruta': 'arhiva' }, 'Arhiva'));
    nav.push(h('a', { href: '#/bodovi', 'data-ruta': 'bodovi' }, 'Kako se boduje'));
    const logo = h('img', { src: 'https://idss.edu.ba/wp-content/uploads/2024/03/logo_white.png', alt: 'IDSS — Internationale Deutsche Schule Sarajevo', onerror: e => { e.target.style.display = 'none'; } });
    const root = h('div', {},
      h('a', { class: 'skok', href: '#glavno' }, 'Preskoči na sadržaj'),
      h('header', { class: 'traka' }, h('div', { class: 'traka-u' },
        h('div', { class: 'marka' }, logo),
        h('div', { class: 'naslov-trake' }, h('div', { class: 'tekst' }, 'IDSS Psiholog', h('small', {}, 'Mjesečni izvještaj'))),
        h('div', { class: 'desno-traka' }, h('div', { class: 'korisnik', title: [ko.email, ko.telefon].filter(Boolean).join(' · ') }, h('b', {}, ko.ime), h('span', { class: 'uloga' }, ko.uloga === 'direktor' ? 'Direktor' : 'Psiholog'), ko.email ? h('span', { class: 'kontakt' }, [ko.email, ko.telefon].filter(Boolean).join(' · ')) : null),
        h('button', { type: 'button', class: 'dugme-traka', onclick: async () => { await Api.odjava(); A.profil = null; location.hash = '#/'; U.pokreni(); } }, 'Odjava')))),
      h('nav', { class: 'nav', 'aria-label': 'Glavna navigacija' }, h('div', { class: 'nav-u' }, nav)),
      h('main', { id: 'glavno', tabindex: '-1' }),
      h('div', { class: 'toast-sp', id: 'toasti', 'aria-live': 'polite' }));
    return root;
  }
  function oznaciNav(ruta) { document.querySelectorAll('.nav a').forEach(a => { if (a.dataset.ruta === ruta) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }
  const glavno = () => $('#glavno');
  const ucitava = tekst => h('div', { class: 'ucitava', role: 'status' }, h('div', {}, h('div', { class: 'vrti', 'aria-hidden': 'true' }), tekst || 'Učitavanje…'));
  U.ucitava = ucitava; U.glavno = glavno;
  function greskaEkran(r, ponovi) {
    return h('div', { class: 'kartica' }, h('div', { class: 'greska-okvir', role: 'alert' }, h('strong', {}, 'Radnja nije uspjela. '), r.poruka || 'Došlo je do greške.'),
      ponovi ? h('button', { type: 'button', class: 'dugme', onclick: ponovi }, 'Pokušaj ponovo') : null);
  }
  U.greskaEkran = greskaEkran;

  /* ---------- ruter ---------- */
  async function ruta() {
    const A = U.A; if (!A.profil) return;
    if (A.cuvar) { try { await A.cuvar(); } catch (e) { /* ignorisano */ } A.cuvar = null; }
    ugasiScene();
    const dijelovi = (location.hash.replace(/^#\/?/, '') || '').split('/');
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if ((dijelovi[0] === 'izvjestaj' && !UUID.test(dijelovi[1] || '')) || (dijelovi[0] === 'novi' && !(/^\d{4}$/.test(dijelovi[1] || '') && /^\d{1,2}$/.test(dijelovi[2] || '')))) { location.replace('#/'); return; }
    const g = glavno(); if (!g) return;
    prazni(g); g.appendChild(ucitava());
    let naziv = 'IDSS Psiholog';
    try {
      if (dijelovi[0] === 'arhiva') { oznaciNav('arhiva'); naziv = 'Arhiva'; await arhiva(g); }
      else if (dijelovi[0] === 'bodovi') { oznaciNav('bodovi'); naziv = 'Kako se boduje'; pravila(g); }
      else if (dijelovi[0] === 'novi') { oznaciNav('pocetna'); await novi(g, +dijelovi[1], +dijelovi[2]); return; }
      else if (dijelovi[0] === 'izvjestaj' && dijelovi[1]) { oznaciNav('pocetna'); naziv = 'Izvještaj'; await U.izvjestaj(g, dijelovi[1], dijelovi[2]); }
      else { oznaciNav('pocetna'); naziv = A.profil.uloga === 'direktor' ? 'Pregled' : 'Moj izvještaj'; await (A.profil.uloga === 'direktor' ? pocetnaDirektor(g) : pocetnaPsiholog(g)); }
    } catch (e) { console.error(e); prazni(g); g.appendChild(greskaEkran({ poruka: 'Neočekivana greška u prikazu. Osvježite stranicu.' })); }
    document.title = naziv + ' · IDSS Psiholog';
    const gl = $('h1', g); if (gl) { gl.setAttribute('tabindex', '-1'); }
  }
  async function novi(g, god, mj) {
    const r = await Api.kreiraj(god, mj, L.uuid());
    if (!r.ok) { prazni(g); g.appendChild(h('div', { class: 'naslov-stranice' }, h('h1', {}, 'Izvještaj nije moguće započeti')));
      g.appendChild(greskaEkran(r)); g.appendChild(h('p', {}, h('a', { href: '#/' }, 'Nazad na početnu'))); return; }
    location.replace('#/izvjestaj/' + r.izvjestaj.id);
  }

  /* ---------- početna: psiholog ---------- */
  async function pocetnaPsiholog(g) {
    const r = await Api.pocetna();
    if (!r.ok) { prazni(g); g.appendChild(greskaEkran(r, ruta)); return; }
    const P = r.periodi;
    const fokus = P.find(p => p.status === 'vracen') || P.find(p => p.status === 'nacrt') || P.find(p => p.status === 'nema' && p.godina === r.tekuci_period.godina && p.mjesec === r.tekuci_period.mjesec) || P.find(p => p.id) || P[0];
    let izv = null;
    if (fokus && fokus.id) { const u = await Api.ucitaj({ id: fokus.id }); if (u.ok) izv = u.izvjestaj; }
    const model = izv ? modelBodova(izv) : { ukupno: 0, max: 900, po_grupama: {} };
    const aktivan = fokus && (fokus.status === 'nacrt' || fokus.status === 'nema' || fokus.status === 'vracen');
    prazni(g);
    g.appendChild(h('div', { class: 'naslov-stranice' }, h('div', {}, h('h1', {}, 'Moj izvještaj'), h('p', { class: 'podnaslov' }, `Školska godina ${r.sezona.skolska_godina}/${String(r.sezona.skolska_godina + 1).slice(2)}.`))));

    // hero
    const platno = h('div', { class: 'platno' });
    const akcija = !fokus ? null : fokus.status === 'nema' ? h('a', { class: 'dugme zlato', href: `#/novi/${fokus.godina}/${fokus.mjesec}` }, 'Započni izvještaj')
      : (fokus.status === 'nacrt' || fokus.status === 'vracen') ? h('a', { class: 'dugme zlato', href: '#/izvjestaj/' + fokus.id }, fokus.status === 'vracen' ? 'Dopuni izvještaj' : 'Nastavi uređivanje')
      : h('a', { class: 'dugme zlato', href: '#/izvjestaj/' + fokus.id }, 'Otvori izvještaj');
    const konacno = izv && izv.bodovi && izv.bodovi.konacno;
    const hero = h('section', { class: 'hero', 'aria-labelledby': 'hero-n' }, platno, h('div', { class: 'tekst' },
      h('h2', { id: 'hero-n' }, fokus ? U.naslovPerioda(fokus.godina, fokus.mjesec) : 'Nema izvještaja'),
      h('div', {}, cipStatus(fokus ? fokus.status : 'nema'), fokus && fokus.kasni ? h('span', { class: 'cip kasni', style: 'margin-left:.4rem' }, 'Kasni') : null),
      h('p', { class: 'velik', style: 'margin:.7rem 0 .2rem' }, h('span', { id: 'hero-bodovi' }, String(model.ukupno)), h('small', {}, ` IDSS bodova`)),
      h('p', { style: 'font-size:.92rem' }, !izv ? 'Bodovi se pojavljuju čim započnete izvještaj.' : konacno ? 'Konačan rezultat, uključujući ocjenu direktora.'
        : fokus && (fokus.status === 'nacrt' || fokus.status === 'vracen') ? 'Trenutni obračun na osnovu unesenog (najviše 900; do 100 bodova dodaje ocjena direktora).'
        : 'Obračun na osnovu podnesenog izvještaja; do 100 bodova dodaje ocjena direktora.'),
      redGrupa(model), h('div', { style: 'margin-top:1rem' }, akcija)));
    g.appendChild(hero); scena(platno, model);

    // rok + sezona
    const kartice = h('div', { class: 'mreza m2', style: 'margin-top:1rem' });
    if (fokus && aktivan) {
      const rok = fokus.status === 'vracen' ? fokus.rok_dopune : fokus.rok; const kasni = dana(r.danas, rok) < 0;
      kartice.appendChild(h('section', { class: 'kartica' }, h('h2', {}, fokus.status === 'vracen' ? 'Rok za dopunu' : 'Rok za podnošenje'),
        h('p', { class: 'plocica' }, h('span', { class: 'br ' + (kasni ? 'opasno' : '') }, L.fmtDatum(rok)), h('span', { class: 'on' }, rokTekst(rok, r.danas))),
        kasni ? h('div', { class: 'upozorenje' }, 'Rok je istekao. Izvještaj se i dalje može podnijeti, ali kašnjenje smanjuje bodove za blagovremenost.') : h('p', { class: 'sitno', style: 'color:var(--ink2)' }, 'Podnošenje u roku donosi 200 bodova za blagovremenost.')));
    }
    const s = r.sezona;
    kartice.appendChild(h('section', { class: 'kartica' }, h('h2', {}, 'Školska godina'),
      s.broj_odobrenih ? h('div', {}, h('p', { class: 'plocica' }, h('span', { class: 'br' }, `${s.prosjek}`), h('span', { class: 'on' }, `prosjek od ${s.broj_odobrenih} ${mnozina(s.broj_odobrenih, 'odobrenog izvještaja', 'odobrena izvještaja')} · rang ${s.rang}`)),
        s.sljedeci_rang ? h('p', { class: 'sitno', style: 'color:var(--ink2)' }, `Sljedeći rang „${s.sljedeci_rang.naziv}“ od prosjeka ${s.sljedeci_rang.prag}.`) : h('p', { class: 'sitno' }, 'Najviši rang je dostignut.'))
        : h('p', { style: 'color:var(--ink2)' }, 'Rang se određuje prosjekom odobrenih izvještaja. Još nema odobrenog izvještaja u ovoj školskoj godini.'),
      s.u_obradi ? h('p', { class: 'sitno', style: 'color:var(--ink2)' }, `U obradi kod direktora: ${s.u_obradi} bodova (privremeno).`) : null,
      h('p', { class: 'sitno', style: 'color:var(--ink2)' }, `Uzastopni izvještaji u roku: ${r.serija}.`)));
    g.appendChild(kartice);

    // staza
    g.appendChild(h('section', { style: 'margin-top:1.4rem', 'aria-labelledby': 'staza-n' }, h('h2', { id: 'staza-n' }, 'Mjeseci'),
      h('div', { class: 'staza' }, P.map(p => mjesecRed(p, r.danas)))));
    g.appendChild(h('section', { style: 'margin-top:1.4rem', 'aria-labelledby': 'znacke-n' }, h('h2', { id: 'znacke-n' }, 'Značke'),
      h('ul', { class: 'znacke' }, r.znacke.map(z => h('li', { class: 'znacka' + (z.stecena ? ' stecena' : '') }, h('span', { class: 'ikona', 'aria-hidden': 'true' }, z.stecena ? '✓' : '•'),
        h('span', {}, h('b', {}, z.naziv), h('span', { class: 'sitno' }, z.opis), z.stecena ? h('span', { class: 'sr-samo sakriveno' }, ' (stečena)') : h('span', { class: 'sakriveno' }, ' (nije stečena)')))))));
    // obavijest o nedavnom odobrenju
    const odobreni = P.find(p => p.status === 'odobren' && p.konacno);
    if (odobreni) { const kljuc = 'idss_vidjeno_' + odobreni.id; if (!LS.get(kljuc)) { LS.set(kljuc, '1'); const u = await Api.ucitaj({ id: odobreni.id }); if (u.ok && u.izvjestaj.odobren_u && Date.now() - Date.parse(u.izvjestaj.odobren_u) < 14 * 864e5) U.slavlje(u.izvjestaj, 'Izvještaj je odobren'); } }
  }
  function mjesecRed(p, danas) {
    const akcija = p.status === 'nema' ? h('a', { class: 'dugme malo zlato', href: `#/novi/${p.godina}/${p.mjesec}` }, 'Započni')
      : h('a', { class: 'dugme malo sekund', href: '#/izvjestaj/' + p.id }, p.status === 'nacrt' ? 'Nastavi' : p.status === 'vracen' ? 'Dopuni' : 'Otvori');
    const sitno = p.status === 'vracen' ? `Rok za dopunu: ${L.fmtDatum(p.rok_dopune)} (${rokTekst(p.rok_dopune, danas)})`
      : (p.status === 'nema' || p.status === 'nacrt') ? `Rok: ${L.fmtDatum(p.rok)} (${rokTekst(p.rok, danas)})` : p.na_vrijeme === false ? 'Podneseno nakon roka' : p.na_vrijeme ? 'Podneseno u roku' : '';
    return h('div', { class: 'mjesec ' + (p.kasni ? 'kasni' : p.status) },
      h('div', { class: 'naziv' }, U.naslovPerioda(p.godina, p.mjesec)),
      h('div', {}, cipStatus(p.status), p.kasni ? h('span', { class: 'cip kasni', style: 'margin-left:.4rem' }, 'Kasni') : null, h('div', { class: 'sitno' }, sitno)),
      h('div', { style: 'display:flex;gap:.8rem;align-items:center' }, p.bodovi_ukupno !== null && p.bodovi_ukupno !== undefined ? h('div', { class: 'bod', title: p.konacno ? 'Konačni bodovi' : 'Privremeni bodovi' }, String(p.bodovi_ukupno), p.konacno ? '' : '*') : null, akcija));
  }

  /* ---------- početna: direktor ---------- */
  async function pocetnaDirektor(g) {
    const r = await Api.pocetna();
    if (!r.ok) { prazni(g); g.appendChild(greskaEkran(r, ruta)); return; }
    prazni(g);
    g.appendChild(h('div', { class: 'naslov-stranice' }, h('div', {}, h('h1', {}, 'Pregled za direktora'), h('p', { class: 'podnaslov' }, 'Podneseni izvještaji, kašnjenja, rizici i preporuke koje čekaju odluku. Sadržaj nacrta nije vidljiv.'))));
    const kr = r.rizici_po_ozbiljnosti;
    g.appendChild(h('div', { class: 'mreza m4' },
      h('div', { class: 'kartica plocica' + (r.cekaju.length ? ' pazi' : '') }, h('span', { class: 'br' }, String(r.cekaju.length)), h('span', { class: 'on' }, 'čeka Vašu odluku')),
      h('div', { class: 'kartica plocica' + (r.kasne.length ? ' opasno' : '') }, h('span', { class: 'br' }, String(r.kasne.length)), h('span', { class: 'on' }, 'izvještaja kasni')),
      h('div', { class: 'kartica plocica' + (kr['Kritičan'] ? ' opasno' : '') }, h('span', { class: 'br' }, String(r.rizici.length)), h('span', { class: 'on' }, `aktivnih rizika (kritičnih: ${kr['Kritičan']}, visokih: ${kr['Visok']})`)),
      h('div', { class: 'kartica plocica' + (r.preporuke_na_cekanju.length ? ' pazi' : '') }, h('span', { class: 'br' }, String(r.preporuke_na_cekanju.length)), h('span', { class: 'on' }, 'preporuka bez odluke'))));
    const tabela = (zag, redovi) => h('div', { class: 'tabela-omot' }, h('table', {}, h('thead', {}, h('tr', {}, zag.map(z => h('th', { class: z.br ? 'br' : '' }, z.t)))), h('tbody', {}, redovi)));
    g.appendChild(h('section', { class: 'kartica', style: 'margin-top:1rem' }, h('h2', {}, 'Čekaju Vašu odluku'),
      r.cekaju.length ? tabela([{ t: 'Psiholog' }, { t: 'Period' }, { t: 'Podneseno' }, { t: 'Podnošenje' }, { t: 'Bodovi (bez ocjene)', br: 1 }, { t: '' }],
        r.cekaju.map(c => h('tr', {}, h('td', {}, c.psiholog), h('td', {}, U.naslovPerioda(c.godina, c.mjesec)), h('td', {}, fmtVrijeme(c.podnesen_u)), h('td', {}, c.ciklus === 1 ? 'prvo' : `${c.ciklus}. (nakon dopune)`),
          h('td', { class: 'br tabular' }, String(c.bodovi_zbroj)), h('td', {}, h('a', { class: 'dugme malo', href: '#/izvjestaj/' + c.id }, 'Pregledaj')))))
        : h('div', { class: 'prazno' }, h('strong', {}, 'Nema izvještaja na čekanju'), 'Novi podneseni izvještaji pojavit će se ovdje.')));
    g.appendChild(h('section', { class: 'kartica', style: 'margin-top:1rem' }, h('h2', {}, 'Izvještaji koji kasne'),
      r.kasne.length ? tabela([{ t: 'Psiholog' }, { t: 'Period' }, { t: 'Stanje' }, { t: 'Rok' }, { t: 'Kasni', br: 1 }],
        r.kasne.map(k => h('tr', {}, h('td', {}, k.psiholog), h('td', {}, U.naslovPerioda(k.godina, k.mjesec)), h('td', {}, k.status === 'nema' ? 'Nije započet' : k.status === 'nacrt' ? 'Nije podnesen' : 'Dopuna nije podnesena'),
          h('td', {}, L.fmtDatum(k.rok)), h('td', { class: 'br' }, `${k.kasni_radnih_dana} ${mnozina(k.kasni_radnih_dana, 'radni dan', 'radnih dana')}`))))
        : h('div', { class: 'prazno' }, h('strong', {}, 'Ništa ne kasni'), 'Svi izvještaji su u roku.')));
    const boja = { 'Kritičan': 'kasni', 'Visok': 'vracen', 'Srednji': 'podnesen', 'Nizak': 'nacrt' };
    g.appendChild(h('section', { class: 'kartica', style: 'margin-top:1rem' }, h('h2', {}, 'Aktivni rizici'),
      h('p', { class: 'sitno', style: 'color:var(--ink2)' }, 'Posljednje podneseno stanje svakog rizika. Riješeni rizici nisu prikazani.'),
      r.rizici.length ? tabela([{ t: 'Šifra' }, { t: 'Ozbiljnost' }, { t: 'Opis' }, { t: 'Stanje' }, { t: 'Rok mjere' }],
        r.rizici.map(x => h('tr', {}, h('td', {}, x.kod), h('td', {}, h('span', { class: 'cip ' + boja[x.ozbiljnost] }, x.ozbiljnost)), h('td', {}, x.opis, h('div', { class: 'sitno', style: 'color:var(--ink2)' }, x.kategorija)), h('td', {}, x.status), h('td', {}, x.rok ? L.fmtDatum(x.rok) : '—'))))
        : h('div', { class: 'prazno' }, h('strong', {}, 'Nema aktivnih rizika'), 'Podneseni izvještaji ne sadrže otvorene rizike.')));
    g.appendChild(h('section', { class: 'kartica', style: 'margin-top:1rem' }, h('h2', {}, 'Preporuke bez odluke'),
      r.preporuke_na_cekanju.length ? tabela([{ t: 'Psiholog' }, { t: 'Period' }, { t: 'Preporuka' }, { t: 'Utjecaj' }, { t: '' }],
        r.preporuke_na_cekanju.map(x => h('tr', {}, h('td', {}, x.psiholog), h('td', {}, U.naslovPerioda(x.godina, x.mjesec)), h('td', {}, x.naslov), h('td', {}, x.utjecaj), h('td', {}, h('a', { class: 'dugme malo', href: '#/izvjestaj/' + x.izvjestaj_id }, 'Odluči')))))
        : h('div', { class: 'prazno' }, h('strong', {}, 'Nema preporuka na čekanju'), 'Odluke se donose u pregledu podnesenog izvještaja.')));
    g.appendChild(h('section', { class: 'kartica', style: 'margin-top:1rem' }, h('h2', {}, 'Posljednji izvještaji'),
      r.izvjestaji.length ? tabela([{ t: 'Psiholog' }, { t: 'Period' }, { t: 'Stanje' }, { t: 'U roku' }, { t: 'IDSS bodovi', br: 1 }, { t: '' }],
        r.izvjestaji.slice(0, 12).map(x => h('tr', {}, h('td', {}, x.psiholog), h('td', {}, U.naslovPerioda(x.godina, x.mjesec)), h('td', {}, cipStatus(x.status)),
          h('td', {}, x.na_vrijeme === null ? '—' : x.na_vrijeme ? 'Da' : 'Ne'), h('td', { class: 'br tabular' }, x.bodovi_ukupno === null ? '—' : x.bodovi_ukupno + (x.konacno ? '' : '*')), h('td', {}, h('a', { class: 'dugme malo sekund', href: '#/izvjestaj/' + x.id }, 'Otvori')))))
        : h('div', { class: 'prazno' }, h('strong', {}, 'Još nema podnesenih izvještaja'), '')));
    g.appendChild(h('p', { class: 'sitno', style: 'color:var(--ink2)' }, '* Privremeni bodovi: konačni iznos se utvrđuje odobrenjem i ocjenom direktora.'));
    const ai = U.aiKartica && U.aiKartica(); if (ai) g.appendChild(ai);
  }

  /* ---------- arhiva ---------- */
  async function arhiva(g) {
    const r = await Api.arhiva();
    if (!r.ok) { prazni(g); g.appendChild(greskaEkran(r, ruta)); return; }
    prazni(g);
    g.appendChild(h('div', { class: 'naslov-stranice' }, h('div', {}, h('h1', {}, 'Arhiva izvještaja'), h('p', { class: 'podnaslov' }, 'Svi mjesečni izvještaji sa historijom promjena. Podneseni i odobreni izvještaji se čuvaju nepromjenjivo.'))));
    g.appendChild(h('section', { class: 'kartica' }, r.izvjestaji.length ? h('div', { class: 'tabela-omot' }, h('table', {}, h('thead', {}, h('tr', {}, ['Period', 'Psiholog', 'Stanje', 'Podneseno', 'Podnošenja', 'IDSS bodovi', ''].map((t, i) => h('th', { class: i === 5 ? 'br' : '' }, t)))),
      h('tbody', {}, r.izvjestaji.map(x => h('tr', {}, h('td', {}, U.naslovPerioda(x.godina, x.mjesec)), h('td', {}, x.psiholog), h('td', {}, cipStatus(x.status)), h('td', {}, fmtVrijeme(x.podnesen_u)),
        h('td', {}, String(x.ciklus)), h('td', { class: 'br tabular' }, x.bodovi_ukupno === null ? '—' : x.bodovi_ukupno + (x.konacno ? '' : '*')), h('td', {}, h('a', { class: 'dugme malo sekund', href: '#/izvjestaj/' + x.id }, 'Otvori')))))))
      : h('div', { class: 'prazno' }, h('strong', {}, 'Arhiva je prazna'), 'Izvještaji se pojavljuju čim se kreiraju.')));
  }

  /* ---------- pravila bodovanja ---------- */
  function pravila(g) {
    prazni(g);
    const tab = (naslov, ukupno, redovi) => h('section', { class: 'kartica' }, h('h2', {}, `${naslov} (najviše ${ukupno})`),
      h('div', { class: 'tabela-omot' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Stavka'), h('th', { class: 'br' }, 'Najviše'), h('th', {}, 'Kako se računa'))), h('tbody', {}, redovi.map(x => h('tr', {}, h('td', {}, x[0]), h('td', { class: 'br tabular' }, String(x[1])), h('td', {}, x[2])))))));
    g.appendChild(h('div', { class: 'naslov-stranice' }, h('div', {}, h('h1', {}, 'Kako se boduje'), h('p', { class: 'podnaslov' }, 'IDSS bodovi se računaju iz stvarnog sadržaja izvještaja i rokova. Isti obračun radi server, pa se rezultat ne može izmijeniti u pregledniku.'))));
    g.appendChild(h('div', { class: 'info' }, 'Najviše 1000 bodova po izvještaju: do 900 računa sistem, a do 100 dodaje ocjena direktora o kvalitetu (0–5, po 20 bodova). Vrijednosti su prijedlog i mogu se prilagoditi odlukom uprave.'));
    g.appendChild(h('div', { class: 'mreza m2' },
      tab('Blagovremenost', 250, [['Podnošenje u roku', 200, 'Puni iznos do roka; za svaki radni dan kašnjenja 50 bodova manje (nakon četiri dana 0). Rok je 5. u sljedećem mjesecu, a ako je neradni dan, prvi sljedeći radni dan.'],
        ['Dopuna u roku', 50, 'Ako izvještaj nije vraćen, 50 bodova. Ako je vraćen, dopuna u roku od 3 radna dana zadržava 50; svaki dan kašnjenja oduzima 25.']]),
      tab('Sadržaj', 250, [['Cjelovitost odjeljaka', 100, 'Učenici 20, nastavnici 20, roditelji 15, radionice 15, QMS i administracija 15, zaključak i plan 15 — svaki cjelovit odjeljak donosi svoj dio.'],
        ['Konkretnost opisa', 75, 'Pet narativnih polja po 15 bodova: 8 bodova od 80 znakova, 15 od 150 znakova.'],
        ['Konkretnost plana', 50, 'Plan za sljedeći mjesec: 20 bodova od 50, 35 od 120 i 50 od 200 znakova.'],
        ['Mjere uz rizike', 25, 'Svaki evidentirani rizik ima korektivnu mjeru i rok; bez rizika puni iznos.']]),
      tab('Stručnost', 200, [['Opservacije u razredu', 60, 'Udio realiziranih u planiranim opservacijama (do 100%). Ako opservacije nisu planirane, 30 bodova.'],
        ['Održane radionice', 50, '20 bodova po održanoj radionici (najviše dvije) i +10 ako su radionice održane za najmanje dvije ciljne grupe.'],
        ['Stručno usavršavanje i supervizija', 40, '10 bodova po satu usavršavanja ili supervizije, najviše 40.'],
        ['QP 05: radionice i obuke u zapisu', 20, 'Udio održanih radionica i obuka (za nastavnike, učenike i roditelje) koje su zavedene u zapis QP 05. Bez održanih radionica: 10 bodova.'],
        ['Povjerljivost i saglasnosti', 20, 'Povjerljivost i zaštita psihološke dokumentacije 10 bodova; saglasnosti roditelja za sve procjene 10 (bez procjena: 10), djelimično 5 bodova.'],
        ['Stanje psihološke dokumentacije', 10, 'Uredno 10, u toku 6, zahtijeva intervenciju 4 boda.']]),
      tab('Efikasnost', 200, [['Rješavanje rizika', 60, 'Udio riješenih u rizicima koji su razmatrani u mjesecu (preneseni i novi).'],
        ['Mjere u roku', 60, 'Udio aktivnih rizika kojima rok mjere nije probijen.'],
        ['Prihvaćeno bez vraćanja', 40, 'Prvo podnošenje 40, nakon jednog vraćanja 20, nakon više vraćanja 0.'],
        ['Realizacija radionica', 40, 'Udio održanih u evidentiranim radionicama; bez radionica 20 bodova.']])));
    g.appendChild(h('section', { class: 'kartica', style: 'margin-top:1rem' }, h('h2', {}, 'Rang'),
      h('p', {}, 'Rang se određuje prosjekom konačnih bodova odobrenih izvještaja u školskoj godini (školska godina počinje u septembru).'),
      h('ul', {}, [['Pripravnik', 'do 499'], ['Saradnik', '500–649'], ['Stručnjak', '650–799'], ['Majstor', '800–899'], ['Velemajstor', '900 i više']].map(x => h('li', {}, `${x[0]}: ${x[1]}`)))));
  }

  /* ---------- slavlje (nakon stvarnog događaja) ---------- */
  U.slavlje = function (izv, naslov) {
    const model = modelBodova(izv); const platno = h('div', { style: 'height:260px;position:relative' });
    let sc = null;
    const m = modal({ naslov, sirok: true, tijelo: h('div', {}, platno,
      h('p', { class: 'plocica' }, h('span', { class: 'br' }, `${model.ukupno} IDSS bodova`), h('span', { class: 'on' }, izv.bodovi && izv.bodovi.konacno ? 'konačni rezultat' : 'privremeni rezultat, do konačnog obračuna nakon odluke direktora')), redGrupa(model)),
      dugmad: [{ tekst: 'Nastavi', klasa: 'zlato' }], poZatvaranju: () => { if (sc) sc.ugasi(); } });
    sc = Scena.montiraj((() => { const c = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%', 'aria-hidden': 'true' }); platno.appendChild(c); return c; })(), { mirno: !U.A.animacije });
    if (sc) { sc.postavi(model); sc.slavlje(); } else platno.appendChild(prstenoviSvg(model));
    return m;
  };

  /* ---------- pokretanje i prijava ---------- */
  function prijavaEkran() {
    const email = h('input', { type: 'email', id: 'p-email', required: true, autocomplete: 'username' });
    const loz = h('input', { type: 'password', id: 'p-loz', required: true, autocomplete: 'current-password' });
    const poruka = h('div', { id: 'p-poruka', role: 'alert' });
    const forma = h('form', { onsubmit: async e => {
        e.preventDefault(); prazni(poruka);
        if (!Api.konfigurisano()) { poruka.appendChild(h('div', { class: 'greska-okvir' }, 'Aplikacija nije podešena: nedostaje adresa projekta ili javni ključ.')); return; }
        const dug = $('#p-dugme'); dug.disabled = true; dug.textContent = 'Prijava…';
        const r = await Api.prijava(email.value.trim(), loz.value);
        dug.disabled = false; dug.textContent = 'Prijavi se';
        if (!r.ok) { poruka.appendChild(h('div', { class: 'greska-okvir' }, r.poruka)); return; }
        U.pokreni();
      } },
      h('div', { class: 'polje' }, h('label', { for: 'p-email' }, 'E-pošta'), email),
      h('div', { class: 'polje' }, h('label', { for: 'p-loz' }, 'Lozinka'), loz),
      poruka, h('button', { type: 'submit', class: 'dugme zlato', id: 'p-dugme' }, 'Prijavi se'));
    return h('div', { class: 'prijava-omot' }, h('main', { class: 'prijava' },
      h('img', { src: 'https://idss.edu.ba/wp-content/uploads/2024/03/logo_white.png', alt: 'IDSS', onerror: e => { e.target.style.display = 'none'; } }),
      h('h1', {}, 'IDSS Psiholog'), h('p', { class: 'podnaslov', style: 'margin-bottom:1rem' }, 'Mjesečni izvještaj psihologa za direktora škole'),
      forma));
  }

  U.pokreni = async function () {
    const korijen = $('#aplikacija'); const A = U.A;
    A.animacije = true;
    ugasiScene(); prazni(korijen);
    if (window.IDSS_CONFIG) Api.postavi(window.IDSS_CONFIG);
    let prijavljen = false;
    if (Api.konfigurisano()) { korijen.appendChild(ucitava('Provjera prijave…')); prijavljen = await Api.obnovi(); prazni(korijen); }
    if (!prijavljen) { document.title = 'Prijava · IDSS Psiholog'; korijen.appendChild(prijavaEkran()); return; }
    const p = await Api.profil();
    if (!p.ok) {
      korijen.appendChild(h('div', { class: 'prijava-omot' }, h('main', { class: 'prijava' }, h('h1', {}, 'Pristup nije moguć'),
        h('div', { class: 'greska-okvir', role: 'alert' }, p.poruka), p.kod === 'NEOVLASTEN' ? h('p', {}, 'Obratite se upravi škole da Vam otvori pristup.') : null,
        h('button', { type: 'button', class: 'dugme sekund', onclick: async () => { await Api.odjava(); U.pokreni(); } }, 'Nazad na prijavu'))));
      return;
    }
    A.profil = p; korijen.appendChild(ljuska());
    if (!window.__idssRuter) { window.addEventListener('hashchange', () => { if (U.A.profil) ruta(); }); window.__idssRuter = true; }
    if (!location.hash) location.hash = '#/'; else ruta();
  };
  U.ruta = ruta; U.pocetnaPsiholog = pocetnaPsiholog;
  return U;
})();
