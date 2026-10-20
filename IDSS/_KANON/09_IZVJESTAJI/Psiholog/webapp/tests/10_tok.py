import json, subprocess, sys, copy, uuid, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from uzorak import potpun, rizik, prep
t = T()
subprocess.run(['bash', os.path.dirname(os.path.abspath(__file__)) + '/reset.sh'], capture_output=True)
PS, DI, P2, ST = [str(uuid.uuid4()) for _ in range(4)]
print(sql(f"""
insert into auth.users(id,email) values ('{PS}','psiholog@idss.ba'),('{DI}','direktor@idss.ba'),('{P2}','psiholog2@idss.ba'),('{ST}','stranac@x.ba');
select psih.dodaj_profil('psiholog@idss.ba','Medina Karaga','psiholog',date '2026-09-01','+38761000000');
select psih.dodaj_profil('direktor@idss.ba','Direktor Škole','direktor',date '2026-09-01',null);
select psih.dodaj_profil('psiholog2@idss.ba','Druga Psihologinja','psiholog',date '2026-09-01',null);
insert into psih.neradni_dani values ('2027-01-05','Test praznik');
"""))
D = '2026-10-18'   # nedjelja; rok za septembar je 5.10.

def R(sub, fn, danas=D, **kw):
    r, e = rpc(sub, fn, danas, **kw)
    if r is None: print('SQL-GREŠKA', fn, e[:300])
    return r or {}

# --- profil i pristup
r = R(PS, 'idss_psih_profil'); t.check(r.get('ok') and r['ime'] == 'Medina Karaga' and r['uloga'] == 'psiholog' and r['telefon'] == '+38761000000' and r['email'] == 'psiholog@idss.ba', 'profil psiholog', r)
t.check(R(DI, 'idss_psih_profil')['uloga'] == 'direktor', 'profil direktor')
t.check(R(ST, 'idss_psih_profil').get('kod') == 'NEOVLASTEN', 'stranac bez profila')
t.check(R(None, 'idss_psih_profil').get('kod') == 'NEOVLASTEN', 'bez prijave')

# --- rokovi
t.check(sql("select psih.rok_podnosenja(2026,9)") == '2026-10-05', 'rok septembar')
t.check(sql("select psih.rok_podnosenja(2026,12)") == '2027-01-06', 'rok decembar (praznik 5.1.)')
t.check(sql("select psih.rok_podnosenja(2026,11)") == '2026-12-07', 'rok novembar')
t.check(sql("select psih.dodaj_radne_dane(date '2026-10-16',3)") == '2026-10-21', 'tri radna dana')
t.check(sql("select psih.radnih_dana_izmedju(date '2026-10-05', date '2026-10-08')") == '3', 'kašnjenje 3')

# --- kreiranje
t.check(R(PS, 'idss_psih_kreiraj', p_godina=2026, p_mjesec=8).get('kod') == 'PERIOD_PRIJE_POCETKA', 'prije početka')
t.check(R(PS, 'idss_psih_kreiraj', p_godina=2026, p_mjesec=11).get('kod') == 'BUDUCI_PERIOD', 'budući period')
t.check(R(PS, 'idss_psih_kreiraj', p_godina=2026, p_mjesec=13).get('kod') == 'VALIDACIJA', 'neispravan mjesec')
t.check(R(DI, 'idss_psih_kreiraj', p_godina=2026, p_mjesec=9).get('kod') == 'ZABRANJENO', 'direktor ne kreira')
r = R(PS, 'idss_psih_kreiraj', p_godina=2026, p_mjesec=9); t.check(r.get('ok'), 'kreiraj septembar', r)
iz = r['izvjestaj']; ID = iz['id']
t.check(iz['status'] == 'nacrt' and iz['revizija'] == 1 and iz['rok_podnosenja'] == '2026-10-05' and iz['moze_urediti'] and not iz['moze_podnijeti'], 'stanje nacrta', {k: iz[k] for k in ('status', 'revizija', 'rok_podnosenja')})
t.check(iz['psiholog']['email'] == 'psiholog@idss.ba' and iz['psiholog']['telefon'] == '+38761000000', 'kontakt psihologa')
r2 = R(PS, 'idss_psih_kreiraj', p_godina=2026, p_mjesec=9); t.check(r2.get('ponovljeno') and r2['izvjestaj']['id'] == ID, 'kreiraj idempotentno')
t.check(R(PS, 'idss_psih_kreiraj', p_godina=2026, p_mjesec=10).get('kod') == 'PRETHODNI_NACRT', 'prethodni nacrt blokira')

