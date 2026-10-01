# _KANON — IMH (International Montessori House Sarajevo)

Ovo je jedinstveni izvor istine (single source of truth) za IMH.
Ovdje živi ISKLJUČIVO posljednja, provjerena verzija svakog ključnog dokumenta.
AI asistenti (Claude Projekti) crpe činjenice SAMO iz ovog foldera.

## Zlatna pravila
1. Samo aktuelno i provjereno. Stare verzije i duplikati idu u `99_ARHIVA`.
2. Jedna istina po dokumentu. Kad nova verzija zamijeni staru, stara se premješta u arhivu — ne ostaje pored nove.
3. Ništa povjerljivo. Lični dosjei djece/kadrova, kontakt-liste roditelja i lični ugovori idu u `_RESTRICTED` (van AI-baze).
4. Bez sync-smeća. `.stversions`, `.sync-conflict`, `~$` i slični privremeni fajlovi ne ulaze ovdje.

## Konvencija imenovanja
`IMH_<Kategorija>_<Naziv>_v<broj>_<GGGG-MM-DD>.ext`
Primjer: `IMH_Profil_Institucijski_v1_2026-07-28.docx`

## Šta ide u koju kategoriju
- 00_PROFIL_USTANOVE — institucijski profil, organizaciona struktura, registracija/licence, službeni kontakti
- 01_PRAVNI_OKVIR — osnivački akti i pravilnici, okvirni ugovori (šabloni)
- 02_MONTESSORI_PEDAGOGIJA — strategija razvoja 2025-2028, program rada, Montessori kurikulum, dnevni ritam i pripremljeno okruženje
- 03_KVALITET_I_STANDARDI — standardi kvaliteta, samovrednovanje, vanjske evaluacije
- 04_KADROVI_HR — opisi radnih mjesta, šabloni ugovora i odluka, HR procedure (NE lični dosjei)
- 05_DJECA_I_UPIS — instrukcija i obrasci upisa, roditeljski vodič, šabloni roditeljskih sastanaka (NE podaci djece)
- 06_FINANSIJE — cjenovnik, financijski pravilnik, šabloni faktura
- 07_PROJEKTI — projekti i inicijative
- 08_IZVJESTAJI — godišnji izvještaji
- 09_OPERATIVA — kalendar godine, Revija/publikacije, sigurnost/hitni telefoni
- 90_TEMPLATES — memorandum IMH, obrasci
- 99_ARHIVA — stare godine i zamijenjene verzije

Zadnja izmjena: 2026-07-28
