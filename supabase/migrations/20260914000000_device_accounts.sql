-- Which accounts have signed in on which device, to stop one person creating
-- many accounts for more free AI. A device may be the first device of at most
-- 2 accounts ("registered" there), and at most 4 accounts may sign in on it.
-- Accounts are created in the browser, so an account counts as registered on
-- the device where it is first used, not where the sign-up form was filled in.
--
-- device_hash is a SHA-256 of the OS machine id (see electron/device.ts), so
-- the raw id never leaves the machine. Only the Edge Functions touch this
-- table, using the service role.
create table if not exists public.device_accounts (
    device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
    user_id uuid not null references auth.users (id) on delete cascade,
    -- True for the device this account was first used on
    first_device boolean not null,
    created_at timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    primary key (device_hash, user_id)
);

create index if not exists device_accounts_user_id on public.device_accounts (user_id);

alter table public.device_accounts enable row level security;
revoke all on table public.device_accounts from anon, authenticated;

-- Records that p_user_id signed in on p_device, if the device's limits allow it.
-- Returns 'ok', 'registration_limit' (the device already has p_max_registered
-- accounts that started there) or 'account_limit' (p_max_accounts accounts have
-- already signed in there). An account already known on the device is always ok.
create or replace function public.register_device(
    p_user_id uuid,
    p_device text,
    p_max_registered integer,
    p_max_accounts integer
)
returns text
language plpgsql
set search_path = ''
as $$
declare
    is_new_account boolean;
    accounts integer;
    registered integer;
begin
    -- One sign-in at a time per device and per account, so parallel requests
    -- can't both slip under a limit. Always device first, then account.
    perform pg_advisory_xact_lock(hashtextextended('device:' || p_device, 0));
    perform pg_advisory_xact_lock(hashtextextended('user:' || p_user_id::text, 0));

    update public.device_accounts
        set last_seen = now()
        where device_hash = p_device and user_id = p_user_id;
    if found then
        return 'ok';
    end if;

    select count(*) into accounts from public.device_accounts where device_hash = p_device;
    if accounts >= p_max_accounts then
        return 'account_limit';
    end if;

    is_new_account := not exists (select 1 from public.device_accounts where user_id = p_user_id);
    if is_new_account then
        select count(*) into registered
            from public.device_accounts
            where device_hash = p_device and first_device;
        if registered >= p_max_registered then
            return 'registration_limit';
        end if;
    end if;

    insert into public.device_accounts (device_hash, user_id, first_device)
        values (p_device, p_user_id, is_new_account);
    return 'ok';
end;
$$;

revoke execute on function public.register_device(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.register_device(uuid, text, integer, integer) to service_role;