# --- tuđi izvještaj i direktor ne vidi nacrt
t.check(R(P2, 'idss_psih_ucitaj', p_id=ID).get('kod') == 'ZABRANJENO', 'drugi psiholog ne vidi')
t.check(R(DI, 'idss_psih_ucitaj', p_id=ID).get('kod') == 'ZABRANJENO', 'direktor ne vidi nacrt')
t.check(R(PS, 'idss_psih_ucitaj', p_godina=2026, p_mjesec=9).get('ok'), 'učitaj po periodu')
t.check(R(PS, 'idss_psih_ucitaj', p_id=str(uuid.uuid4())).get('kod') == 'NE_POSTOJI', 'nepoznat id')

# --- spremanje
sad = potpun()
Z1 = str(uuid.uuid4())
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=1, p_sadrzaj=J(sad), p_rizici=J([rizik()]), p_preporuke=J([prep()]), p_zahtjev=Z1)
t.check(r.get('ok'), 'spremi', r)
iz = r['izvjestaj']
t.check(iz['revizija'] == 2 and len(iz['rizici']) == 1 and iz['rizici'][0]['kod'] == 'RSK-2026-001' and len(iz['preporuke']) == 1, 'rizik dobio kod, preporuka id')
RID = iz['rizici'][0]['id']; PID = iz['preporuke'][0]['id']
t.check(iz['preporuke'][0]['odluka'] == 'Na čekanju', 'preporuka na čekanju')
t.check(iz['moze_podnijeti'] and iz['provjera'] == [], 'može podnijeti', iz['provjera'])
t.check(iz['bodovi_pregled']['max'] == 900 and iz['bodovi_pregled']['zbroj'] > 0, 'bodovi pregled')
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=1, p_sadrzaj=J(sad), p_rizici=J([]), p_preporuke=J([]), p_zahtjev=Z1)
t.check(r.get('ponovljeno') and r['izvjestaj']['revizija'] == 2, 'idempotentan zahtjev')
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=1, p_sadrzaj=J(sad), p_rizici=J([]), p_preporuke=J([]))
t.check(r.get('kod') == 'SUKOB_VERZIJA' and r['revizija_servera'] == 2, 'sukob verzija', r)
bad = copy.deepcopy(sad); bad['ucenici']['individualni_razgovori'] = -3; bad['ucenici']['razliciti_ucenici'] = 'x'
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=2, p_sadrzaj=J(bad), p_rizici=J([]), p_preporuke=J([]))
t.check(r.get('kod') == 'VALIDACIJA' and any(g['polje'] == 'ucenici.individualni_razgovori' for g in r['greske']), 'validacija pri spremanju')
t.check(R(P2, 'idss_psih_spremi', p_id=ID, p_revizija=2, p_sadrzaj=J(sad)).get('kod') == 'ZABRANJENO', 'tuđe ne sprema')
t.check(R(DI, 'idss_psih_spremi', p_id=ID, p_revizija=2, p_sadrzaj=J(sad)).get('kod') == 'ZABRANJENO', 'direktor ne sprema')
# nepoznata polja se odbacuju
sad2 = copy.deepcopy(sad); sad2['ucenici']['ime_ucenika'] = 'Haris H.'; sad2['tajno'] = {'a': 1}
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=2, p_sadrzaj=J(sad2), p_rizici=J([rizik(id=RID)]), p_preporuke=J([prep(id=PID)]))
t.check(r.get('ok') and 'ime_ucenika' not in r['izvjestaj']['sadrzaj']['ucenici'] and 'tajno' not in r['izvjestaj']['sadrzaj'], 'nepoznata polja odbačena', r.get('poruka'))
t.check(len(r['izvjestaj']['rizici']) == 1 and r['izvjestaj']['rizici'][0]['id'] == RID, 'rizik zadržava identitet')
REV = r['izvjestaj']['revizija']

