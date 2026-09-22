-- Vylos learning engine: skills and mastery, the XP ledger, levels, streaks,
-- quests, achievements, rewards, certificates, leaderboards and anti-cheat.
-- Deployed with `npx supabase db push`. The course catalog it tracks (paths,
-- skills, lessons, challenges, capstones) is generated from the app's
-- curricula: `npm run catalog:sql`, then run supabase/catalog/learning-catalog.sql.
-- Safe to re-run: tables use "if not exists" and every function is
-- "create or replace".
--
-- Trust model
--  * Learners can read their own rows but never write them. Every write goes
--    through a security-definer function below, which decides how much XP an
--    activity is worth, runs the anti-cheat checks and records the evidence.
--    The client never sends an XP amount.
--  * Quizzes are graded here, against answer keys learners can't read.
--  * Challenge results come from the IDE's local test runner, so they are
--    lower-trust: they move mastery and XP, but a certificate also needs a
--    reviewed capstone and a final assessment, which only the service role
--    (an Edge Function) can record.
--  * XP and coins are append-only ledgers; balances, levels and leaderboards
--    are always computed from them. Mastery is recomputed from evidence.
--  * Nothing is public until the learner opts in (profiles.is_public,
--    profiles.show_on_leaderboards). Certificates are the exception: anyone
--    holding a certificate ID can verify it, which is what it is for.
--
-- XP amounts live in public.xp_rules and are mirrored for display in the
-- website's lib/learning.ts (XP_RULES) — keep the two in sync.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    handle text unique check (handle ~ '^[a-z0-9_]{3,24}$'),
    display_name text check (char_length(display_name) <= 60),
    avatar_url text check (avatar_url ~ '^https://'),
    bio text check (char_length(bio) <= 280),
    -- Private by default: nothing is shown publicly until the learner opts in
    is_public boolean not null default false,
    show_on_leaderboards boolean not null default false,
    daily_goal_minutes integer not null default 20 check (daily_goal_minutes in (10, 20, 30, 60)),
    timezone text not null default 'UTC',
    created_at timestamptz not null default now()
);

create or replace function public.handle_new_learner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id) values (new.id) on conflict do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
    after insert on auth.users
    for each row execute function public.handle_new_learner();

-- Accounts created before this file was run
insert into public.profiles (id) select id from auth.users on conflict do nothing;

create table if not exists public.creator_profiles (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    headline text check (char_length(headline) <= 120),
    website text check (website ~ '^https://'),
    verified boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.follows (
    follower_id uuid not null references public.profiles (id) on delete cascade,
    followee_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (follower_id, followee_id),
    check (follower_id <> followee_id)
);

-- ---------------------------------------------------------------------------
-- Catalog: paths, skills, lessons, challenges, quizzes, projects.
-- Readable by everyone, written from the dashboard or by the service role.
-- ---------------------------------------------------------------------------

create table if not exists public.learning_paths (
    id text primary key,
    subject text not null default 'programming' check (subject in ('programming', 'mathematics', 'ai')),
    title text not null,
    description text,
    -- Certificate requirements
    min_challenges integer not null default 20,
    pass_mark numeric not null default 0.7 check (pass_mark between 0 and 1),
    capstone_project_id text,
    -- Vylos Coins to unlock the course; 0 = free. Beginner courses are free,
    -- so everyone can start learning without coins.
    unlock_cost integer not null default 0 check (unlock_cost >= 0),
    created_at timestamptz not null default now()
);

create table if not exists public.skills (
    id text primary key,
    path_id text not null references public.learning_paths (id) on delete cascade,
    name text not null,
    position integer not null default 0
);

-- A skill unlocks only once every prerequisite reaches min_mastery. Prerequisites
-- may live in other paths, which is what drives "recommended next".
create table if not exists public.skill_prerequisites (
    skill_id text not null references public.skills (id) on delete cascade,
    requires_skill_id text not null references public.skills (id) on delete cascade,
    min_mastery numeric not null default 0.7 check (min_mastery between 0 and 1),
    primary key (skill_id, requires_skill_id),
    check (skill_id <> requires_skill_id)
);

create table if not exists public.course_lessons (
    id text primary key,
    path_id text not null references public.learning_paths (id) on delete cascade,
    skill_id text references public.skills (id) on delete set null,
    title text not null,
    position integer not null default 0
);

create table if not exists public.challenges (
    id text primary key,
    path_id text references public.learning_paths (id) on delete cascade,
    skill_id text not null references public.skills (id) on delete cascade,
    title text not null,
    prompt text,
    hint text,
    difficulty smallint not null default 2 check (difficulty between 1 and 5),
    kind text not null default 'coding' check (kind in ('coding', 'debugging')),
    -- A pass faster than this is treated as copied, not solved
    min_seconds integer not null default 30,
    -- Set for practice Acyrx generated for one learner's weak spots
    generated_for uuid references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now()
);

create table if not exists public.quizzes (
    id text primary key,
    path_id text not null references public.learning_paths (id) on delete cascade,
    skill_id text references public.skills (id) on delete set null,
    title text not null,
    -- [{"id": "q1", "question": "...", "options": [{"id": "a", "text": "..."}, ...]}]
    questions jsonb not null default '[]',
    -- {"q1": "b", "q2": "true", ...}; never readable by learners (see grants)
    answer_key jsonb not null,
    pass_mark numeric not null default 0.7 check (pass_mark between 0 and 1)
);

create table if not exists public.projects (
    id text primary key,
    path_id text not null references public.learning_paths (id) on delete cascade,
    title text not null,
    description text,
    -- ["API request", "Error handling", ...]
    requirements jsonb not null default '[]',
    skill_ids text[] not null default '{}',
    is_capstone boolean not null default false,
    xp integer not null default 500 check (xp between 0 and 2000),
    achievement_id text
);

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'learning_paths_capstone_fk') then
        alter table public.learning_paths
            add constraint learning_paths_capstone_fk
            foreign key (capstone_project_id) references public.projects (id) on delete set null;
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gamification catalog
-- ---------------------------------------------------------------------------

create table if not exists public.xp_rules (
    reason text primary key,
    xp integer not null check (xp >= 0),
    description text not null
);

insert into public.xp_rules (reason, xp, description) values
    ('lesson', 50, 'Complete a lesson'),
    ('quiz', 75, 'Pass a quiz'),
    ('challenge', 100, 'Complete a coding challenge'),
    ('challenge_no_hints', 150, 'Solve a challenge without hints'),
    ('debugging', 150, 'Solve a debugging challenge'),
    ('explanation', 100, 'Explain a concept correctly to Acyrx'),
    ('daily_goal', 100, 'Reach your daily goal'),
    ('streak_bonus', 100, 'Every 7 days of streak'),
    ('helped_learner', 50, 'Feedback another learner marked helpful')
on conflict (reason) do update set xp = excluded.xp, description = excluded.description;
-- Projects and quests carry their own XP (projects.xp, quests.xp)

create table if not exists public.levels (
    level integer primary key,
    min_xp integer not null unique
);

-- Each level costs more than the last: 100, 350, 650, 1050, ... XP
insert into public.levels (level, min_xp)
select l, case when l = 1 then 0 else (round(100 * power(l - 1, 1.7) / 50) * 50)::integer end
from generate_series(1, 100) as l
on conflict (level) do nothing;

-- Titles per subject; a title holds from its from_level until the next one.
-- 'general' is the overall level shown on profiles.
create table if not exists public.level_titles (
    subject text not null,
    from_level integer not null,
    title text not null,
    primary key (subject, from_level)
);

insert into public.level_titles (subject, from_level, title) values
    ('general', 1, 'Explorer'), ('general', 3, 'Apprentice'), ('general', 6, 'Builder'),
    ('general', 10, 'Developer'), ('general', 15, 'Problem Solver'), ('general', 21, 'Engineer'),
    ('general', 28, 'Advanced Developer'), ('general', 36, 'Expert'),
    ('programming', 1, 'Beginner'), ('programming', 4, 'Coder'),
    ('programming', 10, 'Developer'), ('programming', 20, 'Engineer'),
    ('mathematics', 1, 'Beginner'), ('mathematics', 5, 'Solver'), ('mathematics', 15, 'Mathematician'),
    ('ai', 1, 'Explorer'), ('ai', 5, 'Builder'), ('ai', 12, 'AI Developer'), ('ai', 22, 'AI Engineer')
on conflict (subject, from_level) do nothing;

create table if not exists public.achievements (
    id text primary key,
    name text not null,
    description text not null,
    icon text not null default 'trophy',
    coins integer not null default 0 check (coins >= 0)
);

-- Deliberately few: each one is a real milestone
insert into public.achievements (id, name, description, icon, coins) values
    ('first_steps', 'First Steps', 'Complete your first lesson.', 'footprints', 10),
    ('code_runner', 'Code Runner', 'Run your first program.', 'play', 10),
    ('debugger', 'Debugger', 'Solve your first debugging challenge.', 'bug', 25),
    ('no_hints', 'No Hints', 'Complete 10 challenges without hints.', 'brain', 50),
    ('consistency', 'Consistency', 'Maintain a 7-day streak.', 'flame', 50),
    ('builder', 'Builder', 'Complete your first project.', 'hammer', 75),
    ('mastery', 'Mastery', 'Reach 90%+ demonstrated mastery in a skill.', 'target', 100),
    ('teacher', 'Teacher', 'Successfully explain 20 concepts to Acyrx.', 'graduation-cap', 100),
    ('night_coder', 'Night Coder', 'Complete a lesson after 10 PM.', 'moon', 10),
    ('weekly_champion', 'Weekly Champion', 'Finish a weekly quest.', 'medal', 50),
    ('api_builder', 'API Builder', 'Ship a project that talks to a real API.', 'plug', 75)
on conflict (id) do update
    set name = excluded.name, description = excluded.description, icon = excluded.icon, coins = excluded.coins;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'projects_achievement_fk') then
        alter table public.projects
            add constraint projects_achievement_fk
            foreign key (achievement_id) references public.achievements (id) on delete set null;
    end if;
end;
$$;

create table if not exists public.quests (
    id text primary key,
    cadence text not null check (cadence in ('daily', 'weekly')),
    title text not null,
    metric text not null check (metric in (
        'lessons', 'challenges', 'challenges_no_hints', 'quizzes', 'projects', 'goal_minutes'
    )),
    target integer not null check (target > 0),
    xp integer not null default 0 check (xp between 0 and 1000),
    coins integer not null default 0 check (coins >= 0),
    achievement_id text references public.achievements (id) on delete set null,
    active boolean not null default true
);

