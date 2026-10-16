# IDSS Pedagog — Mjesečni izvještaj

Web aplikacija u kojoj pedagog privatne osnovne škole podnosi mjesečni izvještaj direktoru, a direktor ga pregleda, vrati na dopunu ili odobri. Rad se boduje **IDSS bodovima** (blagovremenost, sadržaj, stručnost, efikasnost + ocjena direktora, najviše 1000).

- **Frontend:** jedna datoteka `index.html` (CSS, JavaScript i 3D scena su ugrađeni; bez vanjskih biblioteka, fontova i CDN-ova). Jedini vanjski resurs je logotip IDSS-a.
- **Backend:** Supabase (PostgreSQL + Auth). Sva pravila (validacija, rokovi, bodovi, ovlaštenja) izvršavaju se na serveru kroz `idss_*` funkcije.
- **Sav tekst u aplikaciji je na bosanskom jeziku (latinica).**

## Pokretanje bez servera (probni režim)
Otvorite `index.html` u pregledniku (prikaz je prilagođen mobilnim uređajima, tabletima, laptopima i velikim ekranima; animacije su uvijek uključene, a sistemska postavka „smanji kretanje“ se poštuje) → „Uđi kao pedagog“ ili „Uđi kao direktor“. Podaci su izmišljeni i ostaju samo u pregledniku.

## Postavljanje Supabase-a (jednokratno)
1. Supabase Dashboard → **SQL Editor** → zalijepite i pokrenite sadržaj `supabase/ALL_001-004.sql` (ili datoteke 001, 002, 003, 004 redom). Pokreće se kao vlasnik baze (`postgres`); skripte se mogu ponavljati.
2. **Authentication → Users → Add user**: kreirajte račune za pedagoga i direktora (e-pošta + lozinka).
3. U SQL Editoru dodijelite uloge pokretanjem `lokalno/POSTAVI_PROFILE.sql` (sadrži stvarne podatke pedagoga; ne šaljite ga u Git). Zadnji argumenti funkcije `interno.dodaj_profil(email, ime, uloga, prvi_period, telefon)` su prvi mjesec izvještavanja i telefon. Račun bez profila nema pristup.
4. Unesite neradne dane (praznici, ferije) — rokovi se računaju u radnim danima:
   ```sql
   insert into public.neradni_dani (datum, naziv) values ('2026-11-25', 'Dan državnosti BiH');
   ```
5. Otvorite `index.html` → „Postavke veze sa Supabase-om“: adresa projekta (`https://<ref>.supabase.co`) i **javni (anon/publishable) ključ** → prijava. **Nikad ne unosite `service_role` ključ.**
6. (Preporuka) U Auth postavkama isključite javnu registraciju (Sign-ups) — pristup imaju samo računi koje kreirate.

Datoteku `index.html` objavite na bilo kojem HTTPS hostingu (ili je otvarajte lokalno). Za čvrsto ugrađivanje veze definirajte prije skripte `window.IDSS_CONFIG = {url:'…', kljuc:'…'}`.

## QMS (ISO 9001:2015): QP 05 i QP 09
Za pedagoga su mjerodavne samo procedure **QP 05 Obuka** i **QP 09 Kreativni čas**. Izvještaj zato bilježi:
- za svaku održanu radionicu/obuku (za nastavnike, učenike, roditelje): da li je zavedena u zapis QP 05 (Evidencija obuke zaposlenih, QP 05.EO-02);
- kreativne časove: planirano (Plan održavanja, QP 09.PO-01), održano, te posjećeno i evidentirano na obrascu QP 09.PC-02 (uz obrazloženje odstupanja).
Direktor u pregledu vidi „X od Y radionica zavedeno u QP 05“ i broj održanih kreativnih časova. Napomena: prema QP 09 kreativne časove drže nastavnici, a pedagog ih planira, nadgleda i posjećuje.

## Proces izvještavanja
Pedagog kroz 10 koraka: rad sa učenicima, saradnja sa nastavnicima i roditeljima, radionice (za učenike, nastavnike, roditelje), stručno usavršavanje, rizici (prenose se iz mjeseca u mjesec dok nisu riješeni), preporuke direktoru, QMS i administracija, zaključak i plan, pregled i podnošenje. Nacrt se automatski sprema; podneseni izvještaj je nepromjenjiv. Rok je 5. u sljedećem mjesecu (ili prvi radni dan poslije), dopuna nakon vraćanja 3 radna dana.

## Bodovanje
Pravila su prikazana u aplikaciji („Kako se boduje“) i u `docs/DECISION_LOG.md`. Obračun radi server (`interno.bodovi`); JavaScript kopija služi samo za prikaz uživo, a paritet se provjerava testom.

## Provjere
```
bash tests/reset.sh                      # lokalna baza + SQL 001–004
bash tests/run.sh tests/10_tok.sql tests/20_rizici.sql   # 127 SQL tvrdnji
node tests/30_paritet.mjs                # JS ↔ SQL paritet (503 slučaja)
python3 build.py                         # sastavlja index.html iz src/
python3 tests/e2e/tok.py tests/e2e/slike # preglednički tok (Playwright)
```
