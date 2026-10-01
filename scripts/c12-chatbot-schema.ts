import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
async function main() {
  const supabase = createSupabaseDirectAdmin();
  for (const table of ["chatbot_conversations", "chatbot_turns"]) {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    console.log(`=== ${table} ===`);
    if (error) console.log("error:", error.message);
    else console.log(data && data.length > 0 ? Object.keys(data[0]) : "(0 rows — cannot infer columns from data)");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
