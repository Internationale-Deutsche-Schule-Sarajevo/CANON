-- Migration: chatbot_rate_limits
-- Date: 2026-08-17
-- Description: Replaces Upstash Redis rate limiting for the chatbot pipeline
--   (src/features/chatbot/rate-limit.ts) with a Supabase-native sliding-window
--   limiter. Upstash was dropped because the Redis host was intermittently
--   unreachable in practice (see scripts/test-chatbot-pipeline-no-ratelimit.ts,
--   which was written specifically to bypass it) and because Supabase is
--   already a hard dependency for every other part of this pipeline — one
--   fewer external service that can take the chatbot down.
--   O-8 step 2: 20 messages/user/hour, keyed by public.users.id.
-- Rollback:
--   drop function if exists check_chatbot_rate_limit(uuid, int, int);
--   drop table if exists chatbot_rate_limits;

create table if not exists chatbot_rate_limits (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_chatbot_rate_limits_user_created
  on chatbot_rate_limits (user_id, created_at desc);

-- RLS on, no policies: matches chatbot_conversations/chatbot_turns — this
-- table is only ever touched via createSupabaseDirectAdmin() (service role,
-- bypasses RLS), never from a browser client.
alter table chatbot_rate_limits enable row level security;

-- Atomically checks-and-consumes one slot in the sliding window for
-- p_user_id. Returns whether the request is allowed, how many requests
-- remain in the current window, and when the window next has room.
--
-- pg_advisory_xact_lock serializes concurrent calls for the same user so two
-- simultaneous requests can't both read count=19 and both be let through —
-- the race Upstash's atomic Redis INCR handled for free and a plain
-- count-then-insert in Postgres would not.
create or replace function check_chatbot_rate_limit(
  p_user_id uuid,
  p_limit int default 20,
  p_window_seconds int default 3600
) returns table(allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
as $$
declare
  v_window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  v_count int;
  v_oldest_in_window timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Housekeeping: drop rows that have aged out of every window we'd ever
  -- query (24h of headroom beyond the 1h window), so the table doesn't grow
  -- unbounded. Piggybacks on a call that's already writing for this user
  -- instead of needing a separate cron job.
  delete from chatbot_rate_limits
    where user_id = p_user_id
      and created_at < now() - interval '24 hours';

  select count(*), min(created_at)
    into v_count, v_oldest_in_window
    from chatbot_rate_limits
    where user_id = p_user_id
      and created_at >= v_window_start;

  if v_count >= p_limit then
    return query select
      false,
      0,
      coalesce(v_oldest_in_window, now()) + make_interval(secs => p_window_seconds);
    return;
  end if;

  insert into chatbot_rate_limits (user_id) values (p_user_id);

  return query select
    true,
    (p_limit - v_count - 1),
    coalesce(v_oldest_in_window, now()) + make_interval(secs => p_window_seconds);
end;
$$;
