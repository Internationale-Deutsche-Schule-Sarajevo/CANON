# DECISION_LOG — IDSS Psiholog (UI/UX prema index-pogled.html)

Odluke označene **OTVORENO** traže potvrdu direktora i/ili psihologa.

| # | Odluka | Obrazloženje | Status |
|---|---|---|---|
| P-01 | Zasebna šema `psih` i funkcije `idss_psih_*` u istom Supabase projektu; dijeli se samo `auth.users`. | Tražene dvije potpuno zasebne aplikacije; greška u jednoj ne može oštetiti drugu. | Usvojeno |
| P-02 | Sadržaj izvještaja psihologa (učenici, nastavnici, roditelji, radionice, usavršavanje i supervizija, administracija, zaključak) je **prijedlog**. | U dostavljenim materijalima nema opisa posla psihologa. | **OTVORENO** |
| P-03 | Samo zbirni podaci; upozorenje uz korake; server ne može prepoznati imena u slobodnom tekstu — odgovornost autora. | Psihološka dokumentacija je osjetljiva. | Usvojeno |
| P-04 | Isti okvir bodova kao u pedagoga (900 sistem + 100 ocjena direktora, rangovi 500/650/800/900), težine stavki prilagođene psihologu (npr. opservacije 60, supervizija 40, povjerljivost i saglasnosti 20). | Isti način rada, različit sadržaj. | **OTVORENO** |
| P-05 | Neutralni bodovi kad stavka nije primjenjiva (npr. nije bilo kriznih intervencija). | Mjesec bez kriza ne smije kažnjavati. | **OTVORENO** |
| P-06 | QMS: samo QP 05 (obuke i radionice); QP 09 se za psihologa ne izvještava. | Pretpostavka da psiholog ne drži kreativne časove. | **OTVORENO** |
| P-07 | Registar rizika se prenosi među mjesecima (kao u UI-ju prema referenci); kategorija i opis nepromjenjivi nakon prvog perioda; šifra RSK-GGGG-NNN. | Usklađeno s referentnim UI/UX-om. | Usvojeno |
| P-08 | AI ocjena (Gemini besplatni nivo): šalje se sadržaj bez imena, kontakta i bodova. Besplatni nivo može koristiti podatke za unapređenje Googleovih usluga. | Za osjetljivu oblast razmotriti plaćeni nivo ili isključiti funkciju. | **OTVORENO** |
| P-09 | Grumen zlata umjesto dijamanta (proceduralni WebGL model). | Zahtjev korisnika. | Usvojeno |
| P-10 | Portret je neutralni zamjenski lik (`src/assets/portret.svg`). Prava fotografija psihologa dolazi kasnije: `python3 build.py --slika psiholog.png [--oko1 oko.png --oko2 oko.png]`. | Zahtjev korisnika. | Čeka sliku |
| P-11 | Neradni dani se kopiraju iz tabele pedagoga ako postoji; pokretljive praznike unijeti ručno. | Rokovi zavise od kalendara. | **OTVORENO** |
| P-12 | Izvještaji se ne brišu; snimci i revizorski trag su nepromjenjivi; rok čuvanja nije određen. | Treba pravilo škole o arhiviranju. | **OTVORENO** |
| P-13 | Anonimni (public) ključ je ugrađen iz referentne datoteke index-pogled.html; mijenja se opcijom `--kljuc`. | Isti Supabase projekat. | Usvojeno |

## Ograničenja testiranja
Stvarni Supabase i Gemini nisu dostupni iz razvojnog okruženja. Baza je testirana na lokalnom PostgreSQL-u 16, preglednik na stvarnoj lokalnoj bazi uz presretanje mrežnih poziva; AI funkcija uz lažni Gemini.
