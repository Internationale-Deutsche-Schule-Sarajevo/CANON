# Chapter Triage Worksheet (Blok 2 — Part A)

Read-only analysis. No code changes, no database writes, no migration, no
deletion. This is a worksheet for director review — every row below is a
SUGGESTION, not a decision. Correct any row and use your corrected set to build
`REGENERATE_LIST.md` and the final exclusion list.

## Scope

Every chapter whose source document (`document_chunks`, `document_status =
'active'`, summed `length(text)`) is under 3,000 characters, UNION every
chapter listed in `corrections/TRUNCATED_CHAPTERS.md` (the 95 confirmed
truncated + the 1 separate prompt-leakage case, `398e9f6d`). Total: **179
chapters** (of 382).

Queried directly against the live database (project `wpizjmqkhbreuiaeobvz`,
`web-app-idss-handbook`) via read-only `SELECT`. No writes were made.

## Classification heuristic (so you can audit/override quickly)

- **EXCLUDE** — title/type indicates a non-text artifact per the director's
  editorial decision: logos, letterheads/memorandums, QR codes, blank forms
  (including ISO/QM "QP ..." forms, questionnaires, order forms, blacklists,
  checklists, complaint/nonconformity logs, survey forms), visitor forms,
  attendance/presence sheets, agreement/confirmation/consent templates
  (contracts, confirmation letters, "Izjava"/"Statement" declaration forms).
  I extended this in three ways not explicitly named in the brief — flagged
  here so you can veto them individually:
  - **Personal student records** (a named student's transcript/report card,
    e.g. "Zeugnis", "School Report") — not general handbook content regardless
    of format.
  - **Pure data/tabular artifacts** (price lists, grade-average exports, room/
    time schedules, calendars-as-objects) — non-narrative, nothing to "read".
  - A few **signage/reference items** (emergency phone list, org chart) with
    no real prose to generate from.
- **RE-EXTRACT** — title implies substantial real text (Pravilnik/Procedura/
  Plan/Odluka adopting a Pravilnik) but source is implausibly thin
  (roughly <1,500 chars) for that document type — regeneration cannot fix a
  failed extraction.
- **REGENERATE** — genuine text content, fabricated or truncated, with enough
  source to rebuild under the new prompt (proportional length, facts
  preserved). This is the default for everything not EXCLUDE/RE-EXTRACT: since
  every row here has `chapter_len` far exceeding `source_len` (that ratio is
  exactly why the old 3,000-char floor produced fabrication), nearly every
  remaining row is fabricated by construction, not just the ones the original
  truncation regex caught.

## Counts

| Category | Count |
|---|---|
| EXCLUDE | 62 |
| RE-EXTRACT | 8 |
| REGENERATE | 109 |
| **Total** | **179** |

---

## EXCLUDE (62) — sorted by source_len ascending

