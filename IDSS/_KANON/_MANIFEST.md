# _KANON — IDSS (Internationale Deutsche Schule Sarajevo)

Ovo je jedinstveni izvor istine (single source of truth) za IDSS.
Ovdje živi ISKLJUČIVO posljednja, provjerena verzija svakog ključnog dokumenta.
AI asistenti (Claude Projekti) crpe činjenice SAMO iz ovog foldera.

## Zlatna pravila
1. Samo aktuelno i provjereno. Stare verzije i duplikati idu u `99_ARHIVA`.
2. Jedna istina po dokumentu. Kad nova verzija zamijeni staru, stara se premješta u arhivu — ne ostaje pored nove.
3. Ništa povjerljivo. Lični dosjei djece/kadrova, kontakt-liste roditelja i lični ugovori idu u `_RESTRICTED` (van AI-baze).
4. Bez sync-smeća. `.stversions`, `.sync-conflict`, `~$` i slični privremeni fajlovi ne ulaze ovdje.

## Konvencija imenovanja
`IDSS_<Kategorija>_<Naziv>_v<broj>_<GGGG-MM-DD>.ext`
Primjer: `IDSS_Profil_Institucijski_v1_2026-07-28.docx`

## Šta ide u koju kategoriju
- 00_PROFIL_USTANOVE — institucijski profil, organizaciona struktura, registracija/licence/ISO 9001, službeni kontakti
- 01_PRAVNI_OKVIR — statut, osnivački akti, pravilnici i procedure, okvirni ugovori (šabloni)
- 02_PEDAGOGIJA_KURIKULUM — nastavni plan i program, njemački Lehrplan (BW/Thüringen), predškolski program, planovi rada (godišnji/mjesečni/sedmični), rasporedi, udžbenici
- 03_QMS_ISO_9001 — procedure, zapisi i obrasci, interni auditi
- 04_KADROVI_HR — opisi radnih mjesta, šabloni ugovora i odluka, HR procedure (NE lični dosjei)
- 05_UCENICI_I_UPIS — upisni obrasci i procedura, roditeljski vodič, šabloni roditeljskih sastanaka (NE podaci djece)
- 06_FINANSIJE — cjenovnik/školarina, financijski pravilnik, šabloni faktura i obrazaca, ponude i narudžbe
- 07_PROJEKTI_GRANTOVI — dm Žar za budućnost, web aplikacije IDSS, AI inicijative
- 08_MARKETING_KOMUNIKACIJA — brend/logo/memorandum, newsletteri i objave, izbor medijske arhive
- 09_IZVJESTAJI — godišnji izvještaj direktora
- 10_OPERATIVA — kalendar školske godine, jelovnici/ishrana, događaji i izleti, osiguranje, sigurnost/hitni telefoni/oznake
- 11_IT_SISTEMI — domene/hosting/nalozi (BEZ lozinki u čistom tekstu), EMIS/SchoolMind/Schulexpert, MS365 uputstva
- 90_TEMPLATES — memorandumi (.dotx), kalendari (.xltx), ostali šabloni
- 99_ARHIVA — stare godine i zamijenjene verzije

Zadnja izmjena: 2026-07-28
