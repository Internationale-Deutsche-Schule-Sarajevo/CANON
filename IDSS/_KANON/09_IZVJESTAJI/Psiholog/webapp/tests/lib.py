import json, os, subprocess, uuid

ENV = dict(os.environ, PGPASSWORD='pg')
DB = 'psih_test'


def psql(sql, db=DB):
    r = subprocess.run(['psql', '-X', '-At', '-q', '-h', 'localhost', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
                       input=sql, capture_output=True, text=True, env=ENV)
    return r.returncode, r.stdout.strip(), r.stderr.strip()


class J:
    def __init__(self, v): self.v = v


def lit(v):
    if isinstance(v, J):
        return "'" + json.dumps(v.v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def rpc(sub, fn, danas=None, role='authenticated', **kw):
    """Poziva public.idss_psih_* kao korisnik `sub`. Vraća (json|None, greska)."""
    args = ', '.join(f'{k} => {lit(v)}' for k, v in kw.items())
    pre = f"set role {role};"
    if sub:
        pre += f" select set_config('request.jwt.claim.sub', '{sub}', false) \\g /dev/null\n"
    if danas:
        pre += f" select set_config('psih.danas_test', '{danas}', false) \\g /dev/null\n"
    rc, out, err = psql(pre + f"\nselect public.{fn}({args});")
    if rc != 0:
        return None, err
    try:
        return json.loads(out.splitlines()[-1]), None
    except Exception:
        return None, out + err


def sql(s):
    rc, out, err = psql(s)
    return out if rc == 0 else 'ERR:' + err


class T:
    def __init__(self):
        self.ok = 0
        self.bad = []

    def check(self, cond, naziv, detalj=''):
        if cond:
            self.ok += 1
        else:
            self.bad.append(f'{naziv} {detalj}')
            print('FAIL', naziv, str(detalj)[:300])

    def kraj(self, ime):
        print(f'{ime}: {self.ok} PASS, {len(self.bad)} FAIL')
        return len(self.bad)


def potpun():
    dug = ('Mjesec je obilježio pojačan rad na prilagodbi učenika nakon početka školske godine; korištene su metode '
           'razgovora, igre uloga i kratkih vježbi opuštanja, a napredak se prati kroz dogovorene ciljeve i opservaciju. ')
    return {
        's1': {'uc_ukupno': 24, 'uc_novi': 5, 'uc_zakljuceni': 3, 'susreta_plan': 60, 'susreta': 62,
               'teme': ['UCENJE', 'EMOCIJE', 'VRSNJACI'], 'nalazi': dug},
        's2': {'procjena_br': 6, 'opservacija_br': 4, 'zrelost_br': 0, 'nalaza_br': 3, 'instrumenti_br': 3,
               'instrumenti': 'Skala anksioznosti za djecu, protokol opservacije, sociometrijski upitnik',
               'procjena_nalazi': dug, 'opservacija_nalazi': dug},
        's3': {'radionice_plan': 4, 'radionice': [
            {'naziv': 'Emocije i ja', 'ciljna': 'UCENICI', 'tema': 'EMOCIJE', 'ucesnika': 22, 'trajanje': 45, 'qp05': 'DA'},
            {'naziv': 'Granice u vršnjačkim odnosima', 'ciljna': 'UCENICI', 'tema': 'ODNOSI', 'ucesnika': 20, 'trajanje': 45, 'qp05': 'DA'},
            {'naziv': 'Podrška djetetu u prilagodbi', 'ciljna': 'RODITELJI', 'tema': 'RODITELJSTVO', 'ucesnika': 14, 'trajanje': 90, 'qp05': 'DA'},
            {'naziv': 'Rad s emocionalno osjetljivim učenicima', 'ciljna': 'NASTAVNICI', 'tema': 'NASTAVNICI', 'ucesnika': 9, 'trajanje': 60, 'qp05': 'DA'}],
               'grupni_nalazi': dug},
        's4': {'rod_razgovora': 18, 'rod_porodica': 15, 'rod_sastanci': 2, 'rod_upuceno': 2, 'rod_nalazi': dug},
        's5': {'nast_konsultacija': 22, 'nast_nastavnika': 9, 'nast_timski': 3, 'nast_nalazi': dug},
        's6': {'ink_ucenika': 7, 'ink_izradjeno': 1, 'ink_azurirano': 6, 'ink_pracenje': 5, 'ink_vanjski': 1, 'ink_nalazi': dug},
        's7': {'kriza_br': 1, 'kriza_protokol': 'DA', 'prijave_br': 1, 'prijave_rok': 'DA', 'kriza_opis': dug,
               'rizici': [{'kategorija': 'VRSNJACKI', 'ozbiljnost': 'SREDNJI', 'opis': 'Učestala verbalna konfliktnost u jednom razredu.',
                           'mjera': 'Radionice i razredni sat.', 'status': 'U_TOKU'},
                          {'kategorija': 'ORGANIZACIJSKI', 'ozbiljnost': 'NIZAK', 'opis': 'Nedostatak prostora za savjetovanje.',
                           'mjera': 'Dogovor o rasporedu kabineta.', 'status': 'OTVOREN'}]},
        's8': {'usavrsavanja': [{'naziv': 'Seminar: rad s anksioznom djecom', 'tip': 'SEMINAR', 'sati': 6, 'certifikat': 'DA'},
                                {'naziv': 'Online kurs: krizna intervencija', 'tip': 'ONLINE', 'sati': 3, 'certifikat': 'NE'}],
               'supervizija_sati': 3},
        's9': {'qp05_zavedeno': 'DA', 'povjerljivost': 'DA', 'saglasnosti': 'DA', 'evidencija': 'DA', 'adm_sati': 20},
        's10': {'zakljucak': dug, 'plan': dug + 'Plan: ' + dug,
                'preporuke': [{'tema': 'Prostor za savjetovanje', 'preporuka': 'Odrediti stalni mirni prostor za individualni rad.', 'hitnost': 'SREDNJA', 'odluka': 'DA'},
                              {'tema': 'Supervizija', 'preporuka': 'Osigurati mjesečnu superviziju tima.', 'hitnost': 'NISKA', 'odluka': 'NE'}]},
    }
