/* =====================================================================
   UI — izvještaj: uređivač (pedagog), pregled i odluke (direktor).
   ===================================================================== */
(function (U) {
  'use strict';
  const L = Logika, h = U.h, $ = U.$, prazni = U.prazni;
  const dubok = x => JSON.parse(JSON.stringify(x));

  const KORACI = [
    { k: 'ucenici', n: 'Rad sa učenicima' }, { k: 'nastavnici', n: 'Saradnja sa nastavnicima' }, { k: 'roditelji', n: 'Saradnja sa roditeljima' },
    { k: 'radionice', n: 'Radionice' }, { k: 'usavrsavanje', n: 'Stručno usavršavanje' }, { k: 'rizici', n: 'Rizici' },
    { k: 'preporuke', n: 'Preporuke direktoru' }, { k: 'administracija', n: 'QMS (QP 05, QP 09) i administracija' }, { k: 'zakljucak', n: 'Zaključak i plan' },
    { k: 'pregled', n: 'Pregled i podnošenje' }];
  const UVOD = {
    ucenici: 'Odnos sa učenicima: razgovori, grupne aktivnosti, teme i rad sa darovitim učenicima. Preporuka: izbjegavajte imena učenika.',
    nastavnici: 'Saradnja sa nastavnicima: posjete časovima, konsultacije, mentorstvo i koordinacija.',
    roditelji: 'Saradnja sa roditeljima: individualni razgovori, roditeljski sastanci i pisana komunikacija.',
    radionice: 'Radionice koje ste održali ili planirali za učenike, nastavnike i roditelje. Ako radionica nije bilo, obrazložite izostanak.',
    usavrsavanje: 'Vaše stručno usavršavanje u mjesecu (seminari, webinari, mentorski rad…). Odjeljak nije obavezan.',
    rizici: 'Evidencija rizika (pedagoških, akademskih, sigurnosnih i organizacijskih) sa mjerom i rokom. Rizici iz ranijih mjeseci koji nisu riješeni prenose se automatski.',
    preporuke: 'Preporuke direktoru koje zahtijevaju njegovu odluku. Odjeljak nije obavezan.',
    administracija: 'IDSS ima implementiran ISO 9001:2015. Za pedagoga su mjerodavne procedure QP 05 Obuka i QP 09 Kreativni čas sa pripadajućim obrascima. Ovdje se unose kreativni časovi, stanje eDnevnika i prepiska sa MOOKS-om.',
    zakljucak: 'Ključna postignuća mjeseca i konkretan plan za sljedeći mjesec.',
  };
  const S_ = (k, l, t, o) => Object.assign({ k, l, t }, o || {});
  const SPEC = {
    ucenici: [S_('individualni_razgovori', 'Individualni razgovori sa učenicima', 'b', { max: 500, pomoc: 'Ukupan broj razgovora u mjesecu (0 ako ih nije bilo).' }),
      S_('razliciti_ucenici', 'Broj različitih učenika', 'b', { max: 500, pomoc: 'Sa koliko je različitih učenika razgovarano; ne može biti više od broja razgovora.' }),
      S_('grupni_rad', 'Grupne i razredne aktivnosti', 'b', { max: 200 }), S_('daroviti_ucenici', 'Daroviti učenici u radu', 'b', { max: 200 }),
      S_('teme', 'Teme rada sa učenicima', 'v', { opc: 'teme', pomoc: 'Odaberite barem jednu temu ako je bilo individualnih razgovora.' }),
      S_('sazetak', 'Sažetak rada sa učenicima', 't', { min: 50, max: 2500, bod: 150, pomoc: 'Ključne teme, ishodi i dogovorene mjere.' })],
    nastavnici: [S_('posjete_planirano', 'Planirane posjete časovima', 'b', { max: 200 }), S_('posjete_realizirano', 'Realizirane posjete časovima', 'b', { max: 200 }),
      S_('razredi', 'Razredi u kojima su posjećeni časovi', 's', { max: 250, pomoc: 'Obavezno ako je bilo posjeta.' }),
      S_('nalazi', 'Nalazi posjeta časovima', 't', { min: 50, max: 2500, pomoc: 'Obavezno ako je bilo posjeta.' }),
      S_('obrazlozenje_prekoracenja', 'Obrazloženje prekoračenja plana posjeta', 't', { min: 20, max: 1000, uslov: o => (o.posjete_realizirano || 0) > (o.posjete_planirano || 0) && o.posjete_planirano !== undefined }),
      S_('konsultacije', 'Konsultacije sa nastavnicima', 'b', { max: 500 }), S_('mentorstvo_sati', 'Sati mentorstva i stručne pomoći', 'b', { max: 200 }),
      S_('sastanci_vijeca', 'Sjednice vijeća', 'b', { max: 50 }),
      S_('koordinacija', 'Koordinacija sa nastavnicima i stručnim organima', 't', { min: 30, max: 2000, bod: 150 })],
    roditelji: [S_('individualni_razgovori', 'Individualni razgovori sa roditeljima', 'b', { max: 500 }), S_('roditeljski_sastanci', 'Roditeljski sastanci', 'b', { max: 50 }),
      S_('pisana_komunikacija', 'Pisana komunikacija sa roditeljima', 'b', { max: 1000 }),
      S_('biljeske', 'Sažetak saradnje sa roditeljima', 't', { min: 30, max: 2000, bod: 150 })],
    administracija: [S_('kreativni_planirano', 'Kreativni časovi planirani (QP 09.PO-01)', 'b', { max: 200, pomoc: 'Broj kreativnih časova predviđenih Planom održavanja kreativnih časova (QP 09.PO-01) za ovaj mjesec.' }),
      S_('kreativni_odrzano', 'Održani kreativni časovi', 'b', { max: 200, pomoc: 'Koliko je kreativnih časova održano u školi u ovom mjesecu.' }),
      S_('kreativni_posjeceno', 'Posjećeni i evidentirani (QP 09.PC-02)', 'b', { max: 200, pomoc: 'Na koliko održanih kreativnih časova ste bili prisutni i zapis unijeli na obrazac „Ostvareni uvid u odgojno-obrazovni rad – posjeta času“ (QP 09.PC-02).' }),
      S_('kreativni_napomena', 'Obrazloženje odstupanja kod kreativnih časova', 't', { min: 20, max: 1000, uslov: o => o.kreativni_planirano !== undefined && o.kreativni_odrzano !== undefined && o.kreativni_posjeceno !== undefined && (o.kreativni_planirano !== o.kreativni_odrzano || o.kreativni_posjeceno < o.kreativni_odrzano), pomoc: 'Obavezno kada održano nije jednako planiranom ili kada nije posjećen svaki održani čas.' }),
      S_('ednevnik', 'Stanje eDnevnika', 'i', { opc: 'ednevnik' }),
      S_('mooks_sazetak', 'Sažetak prepiske sa MOOKS-om', 't', { min: 20, max: 1500, bod: 150 }),
      S_('dokumentacija', 'Napomene o dokumentaciji', 't', { min: 1, max: 1500, neobavezno: true })],
    zakljucak: [S_('postignuca', 'Ključna postignuća u mjesecu', 't', { min: 50, max: 2000, bod: 150 }),
      S_('plan_sljedeci', 'Plan za sljedeći mjesec', 't', { min: 50, max: 2000, bod: 200, pomoc: 'Što konkretnije: aktivnosti, rokovi, ciljne grupe.' })],
  };
  const SPEC_RAD = [S_('ciljna_grupa', 'Ciljna grupa', 'i', { opc: 'grupe' }), S_('naslov', 'Naslov radionice', 's', { min: 5, max: 150 }), S_('datum', 'Datum', 'd'),
    S_('trajanje_min', 'Trajanje (minuta)', 'b', { min: 15, max: 480 }), S_('status', 'Status', 'i', { opc: 'radStatus' }), S_('ucesnika', 'Broj učesnika', 'b', { max: 500 }),
    S_('ishod', 'Ishod radionice', 't', { min: 20, max: 1000, uslov: o => o.status === 'održano' }),
    S_('qp05_zapis', 'Zavedeno u zapis QP 05 (Evidencija obuke, QP 05.EO-02)', 'i', { opc: 'daNe', pomoc: 'Da li je ova radionica ili obuka upisana u zapise koje propisuje procedura QP 05 Obuka.' })];
  const SPEC_USV = [S_('naslov', 'Naslov usavršavanja', 's', { min: 5, max: 150 }), S_('vrsta', 'Vrsta', 'i', { opc: 'usavrsavanje' }), S_('sati', 'Broj sati', 'b', { min: 1, max: 100 }), S_('datum', 'Datum', 'd')];
  const SPEC_RIZ = [S_('kategorija', 'Kategorija', 'i', { opc: 'kategorija' }), S_('opis', 'Opis rizika', 't', { min: 10, max: 500 }), S_('ozbiljnost', 'Ozbiljnost', 'i', { opc: 'ozbiljnost' }),
    S_('status', 'Status rizika', 'i', { opc: 'statusRizika' }), S_('mjera', 'Korektivna mjera', 't', { min: 10, max: 500 }), S_('rok', 'Rok mjere', 'd')];
  const SPEC_PREP = [S_('naslov', 'Naslov preporuke', 's', { min: 5, max: 150 }), S_('obrazlozenje', 'Obrazloženje', 't', { min: 20, max: 1000 }), S_('utjecaj', 'Utjecaj na resurse', 'i', { opc: 'utjecaj' })];
  const NASLOV_SEK = { ucenici: 'Rad sa učenicima', nastavnici: 'Saradnja sa nastavnicima', roditelji: 'Saradnja sa roditeljima', administracija: 'QMS (QP 05, QP 09) i administracija', zakljucak: 'Zaključak i plan' };
  const ENUM_PRIKAZ = {};

  /* ---------- prikaz samo za čitanje ---------- */
  function vrijednost(o, sp) {
    const v = o ? o[sp.k] : undefined;
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '—';
    if (Array.isArray(v)) return v.join(', ');
    if (sp.t === 'd') return L.fmtDatum(v);
    return String(v);
  }
  function dl(o, spec) {
    const red = [];
    spec.filter(sp => !sp.uslov || sp.uslov(o || {})).forEach(sp => { red.push(h('dt', {}, sp.l)); red.push(h('dd', {}, vrijednost(o, sp))); });
    return h('dl', {}, red);
  }
  function stavkeCitanje(lista, spec, naslovFn, prazno) {
    if (!lista || !lista.length) return h('p', { style: 'color:var(--ink2)' }, prazno);
    return h('div', { style: 'display:grid;gap:.7rem' }, lista.map((x, i) => h('div', { class: 'stavka-k' }, h('header', {}, h('b', {}, naslovFn(x, i))), dl(x, spec))));
  }
  function sadrzajCitanje(izv) {
    const s = izv.sadrzaj || {}, rr = [];
    ['ucenici', 'nastavnici', 'roditelji'].forEach(k => rr.push(h('section', { class: 'kartica pregled-sek' }, h('h2', {}, NASLOV_SEK[k]), dl(s[k], SPEC[k]))));
    const rad = s.radionice || {};
    rr.push(h('section', { class: 'kartica pregled-sek' }, h('h2', {}, 'Radionice'),
      stavkeCitanje(rad.stavke, SPEC_RAD, (x, i) => `${i + 1}. ${x.naslov || 'Radionica'}`, 'Nema evidentiranih radionica.'),
      rad.nema_obrazlozenje ? h('dl', {}, h('dt', {}, 'Obrazloženje izostanka'), h('dd', {}, rad.nema_obrazlozenje)) : null));
    rr.push(h('section', { class: 'kartica pregled-sek' }, h('h2', {}, 'Stručno usavršavanje'),
      stavkeCitanje((s.usavrsavanje || {}).stavke, SPEC_USV, (x, i) => `${i + 1}. ${x.naslov || 'Usavršavanje'}`, 'Nema unesenog usavršavanja.')));
    rr.push(h('section', { class: 'kartica pregled-sek' }, h('h2', {}, 'Rizici'),
      stavkeCitanje(izv.rizici, SPEC_RIZ.concat([]), (x, i) => `${x.kod || 'Rizik'}${x.prenesen ? ' (prenesen iz ranijeg mjeseca)' : ''}`, 'Nema evidentiranih rizika.')));
    rr.push(h('section', { class: 'kartica pregled-sek' }, h('h2', {}, 'Administracija i QMS'), dl(s.administracija, SPEC.administracija)));
    rr.push(h('section', { class: 'kartica pregled-sek' }, h('h2', {}, 'Zaključak i plan'), dl(s.zakljucak, SPEC.zakljucak)));
    return rr;
  }

  /* ---------- tabela bodova ---------- */
  function bodoviTabela(b) {
    if (!b || !b.stavke) return null;
    return h('div', { class: 'tabela-omot' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Grupa'), h('th', {}, 'Stavka'), h('th', { class: 'br' }, 'Bodovi'), h('th', {}, 'Obrazloženje'))),
      h('tbody', {}, b.stavke.map(s => h('tr', {}, h('td', {}, (U.GRUPE.find(g => g[0] === s.grupa) || [0, s.grupa])[1]), h('td', {}, s.naziv), h('td', { class: 'br tabular' }, `${s.bodovi} / ${s.max}`), h('td', {}, s.napomena || ''))))));
  }
  function kpiKartica(kp, izv) {
    if (!kp) return null;
    const a = kp.kpi01, k3 = kp.kpi03; const sad = (izv && izv.sadrzaj) || {}; const rs = ((sad.radionice || {}).stavke || []).filter(x => x.status === 'održano'); const adm = sad.administracija || {};
    const q5 = rs.filter(x => x.qp05_zapis === 'Da').length;
    return h('section', { class: 'kartica' }, h('h2', {}, 'Pokazatelji'),
      h('div', { class: 'mreza m4' },
        h('div', { class: 'plocica' + (rs.length && q5 < rs.length ? ' pazi' : '') }, h('span', { class: 'br' }, `${q5} / ${rs.length}`), h('span', { class: 'on' }, 'održanih radionica i obuka zavedeno u zapis QP 05')),
        h('div', { class: 'plocica' }, h('span', { class: 'br' }, `${adm.kreativni_odrzano === undefined ? '—' : adm.kreativni_odrzano}`), h('span', { class: 'on' }, `održanih kreativnih časova (QP 09); planirano ${adm.kreativni_planirano === undefined ? '—' : adm.kreativni_planirano}, posjećeno i evidentirano na QP 09.PC-02: ${adm.kreativni_posjeceno === undefined ? '—' : adm.kreativni_posjeceno}`)),
        h('div', { class: 'plocica' }, h('span', { class: 'br' }, a.stopa === null ? '—' : `${a.stopa}%`), h('span', { class: 'on' }, a.nije_planirano ? 'posjete nisu planirane' : `realizirano ${a.realizirano} od ${a.planirano} posjeta časovima`)),
        h('div', { class: 'plocica' }, h('span', { class: 'br' }, String(kp.kpi02.sesije === null ? '—' : kp.kpi02.sesije)), h('span', { class: 'on' }, 'individualnih razgovora sa učenicima')),
        h('div', { class: 'plocica' }, h('span', { class: 'br' }, String(k3.aktivno_3c)), h('span', { class: 'on' }, `aktivnih rizika (riješeno: ${k3.rijeseno_3a}, prenesenih: ${k3.preneseno_3b}, rok mjere probijen: ${k3.kasne_mjere})`))));
  }
  const TRAG = { KREIRAN_NACRT: 'Izvještaj započet', SPREMLJEN_NACRT: 'Nacrt spremljen', PODNESEN: 'Izvještaj podnesen', PONOVO_PODNESEN: 'Dopunjen izvještaj podnesen',
    VRACEN_NA_DOPUNU: 'Vraćen na dopunu', ODLUKA_O_PREPORUCI: 'Odluka o preporuci', ODOBREN: 'Izvještaj odobren' };
  async function tragKartica(id) {
    const r = await Api.trag(id);
    const k = h('section', { class: 'kartica' }, h('h2', {}, 'Historija promjena'), h('p', { class: 'sitno', style: 'color:var(--ink2)' }, 'Bilježi se ko je i kada šta uradio; sadržaj izvještaja se ne bilježi u historiju.'));
    if (!r.ok) { k.appendChild(h('p', {}, r.poruka)); return k; }
    k.appendChild(h('ul', { class: 'vremenska' }, r.dogadjaji.map(d => h('li', {}, h('b', {}, TRAG[d.akcija] || d.akcija), ` · ${d.akter || ''} · `, h('span', { class: 'sitno' }, U.fmtVrijeme(d.vrijeme))))));
    return k;
  }

  /* ================== UREĐIVAČ ================== */
  function urednik(g, izv, sek0) {
    const gd = izv.godina, mj = izv.mjesec, id = izv.id;
    const od = `${gd}-${String(mj).padStart(2, '0')}-01`, doo = L.krajMjeseca(gd, mj);
    const S = { rev: izv.revizija, sad: dubok(izv.sadrzaj || {}), riz: dubok(izv.rizici || []), prep: dubok(izv.preporuke || []), dirty: false, spremanje: false, verz: 0,
      touched: new Set(), pokaziSve: false, reg: [], tim: null, korak: 'ucenici', srv: [], blok: null, scena: null };
    ['ucenici', 'nastavnici', 'roditelji', 'radionice', 'usavrsavanje', 'administracija', 'zakljucak'].forEach(k => { if (!L.isObj(S.sad[k])) S.sad[k] = {}; });
    ['radionice', 'usavrsavanje'].forEach(k => { if (!Array.isArray(S.sad[k].stavke)) S.sad[k].stavke = []; });
    if (!Array.isArray(S.sad.administracija.qms_postupci)) S.sad.administracija.qms_postupci = [];
    if (!Array.isArray(S.sad.ucenici.teme)) S.sad.ucenici.teme = [];
    const KLJ = 'idss_nacrt_' + id;
    try { const b = JSON.parse(U.SS.get(KLJ) || 'null'); if (b && b.rev === S.rev && JSON.stringify([b.sad, b.riz, b.prep]) !== JSON.stringify([S.sad, S.riz, S.prep])) { S.sad = b.sad; S.riz = b.riz; S.prep = b.prep; S.dirty = true; setTimeout(() => U.obavijesti('Vraćeni su unosi koji nisu bili spremljeni na server.'), 300); } } catch (e) { /* ignorisano */ }
    const sacuvajLokalno = () => U.SS.set(KLJ, JSON.stringify({ rev: S.rev, sad: S.sad, riz: S.riz, prep: S.prep }));

    /* --- validacija i bodovi --- */
    const greske = () => [].concat(L.provjeriSadrzaj(S.sad, true, gd, mj), L.provjeriRizike(S.riz, true), L.provjeriPreporuke(S.prep, true));
    function obracun() {
      const kp = L.kpi(S.sad, S.riz, gd, mj);
      return { kp, b: L.bodovi(S.sad, S.riz, kp, gd, mj, izv.kasnjenje_prvo, izv.ciklus_sljedeci, izv.kasnjenje_dopune_sada) };
    }
    const prefKoraka = k => k;

    /* --- polja --- */
    function polje(o, sp, put, ro) {
      const fid = 'f-' + put.replace(/[^a-z0-9]/gi, '-'), gr = h('div', { class: 'gr', id: fid + '-g', role: 'alert' });
      const wrap = h('div', { class: 'polje' });
      const oz = sp.l + (sp.neobavezno || sp.t === 'b' || sp.uslov ? '' : '');
      const dodirni = () => { S.touched.add(put); osvjezi(); };
      const promjena = () => { S.dirty = true; S.verz++; sacuvajLokalno(); osvjezi(); zakazi(); };
      let ctrl, brojac = null;
      const common = { id: fid, 'aria-describedby': fid + '-g', disabled: !!ro, onblur: dodirni };
      if (sp.t === 'b') ctrl = h('input', Object.assign({ type: 'number', inputmode: 'numeric', step: 1, min: sp.min !== undefined ? sp.min : 0, max: sp.max, value: o[sp.k] === undefined ? '' : o[sp.k],
        oninput: e => { const v = e.target.value; if (v === '') delete o[sp.k]; else o[sp.k] = Number(v); promjena(); } }, common));
      else if (sp.t === 's') ctrl = h('input', Object.assign({ type: 'text', maxlength: sp.max, value: o[sp.k] || '', autocomplete: 'off', oninput: e => { if (e.target.value === '') delete o[sp.k]; else o[sp.k] = e.target.value; promjena(); } }, common));
      else if (sp.t === 'd') ctrl = h('input', Object.assign({ type: 'date', min: sp.nema_gr ? null : null, value: o[sp.k] || '', oninput: e => { if (e.target.value === '') delete o[sp.k]; else o[sp.k] = e.target.value; promjena(); } }, common));
      else if (sp.t === 'i') {
        ctrl = h('select', Object.assign({ onchange: e => { if (e.target.value === '') delete o[sp.k]; else o[sp.k] = e.target.value; promjena(); } }, common),
          h('option', { value: '' }, '— odaberite —'), L.ENUM[sp.opc].map(v => h('option', { value: v, selected: o[sp.k] === v }, v)));
      } else if (sp.t === 'v') {
        const niz = Array.isArray(o[sp.k]) ? o[sp.k] : (o[sp.k] = []);
        ctrl = h('div', { class: 'izbor', role: 'group', 'aria-labelledby': fid + '-l' }, L.ENUM[sp.opc].map(v => h('label', {}, h('input', { type: 'checkbox', checked: niz.includes(v), disabled: !!ro,
          onchange: e => { const i = niz.indexOf(v); if (e.target.checked && i < 0) niz.push(v); else if (!e.target.checked && i >= 0) niz.splice(i, 1); S.touched.add(put); promjena(); } }), v)));
      } else {
        brojac = h('div', { class: 'brojac-znakova' });
        ctrl = h('textarea', Object.assign({ rows: sp.max > 1200 ? 6 : 4, maxlength: sp.max + 200, value: o[sp.k] || '', oninput: e => { if (e.target.value === '') delete o[sp.k]; else o[sp.k] = e.target.value; promjena(); } }, common));
      }
      const info = () => {
        if (!brojac) return;
        const n = L.len(L.btrim(o[sp.k] || '')), min = sp.min || 0;
        let t = `${n} znakova`; if (!sp.neobavezno && min) t += ` · najmanje ${min}`; if (sp.bod) t += ` · za pune bodove ${sp.bod}+`;
        brojac.textContent = t; brojac.className = 'brojac-znakova' + (min && n < min && !sp.neobavezno ? ' mali' : '');
      };
      wrap.appendChild(sp.t === 'v' ? h('div', { class: 'oznaka', id: fid + '-l' }, sp.l) : h('label', { for: fid }, oz));
      if (sp.pomoc) wrap.appendChild(h('div', { class: 'pomoc' }, sp.pomoc));
      wrap.appendChild(ctrl); if (brojac) wrap.appendChild(brojac); wrap.appendChild(gr);
      if (sp.t === 'd') { ctrl.min = sp.slobodan ? '' : od; ctrl.max = sp.slobodan ? '' : doo; }
      S.reg.push({ put, gr, wrap, ctrl, info, o, uslov: sp.uslov }); info(); if (sp.uslov) wrap.hidden = !sp.uslov(o);
      return wrap;
    }
    function grupa(o, spec, pref, ro) {
      const c = h('div', { class: 'forma-sek' }); const red = h('div', { class: 'red-polja' });
      spec.forEach(sp => { const p = polje(o, sp, `${pref}.${sp.k}`, ro); (sp.t === 't' || sp.t === 'v' ? c : red).appendChild(p); });
      const out = h('div', { class: 'forma-sek' }); const brojevi = spec.filter(sp => sp.t !== 't' && sp.t !== 'v');
      return h('div', { class: 'forma-sek' }, red.children.length ? red : null, Array.from(c.children));
    }

    /* --- koraci --- */
    function korakSadrzaj(k) {
      const sp = SPEC[k];
      if (sp) return [h('h2', {}, NASLOV_SEK[k]), h('p', { class: 'podnaslov' }, UVOD[k]), k === 'administracija' ? qmsInfo() : null, grupa(S.sad[k], sp, k)];
      if (k === 'radionice') return [h('h2', {}, 'Radionice'), h('p', { class: 'podnaslov' }, UVOD[k]), h('div', { class: 'info' }, h('strong', {}, 'QP 05 Obuka: '), 'sve radionice i obuke održane u školi (za nastavnike, učenike i roditelje) moraju biti zavedene u zapise koje propisuje QP 05 (Evidencija obuke zaposlenih, QP 05.EO-02; Plan obuke zaposlenih). Za svaku održanu radionicu potvrdite da je zavedena.'), listaRad()];
      if (k === 'usavrsavanje') return [h('h2', {}, 'Stručno usavršavanje'), h('p', { class: 'podnaslov' }, UVOD[k]), listaGen(S.sad.usavrsavanje.stavke, SPEC_USV, 'usavrsavanje.stavke', 'Usavršavanje', 'Dodaj usavršavanje', () => ({}))];
      if (k === 'rizici') return [h('h2', {}, 'Rizici'), h('p', { class: 'podnaslov' }, UVOD[k]), listaRiz()];
      if (k === 'preporuke') return [h('h2', {}, 'Preporuke direktoru'), h('p', { class: 'podnaslov' }, UVOD[k]), listaPrep()];
      return pregledKorak();
    }
    function qmsInfo() {
      return h('div', { class: 'info' }, h('p', { style: 'margin:0 0 .4rem' }, h('strong', {}, 'QP 05 Obuka: '), 'zapisi: Plan obuke zaposlenih, Evidencija obuke zaposlenih (QP 05.EO-02), Izvještaj o obuci novozaposlenog. Zavedenost radionica potvrđujete u koraku „Radionice“.'),
        h('p', { style: 'margin:0' }, h('strong', {}, 'QP 09 Kreativni čas: '), 'nastavnik izrađuje Plan održavanja kreativnih časova (QP 09.PO-01), a pedagog posjećuje časove i nalaze bilježi na obrazac Ostvareni uvid u odgojno-obrazovni rad – posjeta času (QP 09.PC-02).'));
    }
    function listaGen(niz, spec, pref, naziv, dodaj, nova) {
      const c = h('div', { class: 'forma-sek' });
      const crtaj = () => { prazni(c); S.reg = S.reg.filter(r => !r.pripada); const start = S.reg.length;
        niz.forEach((x, i) => c.appendChild(h('div', { class: 'stavka-k' }, h('header', {}, h('b', {}, `${naziv} ${i + 1}`), h('button', { type: 'button', class: 'dugme malo opasno', onclick: () => { niz.splice(i, 1); S.touched.clear(); promjena0(); crtaj(); } }, 'Ukloni')), grupa(x, spec, `${pref}.${i}`))));
        S.reg.slice(start).forEach(r => { r.pripada = true; });
        c.appendChild(h('div', {}, h('button', { type: 'button', class: 'dugme sekund', onclick: () => { niz.push(nova()); promjena0(); crtaj(); } }, '+ ' + dodaj)));
        osvjezi(); };
      crtaj(); return c;
    }
    function promjena0() { S.dirty = true; S.verz++; sacuvajLokalno(); zakazi(); }
    function listaRad() {
      const rad = S.sad.radionice; const c = h('div', { class: 'forma-sek' }); const okvir = h('div');
      const nema = () => { prazni(okvir); if (!rad.stavke.length) okvir.appendChild(grupa(rad, [S_('nema_obrazlozenje', 'Obrazloženje izostanka radionica', 't', { min: 20, max: 1000, pomoc: 'Obavezno kada nema nijedne radionice.' })], 'radionice')); };
      const l = listaGen(rad.stavke, SPEC_RAD, 'radionice.stavke', 'Radionica', 'Dodaj radionicu', () => ({ ciljna_grupa: 'učenici', status: 'održano' }));
      l.addEventListener('click', () => setTimeout(nema, 0)); nema(); c.appendChild(l); c.appendChild(okvir); return c;
    }
    function listaRiz() {
      const c = h('div', { class: 'forma-sek' });
      const crtaj = () => { prazni(c);
        S.riz.forEach((x, i) => {
          const pren = x.prenesen === true; const spec = pren ? SPEC_RIZ.filter(s => ['ozbiljnost', 'status', 'mjera', 'rok'].includes(s.k)) : SPEC_RIZ;
          c.appendChild(h('div', { class: 'stavka-k' }, h('header', {}, h('b', {}, x.kod ? `${x.kod}${pren ? ' · prenesen' : ''}` : `Novi rizik ${i + 1}`),
            pren ? null : h('button', { type: 'button', class: 'dugme malo opasno', onclick: () => { S.riz.splice(i, 1); S.touched.clear(); promjena0(); crtaj(); } }, 'Ukloni')),
            pren ? h('div', { class: 'info' }, h('b', {}, x.kategorija + ': '), x.opis) : null, grupa(x, spec, `rizici.${i}`)));
        });
        c.appendChild(h('div', {}, h('button', { type: 'button', class: 'dugme sekund', onclick: () => { S.riz.push({ status: 'Otvoreno' }); promjena0(); crtaj(); } }, '+ Dodaj rizik')));
        osvjezi(); };
      crtaj(); return c;
    }
    function listaPrep() {
      const c = h('div', { class: 'forma-sek' });
      const crtaj = () => { prazni(c);
        S.prep.forEach((x, i) => {
          const zakl = ['Odobreno', 'Odbijeno'].includes(x.odluka);
          c.appendChild(h('div', { class: 'stavka-k' }, h('header', {}, h('b', {}, `Preporuka ${i + 1}`), h('span', { class: 'cip ' + (zakl ? 'odobren' : x.odluka === 'Potrebna dorada' ? 'vracen' : 'nacrt') }, x.odluka || 'Na čekanju'),
            zakl ? null : h('button', { type: 'button', class: 'dugme malo opasno', onclick: () => { S.prep.splice(i, 1); S.touched.clear(); promjena0(); crtaj(); } }, 'Ukloni')),
            x.komentar_direktora ? h('div', { class: 'info' }, h('b', {}, 'Komentar direktora: '), x.komentar_direktora) : null,
            zakl ? h('p', { class: 'sitno' }, 'Direktor je odlučio o ovoj preporuci; više se ne može mijenjati.') : null, grupa(x, SPEC_PREP, `preporuke.${i}`, zakl)));
        });
        c.appendChild(h('div', {}, h('button', { type: 'button', class: 'dugme sekund', onclick: () => { S.prep.push({}); promjena0(); crtaj(); } }, '+ Dodaj preporuku')));
        osvjezi(); };
      crtaj(); return c;
    }
    function pregledKorak() {
      const ge = greske(), { kp, b } = obracun(); const sad = [];
      sad.push(h('h2', {}, 'Pregled i podnošenje'));
      const ima = ge.length > 0;
      sad.push(ima ? h('div', { class: 'upozorenje' }, h('strong', {}, `Do podnošenja nedostaje još ${ge.length} ${ge.length === 1 ? 'stavka' : 'stavki'}. `), 'Dopunite označene odjeljke:')
        : h('div', { class: 'uspjeh' }, h('strong', {}, 'Izvještaj je potpun. '), 'Provjerite bodove i podnesite ga.'));
      if (ima) {
        const po = {}; ge.forEach(e => { const k = e.polje.split('.')[0]; (po[k] = po[k] || []).push(e); });
        sad.push(h('ul', {}, Object.keys(po).map(k => h('li', {}, h('a', { href: '#', onclick: ev => { ev.preventDefault(); S.pokaziSve = true; prikaziKorak(k); } }, (KORACI.find(x => x.k === k) || { n: k }).n), `: ${po[k].length}`))));
      }
      if (izv.kasnjenje_prvo > 0 && izv.ciklus === 0) sad.push(h('div', { class: 'upozorenje' }, `Rok za podnošenje je istekao (${L.fmtDatum(izv.rok_podnosenja)}). Kašnjenje od ${izv.kasnjenje_prvo} radnih dana smanjuje bodove za blagovremenost.`));
      sad.push(h('h3', {}, 'Predviđeni IDSS bodovi'), bodoviTabela(b), h('p', { class: 'sitno', style: 'color:var(--ink2)' }, 'Ovo je obračun do ocjene direktora (najviše 900 od 1000). Konačan obračun radi server pri podnošenju.'));
      sad.push(h('div', { style: 'margin-top:1rem' }, h('button', { type: 'button', class: 'dugme zlato', id: 'dug-podnesi', disabled: ima, onclick: podnesi }, izv.status === 'vracen' ? 'Podnesi dopunjen izvještaj' : 'Podnesi izvještaj direktoru')));
      return sad;
    }

    /* --- osvježavanje --- */
    let panelEl, koraciEl, sadrzajEl, statusEl;
    function osvjezi() {
      const ge = greske(); const mapa = {}; ge.forEach(e => { if (!mapa[e.polje]) mapa[e.polje] = e.poruka; });
      S.reg.forEach(r => { if (r.uslov) r.wrap.hidden = !r.uslov(r.o); r.info(); const p = mapa[r.put]; const vid = p && (S.touched.has(r.put) || S.pokaziSve); r.gr.textContent = vid ? p : ''; r.wrap.classList.toggle('ima-gr', !!vid);
        if (r.ctrl) { if (vid) r.ctrl.setAttribute('aria-invalid', 'true'); else r.ctrl.removeAttribute('aria-invalid'); } });
      KORACI.forEach(k => { const a = $('#kor-' + k.k); if (!a) return; const n = k.k === 'pregled' ? ge.length : ge.filter(e => e.polje === k.k || e.polje.startsWith(k.k + '.')).length;
        a.classList.toggle('gotov', k.k !== 'pregled' && n === 0); const bi = $('.nedostaje', a); if (bi) { bi.textContent = n ? `${n}` : ''; bi.title = n ? `Nedostaje stavki: ${n}` : ''; a.setAttribute('aria-label', KORACI[KORACI.indexOf(k)].n + (n ? `, nedostaje stavki: ${n}` : k.k === 'pregled' ? '' : ', popunjeno')); }
        const br = $('.br', a); if (br && k.k !== 'pregled') br.textContent = n === 0 ? '✓' : String(KORACI.indexOf(k) + 1); });
      const dp = $('#dug-podnesi'); if (dp) dp.disabled = ge.length > 0;
      panel();
    }
    function panel() {
      if (!panelEl) return;
      const { b } = obracun(); const model = { ukupno: b.zbroj, max: 900, po_grupama: b.po_grupama };
      if (S.scena) S.scena.postavi(model);
      $('#pan-uk', panelEl).textContent = String(b.zbroj);
      const ul = $('#pan-gr', panelEl); prazni(ul); ul.appendChild(U.redGrupa(model));
      const jos = $('#pan-jos', panelEl); prazni(jos);
      const praznine = b.stavke.filter(x => x.max - x.bodovi > 0).sort((a, c) => (c.max - c.bodovi) - (a.max - a.bodovi)).slice(0, 4);
      if (!praznine.length) jos.appendChild(h('li', {}, 'Osvojeni su svi bodovi koje sistem računa.'));
      praznine.forEach(x => jos.appendChild(h('li', {}, h('span', {}, h('b', {}, `+${x.max - x.bodovi} `), x.naziv, h('span', { class: 'sitno', style: 'display:block;color:var(--ink2)' }, x.napomena)))));
    }
    function status(vrsta, tekst) {
      if (!statusEl) return;
      statusEl.className = 'status-spremanja ' + ({ ok: 'ss-ok', nesp: 'ss-nesp', radi: 'ss-radi', gr: 'ss-gr' }[vrsta]);
      statusEl.lastChild.textContent = tekst;
    }

    /* --- spremanje --- */
    function zakazi() { status('nesp', 'Nespremljene izmjene'); clearTimeout(S.tim); S.tim = setTimeout(spremi, 1500); }
    function pripremi() {
      const e0 = L.provjeriSadrzaj(S.sad, false, gd, mj).filter(e => !/^(radionice|usavrsavanje)\.stavke\.\d+/.test(e.polje));
      if (e0.length) return { blok: e0[0].poruka };
      const sad = dubok(S.sad), izostavljeno = [];
      const dobar = (kljuc, x) => !L.provjeriSadrzaj({ [kljuc]: { stavke: [x] } }, false, gd, mj).some(e => e.polje.startsWith(kljuc + '.stavke.0'));
      ['radionice', 'usavrsavanje'].forEach(k => { sad[k].stavke = S.sad[k].stavke.filter(x => { const ok = dobar(k, x); if (!ok) izostavljeno.push(1); return ok; }); });
      const mapaR = [], mapaP = [];
      const riz = []; for (let i = 0; i < S.riz.length; i++) { const x = S.riz[i]; if (L.provjeriRizike([x], false).length) { if (x.id) return { blok: 'Rizik ' + (x.kod || (i + 1)) + ' nije potpun.' }; izostavljeno.push(1); } else { riz.push(x); mapaR.push(i); } }
      const prep = []; for (let i = 0; i < S.prep.length; i++) { const x = S.prep[i]; if (L.provjeriPreporuke([x], false).length) { if (x.id) return { blok: 'Preporuka nije potpuna.' }; izostavljeno.push(1); } else { prep.push(x); mapaP.push(i); } }
      return { sad, riz, prep, mapaR, mapaP, izostavljeno: izostavljeno.length };
    }
    async function spremi() {
      clearTimeout(S.tim); if (S.spremanje) { S.ponovo = true; return true; }
      if (!S.dirty) return true;
      const p = pripremi(); if (p.blok) { status('gr', 'Spremanje čeka ispravku: ' + p.blok); return false; }
      S.spremanje = true; status('radi', 'Spremanje…'); const verz = S.verz;
      const r = await Api.spremi(id, S.rev, p.sad, p.riz, p.prep, L.uuid());
      S.spremanje = false;
      if (r.ok) {
        S.rev = r.izvjestaj.revizija; S.srv = [];
        const zauzeto = new Set();
        S.riz.forEach(x => { if (!x.id) { const m = r.izvjestaj.rizici.find(q => !zauzeto.has(q.id) && L.btrim(q.opis) === L.btrim(x.opis || '')); if (m) { x.id = m.id; x.kod = m.kod; x.prenesen = m.prenesen; zauzeto.add(m.id); } } else zauzeto.add(x.id); });
        S.prep.forEach(x => { if (!x.id) { const m = r.izvjestaj.preporuke.find(q => !zauzeto.has(q.id) && L.btrim(q.naslov) === L.btrim(x.naslov || '')); if (m) { x.id = m.id; x.odluka = m.odluka; zauzeto.add(m.id); } } });
        S.dirty = S.verz !== verz || p.izostavljeno > 0;
        if (!S.dirty) { U.SS.set(KLJ, null); status('ok', 'Sve je spremljeno'); } else { sacuvajLokalno(); if (S.verz !== verz) zakazi(); else status('nesp', `${p.izostavljeno} nedovršena stavka čeka dopunu prije spremanja`); }
        if (S.ponovo) { S.ponovo = false; zakazi(); }
        return true;
      }
      if (r.kod === 'SUKOB_VERZIJA') { konflikt(r); return false; }
      if (r.kod === 'VALIDACIJA' || r.kod === 'KASNIJI_PERIOD' || r.kod === 'PRENESENI_RIZIK_NEDOSTAJE' || r.kod === 'POGRESNO_STANJE') { status('gr', 'Server nije prihvatio izmjene'); U.obavijesti(r.poruka + (r.greske && r.greske[0] ? ' ' + r.greske[0].poruka : ''), true); return false; }
      status('gr', 'Spremanje nije uspjelo; pokušat ću ponovo'); sacuvajLokalno(); S.tim = setTimeout(spremi, 10000); return false;
    }
    function konflikt(r) {
      status('gr', 'Sukob verzija');
      U.modal({ naslov: 'Izvještaj je izmijenjen na drugom mjestu', tijelo: h('p', {}, 'Ista verzija je u međuvremenu spremljena iz drugog taba ili uređaja. Možete učitati stanje sa servera (Vaše nespremljene izmjene se odbacuju) ili zadržati ono što je ovdje i prepisati nacrt.'),
        dugmad: [{ tekst: 'Učitaj stanje sa servera', klasa: 'sekund', klik: () => { U.SS.set(KLJ, null); S.dirty = false; U.ruta(); } },
          { tekst: 'Zadrži moje izmjene', klasa: 'zlato', klik: async () => { S.rev = r.revizija_servera || S.rev; if (!r.revizija_servera) { const u = await Api.ucitaj({ id }); if (u.ok) S.rev = u.izvjestaj.revizija; } S.dirty = true; spremi(); } }] });
    }

    /* --- podnošenje --- */
    async function podnesi() {
      S.pokaziSve = true; osvjezi();
      if (greske().length) { U.obavijesti('Izvještaj još nije potpun.', true); return; }
      const ok = await spremi(); if (!ok || S.dirty) { U.obavijesti('Izvještaj nije spremljen na server; podnošenje je zaustavljeno.', true); return; }
      const { b } = obracun();
      U.modal({ naslov: 'Podnijeti izvještaj direktoru?', tijelo: h('div', {}, h('p', {}, 'Nakon podnošenja izvještaj se više ne može mijenjati, osim ako ga direktor vrati na dopunu.'),
        h('p', { class: 'plocica' }, h('span', { class: 'br' }, `${b.zbroj} bodova`), h('span', { class: 'on' }, 'predviđeno prije ocjene direktora (najviše 900)')),
        izv.kasnjenje_prvo > 0 && izv.ciklus === 0 ? h('div', { class: 'upozorenje' }, `Podnošenje kasni ${izv.kasnjenje_prvo} radnih dana.`) : null),
        dugmad: [{ tekst: 'Još pregledam', klasa: 'sekund' }, { tekst: 'Podnesi', klasa: 'zlato', klik: async btn => {
          btn.disabled = true; const r = await Api.podnesi(id, S.rev, L.uuid());
          if (!r.ok) { btn.disabled = false; U.obavijesti(r.poruka + (r.greske && r.greske[0] ? ' ' + r.greske[0].poruka : ''), true); return false; }
          U.SS.set(KLJ, null); S.dirty = false; U.A.cuvar = null; location.hash = '#/izvjestaj/' + id; await U.ruta(); U.slavlje(r.izvjestaj, 'Izvještaj je podnesen'); } }] });
    }

    /* --- sklapanje stranice --- */
    function prikaziKorak(k) {
      S.korak = k; S.reg = []; prazni(sadrzajEl); korakSadrzaj(k).forEach(n => { if (n) sadrzajEl.appendChild(n); });
      KORACI.forEach(x => { const a = $('#kor-' + x.k); if (a) { if (x.k === k) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); } });
      try { history.replaceState(null, '', '#/izvjestaj/' + id + '/' + k); } catch (e) { /* ignorisano */ }
      const n = KORACI.findIndex(x => x.k === k); const i = KORACI.indexOf(KORACI[n]);
      sadrzajEl.appendChild(h('div', { style: 'display:flex;justify-content:space-between;gap:.6rem;margin-top:1.2rem' },
        n > 0 ? h('button', { type: 'button', class: 'dugme sekund', onclick: () => { prikaziKorak(KORACI[n - 1].k); window.scrollTo(0, 0); } }, '← ' + KORACI[n - 1].n) : h('span'),
        n < KORACI.length - 1 ? h('button', { type: 'button', class: 'dugme', onclick: () => { prikaziKorak(KORACI[n + 1].k); window.scrollTo(0, 0); } }, KORACI[n + 1].n + ' →') : null));
      osvjezi();
    }
    prazni(g);
    statusEl = h('span', { class: 'status-spremanja ss-ok', role: 'status', 'aria-live': 'polite' }, h('i', {}), 'Sve je spremljeno');
    g.appendChild(h('div', { class: 'naslov-stranice' }, h('div', {}, h('h1', {}, 'Izvještaj za ' + U.naslovPerioda(gd, mj)), h('p', { class: 'podnaslov' }, 'Rok: ' + L.fmtDatum(izv.status === 'vracen' ? izv.rok_dopune : izv.rok_podnosenja) + ' (' + U.rokTekst(izv.status === 'vracen' ? izv.rok_dopune : izv.rok_podnosenja, izv.danas) + ')')),
      h('div', { style: 'display:flex;gap:.6rem;align-items:center;flex-wrap:wrap' }, U.cipStatus(izv.status), statusEl)));
    if (izv.status === 'vracen') g.appendChild(h('div', { class: 'upozorenje', role: 'note' }, h('strong', {}, 'Direktor je vratio izvještaj na dopunu. '), izv.direktor_napomena ? `Napomena: ${izv.direktor_napomena}` : '', ' Rok za dopunu: ' + L.fmtDatum(izv.rok_dopune) + '.'));
    koraciEl = h('ol', { class: 'korak-lista' }, KORACI.map((k, i) => h('li', {}, h('a', { href: `#/izvjestaj/${id}/${k.k}`, id: 'kor-' + k.k, onclick: e => { e.preventDefault(); prikaziKorak(k.k); } }, h('span', { class: 'br' }, String(i + 1)), h('span', {}, k.n), h('span', { class: 'nedostaje' })))));
    sadrzajEl = h('section', { class: 'kartica', 'aria-live': 'off' });
    const platno = h('div', { style: 'position:relative' });
    panelEl = h('aside', { class: 'kartica bodovi-ploca', 'aria-label': 'Bodovi' }, h('h3', {}, 'IDSS bodovi'), platno,
      h('div', { class: 'ukupno' }, h('span', { id: 'pan-uk' }, '0'), h('small', {}, ' / 900')), h('div', { id: 'pan-gr' }), h('h3', { style: 'margin-top:.9rem;font-size:1rem' }, 'Gdje još možete osvojiti bodove'), h('ul', { class: 'pr-lista', id: 'pan-jos' }),
      h('p', { class: 'sitno', style: 'color:var(--ink2);margin-top:.6rem' }, 'Dio bodova (rok, rizici bez kašnjenja mjera) računa se i prije unosa sadržaja, pa broj raste kako popunjavate izvještaj. Do 100 bodova dodaje ocjena direktora nakon pregleda.'));
    g.appendChild(h('div', { class: 'uredjivac' }, h('nav', { class: 'bocna', 'aria-label': 'Koraci izvještaja' }, h('div', { class: 'kartica' }, koraciEl)), sadrzajEl, h('div', { class: 'bocna-s' }, panelEl)));
    const { b: b0 } = obracun(); S.scena = U.scena(platno, { ukupno: b0.zbroj, max: 900, po_grupama: b0.po_grupama });
    platno.firstChild && platno.firstChild.tagName === 'CANVAS' && (platno.style.height = '210px');
    prikaziKorak(KORACI.some(k => k.k === sek0) ? sek0 : 'ucenici');
    if (S.dirty) zakazi();
    U.A.cuvar = async () => { if (S.dirty) { await spremi(); } window.onbeforeunload = null; };
    window.onbeforeunload = () => (S.dirty ? 'Imate nespremljenih izmjena.' : undefined);
  }

  /* ================== PREGLED (čitanje i odluke) ================== */
  async function pregled(g, izv) {
    const A = U.A, dir = A.profil.uloga === 'direktor', id = izv.id;
    prazni(g);
    const model = U.modelBodova(izv); const platno = h('div', { style: 'position:relative;height:210px' });
    const kons = izv.bodovi && izv.bodovi.konacno;
    g.appendChild(h('div', { class: 'naslov-stranice' }, h('div', {}, h('h1', {}, `${dir ? izv.pedagog.ime + ' · ' : ''}Izvještaj za ${U.naslovPerioda(izv.godina, izv.mjesec)}`),
      dir && izv.pedagog && (izv.pedagog.email || izv.pedagog.telefon) ? h('p', { class: 'podnaslov' }, 'Kontakt: ', [izv.pedagog.email, izv.pedagog.telefon].filter(Boolean).join(' · ')) : null,
      h('p', { class: 'podnaslov' }, `Podneseno: ${U.fmtVrijeme(izv.podnesen_u)} · podnošenje br. ${izv.ciklus}${izv.na_vrijeme === null ? '' : izv.na_vrijeme ? ' · u roku' : ' · nakon roka'}`)), U.cipStatus(izv.status)));
    if (!dir && izv.status === 'podnesen') g.appendChild(h('div', { class: 'info' }, 'Izvještaj je podnesen i čeka pregled direktora. Bodovi su privremeni do njegove odluke.'));
    if (izv.status === 'odobren') g.appendChild(h('div', { class: 'uspjeh' }, h('strong', {}, 'Izvještaj je odobren. '), izv.direktor_ocjena !== null ? `Ocjena kvaliteta: ${izv.direktor_ocjena} od 5. ` : '', izv.direktor_napomena ? `Napomena direktora: ${izv.direktor_napomena}` : ''));
    g.appendChild(h('section', { class: 'kartica bodovi-ploca', style: 'margin-bottom:1rem' }, h('h2', {}, 'IDSS bodovi'), h('div', { class: 'mreza m2' }, platno,
      h('div', {}, h('div', { class: 'ukupno' }, `${model.ukupno}`, h('small', {}, ` / ${model.max} · ${kons ? 'konačno' : 'privremeno'}`)), U.redGrupa(model)))));
    U.scena(platno, model);
    const bt = bodoviTabela(izv.bodovi); if (bt) g.appendChild(h('section', { class: 'kartica', style: 'margin-bottom:1rem' }, h('h2', {}, 'Obračun po stavkama'), bt,
      izv.bodovi.konacno ? h('p', { class: 'sitno' }, `Ocjena direktora: ${izv.bodovi.direktor} bodova.`) : null));
    const kk = kpiKartica(izv.kpi, izv); if (kk) g.appendChild(kk);
    sadrzajCitanje(izv).forEach(n => { n.style.marginTop = '1rem'; g.appendChild(n); });
    // preporuke
    const pk = h('section', { class: 'kartica', style: 'margin-top:1rem' }, h('h2', {}, 'Preporuke direktoru'));
    if (!izv.preporuke.length) pk.appendChild(h('p', { style: 'color:var(--ink2)' }, 'Nema preporuka u ovom izvještaju.'));
    izv.preporuke.forEach((p, i) => {
      const kar = h('div', { class: 'stavka-k', style: 'margin-bottom:.7rem' }, h('header', {}, h('b', {}, `${i + 1}. ${p.naslov}`), h('span', { class: 'cip ' + (p.odluka === 'Odobreno' ? 'odobren' : p.odluka === 'Na čekanju' ? 'nacrt' : 'vracen') }, p.odluka)),
        h('dl', { class: 'pregled-sek' }, h('dt', {}, 'Obrazloženje'), h('dd', {}, p.obrazlozenje || '—'), h('dt', {}, 'Utjecaj'), h('dd', {}, p.utjecaj), p.komentar_direktora ? [h('dt', {}, 'Komentar direktora'), h('dd', {}, p.komentar_direktora)] : null));
      if (izv.moze_odluciti) {
        const sel = h('select', { id: 'od-' + i, 'aria-label': 'Odluka o preporuci' }, ['Na čekanju', 'Odobreno', 'Odbijeno', 'Potrebna dorada'].map(v => h('option', { value: v, selected: p.odluka === v }, v)));
        const kom = h('textarea', { rows: 2, id: 'ok-' + i, placeholder: 'Komentar (obavezan uz odbijanje ili dorada)', 'aria-label': 'Komentar uz odluku' }, p.komentar_direktora || '');
        kar.appendChild(h('div', { class: 'forma-sek' }, h('div', { class: 'polje' }, h('label', { for: 'od-' + i }, 'Odluka'), sel), kom,
          h('div', {}, h('button', { type: 'button', class: 'dugme malo', onclick: async () => { const r = await Api.odluka(p.id, sel.value, kom.value); if (!r.ok) { U.obavijesti(r.poruka, true); return; } U.obavijesti('Odluka je spremljena.'); U.ruta(); } }, 'Spremi odluku'))));
      }
      pk.appendChild(kar);
    });
    g.appendChild(pk);
    if (izv.moze_odluciti) {
      g.appendChild(h('section', { class: 'kartica', style: 'margin-top:1rem' }, h('h2', {}, 'Odluka o izvještaju'),
        h('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap' },
          h('button', { type: 'button', class: 'dugme sekund', id: 'dug-vrati', onclick: () => vratiModal(izv) }, 'Vrati na dopunu'),
          h('button', { type: 'button', class: 'dugme zeleno', id: 'dug-odobri', onclick: () => odobriModal(izv) }, 'Odobri izvještaj'))));
    }
    g.appendChild(h('div', { style: 'margin-top:1rem' }, await tragKartica(id)));
  }
  function vratiModal(izv) {
    const nap = h('textarea', { rows: 5, id: 'vr-nap', 'aria-describedby': 'vr-pom' });
    const gr = h('div', { class: 'gr', role: 'alert', style: 'color:var(--red);font-weight:600' });
    U.modal({ naslov: 'Vrati izvještaj na dopunu', tijelo: h('div', { class: 'forma-sek' }, h('p', {}, 'Pedagog dobija 3 radna dana za dopunu. Napišite šta treba dopuniti ili ispraviti.'), h('div', { class: 'polje' }, h('label', { for: 'vr-nap' }, 'Obrazloženje (najmanje 15 znakova)'), nap, h('div', { id: 'vr-pom', class: 'pomoc' }, ''), gr)),
      dugmad: [{ tekst: 'Odustani', klasa: 'sekund' }, { tekst: 'Vrati na dopunu', klasa: 'zlato', klik: async () => {
        if (L.len(L.btrim(nap.value)) < 15) { gr.textContent = 'Obrazloženje mora imati najmanje 15 znakova.'; return false; }
        const r = await Api.vrati(izv.id, izv.revizija, nap.value, L.uuid()); if (!r.ok) { gr.textContent = r.poruka; return false; }
        U.obavijesti('Izvještaj je vraćen na dopunu.'); setTimeout(() => { location.hash = '#/'; U.ruta(); }, 0); } }] });
  }
  function odobriModal(izv) {
    let ocj = null; const gr = h('div', { role: 'alert', style: 'color:var(--red);font-weight:600' });
    const zbroj = izv.bodovi ? izv.bodovi.zbroj : 0; const pr = h('p', { class: 'plocica' }, h('span', { class: 'br' }, '—'), h('span', { class: 'on' }, 'konačni IDSS bodovi'));
    const kom = h('textarea', { rows: 3, id: 'od-kom', maxlength: 1000 });
    const radio = h('div', { class: 'ocjena', role: 'radiogroup', 'aria-label': 'Ocjena kvaliteta' }, [0, 1, 2, 3, 4, 5].map(n => h('label', {}, h('input', { type: 'radio', name: 'ocj', value: n, onchange: () => { ocj = n; prazni(pr); pr.appendChild(h('span', { class: 'br' }, `${zbroj + 20 * n}`)); pr.appendChild(h('span', { class: 'on' }, `${zbroj} (sistem) + ${20 * n} (ocjena ${n} od 5)`)); } }), String(n))));
    U.modal({ naslov: 'Odobri izvještaj', tijelo: h('div', { class: 'forma-sek' }, h('p', {}, 'Ocijenite kvalitet izvještaja (0–5). Svaki stepen donosi 20 bodova. Nakon odobrenja izvještaj se zaključava.'), radio, pr,
      h('div', { class: 'polje' }, h('label', { for: 'od-kom' }, 'Napomena (nije obavezna)'), kom), gr),
      dugmad: [{ tekst: 'Odustani', klasa: 'sekund' }, { tekst: 'Odobri', klasa: 'zeleno', klik: async () => {
        if (ocj === null) { gr.textContent = 'Odaberite ocjenu kvaliteta.'; return false; }
        const r = await Api.odobri(izv.id, izv.revizija, ocj, kom.value, L.uuid()); if (!r.ok) { gr.textContent = r.poruka; return false; }
        U.obavijesti('Izvještaj je odobren.'); setTimeout(() => { location.hash = '#/'; U.ruta(); }, 0); } }] });
  }

  U.izvjestaj = async function (g, id, sek) {
    const r = await Api.ucitaj({ id });
    if (!r.ok) { prazni(g); g.appendChild(h('div', { class: 'naslov-stranice' }, h('h1', {}, 'Izvještaj nije dostupan'))); g.appendChild(U.greskaEkran(r)); return; }
    const izv = r.izvjestaj;
    if (izv.moze_urediti) { urednik(g, izv, sek); document.title = 'Uređivanje · IDSS Pedagog'; } else await pregled(g, izv);
  };
})(UI);