| Chapter ID | Title | source_len | chapter_len | Why |
|---|---|---|---|---|
| `3a1f238a-88eb-406b-bce5-b36274b177d8` | IDSS ORGANISATIONAL STRUCTURE | 351 | 7147 | org chart (diagram) |
| `26264065-bb90-45e2-9a56-b249fc2fb744` | IDSS Distribucioni Spisak Dokumenata Realizovano | 443 | 7236 | document distribution list/log |
| `d8c9b715-985b-4574-9a46-9e6ab2284004` | IDSS U G O V O R | 497 | 6362 | contract/agreement template |
| `2616e783-28c9-433e-aa2b-a6cc69e49dd9` | Prisustvo | 511 | 5979 | attendance sheet |
| `f67de21c-13b9-4e70-bc84-deeef99df1d1` | IDSS A G R E E M E N T | 517 | 9380 | agreement template |
| `ce15c420-04f1-41b5-91e4-69f1090e04cc` | qrcode docs.google.com | 546 | 8971 | QR code |
| `d4ace5dc-edf0-4837-8f6b-119b163eaa03` | IDSS Logo RGB Primarna verzija | 551 | 6823 | logo |
| `3fb3c445-5147-478c-90a1-5a30900ffcec` | IDSS Logo RGB Sekundarna verzija | 561 | 7879 | logo |
| `7b2f4be6-c44d-47b2-9efb-7af8f956bd41` | IDSS Logo RGB Primarna verzija WHITEOUT | 583 | 11975 | logo |
| `8053ac77-907a-4d73-9a54-eece1e40157d` | RASPORED UCIONICE 2025 2026 | 586 | 9989 | room schedule table |
| `f43a4547-546c-4f3d-90af-40c2e8418057` | IDSS Logo RGB Primarna verzija MONOCHROME | 595 | 9625 | logo |
| `4ccd31a8-3b66-41d0-9635-6caacd5e89d6` | IDSS Logo RGB Sekundarna verzija WHITEOUT | 597 | 11118 | logo |
| `3f81cd0d-1dae-4bf1-8ecb-4d7efdaa581d` | IDSS Logo RGB Sekundarna verzija MONOCHROME | 605 | 6835 | logo |
| `5dbac41d-cff3-4cfe-8f63-e603329790ac` | Oznaka Hitni Telefoni | 651 | 9907 | signage — emergency phone list |
| `a2aa46fe-7e51-4e25-b23c-b8d1b093174c` | Termini za časove klavira | 679 | 8486 | schedule/timetable |
| `180c0fd5-809b-41e9-b400-37364a4d2df4` | Zahvalnica Dankerskunde Vanjski | 699 | 7978 | certificate of appreciation |
| `f147fa06-19cc-4308-b7ac-5a7ef29a5723` | QP 04 PZ 04 Pregled Zapisa | 980 | 6473 | QM form (records review) |
| `0eb061f0-c3c6-414a-9490-6ea0f95fbb7b` | QP 06 CL 04 Crna Lista Isporucilaca | 997 | 5697 | QM form (supplier blacklist) |
| `f6825053-c72f-4fb2-bd90-3b01596a3f8f` | Notice To The Parent Student Behavior | 1121 | 7591 | per-student notice template |
| `1a23bd26-9cb9-4371-99f8-b2f843faf270` | IDSS Mjere Poboljsanja | 1133 | 6995 | per-student template |
| `4570b2ae-691c-4b4d-9035-8c1b8835f99a` | Obavijest Roditelju Staratelju O Ponasanju Ucenika | 1210 | 8279 | per-student notice template |
| `f6d99bac-7f40-44d2-867a-2f8e96358605` | Measures For Improvement | 1210 | 6219 | per-student template |
| `00f08b7d-cb6a-48e2-9549-828e9623132f` | Mjere Poboljsanja | 1223 | 7185 | per-student template |
| `d877f4eb-0ef9-4243-8b9e-c8c21f962d67` | Priznanje Anerkennung Unutrasnji | 1303 | 6428 | certificate/recognition template |
| `1c88bbca-9ad1-4b55-b0a5-d7916936c4c6` | MEMORANDUM IDSS ZA INTERNA AKTA | 1355 | 5757 | memorandum/letterhead |
| `b343c0f3-f8c3-4334-8e07-e81b8d972eac` | Evicencija Cistose I Urednosti Ucionica | 1362 | 7889 | cleaning log/checklist |
| `406355ba-6d43-406c-b806-791540383a3e` | Statement Abscence Of Student | 1447 | 9427 | declaration/consent form |
| `69e4bdc3-14ce-4ede-958d-fb75989e41aa` | QP 07 AL 02 A Anketni List Ocjena Dogadjaja | 1525 | 8293 | QM form (event survey) |
| `9373d28a-66fd-4712-9513-9b9eef11499b` | Statement Of Independent Departure Of Student | 1534 | 8950 | declaration/consent form |
| `af5f3970-c97f-4c1a-a296-302f053ab407` | Izjava O Samostalnom Odlasku Ucenika | 1607 | 7335 | declaration/consent form |
| `110b3038-241c-4af7-adc2-852cf34949fc` | Izjava O Odsustvu Ucenika | 1614 | 9613 | declaration/consent form |
| `66fad2d3-d572-4507-9a12-279398383921` | IDSS STATEMENT STUDENT ABSCENT 07112022 | 1615 | 7311 | declaration/consent form |
| `f52da4c7-691b-4030-a6e5-9025d0a41944` | Biblioteka Termini Evidencija 17102025 | 1640 | 6499 | schedule/log |
| `17ce3afe-4d72-4997-b983-74f9987c7899` | IDSS Cjenovnik Skolovanja 2026 2027 | 1664 | 7238 | price list table |
| `62cd71b7-eeb4-471c-9c6f-7a27ed55a999` | Kalendar Takmičenja Za Skolsku 2025 2026 godinu | 1701 | 7681 | calendar/schedule table |
| `61463c6c-fdcd-4cef-9029-83147cebb5ca` | IDSS Confirmation Letter Eda Pirildar BIH 11112024 | 1760 | 6675 | personal confirmation letter |
| `604f69ec-b0b4-4937-90b3-dc430a6509b1` | QP 04 01 Evidencija Korektivnih I Preventivnih Mjera | 1774 | 7017 | QM form/log |
| `5c3bc703-011a-4d58-a6c6-2b46887a6b7f` | IDSS Confirmation Letter Eda Pirildar ENG 11112024 | 1856 | 11018 | personal confirmation letter |
| `1de446cc-89c5-4b17-a828-76e7f0f095f4` | IDSS Confirmation Elisa Legrix BA 25032026 | 1860 | 9760 | personal confirmation letter |
| `ce1a42db-5085-4cab-9f43-02f8f293bcbd` | Formular Za Posjetioca Visitor Form | 1861 | 9707 | visitor form |
| `2bc633f1-ef4e-42ee-b862-8cb3fb42d509` | IDSS School Fees 2026 2027 | 1863 | 9267 | price list table |
| `5d2d7a6b-2607-43ae-9639-48b4a117e44e` | IDSS BESÄTIGUNG 2026 2027 | 1948 | 8843 | confirmation letter template |
| `40b85ef2-2a50-4a2d-9789-ecf2c3a682fc` | IDSS Schulgebühren 2026 2027 | 1968 | 8764 | price list table |
| `ec1cd48b-2ad2-405f-8860-4371c336dde1` | IDSS Confirmation Letter Eda Pirildar DEU 11112024 | 2002 | 9407 | personal confirmation letter |
| `3b83f239-c67c-4b19-9936-f0eff81bdab7` | QP 04 I 02 Izvještaj O Neusaglašenosti | 2057 | 8340 | QM form (nonconformity report) |
| `aa2aa955-d9cc-490d-a33e-59e3b05ae9b0` | QP 03 SE 03 Spisak Eksternih Dokumenta | 2146 | 7564 | QM form/list |
| `bfc92d96-e61e-409c-be19-d9eadbf3426c` | IDSS Confirmation Elisa Legrix EN 25032026 | 2198 | 7653 | personal confirmation letter |
| `c8a11248-bd7f-4b8d-9ab3-3e486a7b5e1d` | A Rješenje testa B1 | 2242 | 9671 | exam answer key |
| `cc663fc1-d77c-4f03-bbad-0e6732ba5c37` | IDSS Confirmation Adela Skrijelj EN 21052026 | 2244 | 10348 | personal confirmation letter |
| `2c8fa888-32bf-4c58-bf5b-b8b14f9ef180` | IDSS Confirmation Omar Skrijelj EN 21052026 | 2244 | 8503 | personal confirmation letter |
| `928fd9ee-7dcb-45e2-b854-a7315314e34a` | C Rješenje testa B3 | 2266 | 7223 | exam answer key |
| `a8d95e67-4361-416b-b1aa-c2fa6c3d6d45` | D Rješenje testa B4 | 2491 | 10471 | exam answer key |
| `f1dc7ae1-2e14-4fab-bc2d-6fdd0cb9aa3b` | QP 06 ZR 06 Zapisnik O Reklamaciji | 2890 | 10220 | QM form (complaint record) |
| `064630fe-94a8-47fa-a3b9-2815fc38ac06` | IDSS School Calendar 2026 2027 | 4303 | 4402 | calendar table |
| `dbd35c91-8f00-4107-b5ed-8c85ce18c924` | MASTER CHECK LISTA DOKUMENATA – IDSS | 4671 | 1166 | checklist template |
| `a34732c8-9148-4492-a62b-70a5f472e42c` | School Report Le Rutte Maks Carel | 8531 | 7898 | personal student transcript |
| `b455994d-b357-4c45-bda2-5fba81eef7d6` | QP 06 NA 05 Narudzbenica | 9861 | 4253 | QM form (purchase order) |
| `c859041b-56cc-43f2-8c7a-e001c9b245ca` | QP 06 UI 03 Upitnik Za Isporucioca | 43726 | 8053 | QM form (supplier questionnaire) |
| `e32ac219-a86a-46ac-a32b-58f0b8e188ac` | Zeugnis Katica Eva Sarkozy 20022026 | 14443 | 1344 | personal student transcript |
| `4ca29e85-6811-4a70-8186-f7b59fd2f359` | ProsjecneOcjenePoPredmetimaRazredima (1) | 57571 | 6486 | grade-average data export |
| `63e4fcb4-0d57-4847-be13-a4eda5a8ecc8` | OS18A Pedagoski karton | 68749 | 5535 | pedagogical file template |
| `f2cb3f45-a11f-4a15-ac9e-55a32455db92` | IDSS Evidencija Prisustva | 114023 | 9433 | attendance sheet |

