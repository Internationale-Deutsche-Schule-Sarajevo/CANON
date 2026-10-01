# Sprint 12 (Quiz Engine) — Lessons Learned

Date: 2026-07-17

## Corrections Applied

- [Kviz pitanja se generišu "od nule" svaki put; nakon 5 pokretanja samo
  ~19 poglavlja od 238 ima pitanja] → ROOT CAUSE: generator.ts je koristio
  maxTokens: 4096. Za duža poglavlja 15-pitanja JSON premaši taj limit,
  odsiječe se usred arraya, JSON.parse pukne, ništa se ne sačuva, poglavlje
  se retrira svaki put. Dokaz iz baze: poglavlja SA pitanjima prosjek 6909
  znakova (max 11041); poglavlja BEZ pitanja prosjek 8979 (max 24324) —
  nijedno dulje od ~11k znakova nije uspjelo. → FIX: maxTokens 8192, robusno
  vađenje JSON arraya (od prvog [ do zadnjeg ]), jedan retry na parse/validaciju,
  glasno + brojano logovanje neuspjeha.
  → Relevantna pravila: E-5 (nema tihih neuspjeha), C-4 (self-correction),
  M-8 (male provjerene iteracije).

- [Dijagnostika: pogrešno optužen ON DELETE CASCADE] → Provjereno kroz bazu
  (generated_at svih poglavlja = 11.7., nema regeneracije; 255 = 17×15 tačno,
  nijedno poglavlje s 30 → skip radi, insert bez dedup) da CASCADE nije
  aktivni uzrok; pravi uzrok je token-odsjecanje. Lekcija o dijagnostici:
  ne zaključivati po prvom sumnjivom tragu — potvrditi mehanizam podacima.

## Gotchas Discovered

- gemini-2.5-flash s maxTokens 4096 tiho odsiječe duži JSON izlaz; odgovor
  stigne kao Status 200 "success" (Gemini poziv JESTE uspio), pa izgleda kao
  da sve radi, ali payload je nekompletan i parsiranje padne kasnije. Status
  200 na AI pozivu NE znači da je rezultat upotrebljiv.

- generateAllQuizQuestions loop brojač (n/238) je pozicija u listi svih
  poglavlja, ne broj novih pitanja — poglavlja s ≥15 pitanja se preskoče u
  milisekundi (jedan COUNT upit, bez Gemini poziva). Brojač koji "kreće od 1"
  je očekivan i kod ispravnog resume-a; NIJE dokaz regeneracije od nule.

## Commander Improvement Candidates

- **Novo pravilo (kandidat, 🔴):** FK od izvedenog/generisanog sadržaja
  (quiz_questions) ka regenerabilnom roditelju (handbook_chapters) NE smije
  biti ON DELETE CASCADE. Pri P-9 Living Ecosystem regeneraciji poglavlja,
  CASCADE bi tiho obrisao sva vezana pitanja bez traga. Vezati izvedeni
  sadržaj za stabilan ključ (document_id) ILI migrirati/ponovo generisati
  eksplicitno, nikad se osloniti na kaskadno brisanje. (Trenutno nije okinuto
  jer se poglavlja ne regenerišu od 11.7., ali je mina za Fazu 18.)

- **Dopuna postojećeg E-5 (learned-from):** Kad kod filtrira ili odbacuje
  AI izlaz (safeParse po stavci, JSON parsiranje), neuspjeh se MORA glasno
  logovati i brojati u povratnom rezultatu. Tihо preskakanje neispravnih
  stavki je mjesecima izgledalo kao ispravan rad dok se ništa nije spremalo.
  "Uspješan AI poziv" (HTTP 200) nije isto što i "rezultat sačuvan".

- **Dopuna A-5 / DL-005 (learned-from):** Za AI zadatke koji vraćaju
  strukturirani JSON, maxTokens mora biti dimenzionisan prema NAJDUŽEM
  očekivanom izlazu, ne prosjeku. Odsječeni JSON je tihi kvar koji pogađa
  samo dio ulaza (duga poglavlja), pa promakne u testiranju na kratkim
  primjerima.
