/**
 * C-10 read-only check — how many active document_chunks rows still carry a
 * raw YAML frontmatter block (---\n...\n---\n) that retriever.ts would
 * return as-is (unlike generator.ts, which strips it before prompting).
 * No writes.
 *
 * Run: npx tsx --env-file=.env scripts/c10-frontmatter-scope.ts
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n+/;

async function main() {
  const supabase = createSupabaseDirectAdmin();

  const PAGE_SIZE = 1000;
  let from = 0;
  let totalActive = 0;
  let withFrontmatter = 0;
  const examples: { document_id: string; chunk_index: number }[] = [];

  for (;;) {
    const { data, error } = await supabase
      .from("document_chunks")
      .select("document_id, chunk_index, text")
      .eq("document_status", "active")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data) {
      totalActive++;
      if (FRONTMATTER_RE.test(row.text)) {
        withFrontmatter++;
        if (examples.length < 5) examples.push({ document_id: row.document_id, chunk_index: row.chunk_index });
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`Active chunks total:            ${totalActive}`);
  console.log(`Active chunks WITH frontmatter: ${withFrontmatter}`);
  console.log(`Examples (document_id, chunk_index):`, examples);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exitCode = 1;
});