---

## RE-EXTRACT (8) — sorted by source_len ascending

| Chapter ID | Title | source_len | chapter_len | Why |
|---|---|---|---|---|
| `ac3876a4-667f-4fde-88a9-50a178df2157` | uglovi slaganja | 349 | 8338 | title suggests real (worksheet/lesson) content; 349 chars is implausible for any of it — likely image-only or parser missed a table |
| `de22f60c-53d7-49e6-b335-9774ba5c09f2` | Agenda | 495 | 6450 | generic title, too thin to judge — probably a table/agenda the parser flattened |
| `36bc0bec-45f9-4a08-b176-23d3c3d2031e` | Rjesenje Maturalna Komisija | 546 | 9639 | a commission resolution is normally multi-paragraph; 546 chars implies missed content |
| `317b0435-fde3-4dd2-950d-c62cf1d453d2` | AGENDA 2 | 841 | 6998 | same as Agenda above |
| `c6d691b2-9ca6-444d-801d-15064c0c9043` | Odluka o usvajanju Pravilnika o stipendiranju august 24. (3) | 940 | 6004 | a decision *adopting* a full Pravilnik should carry more than 940 chars of source |
| `f8b42cac-d3ad-4953-8842-d8a303d5e9d8` | QP 05 PO 01 Plan Obuke | 1225 | 6810 | a training Plan under 1,500 chars — likely a table the parser missed |
| `c92e77e1-3c4a-4062-b46e-9a1ae5f36897` | Procedura U Slucaju Povrede Podataka | 1460 | 8847 | a data-breach Procedura under 1,500 chars |
| `7885a1f2-6ce6-4dc6-ae59-3f98eea1fa10` | Interna Politika Cuvanja I Brisanja Podataka | 1471 | 9176 | a retention/deletion Politika under 1,500 chars |

