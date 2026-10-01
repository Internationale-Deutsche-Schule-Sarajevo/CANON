/**
 * Deterministic keyword categorization for handbook_chapters.section.
 *
 * Single source of truth for the 15 director-approved thematic sections
 * (approved 2026-09-08). Used by BOTH:
 *  - scripts/categorize-chapters.ts (one-off dry-run/backfill tool over the
 *    original 316 flat chapters)
 *  - storeChapter() in ./repository.ts (auto-applied to every future chapter,
 *    wired in 2026-09-11 so new/replacement documents aren't silently stuck
 *    at "Nekategorisano" forever)
 * Keep this the ONLY place these rules are defined — do not copy the RULES
 * array elsewhere; both callers above import categorizeChapterTitle.
 *
 * No AI/LLM involved. Rules are checked in priority order (first match
 * wins); anything matching no rule is left as "Nekategorisano" for manual
 * placement, never guessed.
 */

export const SECTIONS = {
  S1: "1. Uvod i osnovni dokumenti škole",
  S2: "2. Organizacija i uprava škole",
  S3: "3. Nastavni plan, program i kurikulum",
  S4: "4. Ocjenjivanje i praćenje uspjeha učenika",
  S5: "5. Pravila ponašanja i disciplina",
  S6: "6. Zaštita djece i sigurnost",
  S7: "7. Zdravlje i higijena",
  S8: "8. Zaštita na radu i okoliša",
  S9: "9. Osoblje i profesionalni razvoj",
  S10: "10. Roditelji i komunikacija",
  S11: "11. Ekskurzije i vannastavne aktivnosti",
  S12: "12. Eksterna matura i vanjsko vrednovanje",
  S13: "13. Sistem kvaliteta (QMS/ISO)",
  S14: "14. Zaštita ličnih podataka",
  S15: "15. Administracija, kalendar i zakonski okvir",
} as const;

export const UNCATEGORIZED = "Nekategorisano";

