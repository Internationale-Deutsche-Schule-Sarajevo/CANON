import copy, random

DUG = ('Mjesec je obilježio pojačan rad na prilagodbi učenika nakon početka školske godine; korištene su metode '
       'razgovora, igre uloga i kratkih vježbi opuštanja, a napredak se prati kroz dogovorene ciljeve i opservaciju. ')


def potpun(g=2026, m=9):
    p = lambda d: f'{g}-{m:02d}-{d:02d}'
    return {
        'ucenici': {'individualni_razgovori': 22, 'razliciti_ucenici': 16, 'grupni_rad': 3, 'procjene': 6, 'krizne_intervencije': 1,
                    'teme': ['Emocionalne teškoće', 'Vršnjački odnosi i nasilje'], 'sazetak': DUG,
                    'krizne_opis': DUG},
        'nastavnici': {'opservacije_planirano': 4, 'opservacije_realizirano': 4, 'razredi': 'Razredi 3, 5 i 7', 'nalazi': DUG,
                       'konsultacije': 12, 'podrska_sati': 5, 'sjednice_tima': 2, 'koordinacija': DUG},
        'roditelji': {'individualni_razgovori': 8, 'roditeljski_sastanci': 2, 'upucivanja': 1, 'biljeske': DUG},
        'radionice': {'stavke': [
            {'ciljna_grupa': 'učenici', 'naslov': 'Emocije i ja', 'datum': p(18), 'trajanje_min': 45, 'ucesnika': 22, 'status': 'održano', 'ishod': 'Učenici su naučili prepoznati emocije i vježbali disanje.', 'qp05_zapis': 'Da'},
            {'ciljna_grupa': 'roditelji', 'naslov': 'Podrška djetetu u prilagodbi', 'datum': p(25), 'trajanje_min': 60, 'ucesnika': 15, 'status': 'održano', 'ishod': 'Roditelji su dobili smjernice za dnevni ritam.', 'qp05_zapis': 'Da'}]},
        'usavrsavanje': {'stavke': [{'naslov': 'Seminar: rad s anksioznom djecom', 'vrsta': 'seminar', 'sati': 3, 'datum': p(10)}]},
        'administracija': {'povjerljivost': 'Da', 'saglasnosti': 'Da, za sve', 'dokumentacija_stanje': 'Uredno', 'mooks_sazetak': DUG,
                           'dokumentacija': 'Dosijei ažurirani.'},
        'zakljucak': {'postignuca': DUG, 'plan_sljedeci': DUG + DUG},
    }


def rizik(**kw):
    d = {'kategorija': 'Psihološki / Emocionalni', 'opis': 'Povećan broj učenika sa simptomima anksioznosti u petom razredu.',
         'ozbiljnost': 'Srednji', 'mjera': 'Radionice i individualno praćenje.', 'rok': '2026-10-20', 'status': 'Otvoreno'}
    d.update(kw); return d


def prep(**kw):
    d = {'naslov': 'Prostor za savjetovanje', 'obrazlozenje': 'Potreban stalni mirni prostor za individualni rad s učenicima.', 'utjecaj': 'Organizacijska izmjena'}
    d.update(kw); return d


SLUCAJNE_VR = [None, 0, -1, 1, 3, 5, 7, 50, 51, 200, 201, 500, 501, 1.5, '', ' ', 'x', 'abc def', 'ž' * 60, 'ž' * 160, 'ž' * 3000, True, [], {}, ['Da'], 'Da', 'Ne', 'održano', 'otkazano',
               '2026-09-15', '2026-02-30', '2026-10-01', '0050-01-01', 'Uredno', 'Nizak', 'Kritičan', 'seminar', 'učenici', 'tekst\x01x', '  Da  ', 99999999999]


def mutiraj(s, rnd):
    s = copy.deepcopy(s)
    for _ in range(rnd.randint(1, 4)):
        sek = rnd.choice([k for k in s.keys()] + ['nepostojeci'])
        o = s.get(sek)
        r = rnd.random()
        if r < .08:
            s[sek] = rnd.choice(SLUCAJNE_VR)
        elif isinstance(o, dict):
            if sek in ('radionice', 'usavrsavanje') and rnd.random() < .7:
                lst = o.get('stavke')
                if rnd.random() < .15:
                    o['stavke'] = rnd.choice(SLUCAJNE_VR)
                elif isinstance(lst, list):
                    if lst and rnd.random() < .7:
                        it = rnd.choice(lst)
                        if isinstance(it, dict) and it:
                            k = rnd.choice(list(it.keys()))
                            if rnd.random() < .3: del it[k]
                            else: it[k] = rnd.choice(SLUCAJNE_VR)
                    elif rnd.random() < .5:
                        lst.append(rnd.choice([{}, 'x', None, {'naslov': 'Nova stavka', 'status': 'održano'}]))
                    else:
                        o['stavke'] = []
            elif o:
                k = rnd.choice(list(o.keys()))
                if rnd.random() < .3: del o[k]
                else: o[k] = rnd.choice(SLUCAJNE_VR)
    return s
