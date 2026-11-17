-- The admin panel on the website (vylos-web /admin): who may use it, what
-- they changed, and one call that gathers the numbers it shows.
--
-- Nothing here is reachable by learners. The website checks the signed-in
-- user against public.admins with the service role, then reads and writes
-- with the service role. Make someone an admin from the SQL editor:
--
--     insert into public.admins (user_id, note)
--     select id, 'owner' from auth.users where email = 'you@example.com';

create table if not exists public.admins (
    user_id uuid primary key references auth.users (id) on delete cascade,
    note text,
    created_at timestamptz not null default now()
);

-- Every change made from the panel, kept when the admin is removed
create table if not exists public.admin_audit_log (
    id bigint generated always as identity primary key,
    admin_id uuid references auth.users (id) on delete set null,
    action text not null,
    target text,
    detail jsonb,
    created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created on public.admin_audit_log (created_at desc);

alter table public.admins enable row level security;
alter table public.admin_audit_log enable row level security;
-- No policies: only the service role (and the dashboard) can see these
revoke all on table public.admins, public.admin_audit_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_overview(): everything the panel's overview shows, in one round trip
-- ---------------------------------------------------------------------------

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    result jsonb;
    inquiries jsonb := '[]';
begin
    -- education_inquiries comes from vylos-web/supabase/education.sql and may
    -- not exist in every project
    if to_regclass('public.education_inquiries') is not null then
        execute $q$
            select coalesce(jsonb_agg(i order by i.created_at desc), '[]')
            from (
                select id, institution, institution_type, country, contact_name, email, seats, created_at
                from public.education_inquiries order by created_at desc limit 10
            ) i
        $q$ into inquiries;
    end if;

    select jsonb_build_object(
        'generated_at', now(),
        'users', jsonb_build_object(
            'total', (select count(*) from auth.users),
            'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
            'new_30d', (select count(*) from auth.users where created_at > now() - interval '30 days')
        ),
        'signups_by_day', (
            select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(u.n, 0)) order by d.day), '[]')
            from generate_series(current_date - 29, current_date, interval '1 day') as d(day)
            left join (
                select created_at::date as day, count(*) as n from auth.users
                where created_at > current_date - 30 group by 1
            ) u on u.day = d.day::date
        ),
        'activity', jsonb_build_object(
            'active_today', (select count(distinct user_id) from public.learning_days where day = current_date),
            'active_7d', (select count(distinct user_id) from public.learning_days where day > current_date - 7),
            'active_30d', (select count(distinct user_id) from public.learning_days where day > current_date - 30),
            'minutes_7d', (select coalesce(sum(minutes), 0) from public.learning_days where day > current_date - 7),
            'xp_7d', (select coalesce(sum(amount), 0) from public.xp_transactions where created_at > now() - interval '7 days')
        ),
        'active_by_day', (
            select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(a.n, 0)) order by d.day), '[]')
            from generate_series(current_date - 29, current_date, interval '1 day') as d(day)
            left join (
                select day, count(distinct user_id) as n from public.learning_days
                where day > current_date - 30 group by 1
            ) a on a.day = d.day::date
        ),
        'ai_usage_7d', (
            select coalesce(jsonb_object_agg(kind, n), '{}')
            from (select kind, sum(count) as n from public.ai_usage where day > current_date - 7 group by kind) k
        ),
        'subscriptions', (
            select coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'billing', billing, 'count', n) order by plan, billing), '[]')
            from (
                select plan, billing, count(*) as n from public.subscriptions
                where status in ('active', 'trialing', 'past_due') group by plan, billing
            ) s
        ),
        'courses', jsonb_build_object(
            'published', (select count(*) from public.courses where published),
            'unpublished', (select count(*) from public.courses where not published),
            'top', (
                select coalesce(jsonb_agg(t order by t.enrolled desc), '[]')
                from (
                    select e.path_id as id, p.title, count(*) as enrolled, count(e.completed_at) as completed
                    from public.course_enrollments e join public.learning_paths p on p.id = e.path_id
                    group by e.path_id, p.title order by count(*) desc limit 10
                ) t
            )
        ),
        'certificates', jsonb_build_object(
            'total', (select count(*) from public.certificates where status = 'valid'),
            'last_30d', (select count(*) from public.certificates where status = 'valid' and issued_at > now() - interval '30 days')
        ),
        'projects_awaiting_review', (select count(*) from public.project_submissions where status = 'submitted'),
        'integrity', jsonb_build_object(
            'open', (select count(*) from public.integrity_flags where resolved_at is null),
            'recent', (
                select coalesce(jsonb_agg(f order by f.created_at desc), '[]')
                from (
                    select f.id, f.kind, f.detail, f.source_id, f.created_at, p.handle
                    from public.integrity_flags f left join public.profiles p on p.id = f.user_id
                    where f.resolved_at is null order by f.created_at desc limit 10
                ) f
            )
        ),
        'recent_signups', (
            select coalesce(jsonb_agg(r order by r.created_at desc), '[]')
            from (
                select u.id, u.email, u.created_at, u.last_sign_in_at, p.handle, p.display_name
                from auth.users u left join public.profiles p on p.id = u.id
                order by u.created_at desc limit 10
            ) r
        ),
        'education_inquiries', inquiries,
        'recent_admin_actions', (
            select coalesce(jsonb_agg(a order by a.created_at desc), '[]')
            from (
                select l.action, l.target, l.created_at, u.email as admin
                from public.admin_audit_log l left join auth.users u on u.id = l.admin_id
                order by l.created_at desc limit 10
            ) a
        )
    ) into result;
    return result;
end;
$$;

revoke execute on function public.admin_overview() from public, anon, authenticated;
grant execute on function public.admin_overview() to service_role;

-- Learners enrolled per course, for the panel's course list: { "<course id>": n }
create or replace function public.admin_course_enrollments()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(jsonb_object_agg(path_id, n), '{}')
    from (select path_id, count(*) as n from public.course_enrollments group by path_id) e;
$$;

revoke execute on function public.admin_course_enrollments() from public, anon, authenticated;
grant execute on function public.admin_course_enrollments() to service_role;
