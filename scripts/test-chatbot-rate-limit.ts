/**
 * Verifies the Supabase-backed chatbot rate limiter
 * (src/features/chatbot/rate-limit.ts + check_chatbot_rate_limit RPC):
 *   1. Messages 1-20 in an hour are allowed, with `remaining` counting down.
 *   2. Message 21 in the same hour is rejected (allowed=false).
 *   3. The limiter fails OPEN when the backing call errors (bad RPC/DB
 *      unreachable), instead of throwing and taking the chatbot down.
 *
 * Uses a real user row (service-role FK requires one) and cleans up every
 * row it inserts into chatbot_rate_limits afterwards. Safe to re-run.
 */
import { createSupabaseDirectAdmin } from "../src/lib/db/supabase";
import { checkChatbotRateLimit } from "../src/features/chatbot/rate-limit";

async function main() {
  const supabase = createSupabaseDirectAdmin();
  const { data: user, error } = await supabase.from("users").select("id, email").limit(1).single();
  if (error || !user) throw new Error(`no user found to test with: ${error?.message}`);
  console.log(`[Test] Using user ${user.email} (${user.id})`);

  // Clean slate: remove any pre-existing rate-limit rows for this user so
  // the test's 21-message count isn't polluted by earlier runs/real usage.
  await supabase.from("chatbot_rate_limits").delete().eq("user_id", user.id);

  let failed = false;

  console.log("\n[Test 1] 20 messages in an hour should all be allowed, 21st rejected");
  for (let i = 1; i <= 21; i++) {
    const result = await checkChatbotRateLimit(user.id);
    const expectAllowed = i <= 20;
    const ok = result.allowed === expectAllowed;
    if (!ok) failed = true;
    console.log(
      `  msg ${String(i).padStart(2)}: allowed=${result.allowed} remaining=${result.remaining} ` +
        `resetAt=${new Date(result.resetAtMs).toISOString()} ${ok ? "OK" : "FAIL (expected allowed=" + expectAllowed + ")"}`,
    );
  }

  const { count: rowCount } = await supabase
    .from("chatbot_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  console.log(`[Test 1] rows persisted for user: ${rowCount} (expected 20 — the 21st call must not insert)`);
  if (rowCount !== 20) failed = true;

  console.log("\n[Test 2] fail-open: a real backend error must return allowed=true, not throw");
  {
    // Sanity check: confirm this actually errors server-side (invalid uuid
    // input) rather than silently succeeding, so the fail-open assertion
    // below is testing what it claims to.
    const badSupabase = createSupabaseDirectAdmin();
    const { error: rpcError } = await badSupabase.rpc("check_chatbot_rate_limit", {
      p_user_id: "not-a-valid-uuid",
    });
    console.log(`  sanity: malformed userId errors at the RPC layer: ${!!rpcError} (${rpcError?.message})`);
    if (!rpcError) failed = true;

    // Exercise the real fail-open path through the public function.
    let threw = false;
    let result: Awaited<ReturnType<typeof checkChatbotRateLimit>> | undefined;
    try {
      result = await checkChatbotRateLimit("not-a-valid-uuid");
    } catch {
      threw = true;
    }
    const ok = !threw && result?.allowed === true;
    if (!ok) failed = true;
    console.log(
      `  checkChatbotRateLimit("not-a-valid-uuid") -> threw=${threw} allowed=${result?.allowed} ` +
        `${ok ? "OK (failed open, did not throw)" : "FAIL"}`,
    );
  }

  console.log("\n[Cleanup] removing test rows");
  await supabase.from("chatbot_rate_limits").delete().eq("user_id", user.id);

  if (failed) {
    console.error("\n[Test] FAILED");
    process.exitCode = 1;
  } else {
    console.log("\n[Test] PASSED");
  }
}

main().catch((err) => {
  console.error("[Test] Fatal:", err);
  process.exitCode = 1;
});
