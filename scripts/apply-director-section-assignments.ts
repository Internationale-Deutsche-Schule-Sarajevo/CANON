/**
 * One-off: writes the Director's manual section assignments for the 69
 * chapters that the keyword rules (section-rules.ts) left as
 * "Nekategorisano" — applied 2026-09-14. Direct ID -> section writes, NOT a
 * re-run of the keyword script (the Director's manual placement overrides
 * the deterministic rules for exactly these 69 rows).
 *
 * Run: npx tsx --env-file=.env scripts/apply-director-section-assignments.ts
 */
import "dotenv/config";
import { SECTIONS } from "../src/features/handbook/section-rules";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ASSIGNMENTS: { id: string; title: string; section: string }[] = [
  { id: "a0617904-7bad-4202-8ca5-63ab21abc634", title: "Year Book 2023 2024 FINAL BEST FOR PRINT", section: SECTIONS.S1 },
  { id: "410f9e06-e26f-4344-9c4a-7b4b6d8dd2de", title: "Yearbook 2024 2025 0372025 BEST FOR PRINT (1)", section: SECTIONS.S1 },

  { id: "bf06bb2e-e9da-4d55-8783-aa4d036fa627", title: "Pravilnik o radu IDSS", section: SECTIONS.S2 },
  { id: "610becaf-dec6-453c-9ceb-6a691b978bc4", title: "IDSS Pravilnik O Radu Stručne Službe 23102024 (3)", section: SECTIONS.S2 },
  { id: "e7f6c997-eca7-4b29-a333-c0398f8fc088", title: "IDSS Pravilnik O Rasporedu Časova 23102024 (3)", section: SECTIONS.S2 },
  { id: "72ee1699-ce08-46fa-bdba-47fefac27d4e", title: "Pravilnik o sadržaju i načinu provođenja nadzora nad zakonitošću rada i stručnom nadzoru", section: SECTIONS.S2 },

  { id: "6cf6c47f-28c2-4064-b528-bcd153086db8", title: "Prvi modul prvi dan materijali", section: SECTIONS.S3 },
  { id: "d8aeaa06-9cc7-4370-bbce-db2b25753870", title: "IDSS Procedura Za Narudzbu Udzbenika 11032025 (1)", section: SECTIONS.S3 },
  { id: "9ea2291b-f080-4ba5-aff8-800a83ec72b2", title: "IDSS Pravilnik O Organizaciji Dopunske I Dodatne Nastave 23102024 (3)", section: SECTIONS.S3 },
  { id: "9af6186e-fef3-4fd6-aa7e-346e428e9024", title: "IDSS Pravilnik O Organizaciji Nastave Za Učenike Sa Posebnim Potrebama 23102024 (3)", section: SECTIONS.S3 },
  { id: "66e6ded7-8086-4a49-83a4-a54329601a01", title: "IDSS Pravilnik O Organizaciji Praktične Nastave 23102024 (3)", section: SECTIONS.S3 },
  { id: "8df33f94-f995-47a4-83bc-ecb4e561758b", title: "IDSS Pravilnik O Profesionalnoj Orijentaciji Učenika 23102024 (3)", section: SECTIONS.S3 },
  { id: "991f1253-9717-4755-b7cc-9160f34e0b2b", title: "IDSS Pravilnik O Radu Školske Biblioteke 23102024 (3)", section: SECTIONS.S3 },
  { id: "173e0f9e-43b7-497f-ad5f-a2a46d3c74cd", title: "IDSS Pravilnik O Vođenju Pedagoške Dokumentacije I Evidencije 23102024 (7)", section: SECTIONS.S3 },
  { id: "88a9f7db-090a-4af0-8da1-4b8e50219930", title: "Pravilnik o vođenju pedagoške dokumentacije i evidencije u osnovnoj školi u KS", section: SECTIONS.S3 },
  { id: "6d596247-a81d-42d3-89aa-ff70e2306927", title: "Pedagoški standardi i normativi za odgoj i obrazovanje u osnovnoj i srednjoj školi", section: SECTIONS.S3 },
  { id: "8a22cb4f-95f0-4ece-b7df-dffd14d84620", title: "Pravilnik o inkluzivnom obrazovanju", section: SECTIONS.S3 },
  { id: "b20982c8-3af4-4ea5-9f21-691ecd25e386", title: "Pravilnik o provođenju mjera odgojno obrazovne podrške i stručnog tretmana učenika", section: SECTIONS.S3 },

  { id: "4b817ac6-dfe2-4b5c-b6aa-e7b210e8cca6", title: "Zeugnis Viola Sara Sarkozy 20022026", section: SECTIONS.S4 },
  { id: "3dbcc2af-d96e-4343-a4c2-16d9f1b035d7", title: "Instrukcije za pisane provjere znanja u IDSS (7)", section: SECTIONS.S4 },

  { id: "a1736aa0-2a32-4ab1-8a24-d16438caa977", title: "IDSS Pravilnik O Zaštiti I Zdravlju Učenika 23102024 (3)", section: SECTIONS.S6 },
  { id: "2029d6d3-bf51-46e9-b838-f39401f18fbe", title: "OBRAZAC ZA IZVJEŠTAVANJE O INCIDENTIMA (3)", section: SECTIONS.S6 },
  { id: "2d7cecff-881a-4a40-b50c-672a7966f825", title: "IDSS Safeguariing Policy BHS Final (1)", section: SECTIONS.S6 },
  { id: "3cd7a7b8-59fa-4706-91cf-ea5ca335a932", title: "Pravilnik o formiranju i radu školskih saobraćajnih patrola", section: SECTIONS.S6 },
  { id: "0433e841-3209-48dd-81e2-221cc6933e9d", title: "IDSS INFORMACIJA ULAZNA KAPIJA", section: SECTIONS.S6 },
  { id: "2b48a2e3-17e9-448e-8de4-fe9d5888c3ea", title: "IDSS Obavijest Skolska Vrata", section: SECTIONS.S6 },
  { id: "a7613574-0f67-4cb1-a9da-9c67365b4f39", title: "Pravilnik O Nadzoru Za Vrijeme Dezura 20082025 (6)", section: SECTIONS.S6 },
  { id: "b0e9f7d5-1487-4701-80a5-e2b69499f95a", title: "IDSS Pravilnik O Zabrani Pusenja 2024 (7)", section: SECTIONS.S6 },

  { id: "b30bd55d-d504-47e7-9acd-c6f25612140b", title: "IDSS Pravilnik O Školskoj Hrani 23102024 (3)", section: SECTIONS.S7 },
  { id: "fc301eb5-6e39-48e9-a481-12859d254362", title: "18 MEDJUNARODNI MJESEC BORBE PROTIV RAKA DOJKE", section: SECTIONS.S7 },
  { id: "ff95eb50-22e1-41b8-97fe-6fcf3e7cb862", title: "Pravilnik o ishrani učenika u osnovnim i srednjim školama KS", section: SECTIONS.S7 },
  { id: "1a3dbc3a-e782-4a72-9078-7ff7e1725da0", title: "6 MEDJUNARODNI DAN LJUDSKIH PRAVA", section: SECTIONS.S7 },
  { id: "0ecb3067-f974-4aa6-9a08-e3fc8ecd600a", title: "8 MEDJUNARODNI DAN OSOBA SA INVALIDITETOM", section: SECTIONS.S7 },

  { id: "368109fd-c25c-44e4-9d5a-a95764eaedd8", title: "IDSS Instrukcije Ciscenje Skole 03022025", section: SECTIONS.S8 },

  { id: "7906ddd8-f85c-4aa9-a73e-b1761dcd88d3", title: "OSTVARENI UVID U ODGOJNO OBRAZOVNI RAD NASTAVNIKA (1)", section: SECTIONS.S9 },
  { id: "9e7ec5f2-3e9c-4328-8aa4-d7d5cc4697cb", title: "Pedagoginja program rada 2012 13", section: SECTIONS.S9 },
  { id: "69ef88fc-73fb-4553-82c1-a805351d00c5", title: "Plan Podrske Nastavnicima Maja Ljubovic 2025 2026", section: SECTIONS.S9 },
  { id: "714b9f00-f6ff-47f4-9495-b642b6d82762", title: "IDSS Uputstvo O Evaluaciji Nastavnog Rada 23102024 (3)", section: SECTIONS.S9 },
  { id: "de22f60c-53d7-49e6-b335-9774ba5c09f2", title: "Agenda", section: SECTIONS.S9 },
  { id: "317b0435-fde3-4dd2-950d-c62cf1d453d2", title: "AGENDA 2", section: SECTIONS.S9 },
  { id: "867e6159-c12b-42e6-9a03-26ade0ad2160", title: "Izvještaj Melisa", section: SECTIONS.S9 },
  { id: "10d984c1-3258-4863-8616-61b9959b85bb", title: "Sedmični izvještaj 5.11", section: SECTIONS.S9 },
  { id: "47436fc7-6b7a-4d34-934a-045a4f9ea900", title: "Sedmični izvještaj 5.18", section: SECTIONS.S9 },
  { id: "ac3876a4-667f-4fde-88a9-50a178df2157", title: "uglovi slaganja", section: SECTIONS.S9 },
  { id: "5f7a6a5f-a1aa-48aa-8742-689911eab0c9", title: "IDSS   Ulazna anketa   (Responses)", section: SECTIONS.S9 },

  { id: "6c033b72-190c-4842-ba7b-de221a24c9bf", title: "I Roditejski Sastanak Agenda Za Razrednike 2025 2026", section: SECTIONS.S10 },
  { id: "414e11be-af71-41ce-a8d2-6a9cdeefdcec", title: "IDSS Pravilnik O Saradnji Sa Rroditeljima I Lokalnom Zajednicom 23102024 (3)", section: SECTIONS.S10 },
  { id: "f0fdbca8-fbaa-4ac9-8018-c156619e5c5f", title: "01 Strategija Sastanka Skraceno", section: SECTIONS.S10 },

  { id: "7de0e6b5-7658-4ae3-916b-1e97d9015a72", title: "IDSS Event Planner", section: SECTIONS.S11 },

  { id: "d66c457c-7bc5-4fdb-98ed-02b28991ea0c", title: "Izvještaj o pripremama za eksternu mature", section: SECTIONS.S12 },
  { id: "4d22d006-a713-4949-a502-a28ebb01dfc6", title: "A   Test B1", section: SECTIONS.S12 },
  { id: "10debe32-e6ae-41c9-bda6-e4f7a15e2d02", title: "B   Test B2", section: SECTIONS.S12 },
  { id: "88370d85-acfd-47da-9cc8-42fb61c13d07", title: "C   Test B3", section: SECTIONS.S12 },
  { id: "7b287837-a418-485c-b4c3-217a21df6662", title: "D   Test B4", section: SECTIONS.S12 },

  { id: "bd1105b5-f575-4f43-936a-89c44ca927e3", title: "1. Odluka stipendija Kan Kereš III 24062025", section: SECTIONS.S15 },
  { id: "6573d9ae-5973-4f95-9aeb-df893f3efd13", title: "Pravilnik za usluge do 30 dana kanton036 0", section: SECTIONS.S15 },
  { id: "21f1a6ea-1320-48f3-adfd-df8d812cf317", title: "IDSS Pravilnik O Korištenju Informaciono komunikacijskih Tehnologija 23102024 (3)", section: SECTIONS.S15 },
  { id: "337b4c5e-286d-4ece-83a3-1d3d714807d4", title: "IDSS Pravilnik O Načinu Korištenja Školskog Prostora Opreme 23102024 (3)", section: SECTIONS.S15 },
  { id: "99ec59bd-7f18-4636-b98c-c2d752a44018", title: "IDSS Pravilnik O Primjeni Novih Tehnologija (7)", section: SECTIONS.S15 },
  { id: "c6d691b2-9ca6-444d-801d-15064c0c9043", title: "Odluka o usvajanju Pravilnika o stipendiranju august 24. (3)", section: SECTIONS.S15 },
  { id: "76c32205-f84d-4e75-8201-911c435664f5", title: "Pravilnik o primjeni informacionog sistema EMIS u osnovnim i srednjim školama u KS", section: SECTIONS.S15 },
  { id: "b2f8c49c-eb46-46f4-b6d8-4b83c90890ae", title: "1a IDSS SCHOOL Application Form 2023 2024", section: SECTIONS.S15 },
  { id: "c5ade0f2-a804-48c5-a22a-6aad66abe0c6", title: "IDSS New Internet Site Bosnian 20052023", section: SECTIONS.S15 },
  { id: "248a4722-364f-40c7-a3c2-911c13416990", title: "IDSS PRESCHOOL Application Form 2022 2023 ENG", section: SECTIONS.S15 },
  { id: "d8542f45-63ce-4e1d-b03c-f65874d4ed21", title: "IDSS Schreiben an die Deutsche Botschaft 17122024", section: SECTIONS.S15 },
  { id: "58330d42-1bf3-43c2-98ab-866de24f4b53", title: "Odluka O Pocetku I Zavrsetku Nastavne Godine 2023 2024 (2)", section: SECTIONS.S15 },
  { id: "b9c3193c-7a36-4cf2-b92e-a6ee41a574ff", title: "IDSS Equivalence Nostrification Certificate Instruction 05092024", section: SECTIONS.S15 },
  { id: "562647d0-ccd6-4121-a246-9676b13f1704", title: "IDSS Izvjestaj za IRPO 2505026", section: SECTIONS.S15 },
  { id: "2b67beb7-3808-4095-822f-d8d56e6fbea4", title: "7.Prilog Zapisniksamisljenjem(3)", section: SECTIONS.S15 },
];

async function main() {
  console.log(`Total assignments: ${ASSIGNMENTS.length} (expected 69)`);
  if (ASSIGNMENTS.length !== 69) {
    throw new Error(`ASSIGNMENTS.length is ${ASSIGNMENTS.length}, expected 69 — aborting, do not write a partial/wrong set.`);
  }
  const ids = new Set(ASSIGNMENTS.map((a) => a.id));
  if (ids.size !== 69) {
    throw new Error(`Duplicate id(s) detected in ASSIGNMENTS — aborting.`);
  }

  let written = 0;
  for (const { id, title, section } of ASSIGNMENTS) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/handbook_chapters?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ section }),
    });
    if (!res.ok) {
      throw new Error(`Failed to update ${id} ("${title}"): ${res.status} ${await res.text()}`);
    }
    written++;
    console.log(`[${written}/69] ${id}  "${title}"  -> ${section}`);
  }

  console.log(`\nDone. ${written}/69 written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
