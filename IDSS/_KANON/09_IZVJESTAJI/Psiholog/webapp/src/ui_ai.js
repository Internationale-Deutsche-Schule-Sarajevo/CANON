
/* =====================================================================
   UI — AI ocjena posljednjeg podnesenog izvještaja (samo direktor@idss.ba).
   Kartica se prikazuje samo ovlaštenom računu; pravu provjeru radi server
   (Edge funkcija „ai-ocjena“). Odgovor se prikazuje isključivo kao tekst.
   ===================================================================== */
(function (U) {
  'use strict';
  const h = U.h, prazni = U.prazni;
  const dozvoljeno = () => {
    const p = U.A.profil; if (!p || p.uloga !== 'direktor') return false;
    const c = window.IDSS_CONFIG || {}; return !!(c.ai_email && p.email && String(p.email).toLowerCase() === String(c.ai_email).toLowerCase());
  };
  const lista = a => (a && a.length ? h('ul', { class: 'ai-lista' }, a.map(x => h('li', {}, x))) : h('p', { class: 'sitno', style: 'color:var(--ink2)' }, 'Nema stavki.'));
  const KLJ = 'idss_ai_';
  function prikaz(r) {
    const o = r.ocjena, i = r.izvjestaj, pr = o.preporuka_direktoru;
    const boja = { 'odobriti': 'odobren', 'odobriti uz napomene': 'podnesen', 'vratiti na dopunu': 'vracen' }[pr.odluka] || 'nacrt';
    return h('div', { class: 'ai-sadrzaj' },
      h('p', { class: 'sitno', style: 'color:var(--ink2)' }, `Izvještaj: ${U.naslovPerioda(i.godina, i.mjesec)} · podneseno ${U.fmtVrijeme(i.podnesen_u)} · generisano ${U.fmtVrijeme(r.generisano)}`),
      o.ukupna_ocjena ? h('p', {}, h('strong', {}, 'Ukupna stručna ocjena: '), h('span', { class: 'cip podnesen' }, o.ukupna_ocjena)) : null,
      h('p', {}, o.sazetak),
      h('h3', {}, 'Snage izvještaja'), lista(o.snage),
      h('h3', {}, 'Zapažanja i nedostaci'), lista(o.zapazanja_i_nedostaci),
      o.procjena_po_oblastima.length ? h('div', {}, h('h3', {}, 'Procjena po oblastima'), h('div', { class: 'tabela-omot' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Oblast'), h('th', {}, 'Procjena'))),
        h('tbody', {}, o.procjena_po_oblastima.map(x => h('tr', {}, h('td', {}, x.oblast), h('td', {}, x.procjena))))))) : null,
      h('div', { class: 'ai-preporuka' }, h('h3', {}, 'Preporuka direktoru'),
        pr.odluka ? h('p', {}, h('span', { class: 'cip ' + boja }, pr.odluka)) : null, h('p', {}, pr.obrazlozenje), pr.koraci.length ? lista(pr.koraci) : null),
      o.pitanja_za_psihologa.length ? h('div', {}, h('h3', {}, 'Pitanja za psihologa'), lista(o.pitanja_za_psihologa)) : null,
      o.ogranicenja ? h('p', { class: 'sitno', style: 'color:var(--ink2)' }, 'Ograničenja procjene: ' + o.ogranicenja) : null);
  }
  U.aiKartica = function () {
    if (!dozvoljeno()) return null;
    const izlaz = h('div', { 'aria-live': 'polite' }), dug = h('button', { type: 'button', class: 'dugme', id: 'dug-ai' }, 'Zatraži AI ocjenu');
    const sekcija = h('section', { class: 'kartica ai-kartica', style: 'margin-top:1rem', id: 'ai-ocjena' }, h('h2', {}, 'AI ocjena posljednjeg izvještaja'),
      h('p', { class: 'sitno', style: 'color:var(--ink2)' }, 'Stručna procjena posljednjeg izvještaja koji je psiholog podnio i preporuka za Vašu odluku. Savjetodavna je i ne zamjenjuje Vašu procjenu. Za procjenu se šalje sadržaj izvještaja bez imena i kontakta psihologa, a bodovi se ne uzimaju u obzir.'),
      h('div', { style: 'margin:.6rem 0' }, dug), izlaz);
    dug.onclick = async () => {
      dug.disabled = true; dug.textContent = 'AI procjena je u toku…'; prazni(izlaz); izlaz.appendChild(U.ucitava('AI priprema procjenu (do nekoliko desetina sekundi)…'));
      const r = await Api.aiOcjena();
      dug.disabled = false; dug.textContent = 'Ponovo zatraži AI ocjenu'; prazni(izlaz);
      if (!r.ok) { izlaz.appendChild(h('div', { class: 'greska-okvir', role: 'alert' }, h('strong', {}, 'AI ocjena nije dostupna. '), r.poruka || 'Pokušajte ponovo.')); return; }
      try { U.SS.set(KLJ + r.izvjestaj.id, JSON.stringify(r)); } catch (e) { /* ignorisano */ }
      izlaz.appendChild(prikaz(r));
    };
    return sekcija;
  };
})(UI);
