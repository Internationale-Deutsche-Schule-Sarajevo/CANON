import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
async function main() {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, chunk_index, document_status")
    .is("embedding", null);
  if (error) throw error;
  for (const r of data ?? []) console.log(JSON.stringify(r));
}
main().catch((e) => { console.error(e); process.exit(1); });
