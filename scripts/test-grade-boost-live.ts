import { retrieveChunks } from "../src/lib/rag/retriever";

const IIV_DOC_ID = "c1a0b320-8f97-4822-a4ea-f1386824bfb6"; // Pravila_Ucionice_I-IV_Razred.md
const VIX_DOC_ID = "df4efaf7-12f3-488b-87fb-b51e3ccc3dc1"; // Pravila_učionice_V-IX_Razred.md

const CASES: { label: string; query: string; expectDoc: string | null }[] = [
  { label: "POTVRĐENI SLUČAJ (I-IV)", query: "Koja pravila vrijede u učionici za razrede I-IV?", expectDoc: IIV_DOC_ID },
  { label: "POTVRĐENI SLUČAJ (V-IX)", query: "Koja pravila vrijede u učionici za razrede V-IX?", expectDoc: VIX_DOC_ID },
  { label: "SUSJEDNI #1 — školarina I-IV (NE smije pogoditi Pravila)", query: "Koliko iznosi školarina za razred I-IV?", expectDoc: null },
  { label: "SUSJEDNI #2 — raspored I-IV (NE smije pogoditi Pravila)", query: "Kakav je raspored časova za razred I-IV?", expectDoc: null },
  { label: "SUSJEDNI #3 — upis V-IX (NE smije pogoditi Pravila)", query: "Koja je procedura upisa učenika u razred V-IX?", expectDoc: null },
];

async function main() {
  for (const c of CASES) {
    console.log(`\n\n===== ${c.label} =====\nUpit: "${c.query}"`);
    const result = await retrieveChunks(c.query);
    console.log(`Confidence: ${result.confidence}`);
    result.chunks.forEach((ch, i) => {
      console.log(
        `  ${i + 1}. doc=${ch.documentId} sim=${ch.similarity.toFixed(4)} raw=${ch.rawSemanticSimilarity?.toFixed(4) ?? "null"} src=${ch.source}`,
      );
    });
    if (c.expectDoc) {
      const hit = result.chunks.some((ch) => ch.documentId === c.expectDoc);
      console.log(hit ? `PASS — ciljni dokument JE u top-5 na mjestu ${result.chunks.findIndex(ch=>ch.documentId===c.expectDoc)+1}` : `FAIL — ciljni dokument NIJE u top-5`);
    } else {
      const iivHit = result.chunks.some((ch) => ch.documentId === IIV_DOC_ID);
      const vixHit = result.chunks.some((ch) => ch.documentId === VIX_DOC_ID);
      console.log(iivHit || vixHit ? `FAIL — lažni pozitivan (Pravila dokument se pojavio)` : `PASS — Pravila dokument NIJE lažno pogođen`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