# --- nepotpun izvještaj ne može se podnijeti
inc = copy.deepcopy(sad); del inc['zakljucak']['plan_sljedeci']
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=REV, p_sadrzaj=J(inc), p_rizici=J([rizik(id=RID)]), p_preporuke=J([prep(id=PID)]))
t.check(r.get('ok') and not r['izvjestaj']['moze_podnijeti'] and r['izvjestaj']['provjera'], 'nacrt može biti nepotpun')
REV = r['izvjestaj']['revizija']
r = R(PS, 'idss_psih_podnesi', p_id=ID, p_revizija=REV); t.check(r.get('kod') == 'VALIDACIJA', 'nepotpuno se ne podnosi', r)
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=REV, p_sadrzaj=J(sad), p_rizici=J([rizik(id=RID)]), p_preporuke=J([prep(id=PID)])); REV = r['izvjestaj']['revizija']

# --- podnošenje (kasni: danas 18.10, rok 5.10. => radni dani 6..16 = 9 -> kašnjenje)
t.check(R(PS, 'idss_psih_podnesi', p_id=ID, p_revizija=REV - 1).get('kod') == 'SUKOB_VERZIJA', 'podnesi sa starom revizijom')
r = R(PS, 'idss_psih_podnesi', p_id=ID, p_revizija=REV); t.check(r.get('ok'), 'podnesi', r)
iz = r['izvjestaj']
kas = int(sql("select psih.radnih_dana_izmedju(date '2026-10-05', date '2026-10-18')"))
t.check(iz['status'] == 'podnesen' and iz['ciklus'] == 1 and iz['na_vrijeme'] is False and iz['kasnjenje_prvo'] == kas, 'podnesen sa kašnjenjem', {k: iz[k] for k in ('status', 'ciklus', 'na_vrijeme', 'kasnjenje_prvo')})
b = iz['bodovi']; st = {s['kod']: s for s in b['stavke']}
t.check(st['B1']['bodovi'] == 0 and st['B2']['bodovi'] == 50 and b['konacno'] is False and b['ukupno'] == b['zbroj'], 'B1=0 (kasnilo >=4 dana), B2=50', st['B1'])
t.check(not iz['moze_urediti'], 'podnesen nije uredljiv')
t.check(R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=iz['revizija'], p_sadrzaj=J(sad)).get('kod') == 'POGRESNO_STANJE', 'podnesen se ne sprema')

# --- direktor
d = R(DI, 'idss_psih_ucitaj', p_id=ID); t.check(d.get('ok') and d['izvjestaj']['moze_odluciti'] and not d['izvjestaj']['moze_urediti'] and not d['izvjestaj']['moje'], 'direktor vidi podnesen')
t.check(d['izvjestaj']['preporuke'][0]['odluka'] == 'Na čekanju', 'preporuka čeka odluku')
REV = d['izvjestaj']['revizija']
t.check(R(PS, 'idss_psih_odobri', p_id=ID, p_revizija=REV, p_ocjena=5).get('kod') == 'ZABRANJENO', 'psiholog ne odobrava')
t.check(R(PS, 'idss_psih_vrati', p_id=ID, p_revizija=REV, p_napomena='Dopuniti sažetak rada sa učenicima.').get('kod') == 'ZABRANJENO', 'psiholog ne vraća')
t.check(R(DI, 'idss_psih_odobri', p_id=ID, p_revizija=REV, p_ocjena=5).get('kod') == 'PREPORUKE_BEZ_ODLUKE', 'odobrenje traži odluke o preporukama')
t.check(R(DI, 'idss_psih_odluka', p_preporuka=PID, p_odluka='Odbijeno').get('kod') == 'VALIDACIJA', 'odbijanje traži komentar')
t.check(R(DI, 'idss_psih_odluka', p_preporuka=PID, p_odluka='Na čekanju').get('kod') == 'VALIDACIJA', 'ne može se vratiti na čekanje')
t.check(R(PS, 'idss_psih_odluka', p_preporuka=PID, p_odluka='Odobreno').get('kod') == 'ZABRANJENO', 'psiholog ne odlučuje')
r = R(DI, 'idss_psih_odluka', p_preporuka=PID, p_odluka='Potrebna dorada', p_komentar='Navedite okvirni trošak i rok.'); t.check(r.get('ok'), 'odluka dorada', r)
REV = r['izvjestaj']['revizija']
t.check(R(DI, 'idss_psih_odobri', p_id=ID, p_revizija=REV, p_ocjena=4).get('kod') == 'PREPORUKE_TRAZE_DORADU', 'dorada blokira odobrenje')
t.check(R(DI, 'idss_psih_vrati', p_id=ID, p_revizija=REV, p_napomena='kratko').get('kod') == 'VALIDACIJA', 'razlog prekratak')
t.check(R(DI, 'idss_psih_vrati', p_id=ID, p_revizija=REV - 1, p_napomena='Dopuniti plan i navesti trošak preporuke.').get('kod') == 'SUKOB_VERZIJA', 'vrati sa starom revizijom')
r = R(DI, 'idss_psih_vrati', p_id=ID, p_revizija=REV, p_napomena='Dopuniti plan i navesti trošak preporuke.'); t.check(r.get('ok'), 'vrati', r)
iz = r['izvjestaj']
t.check(iz['status'] == 'vracen' and iz['rok_dopune'] == '2026-10-21' and iz['direktor_napomena'].startswith('Dopuniti'), 'vraćen, rok dopune 3 radna dana', iz['rok_dopune'])

