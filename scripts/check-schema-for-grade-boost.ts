import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

const CHUNK_ID = "b4a226a0-4bf8-4595-aa57-57a470ad24ef"; // I-IV chunk from memory

async function main() {
  const supabase = createSupabaseDirectAdmin();

  const { data: chunk, error: e1 } = await supabase
    .from("document_chunks")
    .select("*")
    .eq("id", CHUNK_ID)
    .single();
  if (e1) throw e1;
  console.log("=== document_chunks columns/row (I-IV chunk) ===");
  console.log(Object.keys(chunk));
  console.log({ document_id: chunk.document_id, chunk_index: chunk.chunk_index, text: String(chunk.text).slice(0, 200) });

  const { data: doc, error: e2 } = await supabase
    .from("documents")
    .select("*")
    .eq("id", chunk.document_id)
    .single();
  if (e2) throw e2;
  console.log("\n=== documents columns/row ===");
  console.log(Object.keys(doc));
  console.log(doc);

  const { data: chapter, error: e3 } = await supabase
    .from("handbook_chapters")
    .select("*")
    .eq("document_id", chunk.document_id)
    .limit(1);
  if (e3) console.log("handbook_chapters query error (maybe no FK named document_id):", e3.message);
  else {
    console.log("\n=== handbook_chapters columns/row (if linked by document_id) ===");
    console.log(chapter?.[0] ? Object.keys(chapter[0]) : "none found");
    console.log(chapter?.[0]);
  }

  // Search for documents whose title/filename mentions I-IV or V-IX, to see naming convention
  const { data: allDocs, error: e4 } = await supabase
    .from("documents")
    .select("id, title, filename")
    .or("title.ilike.%I-IV%,filename.ilike.%I-IV%,title.ilike.%V-IX%,filename.ilike.%V-IX%");
  if (e4) console.log("filter query error:", e4.message);
  else {
    console.log("\n=== documents matching I-IV / V-IX in title/filename ===");
    console.log(allDocs);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
