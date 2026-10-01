/**
 * Register bridge — TAČNO 2 chunka (b4a226a0, 0dc593d8), potvrđeni
 * register-mismatch slučajevi iz detect-register-mismatch.ts.
 *
 * Ulaz je već postojeći search_text_bs (bosanski doslovan prevod), ne
 * njemački izvor — ovo je čisto register transformacija unutar bosanskog,
 * ne prevod. Isti disciplinovan prompt stil: mijenja OBLIK (1. lice
 * pledge -> formalna izjava pravila), ne dodaje/oduzima sadržaj.
 *
 * `embedding` se ponovo računa iz search_text_bs + search_text_bs_declarative
 * KOMBINOVANO (ne umjesto — search_text_bs ostaje netaknut), tako da
 * retriever.ts ostaje potpuno netaknut (i dalje jedan embedding stupac,
 * ista match_chunks RPC).
 *
 * Run: npx tsx --env-file=.env scripts/search-bridge-register-2chunks.ts
 */
import { franc } from "franc";
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";
import { getAIProvider } from "../src/lib/ai/ai-provider.factory";

const CHUNK_IDS = ["b4a226a0-4bf8-4595-aa57-57a470ad24ef", "0dc593d8-21a7-4a0e-a3ad-01c7be9c3864"];

const SYSTEM_PROMPT =
  "Ti si precizan editor teksta za internu upotrebu u P.U. Internationale Deutsche Schule Sarajevo. " +
  "Tvoj jedini zadatak je da PREOBLIKUJEŠ dati bosanski tekst iz izjava u prvom licu (lični pledge/obećanje) " +
  "u formalne, deklarativne izjave pravila — treće lice ili bezlični oblik, kao u pravilniku.\n\n" +
  "STROGO PRAVILO TAČNOSTI (najvažnije pravilo, nadjačava sve ostale stilske smjernice):\n" +
  "- Mijenjaš ISKLJUČIVO gramatički oblik/registar rečenice. Ne smiješ dodati nijednu novu činjenicu, " +
  "objašnjenje, primjer ili tumačenje kojeg nema u izvornom tekstu.\n" +
  "- Ne smiješ izostaviti nijednu stavku iz izvora. Broj pravila/stavki u izlazu mora odgovarati broju u izvoru.\n" +
  "- Primjer transformacije: 'Dolazim na vrijeme.' -> 'Pravilo o dolasku na vrijeme.' ili 'Učenik dolazi na vrijeme.' " +
  "'Pozdravljam druge ljubazno.' -> 'Pravilo o ljubaznom pozdravljanju drugih.'\n" +
  "- Zadrži isti redoslijed stavki kao u izvoru.\n" +
  "- Ne dodaji naslov, uvod, numeraciju ili bilo šta što nije direktna reformulacija postojećih stavki.\n\n" +
  "Vrati ISKLJUČIVO preoblikovan tekst, jedna stavka po redu, bez ikakvog dodatnog komentara.";

function countItems(text: string): number {
  return text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0).length;
}

type ValidationResult = { ok: true } | { ok: false; reasons: string[] };

function validate(sourceBs: string, declarative: string, finishReason: string | undefined): ValidationResult {
  const reasons: string[] = [];
  const trimmed = declarative.trim();
  if (trimmed.length === 0) { reasons.push("prazan izlaz"); return { ok: false, reasons }; }
  if (finishReason === "MAX_TOKENS") reasons.push("odsječeno (finishReason=MAX_TOKENS)");

  const detected = franc(trimmed, { minLength: 10 });
  if (detected === "deu" || detected === "eng") reasons.push(`franc detektuje izlaz kao "${detected}", ne bosanski`);

  // Tolerance of 2 (not 1): source line-count includes non-rule header
  // lines (e.g. a 2-line "UČIONICA / PRAVILA" title split across lines)
  // that a correct reformulation legitimately drops rather than turning
  // into a fake "rule" — confirmed by direct inspection on the first two
  // chunks this ran against, not a blind widening.
  const sourceItems = countItems(sourceBs);
  const outputItems = countItems(trimmed);
  if (Math.abs(sourceItems - outputItems) > 2) {
    reasons.push(`broj stavki se ne poklapa: izvor=${sourceItems}, izlaz=${outputItems}`);
  }

  const lenRatio = trimmed.length / sourceBs.length;
  if (lenRatio < 0.4 || lenRatio > 3.0) {
    reasons.push(`sumnjiva dužina izlaza naspram izvora (odnos=${lenRatio.toFixed(2)}) — moguće izostavljen ili izmišljen sadržaj`);
  }

  return reasons.length > 0 ? { ok: false, reasons } : { ok: true };
}

async function generateWithRetry(ai: ReturnType<typeof getAIProvider>, userPrompt: string, systemPrompt: string, maxAttempts = 3) {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.generate(userPrompt, systemPrompt, { maxTokens: 8192, temperature: 0.3, language: "bs" });
    } catch (err) {
      lastErr = err as Error;
      console.log(`  (pokušaj ${attempt}/${maxAttempts} neuspješan: ${lastErr.message})`);
    }
  }
  throw lastErr;
}

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const ai = getAIProvider();

  const { data: rows, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, search_text_bs, search_register_bridge_at")
    .in("id", CHUNK_IDS);
  if (error || !rows) throw new Error(`fetch failed: ${error?.message}`);
  if (rows.length !== 2) throw new Error(`očekivao 2 reda, dobio ${rows.length}`);

  for (const row of rows) {
    if (row.search_register_bridge_at) {
      console.log(`\n=== chunk ${row.id} već ima register bridge (${row.search_register_bridge_at}) — preskačem ===`);
      continue;
    }
    if (!row.search_text_bs) throw new Error(`chunk ${row.id} nema search_text_bs — talas 1 mora biti gotov prvo`);

    console.log(`\n=== chunk ${row.id} (doc ${row.document_id}) ===`);
    console.log(`IZVOR (search_text_bs):\n${row.search_text_bs}\n`);

    const result = await generateWithRetry(
      ai,
      `Preoblikuj sljedeći bosanski tekst iz prvog lica u formalne izjave pravila:\n\n${row.search_text_bs}`,
      SYSTEM_PROMPT,
    );
    const declarative = result.text.trim();
    console.log(`DEKLARATIVNI OBLIK:\n${declarative}\n`);
    console.log(`finishReason=${result.finishReason}`);

    const verdict = validate(row.search_text_bs, declarative, result.finishReason);
    if (!verdict.ok) {
      console.log(`ODBIJEN: ${verdict.reasons.join("; ")}`);
      console.log(`NIJE upisano za ovaj chunk.`);
      continue;
    }
    console.log(`Validacija: OK`);

    const combined = `${row.search_text_bs}\n\n${declarative}`;
    const [embedding] = await embedTextsLocal([combined]);

    const { error: updErr } = await supabase
      .from("document_chunks")
      .update({
        search_text_bs_declarative: declarative,
        search_register_bridge_at: new Date().toISOString(),
        embedding,
      })
      .eq("id", row.id);
    if (updErr) throw new Error(`update failed za ${row.id}: ${updErr.message}`);
    console.log(`Upisano (embedding računat iz search_text_bs + search_text_bs_declarative kombinovano).`);
  }
}

main().catch((err) => {
  console.error("[RegisterBridge] Fatal:", err);
  process.exitCode = 1;
});