insert into public.quests (id, cadence, title, metric, target, xp, coins, achievement_id) values
    ('daily_lesson', 'daily', 'Complete 1 lesson', 'lessons', 1, 50, 0, null),
    ('daily_challenges', 'daily', 'Solve 3 challenges', 'challenges', 3, 150, 5, null),
    ('daily_quiz', 'daily', 'Pass today''s quiz', 'quizzes', 1, 100, 0, null),
    ('daily_build', 'daily', 'Build for 20 minutes', 'goal_minutes', 20, 100, 0, null),
    ('weekly_lessons', 'weekly', 'Complete 5 lessons', 'lessons', 5, 150, 10, null),
    ('weekly_challenges', 'weekly', 'Solve 15 challenges', 'challenges', 15, 200, 20, null),
    ('weekly_project', 'weekly', 'Complete 1 project', 'projects', 1, 500, 50, 'weekly_champion')
on conflict (id) do nothing;

-- Cosmetics and extras. Grades, mastery and certificates can never be bought.
-- Courses beyond beginner level are unlocked with coins (course_unlocks), and
-- coins are only ever earned by learning, never bought with money.
create table if not exists public.rewards (
    id text primary key,
    kind text not null check (kind in (
        'profile_frame', 'theme', 'avatar', 'tutor_personality', 'ui',
        'project_template', 'practice_pack', 'bonus_path'
    )),
    name text not null,
    description text,
    cost_coins integer not null default 0 check (cost_coins >= 0),
    requires_achievement text references public.achievements (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Learner data. Readable by its owner only; written only by the functions
-- further down.
-- ---------------------------------------------------------------------------

create table if not exists public.course_enrollments (
    user_id uuid not null references public.profiles (id) on delete cascade,
    path_id text not null references public.learning_paths (id) on delete cascade,
    enrolled_at timestamptz not null default now(),
    -- Every lesson done. Says nothing about mastery, which is tracked apart.
    completed_at timestamptz,
    primary key (user_id, path_id)
);

create table if not exists public.lesson_progress (
    user_id uuid not null references public.profiles (id) on delete cascade,
    lesson_id text not null references public.course_lessons (id) on delete cascade,
    seconds_spent integer not null default 0,
    completed_at timestamptz not null default now(),
    primary key (user_id, lesson_id)
);

create table if not exists public.challenge_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    challenge_id text not null references public.challenges (id) on delete cascade,
    passed boolean not null,
    hints_used integer not null default 0 check (hints_used >= 0),
    duration_seconds integer not null check (duration_seconds >= 0),
    code_hash text check (code_hash ~ '^[0-9a-f]{64}$'),
    suspicious boolean not null default false,
    created_at timestamptz not null default now()
);
create index if not exists challenge_attempts_user on public.challenge_attempts (user_id, challenge_id, created_at);

create table if not exists public.quiz_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    quiz_id text not null references public.quizzes (id) on delete cascade,
    answers jsonb not null,
    score numeric not null check (score between 0 and 1),
    passed boolean not null,
    duration_seconds integer not null check (duration_seconds >= 0),
    suspicious boolean not null default false,
    created_at timestamptz not null default now()
);
create index if not exists quiz_attempts_user on public.quiz_attempts (user_id, quiz_id, created_at);

create table if not exists public.project_submissions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    project_id text not null references public.projects (id) on delete cascade,
    repo_url text check (repo_url ~ '^https://'),
    code_hash text check (code_hash ~ '^[0-9a-f]{64}$'),
    status text not null default 'submitted' check (status in ('submitted', 'passed', 'needs_work', 'flagged')),
    -- Acyrx's assessment: {"correctness": 0.92, "code_quality": 0.84, ...}.
    -- An AI opinion, shown as such, never an official measurement.
    review jsonb,
    overall_score numeric check (overall_score between 0 and 1),
    is_public boolean not null default false,
    submitted_at timestamptz not null default now(),
    reviewed_at timestamptz
);
create index if not exists project_submissions_user on public.project_submissions (user_id, project_id);
create index if not exists project_submissions_hash on public.project_submissions (project_id, code_hash);

