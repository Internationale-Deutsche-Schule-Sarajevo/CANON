
/* =====================================================================
   API — jedini sloj koji komunicira sa serverom.
   * SupabaseApi: Auth REST (/auth/v1) + PostgREST RPC (/rest/v1/rpc/idss_psih_*).
     Ishod operacije je UVIJEK u tijelu odgovora ({ok, kod, poruka}), ne u HTTP statusu.
   Sve odluke o ulozi i pravima donosi server; klijent ih samo prikazuje.
   ===================================================================== */
const Api = (() => {
  'use strict';
  const MREZA = { ok: false, kod: 'MREZA', poruka: 'Nema veze sa serverom. Provjerite internet i pokušajte ponovo.', mreza: true };
  const ISTEKLO = { ok: false, kod: 'SESIJA_ISTEKLA', poruka: 'Sesija je istekla. Prijavite se ponovo.' };
  let cfg = { url: '', kljuc: '' };
  let sesija = null;                // { access, refresh, istice }
  const SS = (() => { try { return window.sessionStorage; } catch (e) { return null; } })();
  const ssGet = k => { try { return SS && SS.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { SS && (v === null ? SS.removeItem(k) : SS.setItem(k, v)); } catch (e) { /* privatni prozor */ } };

  function postavi(c) { cfg = { url: String(c.url || '').replace(/\/+$/, ''), kljuc: c.kljuc || '' }; }
  const konfigurisano = () => /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url) && cfg.kljuc.length > 20;

  async function http(putanja, opcije, bezAuth) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opcije.timeout || 25000);
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
    ssSet('idss_psih_sesija', JSON.stringify(sesija));
  }
  async function rpc(ime, args, drugiPut) {
    if (sesija && sesija.istice - Date.now() < 30000 && !drugiPut) { if (!(await obnoviToken())) { sesija = null; ssSet('idss_psih_sesija', null); return ISTEKLO; } }
    const r = await http('/rest/v1/rpc/' + ime, { method: 'POST', body: JSON.stringify(args || {}) });
    if (!r) return MREZA;
    if (r.status === 401 || (r.tijelo && (r.tijelo.code === 'PGRST301' || /JWT/i.test(r.tijelo.message || '')))) {
      if (!drugiPut && await obnoviToken()) return rpc(ime, args, true);
      sesija = null; ssSet('idss_psih_sesija', null); return ISTEKLO;
    }
    if (r.status === 404 || (r.tijelo && r.tijelo.code === 'PGRST202'))
      return { ok: false, kod: 'NIJE_POSTAVLJENO', poruka: 'Baza nije pripremljena: pokrenite datoteku PSIH_1_BAZA.sql iz mape „supabase“ u Supabase SQL Editoru.' };
    if (r.status === 403 || (r.tijelo && r.tijelo.code === '42501'))
      return { ok: false, kod: 'NEOVLASTEN', poruka: 'Pristup nije dozvoljen.' };
    if (r.status >= 500 || !r.tijelo || typeof r.tijelo.ok !== 'boolean')
      return { ok: false, kod: 'GRESKA_SERVERA', poruka: 'Došlo je do greške na serveru. Pokušajte ponovo.' };
    return r.tijelo;
  }

  const Supa = {
    async obnovi() {
      const s = ssGet('idss_psih_sesija'); if (!s) return false;
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
      sesija = null; ssSet('idss_psih_sesija', null); return { ok: true };
    },
    profil: () => rpc('idss_psih_profil'),
    pocetna: () => rpc('idss_psih_pocetna'),
    ucitaj: a => rpc('idss_psih_ucitaj', { p_id: a.id || null, p_godina: a.godina || null, p_mjesec: a.mjesec || null }),
    kreiraj: (g, m, z) => rpc('idss_psih_kreiraj', { p_godina: g, p_mjesec: m, p_zahtjev: z || null }),
    spremi: (id, rev, s, r, p, z) => rpc('idss_psih_spremi', { p_id: id, p_revizija: rev, p_sadrzaj: s, p_rizici: r, p_preporuke: p, p_zahtjev: z || null }),
    podnesi: (id, rev, z) => rpc('idss_psih_podnesi', { p_id: id, p_revizija: rev, p_zahtjev: z || null }),
    vrati: (id, rev, nap, z) => rpc('idss_psih_vrati', { p_id: id, p_revizija: rev, p_napomena: nap, p_zahtjev: z || null }),
    odluka: (pid, odl, kom) => rpc('idss_psih_odluka', { p_preporuka: pid, p_odluka: odl, p_komentar: kom || null }),
    odobri: (id, rev, ocj, kom, z) => rpc('idss_psih_odobri', { p_id: id, p_revizija: rev, p_ocjena: ocj, p_komentar: kom || null, p_zahtjev: z || null }),
    trag: id => rpc('idss_psih_trag', { p_id: id }),
    arhiva: () => rpc('idss_psih_arhiva'),
    async aiOcjena() {
      if (sesija && sesija.istice - Date.now() < 30000) { if (!(await obnoviToken())) { sesija = null; ssSet('idss_psih_sesija', null); return ISTEKLO; } }
      const r = await http('/functions/v1/psih-ai-ocjena', { method: 'POST', body: '{}', timeout: 100000 });
      if (!r) return MREZA;
      if (r.status === 404) return { ok: false, kod: 'NIJE_POSTAVLJENO', poruka: 'AI funkcija nije postavljena na serveru (potrebno je postaviti funkciju „psih-ai-ocjena“ u Supabaseu).' };
      if (r.status === 401) { sesija = null; ssSet('idss_psih_sesija', null); return ISTEKLO; }
      if (!r.tijelo || typeof r.tijelo.ok !== 'boolean') return { ok: false, kod: 'GRESKA_SERVERA', poruka: 'AI ocjena trenutno nije dostupna. Pokušajte ponovo.' };
      return r.tijelo;
    },
  };

  return {
    postavi, konfigurisano, MREZA,
    nacin: () => 'supabase',
    obnovi: () => Supa.obnovi(),
    prijava: (e, l) => Supa.prijava(e, l),
    odjava: () => Supa.odjava(),
    profil: Supa.profil, pocetna: Supa.pocetna, ucitaj: Supa.ucitaj, kreiraj: Supa.kreiraj,
    spremi: Supa.spremi, podnesi: Supa.podnesi, vrati: Supa.vrati, odluka: Supa.odluka,
    odobri: Supa.odobri, trag: Supa.trag, arhiva: Supa.arhiva, aiOcjena: Supa.aiOcjena,
  };
})();
if (typeof module !== 'undefined') module.exports = Api;
