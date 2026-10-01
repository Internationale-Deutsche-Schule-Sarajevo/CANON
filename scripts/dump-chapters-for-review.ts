/**
 * Read-only dump — full stored content of the 5 director-review chapters
 * plus is_published confirmation for eabd3476. No writes.
 *
 * Run: npx tsx --env-file=.env scripts/dump-chapters-for-review.ts
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

const REVIEW_IDS = [
  "46876ce3-cc86-4675-b16d-0af7b0c29558",
  "de22f60c-53d7-49e6-b335-9774ba5c09f2",
  "36bc0bec-45f9-4a08-b176-23d3c3d2031e",
  "bbbc0750-4cec-4d2c-9283-337cb1f57840",
  "398e9f6d-0637-4552-9953-7dfde6614040",
];

async function main() {
  const supabase = createSupabaseDirectAdmin();

  for (const id of REVIEW_IDS) {
    const { data: chapter, error } = await supabase
      .from("handbook_chapters")
      .select("id, title, is_published, content, generated_at")
      .eq("id", id)
      .single();
    if (error) throw new Error(`${id}: ${error.message}`);

    console.log(`\n${"#".repeat(80)}`);
    console.log(`# ${chapter.title}  (${chapter.id})`);
    console.log(`# is_published=${chapter.is_published}  generated_at=${chapter.generated_at}  length=${chapter.content.length}`);
    console.log("#".repeat(80));
    console.log(chapter.content);
  }

  const { data: eabd } = await supabase
    .from("handbook_chapters")
    .select("id, title, is_published")
    .eq("id", "eabd3476-63d9-414e-ac6f-953c81d16268")
    .single();
  console.log(`\n${"#".repeat(80)}`);
  console.log(`# eabd3476 confirm: ${JSON.stringify(eabd)}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exitCode = 1;
});
