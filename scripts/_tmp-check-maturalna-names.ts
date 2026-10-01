import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("handbook_chapters")
    .select("id, title, content")
    .eq("id", "36bc0bec-45f9-4a08-b176-23d3c3d2031e")
    .single();
  if (error) throw error;
  console.log(`=== ${data.title} (${data.content.length} znakova) ===\n`);
  console.log(data.content);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