# --- psiholog dopunjuje (danas 18.10., dopuna do 21.10. -> u roku)
p = R(PS, 'idss_psih_ucitaj', p_id=ID)['izvjestaj']
t.check(p['status'] == 'vracen' and p['moze_urediti'] and p['direktor_napomena'], 'psiholog vidi vraćeno + napomenu')
t.check(p['preporuke'][0]['odluka'] == 'Potrebna dorada', 'odluka vidljiva psihologu')
pn = copy.deepcopy(p['preporuke'][0]); pn['obrazlozenje'] = 'Potreban stalni mirni prostor za individualni rad; trošak je nula jer se koristi postojeća prostorija.'; pn['utjecaj'] = 'Nema troškova'
r = R(PS, 'idss_psih_spremi', p_id=ID, p_revizija=p['revizija'], p_sadrzaj=J(p['sadrzaj']), p_rizici=J(p['rizici']), p_preporuke=J([pn]))
t.check(r.get('ok') and r['izvjestaj']['preporuke'][0]['odluka'] == 'Na čekanju', 'dopunjena preporuka se vraća na čekanje', r.get('poruka'))
r = R(PS, 'idss_psih_podnesi', p_id=ID, p_revizija=r['izvjestaj']['revizija']); t.check(r.get('ok'), 'podnesi dopunu', r)
iz = r['izvjestaj']; st = {s['kod']: s for s in iz['bodovi']['stavke']}
t.check(iz['ciklus'] == 2 and st['B2']['bodovi'] == 50 and st['E3']['bodovi'] == 20 and iz['kasnjenje_prvo'] == kas, 'ciklus 2: B2 u roku, E3=20', {k: st[k]['bodovi'] for k in ('B2', 'E3')})
t.check(sql("select count(*) from psih.izvjestaj_snimci where ciklus in (1,2)") == '2', 'dva snimka')

# --- odobrenje
d = R(DI, 'idss_psih_ucitaj', p_id=ID)['izvjestaj']; PID = d['preporuke'][0]['id']
r = R(DI, 'idss_psih_odluka', p_preporuka=PID, p_odluka='Odobreno', p_komentar='Prihvaćeno.'); t.check(r.get('ok'), 'odluka odobreno')
REV = r['izvjestaj']['revizija']
t.check(R(DI, 'idss_psih_odobri', p_id=ID, p_revizija=REV, p_ocjena=6).get('kod') == 'VALIDACIJA', 'ocjena > 5')
r = R(DI, 'idss_psih_odobri', p_id=ID, p_revizija=REV, p_ocjena=4, p_komentar='Dobar izvještaj.'); t.check(r.get('ok'), 'odobri', r)
iz = r['izvjestaj']; b = iz['bodovi']
t.check(iz['status'] == 'odobren' and b['konacno'] and b['direktor'] == 80 and b['ukupno'] == b['zbroj'] + 80 and b['max'] == 1000 and any(s['kod'] == 'D1' for s in b['stavke']), 'odobren: D1 = 80', b['ukupno'])
t.check(R(DI, 'idss_psih_odobri', p_id=ID, p_revizija=iz['revizija'], p_ocjena=5).get('kod') == 'POGRESNO_STANJE', 'ne odobrava se dvaput')
out = sql(f"update psih.izvjestaji set sadrzaj='{{}}' where id='{ID}'"); t.check('zaključan' in out, 'odobren je zaključan u bazi', out)
out = sql(f"delete from psih.izvjestaj_snimci"); t.check('nepromjenjiv' in out, 'snimci se ne brišu')
out = sql("delete from psih.revizorski_trag"); t.check('nepromjenjiv' in out, 'trag se ne briše')
out = sql(f"delete from psih.izvjestaji"); t.check('ne briše' in out, 'izvještaj se ne briše')

