/**
 * Validation for AI-generated chapter summaries ("Pročitaj više" feature).
 * Same discipline as the search-bridge translation validator
 * (scripts/search-bridge-wave2-english.ts) — nothing gets written unless it
 * passes every check. The direction of a couple of checks is flipped from
 * the translation validator because a summary is a COMPRESSION of already-
 * Bosnian text, not a translation of foreign text:
 *  - Translation validator: number/name from SOURCE must appear in output
 *    (nothing may be dropped).
 *  - Summary validator: number/name in the SUMMARY must appear in the
 *    already-approved FULL chapter text (nothing may be invented). Omitting
 *    a number/name from the summary is fine and expected — compression is
 *    the point.
 */
import { franc } from "franc";

export type ValidationResult = { ok: true } | { ok: false; reasons: string[] };

const MIN_SUMMARY_LENGTH = 80;
// Apsolutni gornji limit umjesto procenta punog teksta: prompt cilja FIKSAN
// broj rečenica (2-4) bez obzira na dužinu izvora, ne proporcionalnu
// kompresiju, pa je procentualni prag pogrešan oblik provjere — najkraće
// objavljeno poglavlje ima svega 1.033 znaka, gdje bi i legitiman 450-znakovni
// sažetak premašio bilo koji razuman procenat.
// 700 -> 1500 (Talas A, uživo): prompt sada ima eksplicitan izuzetak — kad
// tekst poimenično navodi osobe u zvaničnoj ulozi (komisije, potpisnici),
// sažetak MORA navesti sva imena i uloge, čak i ako je duži od uobičajenog
// (Rjesenje Maturalna Komisija: 6 imenovanih članova s ulogama samo za spisak
// imena traži ~350-450 znakova, plus kontekstna rečenica). 1500 i dalje
// sprečava "sažetak" koji je zapravo prepisan cijeli pasus.
const MAX_SUMMARY_LENGTH = 1500;

const KNOWN_PRESERVE_TOKENS = [
  "IDSS", "BHS", "DEU", "EN", "PDF", "DOCX", "XLSX",
  "IBAN", "SWIFT", "BIC", "KM", "BAM", "EUR", "USD",
];

// 2-4 uzastopne kapitalizovane riječi — heuristika za vlastita imena (ljudi,
// institucije, dokumenti) koja bi sažetak mogao izmisliti. Namjerno grubo
// (isti kompromis kao franc-heuristike u translation validatoru) — cilj je
// uhvatiti očigledne fabrikacije, ne savršeno parsirati bosanski NER.
const PROPER_NAME_RE = /\b[A-ZČĆŽŠĐ][a-zčćžšđ]+(?:\s+[A-ZČĆŽŠĐ][a-zčćžšđ]+){1,3}\b/g;

function extractNumbers(text: string): string[] {
  return Array.from(new Set(text.match(/\d+(?:[.,]\d+)*/g) ?? []));
}

function extractKnownTokens(text: string): string[] {
  const upper = text.toUpperCase();
  return KNOWN_PRESERVE_TOKENS.filter((tok) => new RegExp(`\\b${tok}\\b`).test(upper));
}

function extractProperNames(text: string): string[] {
  // NFC normalizacija prije regexa: izvor/prevod mogu doći u NFD obliku
  // (npr. "c" + kombinujući "ˇ" umjesto jednog kodpointa "č"), što bi inače
  // promaklo [a-zčćžšđ] klasi iako se vizuelno prikazuje identično.
  return Array.from(new Set(text.normalize("NFC").match(PROPER_NAME_RE) ?? []));
}

// Isti fleksibilni broj-poređenje kao popravljeni search-bridge validator
// (search-bridge-wave2-english.ts, Gotcha #3) — poredi VRIJEDNOST broja uz
// obje moguće konvencije separatora, ne doslovan string, jer sažetak smije
// legitimno preformatirati (npr. "50.000" -> "50,000") isti broj.
function parseNumberCandidates(raw: string): number[] {
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  const candidates = new Set<number>();
  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const n = lastDot > lastComma ? Number(raw.replace(/,/g, "")) : Number(raw.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) candidates.add(n);
  } else if (hasComma) {
    const parts = raw.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      const a = Number(raw.replace(",", "."));
      if (Number.isFinite(a)) candidates.add(a);
    }
    const b = Number(raw.replace(/,/g, ""));
    if (Number.isFinite(b)) candidates.add(b);
  } else if (hasDot) {
    const parts = raw.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      const a = Number(raw);
      if (Number.isFinite(a)) candidates.add(a);
    }
    const b = Number(raw.replace(/\./g, ""));
    if (Number.isFinite(b)) candidates.add(b);
  } else {
    const n = Number(raw);
    if (Number.isFinite(n)) candidates.add(n);
  }
  return Array.from(candidates);
}

function numberExistsInSource(summaryRaw: string, sourceTokens: string[]): boolean {
  const summaryCandidates = parseNumberCandidates(summaryRaw);
  if (summaryCandidates.length === 0) return sourceTokens.includes(summaryRaw); // fallback: doslovno
  return sourceTokens.some((srcRaw) =>
    parseNumberCandidates(srcRaw).some((srcVal) => summaryCandidates.some((c) => Math.abs(c - srcVal) < 1e-9)),
  );
}

