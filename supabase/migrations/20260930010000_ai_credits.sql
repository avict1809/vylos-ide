-- Credits: what paid plans spend on Vylos AI (Gemini behind ai-generate,
-- ai-live-token and learning). Enforced by _shared/guard.ts only when the
-- BILLING_ENFORCED secret is "true"; until then these just sit ready.
--
-- Each plan gets a monthly allowance, with a larger first month. Monthly
-- windows count from when the subscription started, so a yearly plan still
-- gets its credits month by month. Unused credits don't carry over.
--
-- Amounts are in millicredits (1 credit = 1000) so small costs stay whole
-- numbers. The per-request cost is set in guard.ts (CREDIT_COST_*_MILLI).
-- Keep the allowances in step with vylos-web lib/plans.ts.

create or replace function public.plan_credit_allowance(p_plan text, p_first_month boolean)
returns bigint
language sql
immutable
set search_path = ''
as $$
    select 1000::bigint * case p_plan
        when 'root' then case when p_first_month then 15 else 10 end
        when 'sprout' then case when p_first_month then 30 else 20 end
        when 'canopy' then case when p_first_month then 60 else 40 end
        else 0
    end
$$;

-- What each account has spent in each monthly window
create table if not exists public.credit_usage (
    user_id uuid not null references auth.users (id) on delete cascade,
    period_start timestamptz not null,
    used_milli bigint not null default 0 check (used_milli >= 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, period_start)
);

alter table public.credit_usage enable row level security;
revoke all on table public.credit_usage from anon, authenticated;
grant select on table public.credit_usage to authenticated;

drop policy if exists "Accounts can read their own credit usage" on public.credit_usage;
create policy "Accounts can read their own credit usage"
    on public.credit_usage for select
    to authenticated
    using (user_id = auth.uid());

-- The current monthly credit window for an account's plan, or no row on Seed.
create or replace function public.credit_window(p_user_id uuid, p_now timestamptz default now())
returns table (
    plan text,
    voice_only boolean,
    period_start timestamptz,
    period_end timestamptz,
    allowance_milli bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
    sub record;
    anchor timestamptz;
    months integer;
    window_start timestamptz;
    first_month boolean;
begin
    select s.plan, s.started_at, s.current_period_start
      into sub
      from public.subscriptions s
     where s.user_id = p_user_id
       and s.status in ('active', 'trialing', 'past_due')
     order by s.current_period_end desc nulls last
     limit 1;
    if not found then
        return;
    end if;

    anchor := coalesce(sub.started_at, sub.current_period_start, p_now);
    months := greatest(0, (extract(year from age(p_now, anchor)) * 12 + extract(month from age(p_now, anchor)))::integer);
    window_start := anchor + make_interval(months => months);

    -- The intro allowance is for an account's first month ever, not every new subscription
    first_month := months = 0 and not exists (
        select 1 from public.subscriptions older
         where older.user_id = p_user_id
           and coalesce(older.started_at, older.created_at) < anchor
    );

    plan := sub.plan;
    voice_only := sub.plan = 'root';
    period_start := window_start;
    period_end := window_start + interval '1 month';
    allowance_milli := public.plan_credit_allowance(sub.plan, first_month);
    return next;
end;
$$;

-- Spends credits for one AI request. Returns:
--   'ok'            spent
--   'no_plan'       Seed: no Vylos AI credits
--   'not_included'  the plan doesn't cover this kind (Root is voice only)
--   'out_of_credits' this month's credits are used up
create or replace function public.consume_ai_credits(p_user_id uuid, p_kind text, p_cost_milli integer)
returns text
language plpgsql
set search_path = ''
as $$
declare
    w record;
    used bigint;
begin
    select * into w from public.credit_window(p_user_id);
    if not found then
        return 'no_plan';
    end if;
    if w.voice_only and p_kind <> 'voice' then
        return 'not_included';
    end if;
    if p_cost_milli > w.allowance_milli then
        return 'out_of_credits';
    end if;

    -- Atomic: parallel requests can't spend past the allowance
    insert into public.credit_usage as u (user_id, period_start, used_milli)
    values (p_user_id, w.period_start, p_cost_milli)
    on conflict (user_id, period_start) do update
        set used_milli = u.used_milli + p_cost_milli, updated_at = now()
        where u.used_milli + p_cost_milli <= w.allowance_milli
    returning u.used_milli into used;

    if used is null then
        return 'out_of_credits';
    end if;
    return 'ok';
end;
$$;

revoke execute on function public.consume_ai_credits(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_credits(uuid, text, integer) to service_role;
revoke execute on function public.credit_window(uuid, timestamptz) from public, anon;
grant execute on function public.credit_window(uuid, timestamptz) to authenticated, service_role;

-- The signed-in account's credits this month, for the app and the site.
-- No row on Seed.
create or replace function public.my_credits()
returns table (
    plan text,
    voice_only boolean,
    allowance_milli bigint,
    used_milli bigint,
    resets_at timestamptz
)
language sql
stable
set search_path = ''
as $$
    select w.plan, w.voice_only, w.allowance_milli, coalesce(u.used_milli, 0), w.period_end
      from public.credit_window(auth.uid()) w
      left join public.credit_usage u
        on u.user_id = auth.uid() and u.period_start = w.period_start
$$;

revoke execute on function public.my_credits() from public, anon;
grant execute on function public.my_credits() to authenticated;
