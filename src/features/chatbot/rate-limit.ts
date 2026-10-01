/**
 * Chatbot rate limiting — O-8 step 2: "20 messages/user/hour".
 * Sliding window, keyed by public.users.id (not IP — a school-issued account
 * is the right unit to limit, and matches how every other per-user quota in
 * this app is scoped).
 *
 * Backed by Supabase (chatbot_rate_limits table + check_chatbot_rate_limit()
 * RPC — see migrations/20260817_chatbot_rate_limits.sql), not Upstash Redis.
 * Upstash was dropped because the Redis host was intermittently unreachable
 * in practice (see scripts/test-chatbot-pipeline-no-ratelimit.ts, written
 * specifically to bypass it) and Supabase is already a hard dependency for
 * every other part of this pipeline — one fewer external service that can
 * take the chatbot down.
 *
 * Fails OPEN: if the rate-limit check itself errors (DB down, RPC missing,
 * network blip), the request is allowed through and the error is logged,
 * never thrown. A broken rate limiter must not take down the whole chatbot —
 * the worst case of failing open is a user sends more than 20 messages in an
 * outage window, which is an acceptable trade against refusing every teacher
 * service-wide because of an unrelated infra hiccup.
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";

const LIMIT = 20;
const WINDOW_SECONDS = 60 * 60;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
};

type RpcRow = { allowed: boolean; remaining: number; reset_at: string };

export async function checkChatbotRateLimit(userId: string): Promise<RateLimitResult> {
  try {
    const supabase = createSupabaseDirectAdmin();
    const { data, error } = await supabase
      .rpc("check_chatbot_rate_limit", {
        p_user_id: userId,
        p_limit: LIMIT,
        p_window_seconds: WINDOW_SECONDS,
      })
      .single<RpcRow>();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("check_chatbot_rate_limit returned no row");

    return {
      allowed: data.allowed,
      remaining: data.remaining,
      resetAtMs: new Date(data.reset_at).getTime(),
    };
  } catch (err) {
    console.error(
      `[ChatbotRateLimit] check failed, failing open (request allowed): ${(err as Error).message}`,
    );
    return { allowed: true, remaining: LIMIT, resetAtMs: Date.now() + WINDOW_SECONDS * 1000 };
  }
}