create table if not exists public.project_comments (
    id uuid primary key default gen_random_uuid(),
    submission_id uuid not null references public.project_submissions (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    body text not null check (char_length(body) between 1 and 2000),
    helpful boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.path_assessments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    path_id text not null references public.learning_paths (id) on delete cascade,
    score numeric not null check (score between 0 and 1),
    created_at timestamptz not null default now()
);

-- Every piece of evidence behind a mastery number. Append-only.
create table if not exists public.user_skill_evidence (
    id bigint generated always as identity primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    skill_id text not null references public.skills (id) on delete cascade,
    kind text not null check (kind in (
        'quiz', 'challenge', 'debugging', 'project', 'explanation', 'mistake', 'assessment'
    )),
    score numeric not null check (score between 0 and 1),
    weight numeric not null check (weight > 0),
    source_id text,
    created_at timestamptz not null default now()
);
create index if not exists user_skill_evidence_user_skill on public.user_skill_evidence (user_id, skill_id);

-- Mastery cache, recomputed from evidence on every new piece of it
create table if not exists public.user_skills (
    user_id uuid not null references public.profiles (id) on delete cascade,
    skill_id text not null references public.skills (id) on delete cascade,
    mastery numeric not null default 0 check (mastery between 0 and 1),
    evidence_count integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (user_id, skill_id)
);

-- The XP ledger. Never updated or deleted; the unique key makes every award
-- idempotent (one lesson, one award, however often the client retries).
create table if not exists public.xp_transactions (
    id bigint generated always as identity primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    amount integer not null check (amount > 0),
    reason text not null,
    source_id text not null,
    path_id text references public.learning_paths (id) on delete set null,
    created_at timestamptz not null default now(),
    unique (user_id, reason, source_id)
);
create index if not exists xp_transactions_user_time on public.xp_transactions (user_id, created_at);

create table if not exists public.coin_transactions (
    id bigint generated always as identity primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    amount integer not null check (amount <> 0),
    reason text not null,
    source_id text not null,
    created_at timestamptz not null default now(),
    unique (user_id, reason, source_id)
);

create table if not exists public.learning_days (
    user_id uuid not null references public.profiles (id) on delete cascade,
    day date not null,
    minutes integer not null default 0,
    goal_minutes integer not null,
    goal_met boolean not null default false,
    last_logged_at timestamptz not null default now(),
    primary key (user_id, day)
);

create table if not exists public.quest_progress (
    user_id uuid not null references public.profiles (id) on delete cascade,
    quest_id text not null references public.quests (id) on delete cascade,
    period_start date not null,
    progress integer not null default 0,
    completed_at timestamptz,
    primary key (user_id, quest_id, period_start)
);

create table if not exists public.user_achievements (
    user_id uuid not null references public.profiles (id) on delete cascade,
    achievement_id text not null references public.achievements (id) on delete cascade,
    earned_at timestamptz not null default now(),
    primary key (user_id, achievement_id)
);

create table if not exists public.user_rewards (
    user_id uuid not null references public.profiles (id) on delete cascade,
    reward_id text not null references public.rewards (id) on delete cascade,
    equipped boolean not null default false,
    acquired_at timestamptz not null default now(),
    primary key (user_id, reward_id)
);

-- Courses bought with Vylos Coins. The coins leave through coin_transactions
-- (reason 'unlock_course'); this records what they paid for.
create table if not exists public.course_unlocks (
    user_id uuid not null references public.profiles (id) on delete cascade,
    path_id text not null references public.learning_paths (id) on delete cascade,
    cost integer not null,
    unlocked_at timestamptz not null default now(),
    primary key (user_id, path_id)
);

-- Learning combo: clean first-try solves in a row (no hints, at most one
-- failed check). Kept here so the multiplier can't be claimed by the app.
create table if not exists public.user_combos (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    count integer not null default 0,
    updated_at timestamptz not null default now()
);

create table if not exists public.certificates (
    id text primary key check (id ~ '^VYLOS-[0-9]{4}-[0-9A-F]{8}$'),
    user_id uuid not null references public.profiles (id) on delete cascade,
    path_id text not null references public.learning_paths (id),
    holder_name text not null,
    final_assessment numeric not null check (final_assessment between 0 and 1),
    projects integer not null,
    challenges integer not null,
    skills_demonstrated integer not null,
    status text not null default 'valid' check (status in ('valid', 'revoked')),
    issued_at timestamptz not null default now(),
    revoked_at timestamptz,
    revoked_reason text
);
create unique index if not exists certificates_one_valid_per_path
    on public.certificates (user_id, path_id) where status = 'valid';

create table if not exists public.certificate_skills (
    certificate_id text not null references public.certificates (id) on delete cascade,
    skill_id text not null references public.skills (id),
    mastery numeric not null check (mastery between 0 and 1),
    primary key (certificate_id, skill_id)
);

-- One row per public lookup, so a holder can see their certificate is used
create table if not exists public.certificate_verifications (
    id bigint generated always as identity primary key,
    certificate_id text not null references public.certificates (id) on delete cascade,
    verified_at timestamptz not null default now()
);

-- Anti-cheat signals. Unresolved flags block certificates and pause XP for
-- the flagged activity; a person reviews them from the dashboard.
create table if not exists public.integrity_flags (
    id bigint generated always as identity primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    kind text not null check (kind in (
        'too_fast', 'guessing', 'identical_submission', 'xp_spike', 'answer_tampering'
    )),
    source_id text,
    detail text,
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);
create index if not exists integrity_flags_open on public.integrity_flags (user_id) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

do $$
declare
    t text;
begin
    foreach t in array array[
        'profiles', 'creator_profiles', 'follows',
        'learning_paths', 'skills', 'skill_prerequisites', 'course_lessons', 'challenges', 'quizzes', 'projects',
        'xp_rules', 'levels', 'level_titles', 'achievements', 'quests', 'rewards',
        'course_enrollments', 'lesson_progress', 'challenge_attempts', 'quiz_attempts',
        'project_submissions', 'project_comments', 'path_assessments',
        'user_skill_evidence', 'user_skills', 'xp_transactions', 'coin_transactions',
        'learning_days', 'quest_progress', 'user_achievements', 'user_rewards',
        'certificates', 'certificate_skills', 'certificate_verifications', 'integrity_flags',
        'course_unlocks', 'user_combos'
    ] loop
        execute format('alter table public.%I enable row level security', t);
        -- Writes only ever happen through the functions below
        execute format('revoke insert, update, delete, truncate on table public.%I from anon, authenticated', t);
    end loop;

    -- Catalog: public
    foreach t in array array[
        'learning_paths', 'skills', 'skill_prerequisites', 'course_lessons', 'projects',
        'xp_rules', 'levels', 'level_titles', 'achievements', 'quests', 'rewards'
    ] loop
        execute format('drop policy if exists "Catalog is public" on public.%I', t);
        execute format('create policy "Catalog is public" on public.%I for select to anon, authenticated using (true)', t);
    end loop;

    -- Learner data: owner only
    foreach t in array array[
        'course_enrollments', 'lesson_progress', 'challenge_attempts', 'quiz_attempts',
        'path_assessments', 'user_skill_evidence', 'user_skills', 'xp_transactions',
        'coin_transactions', 'learning_days', 'quest_progress', 'user_achievements',
        'user_rewards', 'certificates', 'course_unlocks', 'user_combos'
    ] loop
        execute format('drop policy if exists "Owner can read" on public.%I', t);
        execute format('create policy "Owner can read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    end loop;
end;
$$;

-- integrity_flags and certificate_verifications: no policies, so no client
-- access at all. Public certificate checks go through verify_certificate().
revoke all on table public.integrity_flags, public.certificate_verifications from anon, authenticated;

-- Answer keys stay server-side
revoke select on table public.quizzes from anon, authenticated;
grant select (id, path_id, skill_id, title, pass_mark, questions) on table public.quizzes to anon, authenticated;
drop policy if exists "Catalog is public" on public.quizzes;
create policy "Catalog is public" on public.quizzes for select to anon, authenticated using (true);

-- Shared practice challenges are public; generated ones only to their learner
drop policy if exists "Challenges are visible" on public.challenges;
create policy "Challenges are visible" on public.challenges for select to anon, authenticated
    using (generated_for is null or generated_for = (select auth.uid()));

drop policy if exists "Owner can read" on public.profiles;
create policy "Owner can read" on public.profiles for select to authenticated
    using (id = (select auth.uid()));
drop policy if exists "Owner can update" on public.profiles;
create policy "Owner can update" on public.profiles for update to authenticated
    using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update (handle, display_name, avatar_url, bio, is_public, show_on_leaderboards, daily_goal_minutes, timezone)
    on table public.profiles to authenticated;

drop policy if exists "Owner can manage" on public.creator_profiles;
create policy "Owner can manage" on public.creator_profiles for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and not verified);
grant select, delete on table public.creator_profiles to authenticated;
grant insert (user_id, headline, website), update (headline, website) on table public.creator_profiles to authenticated;

drop policy if exists "Follows are visible to both sides" on public.follows;
create policy "Follows are visible to both sides" on public.follows for select to authenticated
    using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
drop policy if exists "Learners manage who they follow" on public.follows;
create policy "Learners manage who they follow" on public.follows for insert to authenticated
    with check (follower_id = (select auth.uid()));
drop policy if exists "Learners can unfollow" on public.follows;
create policy "Learners can unfollow" on public.follows for delete to authenticated
    using (follower_id = (select auth.uid()));
grant insert, delete on table public.follows to authenticated;

drop policy if exists "Own or shared submissions" on public.project_submissions;
create policy "Own or shared submissions" on public.project_submissions for select to authenticated
    using (user_id = (select auth.uid()) or is_public);
grant update (is_public, repo_url) on table public.project_submissions to authenticated;
drop policy if exists "Owner can share" on public.project_submissions;
create policy "Owner can share" on public.project_submissions for update to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Comments on visible submissions" on public.project_comments;
create policy "Comments on visible submissions" on public.project_comments for select to authenticated
    using (exists (
        select 1 from public.project_submissions s
        where s.id = submission_id and (s.is_public or s.user_id = (select auth.uid()))
    ));
drop policy if exists "Comment on shared projects" on public.project_comments;
create policy "Comment on shared projects" on public.project_comments for insert to authenticated
    with check (
        user_id = (select auth.uid())
        and not helpful
        and exists (select 1 from public.project_submissions s where s.id = submission_id and s.is_public)
    );
drop policy if exists "Delete own comments" on public.project_comments;
create policy "Delete own comments" on public.project_comments for delete to authenticated
    using (user_id = (select auth.uid()));
grant insert (submission_id, user_id, body), delete on table public.project_comments to authenticated;

drop policy if exists "Owner can read" on public.certificate_skills;
create policy "Owner can read" on public.certificate_skills for select to authenticated
    using (exists (
        select 1 from public.certificates c
        where c.id = certificate_id and c.user_id = (select auth.uid())
    ));

-- ---------------------------------------------------------------------------
-- Internal helpers (service role only)
-- ---------------------------------------------------------------------------

-- Anything above this in one day is paused and flagged for review
create or replace function public._daily_xp_cap()
returns integer language sql immutable set search_path = '' as $$ select 3000 $$;

create or replace function public._today(p_user uuid)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
    tz text;
begin
    select timezone into tz from public.profiles where id = p_user;
    return (now() at time zone coalesce(tz, 'UTC'))::date;
exception when others then
    -- An unknown time zone name
    return (now() at time zone 'UTC')::date;
end;
$$;

create or replace function public._flag(p_user uuid, p_kind text, p_source text, p_detail text)
returns void
language sql
set search_path = ''
as $$
    insert into public.integrity_flags (user_id, kind, source_id, detail)
    select p_user, p_kind, p_source, p_detail
    where not exists (
        select 1 from public.integrity_flags
        where user_id = p_user and kind = p_kind and source_id is not distinct from p_source
            and resolved_at is null
    );
$$;

create or replace function public._level_for(p_xp bigint, p_subject text default 'general')
returns jsonb
language sql
stable
set search_path = ''
as $$
    select jsonb_build_object(
        'level', l.level,
        'title', coalesce(
            (select title from public.level_titles
                where subject = p_subject and from_level <= l.level
                order by from_level desc limit 1),
            (select title from public.level_titles
                where subject = 'general' and from_level <= l.level
                order by from_level desc limit 1)
        ),
        'xp', p_xp,
        'level_min_xp', l.min_xp,
        'next_level_xp', (select min(min_xp) from public.levels where min_xp > l.min_xp)
    )
    from public.levels l
    where l.min_xp <= greatest(p_xp, 0)
    order by l.level desc
    limit 1;
$$;

-- Free courses are always unlocked; the rest once bought with coins
create or replace function public._path_unlocked(p_user uuid, p_path text)
returns boolean
language sql
stable
set search_path = ''
as $$
    select p_path is null
        or coalesce((select unlock_cost = 0 from public.learning_paths where id = p_path), true)
        or exists (select 1 from public.course_unlocks where user_id = p_user and path_id = p_path);
$$;

-- Returns the XP actually awarded: 0 for a duplicate (already awarded), when
-- the daily cap has been hit, or for work in a course that isn't unlocked.
-- Every award also earns Vylos Coins: 1 per 10 XP.
create or replace function public._award_xp(
    p_user uuid, p_amount integer, p_reason text, p_source text, p_path text default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
    today_xp bigint;
    v_amount integer;
    inserted integer;
begin
    if p_amount <= 0 or not public._path_unlocked(p_user, p_path) then
        return 0;
    end if;

    -- One award at a time per learner, so the cap can't be raced past
    perform pg_advisory_xact_lock(hashtextextended('xp:' || p_user::text, 0));

    select coalesce(sum(t.amount), 0) into today_xp
    from public.xp_transactions t
    where t.user_id = p_user and t.created_at >= now() - interval '24 hours';

    v_amount := least(p_amount, public._daily_xp_cap() - today_xp)::integer;
    if v_amount <= 0 then
        perform public._flag(p_user, 'xp_spike', current_date::text,
            'Reached the daily XP cap of ' || public._daily_xp_cap());
        return 0;
    end if;

    insert into public.xp_transactions (user_id, amount, reason, source_id, path_id)
    values (p_user, v_amount, p_reason, p_source, p_path)
    on conflict (user_id, reason, source_id) do nothing;
    get diagnostics inserted = row_count;
    if inserted = 0 then
        return 0;
    end if;
    perform public._award_coins(p_user, v_amount / 10, p_reason, p_source);
    return v_amount;
end;
$$;

create or replace function public._award_coins(p_user uuid, p_amount integer, p_reason text, p_source text)
returns void
language sql
set search_path = ''
as $$
    insert into public.coin_transactions (user_id, amount, reason, source_id)
    select p_user, p_amount, p_reason, p_source
    where p_amount <> 0
    on conflict (user_id, reason, source_id) do nothing;
$$;

create or replace function public._grant_achievement(p_user uuid, p_achievement text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    inserted integer;
begin
    insert into public.user_achievements (user_id, achievement_id)
    values (p_user, p_achievement)
    on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted > 0 then
        perform public._award_coins(p_user, a.coins, 'achievement', p_achievement)
        from public.achievements a where a.id = p_achievement;
    end if;
    return inserted > 0;
end;
$$;

-- Mastery = recency-weighted average of evidence scores, pulled towards 0 by
-- a prior worth two pieces of evidence, so one lucky quiz can't read as 90%.
-- Evidence halves in weight every 90 days: skills have to stay demonstrated.
create or replace function public._recompute_mastery(p_user uuid, p_skill text)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
    result numeric;
begin
    insert into public.user_skills as us (user_id, skill_id, mastery, evidence_count, updated_at)
    select p_user, p_skill,
        round(coalesce(sum(w * score) / (sum(w) + 2), 0), 4),
        count(*),
        now()
    from (
        select e.score,
            e.weight * power(0.5, extract(epoch from now() - e.created_at) / 86400 / 90) as w
        from public.user_skill_evidence e
        where e.user_id = p_user and e.skill_id = p_skill
    ) weighted
    on conflict (user_id, skill_id) do update
        set mastery = excluded.mastery, evidence_count = excluded.evidence_count, updated_at = now()
    returning us.mastery into result;
    return result;
end;
$$;

create or replace function public._add_evidence(
    p_user uuid, p_skill text, p_kind text, p_score numeric, p_source text
)
returns numeric
language plpgsql
set search_path = ''
as $$
begin
    if p_skill is null
        or not public._path_unlocked(p_user, (select path_id from public.skills where id = p_skill)) then
        return null;
    end if;
    insert into public.user_skill_evidence (user_id, skill_id, kind, score, weight, source_id)
    values (
        p_user, p_skill, p_kind, least(greatest(p_score, 0), 1),
        case p_kind
            when 'assessment' then 4
            when 'project' then 4
            when 'debugging' then 2.5
            when 'challenge' then 2
            when 'explanation' then 1.5
            when 'quiz' then 1
            else 0.5 -- mistake
        end,
        p_source
    );
    return public._recompute_mastery(p_user, p_skill);
end;
$$;

create or replace function public._current_streak(p_user uuid)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
    d date := public._today(p_user);
    n integer := 0;
begin
    -- Today still counts as "in progress" until it's over
    if not exists (select 1 from public.learning_days where user_id = p_user and day = d and goal_met) then
        d := d - 1;
    end if;
    while exists (select 1 from public.learning_days where user_id = p_user and day = d and goal_met) loop
        n := n + 1;
        d := d - 1;
    end loop;
    return n;
end;
$$;

-- Consecutive weeks with the goal met on at least 3 days: consistency
-- without asking for every single day
create or replace function public._weekly_streak(p_user uuid)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
    wk date := date_trunc('week', public._today(p_user))::date;
    n integer := 0;
    days integer;
begin
    loop
        select count(*) into days from public.learning_days
        where user_id = p_user and goal_met and day >= wk and day < wk + 7;
        if days < 3 then
            -- The current week may still be in progress
            exit when wk <> date_trunc('week', public._today(p_user))::date;
        else
            n := n + 1;
        end if;
        wk := wk - 7;
    end loop;
    return n;
end;
$$;

create or replace function public._bump_quests(p_user uuid, p_metric text, p_amount integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
    q record;
    today date := public._today(p_user);
    period date;
    now_progress integer;
begin
    if p_amount <= 0 then
        return;
    end if;
    for q in select * from public.quests where active and metric = p_metric loop
        period := case q.cadence when 'daily' then today else date_trunc('week', today)::date end;

        insert into public.quest_progress as qp (user_id, quest_id, period_start, progress)
        values (p_user, q.id, period, p_amount)
        on conflict (user_id, quest_id, period_start)
            do update set progress = qp.progress + p_amount
            where qp.completed_at is null
        returning qp.progress into now_progress;

        if now_progress is not null and now_progress >= q.target then
            update public.quest_progress set completed_at = now()
            where user_id = p_user and quest_id = q.id and period_start = period;
            perform public._award_xp(p_user, q.xp, 'quest', q.id || ':' || period);
            perform public._award_coins(p_user, q.coins, 'quest_bonus', q.id || ':' || period);
            if q.achievement_id is not null then
                perform public._grant_achievement(p_user, q.achievement_id);
            end if;
        end if;
    end loop;
end;
$$;

-- Returns the ids of achievements newly earned
create or replace function public._check_achievements(p_user uuid)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
    earned text[] := '{}';
begin
    if exists (select 1 from public.lesson_progress where user_id = p_user)
        and public._grant_achievement(p_user, 'first_steps') then
        earned := array_append(earned, 'first_steps');
    end if;

    if exists (
        select 1 from public.challenge_attempts a join public.challenges c on c.id = a.challenge_id
        where a.user_id = p_user and a.passed and not a.suspicious and c.kind = 'debugging'
    ) and public._grant_achievement(p_user, 'debugger') then
        earned := array_append(earned, 'debugger');
    end if;

    if (
        select count(distinct challenge_id) from public.challenge_attempts
        where user_id = p_user and passed and not suspicious and hints_used = 0
    ) >= 10 and public._grant_achievement(p_user, 'no_hints') then
        earned := array_append(earned, 'no_hints');
    end if;

    if public._current_streak(p_user) >= 7 and public._grant_achievement(p_user, 'consistency') then
        earned := array_append(earned, 'consistency');
    end if;

    if exists (select 1 from public.project_submissions where user_id = p_user and status = 'passed')
        and public._grant_achievement(p_user, 'builder') then
        earned := array_append(earned, 'builder');
    end if;

    -- Needs real evidence behind it, not one perfect quiz
    if exists (
        select 1 from public.user_skills where user_id = p_user and mastery >= 0.9 and evidence_count >= 5
    ) and public._grant_achievement(p_user, 'mastery') then
        earned := array_append(earned, 'mastery');
    end if;

    if (
        select count(*) from public.user_skill_evidence
        where user_id = p_user and kind = 'explanation' and score >= 0.7
    ) >= 20 and public._grant_achievement(p_user, 'teacher') then
        earned := array_append(earned, 'teacher');
    end if;

    return earned;
end;
$$;

-- Marks the enrollment complete once every lesson in the path is done
create or replace function public._sync_course_completion(p_user uuid, p_path text)
returns void
language sql
set search_path = ''
as $$
    insert into public.course_enrollments (user_id, path_id, completed_at)
    select p_user, p_path, now()
    where not exists (
        select 1 from public.course_lessons l
        where l.path_id = p_path
            and not exists (select 1 from public.lesson_progress lp where lp.user_id = p_user and lp.lesson_id = l.id)
    )
    on conflict (user_id, path_id) do update
        set completed_at = coalesce(public.course_enrollments.completed_at, now());
$$;

create or replace function public._require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
begin
    if uid is null then
        raise exception 'Sign in first' using errcode = '28000';
    end if;
    return uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Learner API (called by the IDE as the signed-in user)
-- ---------------------------------------------------------------------------

create or replace function public.enroll(p_path_id text)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.course_enrollments (user_id, path_id)
    values (public._require_user(), p_path_id)
    on conflict do nothing;
$$;

-- Lessons only earn XP once real time has been spent on them: clicking
-- "next" through a course records progress but no reward. Time adds up over
-- visits, so coming back to study a skimmed lesson still counts.
create or replace function public.complete_lesson(p_lesson_id text, p_seconds_spent integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    lesson public.course_lessons;
    is_new boolean;
    total_seconds integer;
    xp integer := 0;
    local_hour integer;
begin
    select * into lesson from public.course_lessons where id = p_lesson_id;
    if not found then
        raise exception 'Unknown lesson %', p_lesson_id;
    end if;

    insert into public.course_enrollments (user_id, path_id) values (uid, lesson.path_id) on conflict do nothing;
    insert into public.lesson_progress as lp (user_id, lesson_id, seconds_spent)
    values (uid, p_lesson_id, least(greatest(p_seconds_spent, 0), 3600))
    on conflict (user_id, lesson_id)
        do update set seconds_spent = least(lp.seconds_spent + least(greatest(p_seconds_spent, 0), 3600), 86400)
    returning lp.seconds_spent, (xmax = 0) into total_seconds, is_new;

    if total_seconds >= 45 then
        xp := public._award_xp(uid, (select r.xp from public.xp_rules r where r.reason = 'lesson'),
            'lesson', p_lesson_id, lesson.path_id);
        if xp > 0 then
            perform public._bump_quests(uid, 'lessons', 1);
        end if;
    end if;

    if is_new then
        begin
            select extract(hour from now() at time zone p.timezone)::integer into local_hour
            from public.profiles p where p.id = uid;
        exception when others then
            local_hour := extract(hour from now() at time zone 'UTC')::integer;
        end;
        if local_hour >= 22 then
            perform public._grant_achievement(uid, 'night_coder');
        end if;

        perform public._sync_course_completion(uid, lesson.path_id);
    end if;

    return jsonb_build_object('xp', xp, 'achievements', to_jsonb(public._check_achievements(uid)));
end;
$$;

-- For the "Code Runner" achievement; running code earns no XP by itself
create or replace function public.record_program_run()
returns boolean
language sql
security definer
set search_path = ''
as $$
    select public._grant_achievement(public._require_user(), 'code_runner');
$$;

create or replace function public.record_challenge_attempt(
    p_challenge_id text,
    p_passed boolean,
    p_hints_used integer,
    p_duration_seconds integer,
    p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    ch public.challenges;
    recent integer;
    earlier_failures integer;
    already_passed boolean;
    is_suspicious boolean := false;
    flagged text;
    xp integer := 0;
    mastery_before numeric;
    mastery_after numeric;
    v_reason text;
    combo integer := 0;
    multiplier integer := 1;
begin
    select * into ch from public.challenges where id = p_challenge_id;
    if not found or (ch.generated_for is not null and ch.generated_for <> uid) then
        raise exception 'Unknown challenge %', p_challenge_id;
    end if;

    select coalesce(mastery, 0) into mastery_before
    from public.user_skills where user_id = uid and skill_id = ch.skill_id;
    mastery_before := coalesce(mastery_before, 0);

    select exists (
        select 1 from public.challenge_attempts
        where user_id = uid and challenge_id = ch.id and passed and not suspicious
    ) into already_passed;

    -- Hammering submit until something passes is guessing, not solving
    select count(*) into recent from public.challenge_attempts
    where user_id = uid and challenge_id = ch.id and created_at > now() - interval '10 minutes';
    if recent >= 6 then
        is_suspicious := true;
        flagged := 'guessing';
        perform public._flag(uid, 'guessing', ch.id, recent || ' attempts in 10 minutes');
    end if;

    if p_passed and p_duration_seconds < ch.min_seconds then
        is_suspicious := true;
        flagged := 'too_fast';
        perform public._flag(uid, 'too_fast', ch.id,
            'Passed in ' || p_duration_seconds || 's (minimum ' || ch.min_seconds || 's)');
    end if;

    select count(*) into earlier_failures from public.challenge_attempts
    where user_id = uid and challenge_id = ch.id and not passed;

    insert into public.challenge_attempts (user_id, challenge_id, passed, hints_used, duration_seconds, code_hash, suspicious)
    values (uid, ch.id, p_passed, greatest(p_hints_used, 0), greatest(p_duration_seconds, 0), p_code_hash, is_suspicious);

    -- The learning combo: a clean first pass (no hints, at most one failed
    -- check) adds one; hints, trial and error or anything suspicious resets
    -- it; a day off lets it lapse. Generated practice doesn't count either way.
    if ch.generated_for is null and not already_passed then
        select case when c.updated_at > now() - interval '24 hours' then c.count else 0 end into combo
        from public.user_combos c where c.user_id = uid;
        combo := coalesce(combo, 0);
        if is_suspicious or (p_passed and (p_hints_used > 0 or earlier_failures > 1)) or (not p_passed and earlier_failures + 1 >= 3) then
            combo := 0;
        elsif p_passed then
            combo := combo + 1;
        end if;
        insert into public.user_combos as uc (user_id, count, updated_at) values (uid, combo, now())
        on conflict (user_id) do update set count = excluded.count, updated_at = now();
        multiplier := case when p_passed and combo >= 5 then 3 when p_passed and combo >= 3 then 2 else 1 end;
    end if;

    if not is_suspicious and not already_passed then
        if p_passed then
            v_reason := case
                when ch.kind = 'debugging' then 'debugging'
                when p_hints_used = 0 then 'challenge_no_hints'
                else 'challenge'
            end;
            mastery_after := public._add_evidence(uid, ch.skill_id,
                case when ch.kind = 'debugging' then 'debugging' else 'challenge' end,
                case when p_hints_used = 0 then 1.0 when p_hints_used = 1 then 0.85 else 0.7 end
                    - least(earlier_failures, 3) * 0.05,
                ch.id);
            -- Generated practice has no path, and one reason per challenge id keeps it once-only
            xp := public._award_xp(uid, (select r.xp from public.xp_rules r where r.reason = v_reason) * multiplier,
                'challenge', ch.id, ch.path_id);
            perform public._bump_quests(uid, 'challenges', 1);
            if p_hints_used = 0 then
                perform public._bump_quests(uid, 'challenges_no_hints', 1);
            end if;
        elsif earlier_failures < 3 then
            -- The first few failures are evidence too (repeated mistakes lower mastery)
            mastery_after := public._add_evidence(uid, ch.skill_id, 'mistake', 0, ch.id);
        end if;
    end if;

    return jsonb_build_object(
        'passed', p_passed,
        'xp', xp,
        'skill_id', ch.skill_id,
        'mastery_before', mastery_before,
        'mastery_after', coalesce(mastery_after, mastery_before),
        'flag', flagged,
        'combo', combo,
        'multiplier', multiplier,
        'achievements', to_jsonb(public._check_achievements(uid))
    );
end;
$$;

-- Graded here against the hidden answer key; the client only sends answers
create or replace function public.submit_quiz(p_quiz_id text, p_answers jsonb, p_duration_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    qz public.quizzes;
    total integer;
    correct integer;
    score numeric;
    passed boolean;
    attempts_last_hour integer;
    is_suspicious boolean := false;
    xp integer := 0;
    mastery numeric;
begin
    select * into qz from public.quizzes where id = p_quiz_id;
    if not found then
        raise exception 'Unknown quiz %', p_quiz_id;
    end if;
    if jsonb_typeof(p_answers) <> 'object' then
        raise exception 'Answers must be an object of question id to answer';
    end if;

    select count(*), count(*) filter (where p_answers -> k.key = k.value)
    into total, correct
    from jsonb_each(qz.answer_key) k;
    score := case when total = 0 then 0 else round(correct::numeric / total, 4) end;
    passed := score >= qz.pass_mark;

    select count(*) into attempts_last_hour from public.quiz_attempts
    where user_id = uid and quiz_id = qz.id and created_at > now() - interval '1 hour';
    if attempts_last_hour >= 3 then
        is_suspicious := true;
        perform public._flag(uid, 'guessing', qz.id, 'Quiz retaken ' || attempts_last_hour + 1 || ' times in an hour');
    end if;
    -- Nobody reads and answers a question in under 3 seconds
    if p_duration_seconds < total * 3 then
        is_suspicious := true;
        perform public._flag(uid, 'too_fast', qz.id, total || ' questions in ' || p_duration_seconds || 's');
    end if;

    insert into public.quiz_attempts (user_id, quiz_id, answers, score, passed, duration_seconds, suspicious)
    values (uid, qz.id, p_answers, score, passed, greatest(p_duration_seconds, 0), is_suspicious);

    if not is_suspicious then
        mastery := public._add_evidence(uid, qz.skill_id, 'quiz', score, qz.id);
        if passed then
            xp := public._award_xp(uid, (select r.xp from public.xp_rules r where r.reason = 'quiz'),
                'quiz', qz.id, qz.path_id);
            if xp > 0 then
                perform public._bump_quests(uid, 'quizzes', 1);
            end if;
        end if;
    end if;

    return jsonb_build_object(
        'score', score, 'passed', passed, 'correct', correct, 'total', total, 'xp', xp,
        'mastery', mastery, 'flagged', is_suspicious,
        'achievements', to_jsonb(public._check_achievements(uid))
    );
end;
$$;

-- Heartbeat from the IDE while the learner is actively working. Minutes can't
-- be claimed faster than wall-clock time passes, and time beyond the goal
-- earns nothing: the reward is for showing up, not for staying longer.
create or replace function public.log_learning_time(p_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    today date := public._today(uid);
    goal integer;
    d public.learning_days;
    allowed integer;
    added integer;
    just_met boolean := false;
    streak integer;
    xp integer := 0;
begin
    select daily_goal_minutes into goal from public.profiles where id = uid;

    insert into public.learning_days (user_id, day, goal_minutes, last_logged_at)
    values (uid, today, goal, now() - interval '5 minutes')
    on conflict do nothing;

    select * into d from public.learning_days where user_id = uid and day = today for update;
    allowed := floor(extract(epoch from now() - d.last_logged_at) / 60)::integer;
    added := least(greatest(p_minutes, 0), allowed, 15);

    if added > 0 then
        update public.learning_days
            set minutes = least(minutes + added, 24 * 60),
                -- A goal changed today applies today, until it's met
                goal_minutes = case when goal_met then goal_minutes else goal end,
                -- Advance by what was credited, so partial minutes carry over
                last_logged_at = greatest(last_logged_at + added * interval '1 minute', now() - interval '15 minutes'),
                goal_met = goal_met or minutes + added >= case when goal_met then goal_minutes else goal end
            where user_id = uid and day = today
            returning * into d;
        just_met := d.goal_met and d.minutes - added < d.goal_minutes;
        perform public._bump_quests(uid, 'goal_minutes', added);
    end if;

    streak := public._current_streak(uid);
    if just_met then
        xp := public._award_xp(uid, (select r.xp from public.xp_rules r where r.reason = 'daily_goal'),
            'daily_goal', today::text);
        if streak > 0 and streak % 7 = 0 then
            xp := xp + public._award_xp(uid, (select r.xp from public.xp_rules r where r.reason = 'streak_bonus'),
                'streak_bonus', today::text);
        end if;
    end if;

    return jsonb_build_object(
        'minutes', d.minutes, 'goal_minutes', d.goal_minutes, 'goal_met', d.goal_met,
        'streak', streak, 'xp', xp,
        'achievements', to_jsonb(public._check_achievements(uid))
    );
end;
$$;

create or replace function public.submit_project(p_project_id text, p_repo_url text, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    copied boolean;
    sub_id uuid;
begin
    if not exists (select 1 from public.projects where id = p_project_id) then
        raise exception 'Unknown project %', p_project_id;
    end if;

    -- Byte-identical to someone else's submission of the same project
    select exists (
        select 1 from public.project_submissions
        where project_id = p_project_id and code_hash = p_code_hash and user_id <> uid
    ) into copied;

    insert into public.project_submissions (user_id, project_id, repo_url, code_hash, status)
    values (uid, p_project_id, p_repo_url, p_code_hash, case when copied then 'flagged' else 'submitted' end)
    returning id into sub_id;

    if copied then
        perform public._flag(uid, 'identical_submission', sub_id::text,
            'Same code as another learner''s submission of ' || p_project_id);
    end if;

    return jsonb_build_object('submission_id', sub_id, 'status', case when copied then 'flagged' else 'submitted' end);
end;
$$;

-- Weak-spot practice Acyrx generated for this learner. Limited per day, and
-- worth the same XP whatever difficulty the client claims.
create or replace function public.add_practice_challenge(
    p_skill_id text, p_title text, p_prompt text, p_hint text, p_difficulty integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    new_id text := 'gen-' || replace(gen_random_uuid()::text, '-', '');
begin
    if not public._path_unlocked(uid, (select path_id from public.skills where id = p_skill_id)) then
        raise exception 'Unlock this course first';
    end if;
    if (
        select count(*) from public.challenges
        where generated_for = uid and created_at > now() - interval '24 hours'
    ) >= 15 then
        raise exception 'Daily practice limit reached';
    end if;

    insert into public.challenges (id, path_id, skill_id, title, prompt, hint, difficulty, generated_for)
    values (
        new_id, null, p_skill_id, left(p_title, 200), left(p_prompt, 4000), left(p_hint, 500),
        least(greatest(p_difficulty, 1), 5), uid
    );
    return new_id;
end;
$$;

create or replace function public.mark_comment_helpful(p_comment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    c record;
begin
    select pc.id, pc.user_id as author, s.user_id as owner, pc.helpful
    into c
    from public.project_comments pc
    join public.project_submissions s on s.id = pc.submission_id
    where pc.id = p_comment_id;

    if not found or c.owner <> uid then
        raise exception 'Only the project''s author can mark feedback helpful';
    end if;
    if c.author = uid or c.helpful then
        return 0;
    end if;

    update public.project_comments set helpful = true where id = p_comment_id;

    -- At most 5 helpful-feedback awards a day, so it can't be farmed
    if (
        select count(*) from public.xp_transactions
        where user_id = c.author and reason = 'helped_learner' and created_at > now() - interval '24 hours'
    ) >= 5 then
        return 0;
    end if;
    return public._award_xp(c.author, (select r.xp from public.xp_rules r where r.reason = 'helped_learner'),
        'helped_learner', p_comment_id::text);
end;
$$;

create or replace function public.redeem_reward(p_reward_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    rw public.rewards;
    balance bigint;
begin
    select * into rw from public.rewards where id = p_reward_id;
    if not found then
        raise exception 'Unknown reward %', p_reward_id;
    end if;
    if exists (select 1 from public.user_rewards where user_id = uid and reward_id = rw.id) then
        return jsonb_build_object('ok', true, 'already_owned', true);
    end if;
    if rw.requires_achievement is not null and not exists (
        select 1 from public.user_achievements where user_id = uid and achievement_id = rw.requires_achievement
    ) then
        return jsonb_build_object('ok', false, 'error', 'achievement_required');
    end if;

    perform pg_advisory_xact_lock(hashtextextended('coins:' || uid::text, 0));
    select coalesce(sum(amount), 0) into balance from public.coin_transactions where user_id = uid;
    if balance < rw.cost_coins then
        return jsonb_build_object('ok', false, 'error', 'not_enough_coins', 'balance', balance);
    end if;

    perform public._award_coins(uid, -rw.cost_coins, 'redeem', rw.id);
    insert into public.user_rewards (user_id, reward_id) values (uid, rw.id);
    return jsonb_build_object('ok', true, 'balance', balance - rw.cost_coins);
end;
$$;

-- Skill tree for one path: mastered / in progress / available / locked
create or replace function public.skill_tree(p_path_id text)
returns table (
    skill_id text, name text, "position" integer, mastery numeric, evidence_count integer,
    status text, missing_prerequisites text[]
)
language sql
stable
security definer
set search_path = ''
as $$
    select s.id, s.name, s.position,
        coalesce(us.mastery, 0), coalesce(us.evidence_count, 0),
        case
            when coalesce(us.mastery, 0) >= 0.8 then 'mastered'
            when cardinality(m.missing) > 0 then 'locked'
            when coalesce(us.evidence_count, 0) > 0 then 'in_progress'
            else 'available'
        end,
        m.missing
    from public.skills s
    left join public.user_skills us on us.skill_id = s.id and us.user_id = auth.uid()
    cross join lateral (
        select coalesce(array_agg(p.requires_skill_id order by p.requires_skill_id), '{}') as missing
        from public.skill_prerequisites p
        left join public.user_skills pre on pre.skill_id = p.requires_skill_id and pre.user_id = auth.uid()
        where p.skill_id = s.id and coalesce(pre.mastery, 0) < p.min_mastery
    ) m
    where s.path_id = p_path_id
    order by s.position, s.id;
$$;

-- Course progress and knowledge mastery, side by side and never merged
create or replace function public.course_mastery(p_path_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    with lessons as (
        select count(*) as total,
            count(lp.lesson_id) as done
        from public.course_lessons l
        left join public.lesson_progress lp on lp.lesson_id = l.id and lp.user_id = auth.uid()
        where l.path_id = p_path_id
    ),
    skills as (
        select s.id, s.name, coalesce(us.mastery, 0) as mastery, coalesce(us.evidence_count, 0) as evidence
        from public.skills s
        left join public.user_skills us on us.skill_id = s.id and us.user_id = auth.uid()
        where s.path_id = p_path_id
    )
    select jsonb_build_object(
        'course_progress', (select case when total = 0 then 0 else round(done::numeric / total, 4) end from lessons),
        'knowledge_mastery', (select coalesce(round(avg(mastery), 4), 0) from skills),
        'strong', (select coalesce(jsonb_agg(name order by mastery desc), '[]') from skills where mastery >= 0.8),
        'needs_practice', (select coalesce(jsonb_agg(name order by mastery), '[]')
            from skills where evidence > 0 and mastery < 0.6)
    );
$$;

-- Paths the learner is ready for, by how much of their prerequisite skill set
-- is already demonstrated — not by what keeps them in the app longest
create or replace function public.recommend_paths(p_limit integer default 4)
returns table (path_id text, title text, readiness numeric)
language sql
stable
security definer
set search_path = ''
as $$
    select lp.id, lp.title,
        round(coalesce(avg(case
            when pre.skill_id is null then null
            when coalesce(us.mastery, 0) >= pre.min_mastery then 1
            else 0
        end), 1), 4) as readiness
    from public.learning_paths lp
    left join public.skills s on s.path_id = lp.id
    -- Only prerequisites from other paths: those are what this path builds on
    left join public.skill_prerequisites pre on pre.skill_id = s.id and exists (
        select 1 from public.skills req where req.id = pre.requires_skill_id and req.path_id <> lp.id
    )
    left join public.user_skills us on us.skill_id = pre.requires_skill_id and us.user_id = auth.uid()
    where not exists (
            select 1 from public.course_enrollments e
            where e.user_id = auth.uid() and e.path_id = lp.id and e.completed_at is not null
        )
    group by lp.id, lp.title
    -- Something that builds on what they've done beats a fresh start
    order by readiness desc, count(pre.skill_id) desc, lp.title
    limit least(greatest(p_limit, 1), 20);
$$;

-- What's missing before a certificate can be issued for this path
create or replace function public._certificate_requirements(p_user uuid, p_path text)
returns jsonb
language sql
stable
set search_path = ''
as $$
    with p as (select * from public.learning_paths where id = p_path),
    lessons as (
        select count(*) as total, count(lp.lesson_id) as done
        from public.course_lessons l
        left join public.lesson_progress lp on lp.lesson_id = l.id and lp.user_id = p_user
        where l.path_id = p_path
    ),
    -- One module quiz per skill, passed (quizzes are written on first request)
    quizzes as (
        select count(*) as total,
            count(*) filter (where exists (
                select 1 from public.quizzes q
                join public.quiz_attempts a on a.quiz_id = q.id
                where q.skill_id = s.id and a.user_id = p_user and a.passed and not a.suspicious
            )) as passed
        from public.skills s where s.path_id = p_path
    ),
    challenges as (
        select count(distinct a.challenge_id) as passed
        from public.challenge_attempts a join public.challenges c on c.id = a.challenge_id
        where a.user_id = p_user and a.passed and not a.suspicious and c.path_id = p_path
    ),
    assessment as (
        select score from public.path_assessments
        where user_id = p_user and path_id = p_path order by created_at desc limit 1
    )
    select jsonb_build_object(
        'lessons', jsonb_build_object('done', l.done, 'total', l.total, 'met', l.done = l.total and l.total > 0),
        'quizzes', jsonb_build_object('passed', q.passed, 'total', q.total, 'met', q.passed = q.total),
        'challenges', jsonb_build_object('passed', c.passed, 'required', p.min_challenges, 'met', c.passed >= p.min_challenges),
        'capstone', jsonb_build_object('met', p.capstone_project_id is null or exists (
            select 1 from public.project_submissions s
            where s.user_id = p_user and s.project_id = p.capstone_project_id and s.status = 'passed'
        )),
        'assessment', jsonb_build_object(
            'score', (select score from assessment), 'pass_mark', p.pass_mark,
            'met', coalesce((select score from assessment), 0) >= p.pass_mark
        ),
        'integrity', jsonb_build_object('met', not exists (
            select 1 from public.integrity_flags where user_id = p_user and resolved_at is null
        )),
        'unlocked', jsonb_build_object('met', public._path_unlocked(p_user, p_path), 'cost', p.unlock_cost)
    )
    from p, lessons l, quizzes q, challenges c;
$$;

create or replace function public.certificate_readiness(p_path_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select public._certificate_requirements(public._require_user(), p_path_id);
$$;

-- Everything the IDE's home dashboard needs in one round trip
create or replace function public.my_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    today date := public._today(uid);
    total_xp bigint;
begin
    select coalesce(sum(amount), 0) into total_xp from public.xp_transactions where user_id = uid;

    return jsonb_build_object(
        'level', public._level_for(total_xp),
        'subjects', (
            select coalesce(jsonb_object_agg(subject, public._level_for(xp, subject)), '{}')
            from (
                select lp.subject, sum(t.amount) as xp
                from public.xp_transactions t join public.learning_paths lp on lp.id = t.path_id
                where t.user_id = uid group by lp.subject
            ) s
        ),
        'coins', (select coalesce(sum(amount), 0) from public.coin_transactions where user_id = uid),
        'streak', public._current_streak(uid),
        'weekly_streak', public._weekly_streak(uid),
        'today', (
            select jsonb_build_object('minutes', coalesce(d.minutes, 0), 'goal_minutes', p.daily_goal_minutes,
                'goal_met', coalesce(d.goal_met, false))
            from public.profiles p
            left join public.learning_days d on d.user_id = p.id and d.day = today
            where p.id = uid
        ),
        'week', (
            select coalesce(jsonb_agg(jsonb_build_object('day', day, 'goal_met', goal_met) order by day), '[]')
            from public.learning_days
            where user_id = uid and day >= date_trunc('week', today)::date
        ),
        'quests', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', q.id, 'cadence', q.cadence, 'title', q.title, 'target', q.target, 'xp', q.xp,
                'progress', least(coalesce(qp.progress, 0), q.target), 'completed', qp.completed_at is not null
            ) order by q.cadence, q.id), '[]')
            from public.quests q
            left join public.quest_progress qp on qp.quest_id = q.id and qp.user_id = uid
                and qp.period_start = case q.cadence when 'daily' then today else date_trunc('week', today)::date end
            where q.active
        ),
        'skills', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'skill_id', us.skill_id, 'name', s.name, 'mastery', us.mastery
            ) order by us.mastery desc), '[]')
            from public.user_skills us join public.skills s on s.id = us.skill_id
            where us.user_id = uid and us.evidence_count > 0
        ),
        'achievements', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', a.id, 'name', a.name, 'icon', a.icon, 'earned_at', ua.earned_at
            ) order by ua.earned_at desc), '[]')
            from public.user_achievements ua join public.achievements a on a.id = ua.achievement_id
            where ua.user_id = uid
        )
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Service role API (Edge Functions: AI review, explanations, assessments,
-- certificate issuing)
-- ---------------------------------------------------------------------------

-- Acyrx judged an explanation the learner gave. p_score is 0..1.
create or replace function public.record_explanation(p_user uuid, p_skill_id text, p_score numeric, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    mastery numeric;
    xp integer := 0;
begin
    mastery := public._add_evidence(p_user, p_skill_id, 'explanation', p_score, p_source);
    if p_score >= 0.7 then
        xp := public._award_xp(p_user, (select r.xp from public.xp_rules r where r.reason = 'explanation'),
            'explanation', p_source, (select path_id from public.skills where id = p_skill_id));
    end if;
    return jsonb_build_object('xp', xp, 'mastery', mastery,
        'achievements', to_jsonb(public._check_achievements(p_user)));
end;
$$;

-- Acyrx's project review. p_review holds the per-criterion scores
-- (correctness, code_quality, architecture, testing, understanding).
create or replace function public.review_project(
    p_submission_id uuid, p_review jsonb, p_overall numeric, p_passed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    sub public.project_submissions;
    pr public.projects;
    skill text;
    m_before numeric;
    m_after numeric;
    gains jsonb := '{}';
    xp integer := 0;
begin
    select * into sub from public.project_submissions where id = p_submission_id for update;
    if not found then
        raise exception 'Unknown submission %', p_submission_id;
    end if;
    select * into pr from public.projects where id = sub.project_id;

    update public.project_submissions
        set review = p_review, overall_score = p_overall, reviewed_at = now(),
            -- A flagged (copied) submission stays flagged until a person clears it
            status = case when status = 'flagged' then 'flagged' when p_passed then 'passed' else 'needs_work' end
        where id = sub.id
        returning * into sub;

    if sub.status = 'flagged' then
        return jsonb_build_object('status', sub.status, 'xp', 0);
    end if;

    foreach skill in array pr.skill_ids loop
        select coalesce(mastery, 0) into m_before from public.user_skills where user_id = sub.user_id and skill_id = skill;
        m_after := public._add_evidence(sub.user_id, skill, 'project', p_overall, sub.id::text);
        gains := gains || jsonb_build_object(skill, jsonb_build_object('before', coalesce(m_before, 0), 'after', m_after));
    end loop;

    if sub.status = 'passed' then
        xp := public._award_xp(sub.user_id, pr.xp, 'project', pr.id, pr.path_id);
        if xp > 0 then
            perform public._bump_quests(sub.user_id, 'projects', 1);
        end if;
        if pr.achievement_id is not null then
            perform public._grant_achievement(sub.user_id, pr.achievement_id);
        end if;
    end if;

    return jsonb_build_object('status', sub.status, 'xp', xp, 'skills', gains,
        'achievements', to_jsonb(public._check_achievements(sub.user_id)));
end;
$$;

-- Final assessment for a path: p_skill_scores is {"python.loops": 0.9, ...}
create or replace function public.record_assessment(p_user uuid, p_path_id text, p_skill_scores jsonb)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
    overall numeric;
    s record;
begin
    select round(avg(value::numeric), 4) into overall from jsonb_each_text(p_skill_scores);
    if overall is null then
        raise exception 'No skill scores';
    end if;
    insert into public.path_assessments (user_id, path_id, score) values (p_user, p_path_id, overall);
    for s in select key, value::numeric as score from jsonb_each_text(p_skill_scores) loop
        perform public._add_evidence(p_user, s.key, 'assessment', s.score, 'assessment:' || p_path_id);
    end loop;
    perform public._check_achievements(p_user);
    return overall;
end;
$$;

create or replace function public.issue_certificate(p_user uuid, p_path_id text, p_holder_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    reqs jsonb := public._certificate_requirements(p_user, p_path_id);
    missing text[];
    cert_id text;
    existing text;
begin
    if reqs is null then
        raise exception 'Unknown path %', p_path_id;
    end if;
    select array_agg(key) into missing from jsonb_each(reqs) where not (value ->> 'met')::boolean;
    if missing is not null then
        return jsonb_build_object('issued', false, 'missing', to_jsonb(missing), 'requirements', reqs);
    end if;

    select id into existing from public.certificates
    where user_id = p_user and path_id = p_path_id and status = 'valid';
    if existing is not null then
        return jsonb_build_object('issued', false, 'certificate_id', existing, 'already_issued', true);
    end if;

    loop
        cert_id := 'VYLOS-' || extract(year from now())::integer || '-'
            || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
        exit when not exists (select 1 from public.certificates where id = cert_id);
    end loop;

    insert into public.certificates (
        id, user_id, path_id, holder_name, final_assessment, projects, challenges, skills_demonstrated
    )
    values (
        cert_id, p_user, p_path_id, p_holder_name,
        (reqs -> 'assessment' ->> 'score')::numeric,
        (select count(distinct s.project_id) from public.project_submissions s
            join public.projects pr on pr.id = s.project_id
            where s.user_id = p_user and s.status = 'passed' and pr.path_id = p_path_id),
        (reqs -> 'challenges' ->> 'passed')::integer,
        0
    );

    insert into public.certificate_skills (certificate_id, skill_id, mastery)
    select cert_id, us.skill_id, us.mastery
    from public.user_skills us join public.skills s on s.id = us.skill_id
    where us.user_id = p_user and s.path_id = p_path_id and us.mastery >= 0.7;

    update public.certificates
        set skills_demonstrated = (select count(*) from public.certificate_skills where certificate_id = cert_id)
        where id = cert_id;

    -- Enough, with the course's own XP, to unlock what comes next
    perform public._award_coins(p_user, 200, 'certificate', p_path_id);

    return jsonb_build_object('issued', true, 'certificate_id', cert_id);
end;
$$;

create or replace function public.revoke_certificate(p_certificate_id text, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.certificates
        set status = 'revoked', revoked_at = now(), revoked_reason = p_reason
        where id = p_certificate_id;
$$;

-- ---------------------------------------------------------------------------
-- Public API (anyone, including the website with the anon key)
-- ---------------------------------------------------------------------------

create or replace function public.verify_certificate(p_certificate_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    cert record;
begin
    select c.*, lp.title as path_title, lp.subject
    into cert
    from public.certificates c join public.learning_paths lp on lp.id = c.path_id
    where c.id = upper(trim(p_certificate_id));

    if not found then
        return null;
    end if;

    insert into public.certificate_verifications (certificate_id) values (cert.id);

    return jsonb_build_object(
        'id', cert.id,
        'holder_name', cert.holder_name,
        'course', cert.path_title,
        'subject', cert.subject,
        'issuer', 'Vylos',
        'issued_at', cert.issued_at,
        'status', cert.status,
        'revoked_at', cert.revoked_at,
        'final_assessment', cert.final_assessment,
        'projects', cert.projects,
        'challenges', cert.challenges,
        'skills_demonstrated', cert.skills_demonstrated,
        'skills', (
            select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'mastery', cs.mastery)
                order by cs.mastery desc), '[]')
            from public.certificate_skills cs join public.skills s on s.id = cs.skill_id
            where cs.certificate_id = cert.id
        ),
        'profile_handle', (select handle from public.profiles where id = cert.user_id and is_public)
    );
end;
$$;

-- Only for learners who made their profile public
create or replace function public.public_profile(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    p public.profiles;
    total_xp bigint;
begin
    select * into p from public.profiles where handle = lower(p_handle) and is_public;
    if not found then
        return null;
    end if;
    select coalesce(sum(amount), 0) into total_xp from public.xp_transactions where user_id = p.id;

    return jsonb_build_object(
        'handle', p.handle,
        'display_name', coalesce(p.display_name, p.handle),
        'avatar_url', p.avatar_url,
        'bio', p.bio,
        'member_since', p.created_at,
        'level', public._level_for(total_xp),
        'streak', public._current_streak(p.id),
        'league', public._league(p.id),
        -- Verified skills: enough evidence behind them to mean something
        'skills', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'name', s.name, 'mastery', us.mastery, 'evidence', us.evidence_count,
                'challenges', (select count(*) from public.user_skill_evidence e
                    where e.user_id = p.id and e.skill_id = us.skill_id and e.kind in ('challenge', 'debugging')),
                'projects', (select count(*) from public.user_skill_evidence e
                    where e.user_id = p.id and e.skill_id = us.skill_id and e.kind = 'project'),
                'assessed', exists (select 1 from public.user_skill_evidence e
                    where e.user_id = p.id and e.skill_id = us.skill_id and e.kind = 'assessment')
            ) order by us.mastery desc), '[]')
            from public.user_skills us join public.skills s on s.id = us.skill_id
            where us.user_id = p.id and us.evidence_count >= 5 and us.mastery >= 0.6
        ),
        'projects', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'title', pr.title, 'repo_url', sub.repo_url, 'reviewed_at', sub.reviewed_at
            ) order by sub.reviewed_at desc), '[]')
            from public.project_submissions sub join public.projects pr on pr.id = sub.project_id
            where sub.user_id = p.id and sub.status = 'passed' and sub.is_public
        ),
        'project_count', (
            select count(distinct project_id) from public.project_submissions
            where user_id = p.id and status = 'passed'
        ),
        'certificates', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', c.id, 'course', lp.title, 'issued_at', c.issued_at
            ) order by c.issued_at desc), '[]')
            from public.certificates c join public.learning_paths lp on lp.id = c.path_id
            where c.user_id = p.id and c.status = 'valid'
        ),
        'achievements', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', a.id, 'name', a.name, 'description', a.description, 'icon', a.icon, 'earned_at', ua.earned_at
            ) order by ua.earned_at desc), '[]')
            from public.user_achievements ua join public.achievements a on a.id = ua.achievement_id
            where ua.user_id = p.id
        )
    );