# --- historija
tr = R(PS, 'idss_psih_trag', p_id=ID)
ak = [x['akcija'] for x in tr['dogadjaji']]
t.check(ak[0] == 'KREIRAN_NACRT' and 'PODNESEN' in ak and 'VRACEN_NA_DOPUNU' in ak and 'PONOVO_PODNESEN' in ak and ak[-1] == 'ODOBREN' and 'ODLUKA_O_PREPORUCI' in ak, 'trag psihologa', ak)
trd = R(DI, 'idss_psih_trag', p_id=ID); t.check('SPREMLJEN_NACRT' not in [x['akcija'] for x in trd['dogadjaji']], 'direktor ne vidi spremanja')
t.check(R(P2, 'idss_psih_trag', p_id=ID).get('kod') == 'ZABRANJENO', 'tuđi trag zabranjen')
t.check(sql("select count(*) from psih.revizorski_trag where sazetak::text ilike '%Mjesec je obilježio%'") == '0', 'trag ne sadrži sadržaj izvještaja')

# --- prenošenje rizika u sljedeći mjesec (rizik ostao otvoren)
D2 = '2026-11-03'
r = R(PS, 'idss_psih_kreiraj', danas=D2, p_godina=2026, p_mjesec=10); t.check(r.get('ok'), 'kreiraj oktobar', r)
i10 = r['izvjestaj']; ID2 = i10['id']
t.check(len(i10['rizici']) == 1 and i10['rizici'][0]['prenesen'] and i10['rizici'][0]['kod'] == 'RSK-2026-001' and i10['rizici'][0]['id'] == RID, 'rizik prenesen u oktobar', i10['rizici'])
t.check(i10['kpi']['kpi03']['preneseno_3b'] == 1 and i10['kpi']['kpi03']['novi'] == 0, 'kpi prenesen')
s10 = potpun(2026, 10)
# uklanjanje prenesenog rizika nije dozvoljeno
r = R(PS, 'idss_psih_spremi', danas=D2, p_id=ID2, p_revizija=i10['revizija'], p_sadrzaj=J(s10), p_rizici=J([]), p_preporuke=J([]))
t.check(r.get('kod') == 'VALIDACIJA' and any(g['kod'] == 'PRENESENI_RIZIK_NEDOSTAJE' for g in r['greske']), 'preneseni rizik se ne briše')
# opis prenesenog rizika se ne mijenja
r = R(PS, 'idss_psih_spremi', danas=D2, p_id=ID2, p_revizija=i10['revizija'], p_sadrzaj=J(s10), p_rizici=J([rizik(id=RID, opis='Potpuno drugi opis rizika koji se ne smije promijeniti.')]), p_preporuke=J([]))
t.check(r.get('kod') == 'VALIDACIJA' and any(g['kod'] == 'NEPROMJENJIVO' for g in r['greske']), 'opis prenesenog rizika nepromjenjiv')
# tuđi/nepoznati id rizika
r = R(PS, 'idss_psih_spremi', danas=D2, p_id=ID2, p_revizija=i10['revizija'], p_sadrzaj=J(s10), p_rizici=J([rizik(id=RID), rizik(id=str(uuid.uuid4()))]), p_preporuke=J([]))
t.check(r.get('kod') == 'VALIDACIJA' and any(g['kod'] == 'NEPOZNAT' for g in r['greske']), 'nepoznat id rizika')
# zatvaranje + novi rizik
r = R(PS, 'idss_psih_spremi', danas=D2, p_id=ID2, p_revizija=i10['revizija'], p_sadrzaj=J(s10),
      p_rizici=J([rizik(id=RID, status='Riješeno', mjera='Radionice održane, stanje se smirilo.'), rizik(opis='Nedostatak prostora za savjetovanje u dopodnevnim satima.', kategorija='Organizacijski', ozbiljnost='Nizak')]),
      p_preporuke=J([]))
