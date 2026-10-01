# Chapter Regeneration List

Exactly the 109 REGENERATE-category chapter ids from
`corrections/CHAPTER_TRIAGE.md` (Director-authorized without individual
review — M-4 go given, 2026-07-27). EXCLUDE (62 + Plan Obuke f8b42cac,
now `is_published=false`) and RE-EXTRACT (the remaining 7) chapters are
deliberately NOT included here — regeneration cannot fix a failed
extraction, and EXCLUDE chapters should never be regenerated at all.

`scripts/regenerate-truncated.ts` reads this file for chapter UUIDs
(any UUID-shaped token anywhere in the text, so the table below is read
as-is) and re-sorts by source length ascending before running.

Known expected failure (not a bug): `6d596247-a81d-42d3-89aa-ff70e2306927`
(Pedagoški standardi i normativi, ~776K source) will truncate even at the
65,536-token ceiling — logged as ❌ and skipped, needs per-section handling
later, out of scope for this run.

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
