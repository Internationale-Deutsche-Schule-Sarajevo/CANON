import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("documents")
    .select("id, filename, original_name, metadata, status")
    .or("filename.ilike.%I-IV%,filename.ilike.%V-IX%,filename.ilike.%razred%,filename.ilike.%skolarina%,filename.ilike.%raspored%");
  if (error) throw error;
  for (const d of data ?? []) {
    console.log(d.id, "|", d.filename, "|", d.status, "|", JSON.stringify(d.metadata));
  }
  console.log("total:", data?.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
