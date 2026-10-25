# IDSS Psiholog — Mjesečni izvještaj

Zasebna web aplikacija (jedan HTML + Supabase) za mjesečno izvještavanje školskog psihologa direktoru. UI/UX, paleta i bodovanje (IDSS bodovi) isti kao u IDSS Pedagog (index-pogled.html); u 3D animaciji vrti se **grumen zlata**.
Isti Supabase projekat (`https://mundbastjijqnhpvdtzj.supabase.co`), ali odvojene tabele i funkcije (šema `psih`, `idss_psih_*`). IDSS Pedagog se ne dira.

Psiholog: Medina Karaga · psiholog@idss.ba

## Postavljanje (jednom)
0. Najlakše: korisnike napraviti u Authentication → Users, pa u SQL Editoru pokrenuti `supabase/PSIH_SVE_U_JEDNOM.sql` (baza + profili + neradni dani + provjera; može se ponavljati). Koraci 1–3 niže su isto to, pojedinačno.
1. SQL Editor: pokrenuti cijeli `supabase/PSIH_1_BAZA.sql`.
2. Authentication → Users → Add user: `psiholog@idss.ba` (Auto Confirm User). `direktor@idss.ba` već postoji.
3. SQL Editor: `lokalno/POSTAVI_PROFILE_PSIHOLOG.sql`, zatim `lokalno/NERADNI_DANI_PSIHOLOG.sql`.
4. Frontend: `index.html` (već sadrži URL i anon ključ). Ponovno sastavljanje iz `src/`: `python3 build.py` (opcije `--kljuc`, `--slika`).
5. AI ocjena (neobavezno, samo direktor@idss.ba): Edge Functions → nova funkcija `psih-ai-ocjena` → zalijepiti `supabase/functions/psih-ai-ocjena.ts` → Deploy; tajna `GEMINI_API_KEY`.

## Slika psihologa
Zasad je neutralni zamjenski lik. Kad stigne slika: prozirni PNG/WebP 447×520 px, pa
`python3 build.py --slika psiholog.png` (opcionalno `--oko1`/`--oko2` pupile 31×31 px na (128,152) i (212,163) za praćenje miša).

## Objava (GitHub Pages)
Aplikacija se objavljuje workflowom `.github/workflows/deploy-pedagog.yml` (isti workflow objavljuje i pedagoga): pri svakom pushu na `main` koji dira `Pedagog/webapp` ili `Psiholog/webapp`. Pedagog ostaje na korijenu stranice, a psiholog je na putanji `/Psiholog/` (`https://<organizacija>.github.io/CANON/Psiholog/`).

## Testovi
```
cd tests && ./reset.sh && python3 10_tok.py && python3 30_napad.py && python3 40_paritet.py && python3 50_ai_funkcija.py
cd ../e2e && python3 tok.py && python3 direktor.py
```

