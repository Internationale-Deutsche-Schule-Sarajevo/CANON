import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
async function main() {
  const supabase = createSupabaseDirectAdmin();
  const ids = [
    "93799ac1-3b48-4ce9-a954-0e80dd22c29c", // Agenda
    "8a45c97a-c4fd-4e2c-9e11-72552520c5f8", // Rjesenje
    "c1a0b320-8f97-4822-a4ea-f1386824bfb6", // Pravila I-IV
    "df4efaf7-12f3-488b-87fb-b51e3ccc3dc1", // Pravila V-IX
  ];
  const { data, error } = await supabase
    .from("documents")
    .select("id, filename, storage_path, mime_type, status, metadata")
    .in("id", ids);
  if (error) throw error;
  for (const d of data ?? []) console.log(JSON.stringify(d, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