---

## REGENERATE (109) — sorted by source_len ascending

`T` = was in the 95-truncated / prompt-leakage list (`TRUNCATED_CHAPTERS.md`);
blank = newly identified here as fabricated from a tiny source (not previously
flagged, since the old pass only checked for mid-sentence cutoff, not
fabrication).

| Chapter ID | Title | source_len | chapter_len | T |
|---|---|---|---|---|
| `bbbc0750-4cec-4d2c-9283-337cb1f57840` | Pravila Ucionice I IV Razred | 550 | 5826 | T |
| `398e9f6d-0637-4552-9953-7dfde6614040` | Pravila učionice V IX Razred | 550 | 1301 | T (prompt-leakage) |
| `2b48a2e3-17e9-448e-8de4-fe9d5888c3ea` | IDSS Obavijest Skolska Vrata | 587 | 5514 | |
| `0433e841-3209-48dd-81e2-221cc6933e9d` | IDSS INFORMACIJA ULAZNA KAPIJA | 625 | 4886 | |
| `070db35f-2989-45ac-b74e-387b2c562c97` | Zapisnik S Individualnog Roditeljskog Sastanka 2025 2026 | 784 | 8531 | |
| `a532a903-31a7-46bd-9581-e64ab7929d84` | IDSS ZAPISNIK INDIVIDUALNI RODITELJSKI SASTANAK 07112022 | 873 | 8401 | |
| `c1923e6b-f54e-4977-bd80-91e44c171a37` | Zapisnik S Individualnog Roditeljskog Sastanka 2024 2025 | 902 | 6553 | |
| `47ced8c4-f075-4cdf-9a00-691df3ba8bf4` | Pismena Priprema Za Realizaciju Nastavnog Casa 2025 2026 | 1097 | 8300 | |
| `ee5576fe-e439-4e87-94ce-49344012a312` | IDSS Summer School 2026 Budzet | 1579 | 8315 | |
| `2c991928-e1b8-4f4c-844b-6334a8c76a6c` | Dokumentacija Za Nove Kolege | 1613 | 5953 | |
| `bd1105b5-f575-4f43-936a-89c44ca927e3` | 1. Odluka stipendija Kan Kereš III 24062025 | 1759 | 6007 | |
| `17a14949-b7a4-4087-98fb-d3dddb5a5835` | Dramska izvještaj maj | 1800 | 6833 | |
| `ecd96377-41cc-4fde-bf83-d5cdcf21159a` | IDSS POZIV RAZREDNIKU PEDAGOGU 08022021 | 1886 | 9623 | |
| `43d4e96b-9258-4d93-a4c2-6bcb5b27a319` | MSTeams Prvi Ulazak 03102025 | 1907 | 5945 | |
| `26626e86-c177-4b4f-8b96-79de156ef455` | 20 RESPIRATORNI SINCICIJSKI VIRUS | 1965 | 7121 | |
| `3a0547c3-ef9e-4f34-aa68-0fb41961b6a9` | Rjesenje O Imenovanju Komisije Za Procjenu Znanja Ucenika IV razred | 1969 | 6708 | |
| `4d290209-89b1-4631-afaa-a65641de7622` | IDSS POZIV NASTAVNIKU PEDAGOGU ONLINE 08022021 | 2037 | 9722 | |
| `d1f03d5b-8b5a-45fd-935b-c4fa81d46812` | Dramska izvještaj mart 2026 | 2105 | 8541 | |
| `e3822a88-1b5c-492b-aec6-0f938f875181` | Pravilnik O Radu Sluzbenika Za Zastitu Podataka | 2145 | 9974 | |
| `70eec7cb-1e85-411f-a653-ff1169ddf0bf` | Politika Privatnosti | 2148 | 9102 | |
| `a9ebedab-f2bd-4e1c-a12f-9165dc3fefa3` | Zapisnik Sa Sjednice Odjeljenskog Vijeca 07032023 | 2185 | 7333 | |
| `b7e9c7cc-6e73-488b-9bc1-e04716ec5a61` | Zapisnik Sa Sjednice Odjeljenskog Vijeca 2024 2025 | 2192 | 10007 | |
| `ce88485a-9dc9-4b71-b0c6-54816a8b82c8` | Dramska izvještaj april 2026 | 2218 | 5371 | |
| `ff612ee4-5465-47e7-b50f-127fa9c2d4f0` | Odluka O Naknadi Stete Od Strane Radnika 23102023 (2) | 2321 | 7332 | |
| `3dbcc2af-d96e-4343-a4c2-16d9f1b035d7` | Instrukcije za pisane provjere znanja u IDSS (7) | 2451 | 8454 | |
| `25a35f4d-bcf9-443d-b825-5d4fc09e5c86` | Odluka O Imenovanju Sluzbenika Za Zasitu Licnih Podataka | 2553 | 9677 | |
| `19394510-0a8c-4a30-9b64-fd5ae638e194` | Rješenje o izmjeni podataka sudski registar IDSS direktor Davor Mulalić | 2575 | 8283 | |
| `6bc59df8-492f-4540-bfa3-54ab7c9d8208` | Aktuelni Izvod IDSS 2021 | 2811 | 5837 | |
| `09ca31ea-f85e-43e4-9de4-92350b407bf5` | 19 CRIJEVNE ZARAZNE BOLESTI | 2847 | 6809 | |
| `03a6c6de-8440-4611-b74e-6b5bb975929d` | STRUČNO ZVANJE MENTOR | 2938 | 7565 | |
| `52f72de5-dfe8-49a6-b97f-bde7a4b30cf6` | Hours Of Consultations 2025 2026 | 4170 | 6613 | T |
| `d8aeaa06-9cc7-4370-bbce-db2b25753870` | IDSS Procedura Za Narudzbu Udzbenika 11032025 (1) | 5743 | 1976 | T |
| `58330d42-1bf3-43c2-98ab-866de24f4b53` | Odluka O Pocetku I Zavrsetku Nastavne Godine 2023 2024 (2) | 5775 | 7126 | T |
| `8f9d1ad7-4802-4bb9-865d-0c2ba8af30ae` | IDSS Pravilnik O Prijemu Poklona 10032025 (1) | 6583 | 9988 | T |
| `610becaf-dec6-453c-9ceb-6a691b978bc4` | IDSS Pravilnik O Radu Stručne Službe 23102024 (3) | 7072 | 7630 | T |
| `cc793074-3e17-4c09-a148-9b64c7c12002` | IDSS Uputstvo O Radu U Kriznim Situacijama 23102024 (3) | 7529 | 10157 | T |
| `6be7d58a-c356-45e6-a0ff-2fdfbb48828b` | 1a POZAR I RIZIK OD POZARA PREPORUKE | 7656 | 9566 | T |
| `0a106b7f-0681-4378-85c2-0b81d2a85715` | IDSS Plan Integriteta 23102024 (3) | 8099 | 10293 | T |
| `8d3255b0-f72f-4a41-8070-0dc517ed1a0b` | IDSS Uputstvo O Saradnji S Roditeljima 23102024 (3) | 8298 | 9177 | T |
| `c2db24e5-813e-4206-93be-66e43315befa` | 13 KALIJ JODID RADIO AKTIVNOST | 8333 | 9068 | T |
| `a66daf26-6dab-4be4-a9bb-c461cbb99252` | 40 satna Sedmica | 8542 | 8211 | T |
| `5f7a6a5f-a1aa-48aa-8742-689911eab0c9` | IDSS Ulazna anketa (Responses) | 8608 | 6543 | T |
| `fc301eb5-6e39-48e9-a481-12859d254362` | 18 MEDJUNARODNI MJESEC BORBE PROTIV RAKA DOJKE | 8652 | 7386 | T |
| `8e7e5ac1-a646-4842-9a67-883d14a21b92` | IDSS Pravilnik O Zaštiti Na Radu 23102024 (3) | 9012 | 3295 | T |
| `a388fbe2-735c-4a04-aef0-3fd715dd2403` | IDSS Pravilnik O Zaštiti Od Pozara 23102024 (3) | 9016 | 7577 | T |
| `730a563b-43a0-4446-aee1-6bf8e10bdbbc` | 14 KRPELJI I BOLESTI KOJE NAJCESCE PRENOSE | 9089 | 8079 | T |
| `97e708f6-ef30-4df0-9f53-ef7e09864f03` | 1. IDSS Summer School 2026 Decision On Implementation | 9164 | 7666 | T |
| `3a40af26-0056-42ab-a41b-3c3404c5e98e` | Plan Sprovođenja Mjera LEPTOSPIROZA 23052025 | 9323 | 5188 | T |
| `6191b56a-889d-4054-89c4-cd19fa1b0cb6` | IDSS Pravilnik O Stručnom Usavršavanju Nastavnika I Stručnih Saradnika 23102024 (3) | 9541 | 7577 | T |
| `31a5d9b0-a1fc-4e44-9667-664b8a7d4f75` | 3a STREPTOKOKNA OBOLJENJA PREPORUKE ZA POSTUPANJE | 10750 | 3723 | T |
| `1d2c5c03-3f1f-485a-8774-3e73969aca25` | IDSS Pravilnik O Zaštiti Okoliša I Upravljanju Otpadom 23102024 (3) | 12014 | 8310 | T |
| `df887b3d-e6f7-409c-b6d0-4f0f93e39a68` | IDSS Pravilnik O Organizaciji Školskih Takmičenja 13032025 (7) | 12350 | 6437 | T |
| `756dc82b-aaf6-4e85-bd40-13c34d769f4b` | Pravilnik o nostrifikaciji i ekvivalenciji inostranih svjedodžbi obrazovnih isprava | 12772 | 5811 | T |
| `a484fba2-cf17-404f-9c68-98240f49b7b1` | Eksterna Matura Izvjestaj BHS Njemacki 17062026 | 13210 | 4544 | T |
| `72ee1699-ce08-46fa-bdba-47fefac27d4e` | Pravilnik o sadržaju i načinu provođenja nadzora nad zakonitošću rada i stručnom nadzoru | 13438 | 10728 | T |
| `fdf2777c-cceb-4296-a1e7-c315239249a8` | 5 KARCINOM | 13576 | 5500 | T |
| `fc42b327-5a35-40c1-97d4-aa3e7b760b96` | IDSS Pravilnik O Organizaciji I Realizaciji Izleta Studijskih Posjeta I Ekskurzija FINALNO (1) | 14757 | 7191 | T |
| `ed088462-19f3-4f16-b876-e83982ad7ef7` | Odluka O Usvajanju Sedmicnog Opterecenja Nastavnika SG 2025 2026 | 14861 | 2217 | T |
| `6a120f43-3b88-48ca-81fb-21eb0791d1be` | QP 07 PROCEDURA PREISPITIVANJE UGOVORA | 14907 | 7836 | T |
| `eed8d21e-4659-47ca-b5de-4dd716c62ff4` | PLAN I PROGRAM dramska i recitatorska sekcija 09022026 | 14939 | 10884 | T |
| `e6c4ac40-3014-41a6-8d8a-39dd72eb3e80` | Procedura Dojava Bombe 25092024 (1) | 15555 | 6364 | T |
| `948d050f-4399-4a8c-b988-8c06eb80786d` | IDSS Pravilnik O Formiranju Cijena 2026 2027 | 17153 | 1134 | T |
| `b137a335-de3a-4301-9de1-26c8448a179e` | Protokol O Kriznim Situacijama 26022024 | 18053 | 7536 | T |
| `dd7f8abd-8e80-4ac2-955d-e32e250a7132` | UspjehUUcenju (1) | 18742 | 7080 | T |
| `e53d3ad4-0639-41b3-9bee-2f8dc38163c6` | IDSS Pravilnik O Formiranju Cijena 20022024 (3) | 19063 | 14025 | T |
| `69ef88fc-73fb-4553-82c1-a805351d00c5` | Plan Podrske Nastavnicima Maja Ljubovic 2025 2026 | 19585 | 7616 | T |
| `0fdfe6ec-8062-480f-aaa4-9a6dfad85a55` | IDSS Pravilnik O Formiranju Cijena 2026 2027 2 | 19678 | 2065 | T |
| `9d8118d7-165e-4125-822d-cbdd008b54ea` | Odluka Skolski Kalendar IDSS 2026 2027 | 20381 | 14834 | T |
| `1ab32db7-c39f-4231-88f1-22f0534a057a` | Poslovnik o radu strucnih organa | 20968 | 2438 | T |
| `d94e74eb-c73e-48b0-adbf-61dd361ecb1b` | Protokol O Kriznim Situacijama 26022024 (3) | 21092 | 12601 | T |
| `ce8d874a-5b0a-4185-96d4-d2b5abff2bba` | QP 03 PROCEDURA UPRAVLJANJE DOKUMENTOVANIM INFORMACIJAMA | 22200 | 4404 | T |
| `ff95eb50-22e1-41b8-97fe-6fcf3e7cb862` | Pravilnik o ishrani učenika u osnovnim i srednjim školama KS | 23139 | 1138 | T |
| `76c32205-f84d-4e75-8201-911c435664f5` | Pravilnik o primjeni informacionog sistema EMIS u osnovnim i srednjim školama u KS | 25604 | 4163 | T |
| `25ac7dc3-d59c-46ad-bf7c-80d593b07054` | Pravilnik o izricanju odgojno disciplinskih mjera u osnovnim i srednjim školama | 26243 | 9485 | T |
| `933cb3b7-a06d-4272-927b-9cbd9ee9e8e1` | Pravilnik o internoj evaluaciji znanja učenika osnovnih i srednjih škola i eksternoj procjeni znanja učenika osnovnih škola KS | 26824 | 1178 | T |
| `9e17eeda-d4b0-426b-a622-1183d5006378` | Takmicenja 2025 2026 IDEJE | 31733 | 1113 | T |
| `e258abe8-9e3b-493d-bedd-7193285753c0` | 4 SPOLNO PRENOSIVE INFEKCIJE ZASTITA SPOLNOG I REPRODUKTIVNOG ZDRAVLJA | 33940 | 14369 | T |
| `f45f33e7-4175-4e2d-98c3-5483860ec0b7` | Pravilnik o prepoznavanju, prevenciji i zaštiti od diskriminacije u osnovnim i srednjim školama | 36581 | 16240 | T |
| `e0c4a593-d6c0-4517-84c7-c3ab1e61b108` | Pravilnik o praćenju, vrednovanju i ocjenjivanju učenika osnovnih i srednjih škola u KS | 37414 | 6050 | T |
| `7be76cd5-98cd-4d84-bf87-c4a170aaea5d` | Pravilnik O Kucnom Redu 27112024 (7) | 38931 | 1075 | T |
| `c1938f43-e430-43e5-b232-3864dfad6d7e` | Pravilnik o kucnom redu v2 | 39678 | 1052 | T |
| `3d006462-fa3d-406b-bd6d-73e681405d3f` | IDSS Pravilnik O Kućnom Redu BHS 21102024 (1) | 39748 | 17233 | T |
| `9f6b087a-9b5e-472a-ad2b-1abf4ee68378` | Annual Plan And Program Of Work IDSS Preschool 2025 2026 | 41413 | 8306 | T |
| `2d7cecff-881a-4a40-b50c-672a7966f825` | IDSS Safeguariing Policy BHS Final (1) | 41475 | 14913 | T |
| `f5253fd3-493a-41e5-9ee2-02819c29bf29` | 1. IDSS Pravilnik O Organizaciji Ekskurzija 09032026 | 44494 | 14345 | T |
| `6f86228e-8b00-447b-86d6-674dd9db9983` | Pravilnik o vodenju evidencije o neprihvatljivim oblicima ponašanja iili drugim faktorima koji mogu ugroziti najbolji interes ucenika i zaštiti ucenika | 49001 | 4739 | T |
| `de3b36c1-9145-4cef-a13e-0333d602ea0d` | ZAKON O UDŽBENICIMA U KS | 50469 | 1162 | T |
| `2df94396-7f33-4551-a5fd-e29f21e0efe0` | Plan Interventnih Mjera Zagadjenost Zraka | 67866 | 8201 | T |
| `a6a340c6-fbb2-4441-9dba-890547685e1a` | Uputstvo Za Provodjenje Eksterne Mature 2026 | 69063 | 9210 | T |
| `3e622cdc-a8cd-4e99-80da-3774ff5cf5f3` | ZAKON O PREVENCIJI I SUZBIJANJU KORUPCIJE U KS | 69193 | 1092 | T |
| `8a22cb4f-95f0-4ece-b7df-dffd14d84620` | Pravilnik o inkluzivnom obrazovanju | 71128 | 1336 | T |
| `7f24df7b-6791-4697-81b0-264bd7e45d3a` | Pravila Skole | 76134 | 1141 | T |
| `d83f0f44-9767-4c64-8de2-a7b09f84286c` | IDSS Vodic Za MS Teams Za Nastavnike | 80717 | 1211 | T |
| `83744f1a-b8bd-4cdc-a3f5-abcd54aa09b8` | Opcinski nivo Uputstvo o organizaciji i provodenju takmicenja 2025 2026 | 100729 | 4245 | T |
| `c16c8bfa-b799-46b4-9a28-d1de22f0121b` | IDSS Parents Guide 2026 2027 | 108648 | 1104 | T |
| `cbd20e73-4ea8-4f3a-a816-ee8131e3c479` | Elaborat Medjunarodna Njemacka Skola Sarajevo | 112235 | 2885 | T |
| `8143c211-19b7-4770-ba9f-a4ed64f0a98d` | Zapisnik Sa II Grupnog Roditeljskog Sastanka Razrednik 2025 2026 I BIH | 112634 | 6870 | T |
| `b20982c8-3af4-4ea5-9f21-691ecd25e386` | Pravilnik o provođenju mjera odgojno obrazovne podrške i stručnog tretmana učenika | 115325 | 28118 | T |
| `88a9f7db-090a-4af0-8da1-4b8e50219930` | Pravilnik o vođenju pedagoške dokumentacije i evidencije u osnovnoj školi u KS | 129712 | 1212 | T |
| `376ee255-ce36-441f-9123-713965414065` | Prirucnik Za Nastavnike IDSS 26052025 | 139002 | 1124 | T |
| `bf06bb2e-e9da-4d55-8783-aa4d036fa627` | Pravilnik o radu IDSS | 156305 | 1108 | T |
| `0c8d9f33-940a-4980-8e91-3d0cdf15fcaf` | Pravilnik o realizaciji škole u prirodi, izleta, studijskih posjeta, ekskurzija, kampovanja logorovanja, društveno korisnog učenja i drugih oblika odgojn | 176529 | 3699 | T |
| `9350131e-5ae2-41a1-8b27-1418a79021f4` | Project Green School Green Kindergarten Sep25 Jun26 | 182619 | 1142 | T |
| `7468c03b-d75f-4a7f-8fca-48507e907933` | ZAKON O ZAŠTITI LICNIH PODATAKA BiH | 212437 | 1139 | T |
| `10f0c8c2-a649-45fd-8a7d-42fec5ca038b` | Zakon o odgoju i obrazovanju u osnovnoj i srednjoj školi u KS | 216096 | 1112 | T |
| `53d6b7d9-cdaf-4fa6-959d-79bacc8ab472` | Zapisnik Sa Sjednice Skolskog Odbora 2024 2025 | 237367 | 5233 | T |
| `e3b150c2-7923-47d4-92b0-c1627e57efc0` | medjunarodna takmicenja izvjestaj 2026 2 | 249815 | 10334 | T |
| `1497b1ce-2ff4-481f-a0a3-dc823bfc6729` | Kantonalni nivo Uputstvo o organizaciji takmičenja 2025 2026 | 292036 | 3402 | T |
| `6d596247-a81d-42d3-89aa-ff70e2306927` | Pedagoški standardi i normativi za odgoj i obrazovanje u osnovnoj i srednjoj školi | 774695 | 27357 | T — **known exception**: will still truncate at 65,536 maxTokens, out of scope, expect a logged failure |

---

## Notes for director review

- 62 EXCLUDE suggestions extend beyond the director's named categories in
  three places (personal student records, pure data/tabular artifacts, a
  couple of signage items) — see heuristic section above. Veto freely; these
  are the rows most worth double-checking.
- The 8 RE-EXTRACT chapters cannot be fixed by regeneration at all — they need
  the source document re-imported/re-parsed (likely image-only PDF or a
  table/DOCX structure the chunker missed) before any chapter content is
  trustworthy.
- The 109 REGENERATE chapters are the direct input for `REGENERATE_LIST.md`
  once you finalize this list — the script (Part C) processes smallest source
  first.
- `6d596247` (Pedagoški standardi i normativi, ~776K source) is expected to
  fail even at the new 65,536-token ceiling — this is the known exception
  called out in the sprint brief, not a bug in the new pipeline.
