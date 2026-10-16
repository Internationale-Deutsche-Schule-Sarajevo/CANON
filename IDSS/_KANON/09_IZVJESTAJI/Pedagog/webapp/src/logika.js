/* =====================================================================
   LOGIKA — validacija, KPI pokazatelji, IDSS bodovi, rokovi.
   Ovo je tačno ogledalo SQL funkcija iz supabase/002_validacija_bodovi.sql.
   Server je mjerodavan; ovdje se samo računa za trenutni prikaz i demo-režim.
   Paritet JS <-> SQL provjerava tests/30_paritet.mjs.
   ===================================================================== */
const Logika = (() => {
  'use strict';
  const ENUM = {
    teme: ['Ponašanje','Učenje i ocjene','Emocionalna podrška','Socijalna integracija','Daroviti učenici',
           'Inkluzivna podrška','Adaptacija novih učenika','Prelazak u viši razred',
           'Vršnjačko nasilje i sigurnost','Profesionalna orijentacija'],
    daNe: ['Da','Ne'],
    ednevnik: ['Uredno','U toku','Zahtijeva intervenciju'],
    grupe: ['učenici','nastavnici','roditelji'],
    radStatus: ['održano','otkazano','prebačeno'],
    usavrsavanje: ['seminar','webinar','stručni skup','mentorski rad','samostalno učenje','ostalo'],
    kategorija: ['Pedagoški / Ponašanje','Akademski','Sigurnosni / Zaštita djece','Organizacijski'],
    ozbiljnost: ['Nizak','Srednji','Visok','Kritičan'],
    statusRizika: ['Otvoreno','U toku','Riješeno','Eskalirano'],
    utjecaj: ['Nema troškova','Potreban budžet','Kadrovska odluka','Organizacijska izmjena'],
    odluka: ['Na čekanju','Odobreno','Odbijeno','Potrebna dorada'],
  };
  const MJESECI = ['januar','februar','mart','april','maj','juni','juli','august','septembar','oktobar','novembar','decembar'];
  const MJESECI_G = ['januara','februara','marta','aprila','maja','juna','jula','augusta','septembra','oktobra','novembra','decembra'];

  const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const len = s => Array.from(String(s)).length;                 // broj znakova (kao char_length)
  const btrim = s => String(s).replace(/^ +| +$/g, '');          // kao PostgreSQL btrim: samo razmaci
  const G = (polje, kod, poruka) => ({ polje, kod, poruka });
  const ci = (o, k) => (o && typeof o[k] === 'number' && Number.isInteger(o[k]) && Math.abs(o[k]) <= 2147483647) ? o[k] : null;
  const tk = (o, k) => (o && typeof o[k] === 'string') ? btrim(o[k]) : null;
  const obj = (s, k) => (isObj(s) && isObj(s[k])) ? s[k] : {};
  const nil = v => v === undefined || v === null;
  const pad2 = n => String(n).padStart(2, '0');

  function jeDatum(t) {
    if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
    const [y, m, d] = t.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  const jeUuid = t => typeof t === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
  function fmtDatum(iso) {            // 2026-10-06 -> 06.10.2026.
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}.${m}.${y}.`;
  }
  const krajMjeseca = (g, m) => { const d = new Date(Date.UTC(g, m, 0)); return `${g}-${pad2(m)}-${pad2(d.getUTCDate())}`; };

  /* ---------- element-validatori (isti poruke i kodovi kao SQL) ---------- */
  function eCijeli(o, k, naziv, mn, mx, obavezno, put) {
    const v = o[k];
    if (nil(v)) return obavezno ? [G(`${put}.${k}`, 'OBAVEZNO', `${naziv} je obavezno polje (unesite 0 ako nema aktivnosti).`)] : [];
    if (typeof v !== 'number' || !Number.isInteger(v)) return [G(`${put}.${k}`, 'TIP', `${naziv} mora biti cijeli broj.`)];
    if (v < mn || v > mx) return [G(`${put}.${k}`, 'RASPON', `${naziv} mora biti između ${mn} i ${mx}.`)];
    return [];
  }
  function eTekst(o, k, naziv, mn, mx, obavezno, put) {
    const v = o[k];
    if (nil(v)) return obavezno ? [G(`${put}.${k}`, 'OBAVEZNO', `${naziv} je obavezno polje.`)] : [];
    if (typeof v !== 'string') return [G(`${put}.${k}`, 'TIP', `${naziv} mora biti tekst.`)];
    const tt = btrim(v);
    if (/[\x01-\x08\x0B\x0C\x0E-\x1F]/.test(v)) return [G(`${put}.${k}`, 'ZNAKOVI', `${naziv} sadrži nedozvoljene kontrolne znakove.`)];
    if (len(v) > mx) return [G(`${put}.${k}`, 'PRODUGO', `${naziv} može imati najviše ${mx} znakova.`)];
    if (obavezno) {
      if (tt === '') return [G(`${put}.${k}`, 'OBAVEZNO', `${naziv} je obavezno polje.`)];
      if (len(tt) < mn) return [G(`${put}.${k}`, 'PREKRATKO', `${naziv} mora imati najmanje ${mn} znakova (trenutno ${len(tt)}).`)];
    }
    return [];
  }
  function eEnum(o, k, naziv, dozv, obavezno, put) {
    const v = o[k];
    if (nil(v)) return obavezno ? [G(`${put}.${k}`, 'OBAVEZNO', `${naziv} je obavezno polje.`)] : [];
    if (typeof v !== 'string' || !dozv.includes(v)) return [G(`${put}.${k}`, 'VRIJEDNOST', `${naziv} ima nedozvoljenu vrijednost.`)];
    return [];
  }
  function eVise(o, k, naziv, dozv, mn, obavezno, put) {
    const v = o[k];
    if (nil(v)) return obavezno ? [G(`${put}.${k}`, 'OBAVEZNO', `${naziv} je obavezno polje.`)] : [];
    if (!Array.isArray(v)) return [G(`${put}.${k}`, 'TIP', `${naziv} mora biti lista.`)];
    const dobri = v.filter(e => typeof e === 'string' && dozv.includes(e)).length;
    const razl = new Set(v.map(e => (typeof e === 'string' ? 's:' + e : 'x:' + JSON.stringify(e)))).size;
    if (dobri !== v.length) return [G(`${put}.${k}`, 'VRIJEDNOST', `${naziv} sadrži nedozvoljenu vrijednost.`)];
    if (razl !== v.length) return [G(`${put}.${k}`, 'DUPLIKAT', `${naziv} sadrži ponovljene vrijednosti.`)];
    if (obavezno && v.length < mn) return [G(`${put}.${k}`, 'OBAVEZNO', `${naziv}: odaberite najmanje ${mn}.`)];
    return [];
  }
  function eDatum(o, k, naziv, obavezno, put, od, doo) {
    const v = o[k];
    if (nil(v) || (typeof v === 'string' && btrim(v) === '')) return obavezno ? [G(`${put}.${k}`, 'OBAVEZNO', `${naziv} je obavezno polje.`)] : [];
    if (typeof v !== 'string' || !jeDatum(v)) return [G(`${put}.${k}`, 'TIP', `${naziv} mora biti ispravan datum (GGGG-MM-DD).`)];
    if (od && v < od) return [G(`${put}.${k}`, 'RASPON', `${naziv} ne smije biti prije ${fmtDatum(od)}.`)];
    if (doo && v > doo) return [G(`${put}.${k}`, 'RASPON', `${naziv} ne smije biti poslije ${fmtDatum(doo)}.`)];
    return [];
  }

  /* ---------- Validacija sadržaja ---------- */
  function provjeriSadrzaj(s, strogo, godina, mjesec) {
    if (!isObj(s)) return [G('sadrzaj', 'TIP', 'Sadržaj izvještaja mora biti objekat.')];
    let e = [];
    const od = `${godina}-${pad2(mjesec)}-01`, doo = krajMjeseca(godina, mjesec);
    for (const sek of ['ucenici', 'nastavnici', 'roditelji', 'radionice', 'usavrsavanje', 'administracija', 'zakljucak']) {
      if (sek in s && !(isObj(s[sek]) || s[sek] === null)) e.push(G(sek, 'TIP', `Odjeljak „${sek}“ mora biti objekat.`));
    }
    const u = obj(s, 'ucenici'), n = obj(s, 'nastavnici'), r = obj(s, 'roditelji'), rad = obj(s, 'radionice'),
          usv = obj(s, 'usavrsavanje'), a = obj(s, 'administracija'), z = obj(s, 'zakljucak');

    e = e.concat(
      eCijeli(u, 'individualni_razgovori', 'Broj individualnih razgovora', 0, 500, strogo, 'ucenici'),
      eCijeli(u, 'razliciti_ucenici', 'Broj različitih učenika', 0, 500, strogo, 'ucenici'),
      eCijeli(u, 'grupni_rad', 'Broj grupnih/razrednih aktivnosti', 0, 200, strogo, 'ucenici'),
      eCijeli(u, 'daroviti_ucenici', 'Broj darovitih učenika u radu', 0, 200, strogo, 'ucenici'));
    const ind = ci(u, 'individualni_razgovori'), raz = ci(u, 'razliciti_ucenici');
    e = e.concat(
      eVise(u, 'teme', 'Teme rada sa učenicima', ENUM.teme, 1, strogo && (ind || 0) > 0, 'ucenici'),
      eTekst(u, 'sazetak', 'Sažetak rada sa učenicima', 50, 2500, strogo, 'ucenici'));
    if (ind !== null && raz !== null && raz > ind)
      e.push(G('ucenici.razliciti_ucenici', 'NEUSKLADJENO', 'Broj različitih učenika ne može biti veći od broja individualnih razgovora.'));

    e = e.concat(
      eCijeli(n, 'posjete_planirano', 'Planirane posjete časovima', 0, 200, strogo, 'nastavnici'),
      eCijeli(n, 'posjete_realizirano', 'Realizirane posjete časovima', 0, 200, strogo, 'nastavnici'),
      eCijeli(n, 'konsultacije', 'Broj konsultacija sa nastavnicima', 0, 500, strogo, 'nastavnici'),
      eCijeli(n, 'mentorstvo_sati', 'Sati mentorstva i stručne pomoći', 0, 200, strogo, 'nastavnici'),
      eCijeli(n, 'sastanci_vijeca', 'Broj sjednica vijeća', 0, 50, strogo, 'nastavnici'));
    const pl = ci(n, 'posjete_planirano'), re = ci(n, 'posjete_realizirano');
    e = e.concat(
      eTekst(n, 'razredi', 'Razredi u kojima su posjećeni časovi', 1, 250, strogo && (re || 0) > 0, 'nastavnici'),
      eTekst(n, 'nalazi', 'Nalazi posjeta časovima', 50, 2500, strogo && (re || 0) > 0, 'nastavnici'),
      eTekst(n, 'obrazlozenje_prekoracenja', 'Obrazloženje prekoračenja plana posjeta', 20, 1000, strogo && re !== null && pl !== null && re > pl, 'nastavnici'),
      eTekst(n, 'koordinacija', 'Koordinacija sa nastavnicima i stručnim organima', 30, 2000, strogo, 'nastavnici'));

    e = e.concat(
      eCijeli(r, 'individualni_razgovori', 'Broj individualnih razgovora sa roditeljima', 0, 500, strogo, 'roditelji'),
      eCijeli(r, 'roditeljski_sastanci', 'Broj roditeljskih sastanaka', 0, 50, strogo, 'roditelji'),
      eCijeli(r, 'pisana_komunikacija', 'Broj pisanih komunikacija sa roditeljima', 0, 1000, strogo, 'roditelji'),
      eTekst(r, 'biljeske', 'Sažetak saradnje sa roditeljima', 30, 2000, strogo, 'roditelji'));

    // Radionice
    let stavke;
    if ('stavke' in rad && !Array.isArray(rad.stavke)) { e.push(G('radionice.stavke', 'TIP', 'Radionice moraju biti lista.')); stavke = []; }
    else stavke = rad.stavke === undefined ? [] : rad.stavke;
    if (stavke.length > 30) e.push(G('radionice.stavke', 'PREVISE', 'Najviše 30 radionica po izvještaju.'));
    else {
      stavke.forEach((x, i) => {
        const put = `radionice.stavke.${i}`;
        if (!isObj(x)) { e.push(G(put, 'TIP', 'Radionica mora biti objekat.')); return; }
        const st = tk(x, 'status');
        e = e.concat(
          eEnum(x, 'ciljna_grupa', 'Ciljna grupa radionice', ENUM.grupe, true, put),
          eTekst(x, 'naslov', 'Naslov radionice', 5, 150, true, put),
          eDatum(x, 'datum', 'Datum radionice', true, put, od, doo),
          eCijeli(x, 'trajanje_min', 'Trajanje radionice (minute)', 15, 480, true, put),
          eEnum(x, 'status', 'Status radionice', ENUM.radStatus, true, put),
          eCijeli(x, 'ucesnika', 'Broj učesnika', 0, 500, strogo || st === 'održano', put),
          eTekst(x, 'ishod', 'Ishod radionice', 20, 1000, strogo && st === 'održano', put),
          eEnum(x, 'qp05_zapis', 'Zavedeno u zapis QP 05 (Evidencija obuke, QP 05.EO-02)', ENUM.daNe, strogo || st === 'održano', put));
        if (st === 'održano' && (ci(x, 'ucesnika') || 0) < 1 && 'ucesnika' in x)
          e.push(G(`${put}.ucesnika`, 'RASPON', 'Održana radionica mora imati najmanje jednog učesnika.'));
      });
      e = e.concat(eTekst(rad, 'nema_obrazlozenje', 'Obrazloženje izostanka radionica', 20, 1000, strogo && stavke.length === 0, 'radionice'));
    }

    // Stručno usavršavanje
    if ('stavke' in usv && !Array.isArray(usv.stavke)) e.push(G('usavrsavanje.stavke', 'TIP', 'Stručno usavršavanje mora biti lista.'));
    else {
      const sv = usv.stavke === undefined ? [] : usv.stavke;
      if (sv.length > 30) e.push(G('usavrsavanje.stavke', 'PREVISE', 'Najviše 30 stavki stručnog usavršavanja.'));
      else sv.forEach((x, i) => {
        const put = `usavrsavanje.stavke.${i}`;
        if (!isObj(x)) { e.push(G(put, 'TIP', 'Stavka mora biti objekat.')); return; }
        e = e.concat(
          eTekst(x, 'naslov', 'Naslov usavršavanja', 5, 150, true, put),
          eEnum(x, 'vrsta', 'Vrsta usavršavanja', ENUM.usavrsavanje, true, put),
          eCijeli(x, 'sati', 'Broj sati', 1, 100, true, put),
          eDatum(x, 'datum', 'Datum usavršavanja', true, put, od, doo));
      });
    }

    e = e.concat(
      eCijeli(a, 'kreativni_planirano', 'Kreativni časovi planirani (QP 09.PO-01)', 0, 200, strogo, 'administracija'),
      eCijeli(a, 'kreativni_odrzano', 'Održani kreativni časovi', 0, 200, strogo, 'administracija'),
      eCijeli(a, 'kreativni_posjeceno', 'Posjećeni kreativni časovi evidentirani na QP 09.PC-02', 0, 200, strogo, 'administracija'),
      eEnum(a, 'ednevnik', 'Stanje eDnevnika', ENUM.ednevnik, strogo, 'administracija'),
      eTekst(a, 'mooks_sazetak', 'Sažetak prepiske sa MOOKS-om', 20, 1500, strogo, 'administracija'),
      eTekst(a, 'dokumentacija', 'Napomene o dokumentaciji', 1, 1500, false, 'administracija'),
      eTekst(z, 'postignuca', 'Ključna postignuća u mjesecu', 50, 2000, strogo, 'zakljucak'),
      eTekst(z, 'plan_sljedeci', 'Plan za sljedeći mjesec', 50, 2000, strogo, 'zakljucak'));
    const kp = ci(a, 'kreativni_planirano'), ko = ci(a, 'kreativni_odrzano'), kv = ci(a, 'kreativni_posjeceno');
    if (ko !== null && kv !== null && kv > ko) e.push(G('administracija.kreativni_posjeceno', 'NEUSKLADJENO', 'Broj posjećenih kreativnih časova ne može biti veći od broja održanih.'));
    e = e.concat(eTekst(a, 'kreativni_napomena', 'Obrazloženje odstupanja kod kreativnih časova', 20, 1000,
      strogo && kp !== null && ko !== null && kv !== null && (kp !== ko || kv < ko), 'administracija'));
    return e;
  }

  function provjeriRizike(r, strogo) {
    if (!Array.isArray(r)) return [G('rizici', 'TIP', 'Rizici moraju biti lista.')];
    if (r.length > 100) return [G('rizici', 'PREVISE', 'Najviše 100 rizika po izvještaju.')];
    let e = []; const ids = [];
    r.forEach((x, i) => {
      const put = `rizici.${i}`;
      if (!isObj(x)) { e.push(G(put, 'TIP', 'Rizik mora biti objekat.')); return; }
      if ('id' in x && x.id !== null) {
        if (typeof x.id !== 'string' || !jeUuid(x.id)) e.push(G(`${put}.id`, 'TIP', 'Identifikator rizika nije ispravan.'));
        else if (ids.includes(x.id)) e.push(G(`${put}.id`, 'DUPLIKAT', 'Isti rizik je naveden više puta.'));
        else ids.push(x.id);
      }
      e = e.concat(
        eEnum(x, 'kategorija', 'Kategorija rizika', ENUM.kategorija, true, put),
        eEnum(x, 'ozbiljnost', 'Ozbiljnost rizika', ENUM.ozbiljnost, true, put),
        eEnum(x, 'status', 'Status rizika', ENUM.statusRizika, true, put),
        eTekst(x, 'opis', 'Opis rizika', 10, 500, true, put),
        eTekst(x, 'mjera', 'Korektivna mjera', 10, 500, strogo, put),
        eDatum(x, 'rok', 'Rok mjere', strogo, put, null, null));
    });
    return e;
  }

  function provjeriPreporuke(p, strogo) {
    if (!Array.isArray(p)) return [G('preporuke', 'TIP', 'Preporuke moraju biti lista.')];
    if (p.length > 50) return [G('preporuke', 'PREVISE', 'Najviše 50 preporuka po izvještaju.')];
    let e = []; const ids = [];
    p.forEach((x, i) => {
      const put = `preporuke.${i}`;
      if (!isObj(x)) { e.push(G(put, 'TIP', 'Preporuka mora biti objekat.')); return; }
      if ('id' in x && x.id !== null) {
        if (typeof x.id !== 'string' || !jeUuid(x.id)) e.push(G(`${put}.id`, 'TIP', 'Identifikator preporuke nije ispravan.'));
        else if (ids.includes(x.id)) e.push(G(`${put}.id`, 'DUPLIKAT', 'Ista preporuka je navedena više puta.'));
        else ids.push(x.id);
      }
      e = e.concat(
        eTekst(x, 'naslov', 'Naslov preporuke', 5, 150, true, put),
        eTekst(x, 'obrazlozenje', 'Obrazloženje preporuke', 20, 1000, strogo, put),
        eEnum(x, 'utjecaj', 'Utjecaj na resurse', ENUM.utjecaj, true, put));
    });
    return e;
  }

  /* ---------- KPI ---------- */
  function kpi(s, r, godina, mjesec) {
    const n = obj(s, 'nastavnici'), u = obj(s, 'ucenici');
    const pl = ci(n, 'posjete_planirano'), re = ci(n, 'posjete_realizirano');
    const kraj = krajMjeseca(godina, mjesec);
    const lista = Array.isArray(r) ? r : [];
    const otvoren = x => x.status !== 'Riješeno';
    const po = { 'Kritičan': 0, 'Visok': 0, 'Srednji': 0, 'Nizak': 0 };
    lista.forEach(x => { if (otvoren(x) && x.ozbiljnost in po) po[x.ozbiljnost]++; });
    return {
      kpi01: {
        planirano: pl, realizirano: re,
        stopa: (pl === null || re === null || pl === 0) ? null : Math.round(1000 * re / pl) / 10,
        nije_planirano: pl === 0,
        premaseno: (pl !== null && re !== null && re > pl) ? re - pl : 0,
      },
      kpi02: { sesije: ci(u, 'individualni_razgovori') },
      kpi03: {
        rijeseno_3a: lista.filter(x => x.status === 'Riješeno').length,
        preneseno_3b: lista.filter(x => x.prenesen === true).length,
        aktivno_3c: lista.filter(otvoren).length,
        po_ozbiljnosti: po,
        kasne_mjere: lista.filter(x => otvoren(x) && jeDatum(x.rok) && x.rok < kraj).length,
        novi: lista.filter(x => x.prenesen !== true).length,
      },
    };
  }

  /* ---------- IDSS bodovi ---------- */
  const rnd = (a, b, c) => Math.floor((2 * a * b + c) / (2 * c));
  const stavka = (kod, grupa, naziv, bodovi, max, napomena) => ({ kod, grupa, naziv, bodovi, max, napomena });
  const tekstOd = v => (nil(v) ? '' : (typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v))));
  const narBodovi = (t, vrh, sred, vrhB, sredB) => { const l = len(btrim(tekstOd(t))); return l >= vrh ? vrhB : (l >= sred ? sredB : 0); };

  function bodovi(s, r, k, godina, mjesec, kasnjenje, ciklus, kasnjenjeDopune) {
    const u = obj(s, 'ucenici'), n = obj(s, 'nastavnici'), ro = obj(s, 'roditelji'), rad = obj(s, 'radionice'),
          usv = obj(s, 'usavrsavanje'), a = obj(s, 'administracija'), z = obj(s, 'zakljucak');
    const greske = provjeriSadrzaj(s, true, godina, mjesec);
    const kas = Math.max(kasnjenje || 0, 0), kd = Math.max(kasnjenjeDopune || 0, 0);
    const st = [];
    const b1 = Math.max(0, 200 - 50 * Math.min(kas, 4));
    const b2 = ciklus <= 1 ? 50 : Math.max(0, 50 - 25 * Math.min(kd, 2));
    st.push(stavka('B1', 'blagovremenost', 'Podnošenje izvještaja u roku', b1, 200, kas === 0 ? 'Podneseno u roku.' : `Kašnjenje: ${kas} radnih dana.`));
    st.push(stavka('B2', 'blagovremenost', 'Dopuna u roku nakon vraćanja', b2, 50,
      ciklus <= 1 ? 'Izvještaj nije vraćen na dopunu.' : (kd === 0 ? 'Dopuna u roku.' : `Kašnjenje dopune: ${kd} radnih dana.`)));

    const sekcije = ['ucenici', 'nastavnici', 'roditelji', 'radionice', 'administracija', 'zakljucak'];
    const tezine = [20, 20, 15, 15, 15, 15];
    let s1 = 0;
    sekcije.forEach((sek, i) => { if (!greske.some(g => g.polje === sek || g.polje.startsWith(sek + '.'))) s1 += tezine[i]; });
    st.push(stavka('S1', 'sadrzaj', 'Cjelovitost odjeljaka', s1, 100, 'Odjeljak je cjelovit kada nema nedostataka pri provjeri.'));
    const s2 = narBodovi(u.sazetak, 150, 80, 15, 8) + narBodovi(n.koordinacija, 150, 80, 15, 8) + narBodovi(ro.biljeske, 150, 80, 15, 8)
             + narBodovi(a.mooks_sazetak, 150, 80, 15, 8) + narBodovi(z.postignuca, 150, 80, 15, 8);
    st.push(stavka('S2', 'sadrzaj', 'Konkretnost opisa', s2, 75, 'Opisi od 80 znakova donose dio, a od 150 znakova pun broj bodova.'));
    const lp = len(btrim(tekstOd(z.plan_sljedeci)));
    const s3 = lp >= 200 ? 50 : (lp >= 120 ? 35 : (lp >= 50 ? 20 : 0));
    st.push(stavka('S3', 'sadrzaj', 'Konkretnost plana za sljedeći mjesec', s3, 50, 'Plan od 50, 120 i 200 znakova: 20, 35 i 50 bodova.'));
    const rl = Array.isArray(r) ? r : [];
    const ukupnoR = rl.length, kompletno = rl.filter(x => tekstOd(x.mjera) !== '' && jeDatum(x.rok)).length;
    const s4 = ukupnoR === 0 ? 25 : rnd(25, kompletno, ukupnoR);
    st.push(stavka('S4', 'sadrzaj', 'Korektivne mjere uz rizike', s4, 25,
      ukupnoR === 0 ? 'Nema evidentiranih rizika.' : `${kompletno} od ${ukupnoR} rizika ima mjeru i rok.`));

    const pl = ci(n, 'posjete_planirano'), re = ci(n, 'posjete_realizirano');
    const t1 = (pl || 0) === 0 ? 30 : rnd(60, Math.min(re || 0, pl), pl);
    st.push(stavka('T1', 'strucnost', 'Posjete časovima', t1, 60,
      (pl || 0) === 0 ? 'Posjete nisu planirane: polovina bodova.' : `Realizirano ${re || 0} od ${pl} planiranih posjeta (računa se najviše do punog plana).`));
    const rs = Array.isArray(rad.stavke) ? rad.stavke : [];
    const odrz = rs.filter(x => isObj(x) && x.status === 'održano');
    const odr = odrz.length;
    const gr = new Set(odrz.filter(x => typeof x.ciljna_grupa === 'string').map(x => x.ciljna_grupa)).size;
    const ukupnoRad = rs.length;
    const t2 = Math.min(40, 20 * odr) + (gr >= 2 ? 10 : 0);
    st.push(stavka('T2', 'strucnost', 'Održane radionice', t2, 50, `Održano radionica: ${odr}; ciljnih grupa: ${gr} (po 20 bodova za prve dvije radionice, +10 za dvije ili više ciljnih grupa).`));
    const us = Array.isArray(usv.stavke) ? usv.stavke : [];
    const sati = us.reduce((acc, x) => acc + (isObj(x) && ci(x, 'sati') !== null ? ci(x, 'sati') : 0), 0);
    const t3 = Math.min(40, 10 * sati);
    st.push(stavka('T3', 'strucnost', 'Stručno usavršavanje', t3, 40, `Sati usavršavanja: ${sati} (10 bodova po satu, najviše 40).`));
    const q5 = rs.filter(x => isObj(x) && x.status === 'održano' && x.qp05_zapis === 'Da').length;
    const t4 = odr === 0 ? 10 : rnd(20, Math.min(q5, odr), odr);
    st.push(stavka('T4', 'strucnost', 'QP 05: radionice i obuke zavedene u zapis', t4, 20,
      odr === 0 ? 'Nema održanih radionica ni obuka: polovina bodova.' : `U zapis QP 05 zavedeno ${Math.min(q5, odr)} od ${odr} održanih radionica i obuka.`));
    const kp = ci(a, 'kreativni_planirano'), ko = ci(a, 'kreativni_odrzano') || 0, kv = ci(a, 'kreativni_posjeceno') || 0;
    const t5 = ko === 0 ? ((kp || 0) > 0 ? 0 : 10) : rnd(20, Math.min(kv, ko), ko);
    st.push(stavka('T5', 'strucnost', 'QP 09: posjete kreativnim časovima evidentirane', t5, 20,
      ko === 0 && (kp || 0) > 0 ? 'Planirani kreativni časovi nisu održani.' : ko === 0 ? 'Nema planiranih ni održanih kreativnih časova: polovina bodova.'
        : `Evidentirano ${Math.min(kv, ko)} posjeta od ${ko} održanih kreativnih časova.`));
    const t6 = { 'Uredno': 10, 'U toku': 6, 'Zahtijeva intervenciju': 4 }[a.ednevnik] || 0;
    st.push(stavka('T6', 'strucnost', 'Stanje eDnevnika', t6, 10, 'Uredno 10, u toku 6, zahtijeva intervenciju 4 boda.'));

    const k3 = (k && k.kpi03) || {};
    const ra = k3.rijeseno_3a || 0, rb = k3.preneseno_3b || 0, rc = k3.aktivno_3c || 0, rk = k3.kasne_mjere || 0, rn = k3.novi || 0;
    const base = rb + rn;
    const e1 = base === 0 ? 60 : rnd(60, Math.min(ra, base), base);
    st.push(stavka('E1', 'efikasnost', 'Rješavanje rizika', e1, 60, base === 0 ? 'Nema rizika za rješavanje.' : `Riješeno ${ra} od ${base} rizika u razmatranju.`));
    const e2 = rc === 0 ? 60 : rnd(60, Math.max(rc - rk, 0), rc);
    st.push(stavka('E2', 'efikasnost', 'Mjere u roku', e2, 60, rc === 0 ? 'Nema aktivnih rizika.' : `${rk} od ${rc} aktivnih rizika ima probijen rok mjere.`));
    const e3 = ciklus <= 1 ? 40 : (ciklus === 2 ? 20 : 0);
    st.push(stavka('E3', 'efikasnost', 'Prihvaćeno bez vraćanja', e3, 40, `Podnošenje br. ${ciklus}.`));
    const e4 = ukupnoRad === 0 ? 20 : rnd(40, odr, ukupnoRad);
    st.push(stavka('E4', 'efikasnost', 'Realizacija radionica', e4, 40,
      ukupnoRad === 0 ? 'Nema evidentiranih radionica: polovina bodova.' : `${odr} od ${ukupnoRad} evidentiranih radionica je održano.`));

    const grupa = g => ({ bodovi: st.filter(x => x.grupa === g).reduce((x, y) => x + y.bodovi, 0), max: { blagovremenost: 250, sadrzaj: 250, strucnost: 200, efikasnost: 200 }[g] });
    return {
      stavke: st, zbroj: st.reduce((x, y) => x + y.bodovi, 0), max: 900,
      po_grupama: { blagovremenost: grupa('blagovremenost'), sadrzaj: grupa('sadrzaj'), strucnost: grupa('strucnost'), efikasnost: grupa('efikasnost') },
    };
  }

  const rang = p => (p >= 900 ? 'Velemajstor' : p >= 800 ? 'Majstor' : p >= 650 ? 'Stručnjak' : p >= 500 ? 'Saradnik' : 'Pripravnik');

  /* ---------- Rokovi (za demo-režim; server računa sa kalendarom neradnih dana) ---------- */
  const dodajDane = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return dt.toISOString().slice(0, 10); };
  const radniDan = (iso, neradni) => { const [y, m, d] = iso.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w !== 0 && w !== 6 && !(neradni || []).includes(iso); };
  const sljedeciRadni = (iso, neradni) => { let x = iso; while (!radniDan(x, neradni)) x = dodajDane(x, 1); return x; };
  const dodajRadne = (iso, n, neradni) => { let x = iso, k = 0; while (k < n) { x = dodajDane(x, 1); if (radniDan(x, neradni)) k++; } return x; };
  const radnihIzmedju = (od, doo, neradni) => { let c = 0, x = od; while (x < doo) { x = dodajDane(x, 1); if (radniDan(x, neradni)) c++; } return c; };
  const rokPodnosenja = (g, m, neradni, dan = 5) => {
    const sl = m === 12 ? [g + 1, 1] : [g, m + 1];
    return sljedeciRadni(`${sl[0]}-${pad2(sl[1])}-${pad2(dan)}`, neradni);
  };
  const imeMjeseca = m => MJESECI[m - 1];
  const naslovPerioda = (g, m) => `${imeMjeseca(m)} ${g}.`;
  const skolskaGodina = (g, m) => (m >= 9 ? g : g - 1);

  const uuid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  return { ENUM, MJESECI, MJESECI_G, provjeriSadrzaj, provjeriRizike, provjeriPreporuke, kpi, bodovi, rang, rnd,
           jeDatum, fmtDatum, krajMjeseca, dodajDane, radniDan, sljedeciRadni, dodajRadne, radnihIzmedju, rokPodnosenja,
           imeMjeseca, naslovPerioda, skolskaGodina, uuid, len, btrim, isObj };
})();
if (typeof module !== 'undefined') module.exports = Logika;