end;
$$;

-- Weekly league from demonstrated learning only: solving, passing, building,
-- explaining. Lessons, time spent and streak bonuses don't count.
create or replace function public._league(p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
    select case
        when xp >= 3000 then 'Diamond'
        when xp >= 1800 then 'Platinum'
        when xp >= 900 then 'Gold'
        when xp >= 300 then 'Silver'
        else 'Bronze'
    end
    from (
        select coalesce(sum(amount), 0) as xp from public.xp_transactions
        where user_id = p_user and created_at > now() - interval '7 days'
            and reason in ('challenge', 'quiz', 'project', 'explanation', 'helped_learner')
    ) t;
$$;

-- Boards: 'weekly', 'all_time', 'course' (p_scope = path id), 'skill'
-- (p_scope = skill id, ranked by mastery) and 'friends' (signed in: the
-- people you follow). Only learners who opted in ever appear.
create or replace function public.leaderboard(p_board text, p_scope text default null, p_limit integer default 50)
returns table (rank bigint, handle text, display_name text, avatar_url text, value numeric, league text, level integer)
language sql
stable
security definer
set search_path = ''
as $$
    with eligible as (
        select p.id, p.handle, coalesce(p.display_name, p.handle) as display_name, p.avatar_url
        from public.profiles p
        where p.show_on_leaderboards and p.handle is not null
            and (p_board <> 'friends' or p.id = auth.uid() or exists (
                select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id
            ))
    ),
    scored as (
        select e.*,
            case
                when p_board = 'skill' then (
                    select us.mastery * 100 from public.user_skills us
                    where us.user_id = e.id and us.skill_id = p_scope and us.evidence_count >= 5
                )
                else (
                    select sum(t.amount) from public.xp_transactions t
                    where t.user_id = e.id
                        and (p_board = 'all_time' or p_board = 'course'
                            or t.created_at > now() - interval '7 days')
                        and (p_board <> 'course' or t.path_id = p_scope)
                )
            end as value
        from eligible e
    )
    select rank() over (order by s.value desc), s.handle, s.display_name, s.avatar_url,
        round(s.value, 1), public._league(s.id),
        (public._level_for((select coalesce(sum(amount), 0) from public.xp_transactions where user_id = s.id)) ->> 'level')::integer
    from scored s
    where s.value > 0
        and p_board in ('weekly', 'all_time', 'course', 'skill', 'friends')
        and (p_board not in ('course', 'skill') or p_scope is not null)
    order by s.value desc, s.handle
    limit least(greatest(p_limit, 1), 100);
$$;


-- ---------------------------------------------------------------------------
-- Additions for the desktop app
-- ---------------------------------------------------------------------------

-- Final assessments: questions the learning Edge Function wrote for one
-- learner, with the rubric it grades against. Service role only, so the
-- rubric never reaches the app.
create table if not exists public.assessment_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    path_id text not null references public.learning_paths (id) on delete cascade,
    -- [{"id": "q1", "skill_id": "...", "question": "...", "rubric": "..."}]
    questions jsonb not null,
    created_at timestamptz not null default now(),
    submitted_at timestamptz,
    score numeric check (score between 0 and 1)
);
create index if not exists assessment_sessions_user on public.assessment_sessions (user_id, path_id, created_at);
alter table public.assessment_sessions enable row level security;
revoke all on table public.assessment_sessions from anon, authenticated;

