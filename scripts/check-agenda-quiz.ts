import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("id, question, explanation, options")
    .eq("chapter_id", "de22f60c-53d7-49e6-b335-9774ba5c09f2");
  if (error) throw error;
  console.log("count:", data?.length ?? 0);
  const blob = JSON.stringify(data ?? []);
  const bad = /nekeda|prelijevanje ruku/i.test(blob);
  console.log("mentions wrong OCR text anywhere:", bad);
  if (bad) {
    for (const q of data ?? []) {
      if (/nekeda|prelijevanje ruku/i.test(JSON.stringify(q))) {
        console.log(" -", q.question, JSON.stringify(q.options));
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
