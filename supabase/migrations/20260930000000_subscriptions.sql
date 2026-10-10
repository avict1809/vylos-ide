-- Paid plans (Root, Sprout, Canopy), bought through Polar on vylos-web.
--
-- vylos-web's /api/webhooks/polar receives Polar's subscription webhooks and
-- records each one here through record_polar_subscription, using the service
-- role. Accounts can read their own rows (the app and the site show the plan
-- from them); nobody can write them through the API.

create table if not exists public.subscriptions (
    polar_subscription_id text primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    plan text not null check (plan in ('root', 'sprout', 'canopy')),
    billing text not null check (billing in ('monthly', 'yearly')),
    -- Polar's status: incomplete, incomplete_expired, trialing, active,
    -- past_due, canceled, unpaid, paused
    status text not null,
    polar_customer_id text not null,
    polar_product_id text not null,
    -- When the subscription began; monthly credit windows are counted from here
    started_at timestamptz,
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    canceled_at timestamptz,
    ended_at timestamptz,
    -- Polar's modified_at, so a late, out-of-order webhook can't overwrite a newer one
    polar_modified_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;
revoke all on table public.subscriptions from anon, authenticated;
grant select on table public.subscriptions to authenticated;

drop policy if exists "Accounts can read their own subscriptions" on public.subscriptions;
create policy "Accounts can read their own subscriptions"
    on public.subscriptions for select
    to authenticated
    using (user_id = auth.uid());

-- Records one subscription as Polar last described it. Called by the webhook
-- for every subscription.* event; an event older than what's stored is ignored.
create or replace function public.record_polar_subscription(
    p_subscription_id text,
    p_user_id uuid,
    p_plan text,
    p_billing text,
    p_status text,
    p_customer_id text,
    p_product_id text,
    p_started_at timestamptz,
    p_current_period_start timestamptz,
    p_current_period_end timestamptz,
    p_cancel_at_period_end boolean,
    p_canceled_at timestamptz,
    p_ended_at timestamptz,
    p_modified_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
    insert into public.subscriptions as s (
        polar_subscription_id, user_id, plan, billing, status, polar_customer_id, polar_product_id, started_at,
        current_period_start, current_period_end, cancel_at_period_end, canceled_at, ended_at, polar_modified_at
    )
    values (
        p_subscription_id, p_user_id, p_plan, p_billing, p_status, p_customer_id, p_product_id, p_started_at,
        p_current_period_start, p_current_period_end, p_cancel_at_period_end, p_canceled_at, p_ended_at, p_modified_at
    )
    on conflict (polar_subscription_id) do update set
        user_id = excluded.user_id,
        plan = excluded.plan,
        billing = excluded.billing,
        status = excluded.status,
        polar_customer_id = excluded.polar_customer_id,
        polar_product_id = excluded.polar_product_id,
        started_at = coalesce(excluded.started_at, s.started_at),
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        canceled_at = excluded.canceled_at,
        ended_at = excluded.ended_at,
        polar_modified_at = excluded.polar_modified_at,
        updated_at = now()
    where s.polar_modified_at is null
        or excluded.polar_modified_at is null
        or excluded.polar_modified_at >= s.polar_modified_at;
end;
$$;

revoke execute on function public.record_polar_subscription(
    text, uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_polar_subscription(
    text, uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz
) to service_role;

-- The plan an account has right now, or nothing for Seed. Active and trialing
-- subscriptions count, and so does past_due while Polar retries the payment.
create or replace view public.current_plans
with (security_invoker = true) as
select distinct on (user_id)
    user_id, plan, billing, status, current_period_end, cancel_at_period_end, polar_subscription_id
from public.subscriptions
where status in ('active', 'trialing', 'past_due')
order by user_id, current_period_end desc nulls last;

grant select on public.current_plans to authenticated;