-- Progress made before the app synced it (kept on the device). Records the
-- lessons as done, for course progress, but earns nothing: there's no way to
-- know how they were done.
create or replace function public.import_lesson_progress(p_lesson_ids text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    imported integer;
    p text;
begin
    if cardinality(p_lesson_ids) > 5000 then
        raise exception 'Too many lessons';
    end if;

    insert into public.lesson_progress (user_id, lesson_id, seconds_spent)
    select uid, l.id, 0
    from public.course_lessons l
    where l.id = any (p_lesson_ids)
    on conflict do nothing;
    get diagnostics imported = row_count;

    for p in
        select distinct l.path_id from public.course_lessons l where l.id = any (p_lesson_ids)
    loop
        -- Courses started before coins unlocked courses stay open for those learners
        if (select created_at from public.profiles where id = uid) < timestamptz '2026-09-24' then
            insert into public.course_unlocks (user_id, path_id, cost)
            select uid, p, 0
            where not public._path_unlocked(uid, p)
            on conflict do nothing;
        end if;
        insert into public.course_enrollments (user_id, path_id) values (uid, p) on conflict do nothing;
        perform public._sync_course_completion(uid, p);
    end loop;
    if imported > 0 then
        perform public._grant_achievement(uid, 'first_steps');
    end if;
    return imported;
end;
$$;


-- ---------------------------------------------------------------------------
-- Course unlocks (Vylos Coins)
-- ---------------------------------------------------------------------------

-- Every course with its price and whether this learner has it
create or replace function public.course_access()
returns table (path_id text, unlock_cost integer, unlocked boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select lp.id, lp.unlock_cost, public._path_unlocked(auth.uid(), lp.id)
    from public.learning_paths lp;
$$;

create or replace function public.unlock_course(p_path_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    cost integer;
    balance bigint;
begin
    select unlock_cost into cost from public.learning_paths where id = p_path_id;
    if not found then
        raise exception 'Unknown course %', p_path_id;
    end if;
    if public._path_unlocked(uid, p_path_id) then
        return jsonb_build_object('ok', true, 'already_unlocked', true);
    end if;

    perform pg_advisory_xact_lock(hashtextextended('coins:' || uid::text, 0));
    select coalesce(sum(amount), 0) into balance from public.coin_transactions where user_id = uid;
    if balance < cost then
        return jsonb_build_object('ok', false, 'error', 'not_enough_coins', 'balance', balance, 'cost', cost);
    end if;

    perform public._award_coins(uid, -cost, 'unlock_course', p_path_id);
    insert into public.course_unlocks (user_id, path_id, cost) values (uid, p_path_id, cost);
    insert into public.course_enrollments (user_id, path_id) values (uid, p_path_id) on conflict do nothing;
    return jsonb_build_object('ok', true, 'balance', balance - cost);
end;
$$;

-- ---------------------------------------------------------------------------
-- Social: following, shared projects, feedback
-- ---------------------------------------------------------------------------

create or replace function public.follow(p_handle text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    target uuid;
begin
    select id into target from public.profiles where handle = lower(trim(p_handle));
    if target is null then
        raise exception 'No learner has the handle %', p_handle;
    end if;
    if target = uid then
        raise exception 'You can''t follow yourself';
    end if;
    insert into public.follows (follower_id, followee_id) values (uid, target) on conflict do nothing;
    return true;
end;
$$;

create or replace function public.unfollow(p_handle text)
returns void
language sql
security definer
set search_path = ''
as $$
    delete from public.follows
    where follower_id = public._require_user()
        and followee_id = (select id from public.profiles where handle = lower(trim(p_handle)));
$$;

-- Who the learner follows. Details only for public profiles.
create or replace function public.my_following()
returns table (handle text, display_name text, is_public boolean, level integer, streak integer)
language sql
stable
security definer
set search_path = ''
as $$
    select p.handle, coalesce(p.display_name, p.handle), p.is_public,
        case when p.is_public then (public._level_for((select coalesce(sum(amount), 0) from public.xp_transactions where user_id = p.id)) ->> 'level')::integer end,
        case when p.is_public then public._current_streak(p.id) end
    from public.follows f join public.profiles p on p.id = f.followee_id
    where f.follower_id = public._require_user()
    order by p.handle;
$$;

-- Shared, passed projects: from people the learner follows and their own
-- first, then everyone else's
create or replace function public.project_feed(p_limit integer default 30)
returns table (
    submission_id uuid, handle text, display_name text, project text, course text, repo_url text,
    overall_score numeric, reviewed_at timestamptz, comments bigint, is_mine boolean, followed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    select s.id, p.handle, coalesce(p.display_name, p.handle), pr.title, lp.title, s.repo_url,
        s.overall_score, s.reviewed_at,
        (select count(*) from public.project_comments c where c.submission_id = s.id),
        s.user_id = auth.uid(),
        exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = s.user_id)
    from public.project_submissions s
    join public.profiles p on p.id = s.user_id
    join public.projects pr on pr.id = s.project_id
    join public.learning_paths lp on lp.id = pr.path_id
    where s.is_public and s.status = 'passed' and p.handle is not null
    order by (s.user_id = auth.uid() or exists (
        select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = s.user_id
    )) desc, s.reviewed_at desc
    limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.submission_comments(p_submission_id uuid)
returns table (id uuid, handle text, display_name text, body text, helpful boolean, created_at timestamptz, is_mine boolean, can_mark_helpful boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, p.handle, coalesce(p.display_name, p.handle, 'A learner'), c.body, c.helpful, c.created_at,
        c.user_id = auth.uid(),
        s.user_id = auth.uid() and c.user_id <> auth.uid() and not c.helpful
    from public.project_comments c
    join public.project_submissions s on s.id = c.submission_id
    join public.profiles p on p.id = c.user_id
    where c.submission_id = p_submission_id and (s.is_public or s.user_id = auth.uid())
    order by c.created_at;
$$;

create or replace function public.add_comment(p_submission_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := public._require_user();
    new_id uuid;
begin
    if (select handle from public.profiles where id = uid) is null then
        raise exception 'Choose a handle before giving feedback';
    end if;
    if not exists (select 1 from public.project_submissions where id = p_submission_id and is_public) then
        raise exception 'That project isn''t shared';
    end if;
    if char_length(trim(p_body)) not between 1 and 2000 then
        raise exception 'Feedback must be 1 to 2000 characters';
    end if;
    if (select count(*) from public.project_comments where user_id = uid and created_at > now() - interval '24 hours') >= 30 then
        raise exception 'That''s enough feedback for today';
    end if;
    insert into public.project_comments (submission_id, user_id, body) values (p_submission_id, uid, trim(p_body))
    returning id into new_id;
    return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

do $$
declare
    f record;
begin
    -- Start from nothing: Postgres and Supabase grant EXECUTE widely by default
    for f in
        select p.oid::regprocedure as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in (
            'handle_new_learner', '_daily_xp_cap', '_today', '_flag', '_level_for', '_award_xp', '_award_coins',
            '_grant_achievement', '_recompute_mastery', '_add_evidence', '_current_streak', '_weekly_streak',
            '_bump_quests', '_check_achievements', '_sync_course_completion', '_require_user', '_league',
            '_certificate_requirements',
            'enroll', 'complete_lesson', 'record_program_run', 'record_challenge_attempt', 'submit_quiz',
            'log_learning_time', 'submit_project', 'add_practice_challenge', 'mark_comment_helpful',
            'redeem_reward', 'skill_tree', 'course_mastery', 'recommend_paths', 'certificate_readiness',
            'my_progress', 'record_explanation', 'review_project', 'record_assessment', 'issue_certificate',
            'revoke_certificate', 'verify_certificate', 'public_profile', 'leaderboard',
            'import_lesson_progress', '_path_unlocked', 'course_access', 'unlock_course', 'follow', 'unfollow',
            'my_following', 'project_feed', 'submission_comments', 'add_comment'
        )
    loop
        execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
        execute format('grant execute on function %s to service_role', f.sig);
    end loop;
end;
$$;

grant execute on function
    public.enroll(text),
    public.complete_lesson(text, integer),
    public.record_program_run(),
    public.record_challenge_attempt(text, boolean, integer, integer, text),
    public.submit_quiz(text, jsonb, integer),
    public.log_learning_time(integer),
    public.submit_project(text, text, text),
    public.add_practice_challenge(text, text, text, text, integer),
    public.mark_comment_helpful(uuid),
    public.redeem_reward(text),
    public.skill_tree(text),
    public.course_mastery(text),
    public.recommend_paths(integer),
    public.certificate_readiness(text),
    public.my_progress(),
    public.import_lesson_progress(text[]),
    public.unlock_course(text),
    public.follow(text),
    public.unfollow(text),
    public.my_following(),
    public.project_feed(integer),
    public.submission_comments(uuid),
    public.add_comment(uuid, text)
to authenticated;

grant execute on function public.course_access() to anon, authenticated;

grant execute on function
    public.verify_certificate(text),
    public.public_profile(text),
    public.leaderboard(text, text, integer)
to anon, authenticated;