t.check(r.get('ok'), 'zatvori stari i dodaj novi rizik', r.get('poruka') or r.get('greske'))
iz = r['izvjestaj']; kodovi = sorted(x['kod'] for x in iz['rizici'])
t.check(kodovi == ['RSK-2026-001', 'RSK-2026-002'], 'novi rizik RSK-2026-002', kodovi)
t.check(iz['kpi']['kpi03']['rijeseno_3a'] == 1 and iz['kpi']['kpi03']['aktivno_3c'] == 1 and iz['kpi']['kpi03']['novi'] == 1, 'kpi nakon zatvaranja', iz['kpi']['kpi03'])
# zatvoren rizik se ne prenosi u novembar
r = R(PS, 'idss_psih_podnesi', danas=D2, p_id=ID2, p_revizija=iz['revizija']); t.check(r.get('ok') and r['izvjestaj']['na_vrijeme'] is True, 'oktobar podnesen na vrijeme (rok 5.11.)', r.get('poruka'))
st = {s['kod']: s for s in r['izvjestaj']['bodovi']['stavke']}; t.check(st['B1']['bodovi'] == 200 and st['E1']['bodovi'] == 30, 'B1=200; E1 = 1 od 2', (st['B1'], st['E1']))
t.check(R(PS, 'idss_psih_kreiraj', danas='2026-12-02', p_godina=2026, p_mjesec=11).get('ok'), 'novembar')
nov = R(PS, 'idss_psih_ucitaj', danas='2026-12-02', p_godina=2026, p_mjesec=11)['izvjestaj']
t.check([x['kod'] for x in nov['rizici']] == ['RSK-2026-002'], 'prenosi se samo otvoreni rizik', nov['rizici'])

# --- početne stranice
pp = R(PS, 'idss_psih_pocetna', danas='2026-12-02')
t.check(pp['ok'] and pp['uloga'] == 'psiholog' and pp['periodi'][0]['godina'] == 2026 and pp['periodi'][0]['mjesec'] == 12 and len(pp['periodi']) == 4, 'psiholog početna: periodi', [(x['mjesec'], x['status']) for x in pp['periodi']])
t.check(pp['sezona']['broj_odobrenih'] == 1 and pp['sezona']['prosjek'] == b['ukupno'] and pp['sezona']['rang'] in ('Pripravnik', 'Saradnik', 'Stručnjak', 'Majstor', 'Velemajstor') and pp['sezona']['u_obradi'] > 0, 'sezona', pp['sezona'])
t.check(len(pp['znacke']) == 5 and isinstance(pp['serija'], int), 'značke')
dp = R(DI, 'idss_psih_pocetna', danas='2026-12-02')
t.check(dp['ok'] and dp['uloga'] == 'direktor' and len(dp['cekaju']) == 1 and dp['cekaju'][0]['psiholog'] == 'Medina Karaga', 'direktor: čekaju', dp['cekaju'])
t.check(any(k['psiholog'] == 'Druga Psihologinja' for k in dp['kasne']), 'direktor: kasne (druga psihologinja nije ništa predala)', dp['kasne'][:2])
t.check(dp['rizici_po_ozbiljnosti']['Nizak'] == 1 and dp['rizici'][0]['kod'] == 'RSK-2026-002', 'direktor: otvoreni rizici', dp['rizici'])
t.check(dp['preporuke_na_cekanju'] == [], 'nema preporuka na čekanju')
ar = R(PS, 'idss_psih_arhiva'); t.check(ar['ok'] and len(ar['izvjestaji']) == 3 and ar['izvjestaji'][0]['mjesec'] == 11, 'arhiva psihologa')
ar = R(DI, 'idss_psih_arhiva'); t.check(len(ar['izvjestaji']) == 2, 'direktor u arhivi ne vidi nacrte', len(ar['izvjestaji']))
sys.exit(1 if t.kraj('10_tok') else 0)
