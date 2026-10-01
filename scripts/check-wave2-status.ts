import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

async function main() {
  const supabase = createSupabaseDirectAdmin();

  const { count: totalEng, error: e1 } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("search_source_lang", "eng");
  if (e1) throw e1;

  const { count: doneEng, error: e2 } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("search_source_lang", "eng")
    .not("search_translated_at", "is", null);
  if (e2) throw e2;

  const { count: totalDeu, error: e3 } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("search_source_lang", "deu")
    .not("search_translated_at", "is", null);
  if (e3) throw e3;

  const { data: latest, error: e4 } = await supabase
    .from("document_chunks")
    .select("id, search_translated_at")
    .eq("search_source_lang", "eng")
    .not("search_translated_at", "is", null)
    .order("search_translated_at", { ascending: false })
    .limit(5);
  if (e4) throw e4;

  const { data: earliest, error: e5 } = await supabase
    .from("document_chunks")
    .select("id, search_translated_at")
    .eq("search_source_lang", "eng")
    .not("search_translated_at", "is", null)
    .order("search_translated_at", { ascending: true })
    .limit(3);
  if (e5) throw e5;

  console.log("English (eng) chunks flagged for bridge total:", totalEng);
  console.log("English (eng) chunks with search_translated_at set:", doneEng);
  console.log("German (deu) chunks with search_translated_at set (wave1 check):", totalDeu);
  console.log("Earliest 3 timestamps:", earliest);
  console.log("Latest 5 timestamps:", latest);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