/** Normalize: lowercase + strip Bosnian diacritics, for tolerant substring matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj");
}

type Rule = {
  section: string;
  // Either a regex tested against the raw title (for structural patterns
  // like the "QP <digits>" prefix) or a list of normalized substrings.
  regex?: RegExp;
  keywords?: string[];
};

// Priority order matters: first matching rule wins. All keyword lists are
// matched against the normalized (lowercased, diacritic-stripped) title.
const RULES: Rule[] = [
  // Priority 1 — QP prefix -> QMS/ISO
  { section: SECTIONS.S13, regex: /^QP\s?\d/i },

  // Priority 2 — Data protection
  {
    section: SECTIONS.S14,
    keywords: [
      "zastitu licnih podataka",
      "zastiti licnih podataka",
      "zastite licnih podataka",
      "sluzbenika za zastitu podataka",
      "povrede podataka",
      "cuvanja i brisanja podataka",
      "politika privatnosti",
    ],
  },

  // Priority 3 — External exams / evaluation
  {
    section: SECTIONS.S12,
    keywords: [
      "eksterna matura",
      "eksterne mature",
      "eksternu maturu",
      "vanjskih evaluacija",
      "maturalna komisija",
      "eksternoj procjeni znanja",
    ],
  },

  // Priority 4 — Occupational safety & environment
  {
    section: SECTIONS.S8,
    keywords: [
      "zastite na radu",
      "zastiti na radu",
      "zastita na radu",
      "zastite od pozara",
      "zastiti od pozara",
      "rizik od pozara",
      "zemljotres",
      "ekstremno visoke temperature",
      "ekstremno niske temperature",
      "zagadjenost zraka",
      "upravljanju otpadom",
      "zastiti okolisa",
    ],
  },

  // Priority 5 — Child protection & safety
  {
    section: SECTIONS.S6,
    keywords: [
      "safeguard",
      "kriznim situacijama",
      "kriznih situacija",
      "dojava bombe",
      "slucaju nasilja u skoli",
      "diskriminacije",
      "zastiti ucenika na internetu",
      "izvjestavanju o incidentima",
      "povreda ucenika",
      "hitnim medicinskim situacijama",
      "zastiti dobrobiti",
      "odlazak djece nakon nastave",
    ],
  },

  // Priority 6 — Health & hygiene
  {
    section: SECTIONS.S7,
    keywords: [
      "streptokok",
      "hiv",
      "aids",
      "karcinom",
      "rak grlica",
      "rak dojke",
      "dijabetes",
      "rotavirus",
      "krpelj",
      "majmunske boginje",
      "mentalnog zdravlja",
      "crijevne zarazne bolesti",
      "respiratorni sincicijski",
      "escherichia coli",
      "zimske bolesti disnih organa",
      "antimikrobnim lijekovima",
      "scarlatina",
      "spolno prenosive",
      "kalij jodid",
      "leptospiroza",
      "zagadjujuce materije u zraku",
      "precisciva zraka",
      "preciscivaci zraka",
      "uticaj na zdravlje",
    ],
  },

  // Priority 7 — Staff & professional development
  {
    section: SECTIONS.S9,
    keywords: [
      "orijentacija novozaposlenih",
      "profesionalni razvoj nastavnika",
      "strucnom usavrsavanju",
      "strucno zvanje",
      "pracenja i mentorstva",
      "plan i program obuke za zaposlenike",
      "evidencija obuke zaposlenih",
      "procedura obuka",
      "40 satnoj sedmici",
      "40 satna sedmica",
      "sedmicnog opterecenja nastavnika",
      "evidencija zamjena",
      "koristenja laptopa",
      "sredstava za rad",
      "poslovima nastavnika",
      "profilu i strucnoj spremi nastavnika",
      "naknadi stete od strane radnika",
      "disciplinskoj i materijalnoj odgovornosti radnika",
      "prijemu i radu sa volonterima",
      "prijemu poklona",
      "edukacija",
      "uvodni sastanak",
      "samorefleksiju nastavnika",
      "samorefleksije nastavnika",
      "zadovoljstva zaposlenih",
      "poziv nastavniku",
      "poziv razredniku",
      "smjernice za razrednike",
    ],
  },

  // Priority 8 — Student behavior & discipline
  {
    section: SECTIONS.S5,
    keywords: [
      "disciplinsk",
      "izostajanju",
      "izostanaka",
      "izostanci",
      "kucnom redu",
      "pravila skole",
      "pravila ucionice",
      "pohvalama i nagradama",
      "neprihvatljivim oblicima ponasanja",
    ],
  },

  // Priority 9 — Student assessment & progress
  {
    section: SECTIONS.S4,
    keywords: [
      "ocjenjivanj",
      "napredovanju ucenika",
      "vrednovanju i ocjenjivanju",
      "uspjeh",
      "raspored pismenih provjera znanja",
    ],
  },

  // Priority 10 — Excursions & extracurricular
  {
    section: SECTIONS.S11,
    keywords: [
      "ekskurzij",
      "izlet",
      "summer school",
      "studijskih posjeta",
      "project week",
      "green school",
      "green kindergarten",
      "takmic",
      "dramska",
      "recitatorska sekcija",
      "izvidjacke sekcije",
      "sportskih aktivnosti",
      "vannastavnim aktivnostima",
      "winter celebration",
      "wintercelebration",
      "laternenfest",
    ],
  },

  // Priority 11 — Parents & communication
  {
    section: SECTIONS.S10,
    keywords: [
      "roditeljsk",
      "parent",
      "saradnji s roditeljima",
      "saradnji sa roditeljima",
      "izjava roditelja",
      "dogovor izmedju nastavnika roditelja i ucenika",
      "hours of consultations",
      "konsultacij",
    ],
  },

  // Priority 12 — School organization & governance
  {
    section: SECTIONS.S2,
    keywords: [
      "poslovnik",
      "zapisnik sa sjednice",
      "vijec",
      "odluka o imenovanju",
      "rjesenje o imenovanju komisije",
      "raspored casova",
    ],
  },

  // Priority 13 — Curriculum & program
  {
    section: SECTIONS.S3,
    keywords: [
      "plan i program",
      "plan and program",
      "kurikulum",
      "nastavnog plana i programa",
      "predmetnog kurikuluma",
      "pismena priprema za realizaciju nastavnog",
      "produzenog boravka",
      "inquiry based learning",
      "planer za ibl",
      "pedagoske sedmice",
    ],
  },

  // Priority 14 — Foundational / intro documents
  {
    section: SECTIONS.S1,
    keywords: [
      "elaborat",
      "prirucnik za nastavnike",
      "dokumentacija za nove kolege",
      "brand manual",
      "idss strategija",
      "venture minds strategy",
      "eticki kodeks",
      "kodeks idss",
    ],
  },

  // Priority 15 — Administration, calendar, legal framework
  {
    section: SECTIONS.S15,
    keywords: [
      "zakon o",
      "skolski kalendar",
      "school calendar",
      "rjesenje o registraciji",
      "rjesenje o upisu u registar",
      "sudski registar",
      "aktuelni izvod",
      "o ispunjavanju uslova",
      "poziv za upis",
      "contact list",
      "plan integriteta",
      "prevenciji i suzbijanju korupcije",
      "unutrasnjeg prijavljivanja korupcije",
      "formiranju cijena",
      "nostrifikaciji i ekvivalenciji",
    ],
  },
];

/** Returns the matching section for a chapter title, or UNCATEGORIZED ("Nekategorisano") if no rule matches. Never guesses. */
export function categorizeChapterTitle(title: string): string {
  const normalizedTitle = normalize(title);
  for (const rule of RULES) {
    if (rule.regex && rule.regex.test(title)) return rule.section;
    if (rule.keywords) {
      for (const kw of rule.keywords) {
        if (normalizedTitle.includes(normalize(kw))) return rule.section;
      }
    }
  }
  return UNCATEGORIZED;
}