// FIX (Talas A, uživo otkriveno): Bosanski deklinira imena po padežu
// ("Anesa Karaman" nominativ -> "Anesi Karaman"/"Anesu Karaman" dativ,
// "Adnana" -> "Adnani"/"Adnanu"...), pa doslovan substring-match protiv
// izvora (nominativ) lažno odbija SVAKI sažetak koji spomene osobu izvan
// nominativa — u prvom testiranju je ovo bio dominantan uzrok odbijanja,
// ne stvarna fabrikacija. Umjesto cijele riječi, poredi se "stem" (koren)
// svake riječi imena — dovoljno dug prefiks da preživi promjenu padežnog
// nastavka (obično zadnja 1-3 slova), traži se bilo gdje u izvoru. Ovo
// namjerno ne pokušava biti savršena bosanska morfologija (isti kompromis
// kao i franc-heuristike) — cilj je da prestane lažno odbijati stvarna
// imena iz izvora, uz zadržavanje mogućnosti da uhvati istinski izmišljeno
// ime (koje neće dijeliti ni koren sa bilo čim u izvoru).
function wordStem(word: string): string {
  const normalized = word.normalize("NFC");
  if (normalized.length <= 3) return normalized;
  const dropCount = Math.min(2, normalized.length - 3);
  return normalized.slice(0, normalized.length - dropCount);
}

function nameExistsInSource(name: string, fullTextLower: string): boolean {
  const words = name.normalize("NFC").split(/\s+/);
  return words.every((w) => fullTextLower.includes(wordStem(w).toLowerCase()));
}

export function validateSummary(
  fullText: string,
  summary: string,
  finishReason: string | undefined,
): ValidationResult {
  const reasons: string[] = [];
  const trimmed = summary.trim();

  if (trimmed.length === 0) {
    reasons.push("prazan sažetak");
    return { ok: false, reasons };
  }
  if (finishReason === "MAX_TOKENS") {
    reasons.push("sažetak odsječen (finishReason=MAX_TOKENS) — izlaz nepotpun");
  }
  if (trimmed.length < MIN_SUMMARY_LENGTH) {
    reasons.push(`sažetak prekratak (${trimmed.length} znakova, minimum ${MIN_SUMMARY_LENGTH})`);
  }
  if (trimmed.length > MAX_SUMMARY_LENGTH) {
    reasons.push(`sažetak predugačak (${trimmed.length} znakova, maksimum ${MAX_SUMMARY_LENGTH})`);
  }
  if (trimmed.length >= fullText.length) {
    reasons.push(`sažetak nije kraći od punog teksta (${trimmed.length}/${fullText.length} znakova) — nije stvarna kompresija`);
  }

  const detected = franc(trimmed, { minLength: 10 });
  if (detected === "eng" || detected === "deu") {
    reasons.push(`franc detektuje sažetak kao "${detected}", ne bosanski/srodan`);
  }

  // Fabrikacija brojeva: svaki broj u sažetku mora postojati (po vrijednosti)
  // negdje u punom tekstu. Sažetak SMIJE izostaviti brojeve iz izvora —
  // provjera ide samo u ovom smjeru (obrnuto od translation validatora).
  const sourceNumberTokens = extractNumbers(fullText);
  const summaryNumbers = extractNumbers(trimmed);
  const fabricatedNumbers = summaryNumbers.filter((n) => !numberExistsInSource(n, sourceNumberTokens));
  if (fabricatedNumbers.length > 0) {
    reasons.push(`sažetak sadrži broj(eve) koji ne postoje u punom tekstu: ${fabricatedNumbers.join(", ")}`);
  }

  // Fabrikacija poznatih skraćenica/institucija — isti smjer.
  const sourceKnownTokens = new Set(extractKnownTokens(fullText).map((t) => t.toUpperCase()));
  const summaryKnownTokens = extractKnownTokens(trimmed);
  const fabricatedKnownTokens = summaryKnownTokens.filter((t) => !sourceKnownTokens.has(t.toUpperCase()));
  if (fabricatedKnownTokens.length > 0) {
    reasons.push(`sažetak sadrži oznaku/skraćenicu koja ne postoji u punom tekstu: ${fabricatedKnownTokens.join(", ")}`);
  }

  // Fabrikacija vlastitih imena (ljudi, institucije, nazivi dokumenata) — isti
  // smjer, gruba heuristika (vidi napomenu uz PROPER_NAME_RE i wordStem).
  const fullTextLowerNormalized = fullText.normalize("NFC").toLowerCase();
  const summaryNames = extractProperNames(trimmed);
  const fabricatedNames = summaryNames.filter((name) => !nameExistsInSource(name, fullTextLowerNormalized));
  if (fabricatedNames.length > 0) {
    reasons.push(`sažetak sadrži moguće izmišljeno ime/naziv koji ne postoji doslovno u punom tekstu: ${fabricatedNames.join("; ")}`);
  }

  return reasons.length > 0 ? { ok: false, reasons } : { ok: true };
}
