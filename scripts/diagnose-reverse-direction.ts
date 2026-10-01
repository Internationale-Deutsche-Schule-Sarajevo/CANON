/**
 * Read-only — Zahtjev 5: does the same cross-lingual gap show up in reverse
 * (a German/English query against a genuinely Bosnian chunk)? No writes.
 * Compares direct cosine (bypassing match_chunks' row cap) for a Bosnian,
 * German, and English phrasing of the same question against one confirmed-
 * Bosnian chunk (Pravilnik o kućnom redu, chunk_index=1).
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { embedTextsLocal } from "../src/lib/rag/local-embedder";

const TARGET_CHUNK_ID = "79172acb-7412-4274-afe3-392eb264aedd"; // Pravilnik o kućnom redu, chunk_index 1

const QUERIES: { lang: string; text: string }[] = [
  { lang: "bs", text: "Koja pravila ponašanja i kućni red vrijede u školi?" },
  { lang: "de", text: "Welche Verhaltensregeln und Hausordnung gelten in der Schule?" },
  { lang: "en", text: "What rules of conduct and house rules apply at the school?" },
];

function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const { data: chunk, error } = await supabase
    .from("document_chunks")
    .select("id, text, embedding")
    .eq("id", TARGET_CHUNK_ID)
    .single();
  if (error || !chunk) throw new Error(`chunk fetch failed: ${error?.message}`);

  const stored = chunk.embedding as unknown;
  const storedVec: number[] = typeof stored === "string" ? JSON.parse(stored) : (stored as number[]);

  console.log(`Target chunk (confirmed Bosnian, "Pravilnik o kućnom redu"): ${chunk.text.slice(0, 100).replace(/\n/g, " ")}...\n`);

  for (const q of QUERIES) {
    const [qEmb] = await embedTextsLocal([q.text]);
    const sim = cosine(qEmb, storedVec);
    console.log(`[${q.lang}] "${q.text}"\n    cosine=${sim.toFixed(4)} ${sim >= 0.6 ? "PASSES 0.6" : "BELOW 0.6"}`);
  }
}

main().catch((err) => {
  console.error("[Diag] Fatal:", err);
  process.exitCode = 1;
});
