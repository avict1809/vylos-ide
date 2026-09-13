-- Per-user daily request counters for the AI Edge Functions (ai-generate,
-- ai-live-token). Only those functions touch this, using the service role:
-- RLS with no policies plus the revokes below keep app users out entirely,
-- so nobody can read or reset their own counter.
create table if not exists public.ai_usage (
    user_id uuid not null references auth.users (id) on delete cascade,
    day date not null,
    kind text not null,
    count integer not null default 0,
    primary key (user_id, day, kind)
);

alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated;

-- Counts one request of `p_kind` for today (UTC) and returns true if it was
-- within `p_limit`. Atomic, so parallel requests cannot race past the limit.
create or replace function public.consume_ai_quota(p_user_id uuid, p_kind text, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    used integer;
begin
    if p_limit < 1 then
        return false;
    end if;

    insert into public.ai_usage as u (user_id, day, kind, count)
    values (p_user_id, (now() at time zone 'utc')::date, p_kind, 1)
    on conflict (user_id, day, kind)
        do update set count = u.count + 1
        where u.count < p_limit
    returning u.count into used;

    return used is not null;
end;
$$;

revoke execute on function public.consume_ai_quota(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer) to service_role;
