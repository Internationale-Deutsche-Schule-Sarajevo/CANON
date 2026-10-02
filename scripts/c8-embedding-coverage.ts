/**
 * C-8 read-only check — document_chunks embedding coverage (active chunks
 * only, matching P-8's "WHERE document_status = 'active'" rule and what
 * retriever.ts actually queries). No writes.
 *
 * Run: npx tsx --env-file=.env scripts/c8-embedding-coverage.ts
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";

type QueryBuilder = ReturnType<ReturnType<typeof createSupabaseDirectAdmin>["from"]>;

async function count(filters: (q: QueryBuilder) => QueryBuilder): Promise<number> {
  const supabase = createSupabaseDirectAdmin();
  let q = supabase.from("document_chunks").select("*", { count: "exact", head: true });
  q = filters(q);
  const { count: n, error } = await q;
  if (error) throw new Error(error.message);
  return n ?? 0;
}

async function main() {
  const totalActive = await count((q) => q.eq("document_status", "active"));
  const nullEmbeddingActive = await count((q) =>
    q.eq("document_status", "active").is("embedding", null),
  );
  const validEmbeddingActive = await count((q) =>
    q.eq("document_status", "active").not("embedding", "is", null),
  );

  const totalAll = await count((q) => q);
  const nullEmbeddingAll = await count((q) => q.is("embedding", null));
  const validEmbeddingAll = await count((q) => q.not("embedding", "is", null));

  console.log("=== document_chunks WHERE document_status='active' (what retriever.ts queries) ===");
  console.log(`  total:            ${totalActive}`);
  console.log(`  embedding NULL:   ${nullEmbeddingActive}`);
  console.log(`  embedding valid:  ${validEmbeddingActive}`);
  console.log(`  coverage:         ${((validEmbeddingActive / totalActive) * 100).toFixed(1)}%`);

  console.log("\n=== document_chunks ALL statuses (for reference) ===");
  console.log(`  total:            ${totalAll}`);
  console.log(`  embedding NULL:   ${nullEmbeddingAll}`);
  console.log(`  embedding valid:  ${validEmbeddingAll}`);
}

main().catch((err) => {
  console.error("[C8] Fatal:", err);
  process.exitCode = 1;
});
