-- Courses live in the database. Until 0.6.0 they were TypeScript files in the
-- app (app/lib/learning/curricula) and `npm run catalog:sql` copied them into
-- the learning engine's catalog. Now public.courses holds each course's full
-- definition, the app downloads the published ones, and a trigger keeps the
-- catalog (learning_paths, skills, course_lessons, challenges, projects) in
-- step with every insert and update, so there is nothing to regenerate.
--
-- Add or edit courses with `npm run courses -- push` (see docs/courses.md) or
-- straight from the Supabase Table Editor; validate_course() rejects a
-- definition the app could not show.
--
-- definition (jsonb), everything about a course except its id:
--   title, tagline, level, hours, accent, badge       required
--   category       language | framework | ai | vibe | security | essentials
--   stack          tag shown on the card, e.g. 'JavaScript'
--   buildsOn       id of a course whose functions module this one's first module requires
--   requires       tool ids the learner needs installed (app/lib/setup/tools.ts)
--   tutorGuidelines  rules for the AI tutor
--   capstone       { title, description, requirements[], achievementId? }
--   modules[]      { id, title, description, lessons[] }
--   lessons[]      { id, title, exercise? }
-- Module and lesson ids are what progress is stored against: keep them when
-- you reword a title, or learners lose that progress.

create table if not exists public.courses (
    id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    -- Order within its catalog section
    position integer not null default 0,
    -- Unpublished courses are hidden from the app but keep their catalog
    -- rows, so nobody's progress or certificates are touched
    published boolean not null default true,
    definition jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists courses_published_position on public.courses (position) where published;

-- ---------------------------------------------------------------------------
-- Validation: the structure the app and the catalog rely on. Exercise checks
-- are validated in full by the app (app/lib/exercises/format.ts) and by
-- `npm run courses -- push`; here only their shape.
-- ---------------------------------------------------------------------------

create or replace function public.validate_course(p_id text, p_def jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
    m jsonb;
    l jsonb;
    field text;
    module_ids text[] := '{}';
    lesson_ids text[] := '{}';
    slug constant text := '^[a-z0-9]+(-[a-z0-9]+)*$';
begin
    if jsonb_typeof(p_def) is distinct from 'object' then
        raise exception 'Course "%": definition must be a JSON object', p_id;
    end if;
    if p_def ? 'id' then
        raise exception 'Course "%": leave "id" out of definition, it is the row''s id column', p_id;
    end if;

    foreach field in array array['title', 'tagline', 'level', 'accent', 'badge'] loop
        if jsonb_typeof(p_def -> field) is distinct from 'string' or btrim(p_def ->> field) = '' then
            raise exception 'Course "%": "%" is required and must be text', p_id, field;
        end if;
    end loop;
    if jsonb_typeof(p_def -> 'hours') is distinct from 'number' or (p_def ->> 'hours')::numeric <= 0 then
        raise exception 'Course "%": "hours" must be a positive number', p_id;
    end if;
    if p_def ? 'category' and coalesce(p_def ->> 'category', '') not in ('language', 'framework', 'ai', 'vibe', 'security', 'essentials') then
        raise exception 'Course "%": "category" must be one of language, framework, ai, vibe, security, essentials', p_id;
    end if;
    if p_def ? 'buildsOn' and (jsonb_typeof(p_def -> 'buildsOn') <> 'string' or p_def ->> 'buildsOn' = p_id) then
        raise exception 'Course "%": "buildsOn" must be another course''s id', p_id;
    end if;
    foreach field in array array['requires', 'tutorGuidelines'] loop
        if p_def ? field and jsonb_typeof(p_def -> field) <> 'array' then
            raise exception 'Course "%": "%" must be a list', p_id, field;
        end if;
    end loop;
    if p_def ? 'capstone' and (
        jsonb_typeof(p_def -> 'capstone' -> 'title') is distinct from 'string'
        or jsonb_typeof(p_def -> 'capstone' -> 'description') is distinct from 'string'
        or jsonb_typeof(p_def -> 'capstone' -> 'requirements') is distinct from 'array'
    ) then
        raise exception 'Course "%": "capstone" needs a title, a description and a list of requirements', p_id;
    end if;

    if jsonb_typeof(p_def -> 'modules') is distinct from 'array' or jsonb_array_length(p_def -> 'modules') = 0 then
        raise exception 'Course "%": "modules" must be a non-empty list', p_id;
    end if;
    for m in select value from jsonb_array_elements(p_def -> 'modules') loop
        if coalesce(m ->> 'id', '') !~ slug then
            raise exception 'Course "%": module "%" needs an "id" in lower-case-with-dashes', p_id, coalesce(m ->> 'title', '?');
        end if;
        if (m ->> 'id') = any (module_ids) then
            raise exception 'Course "%": two modules share the id "%"', p_id, m ->> 'id';
        end if;
        module_ids := module_ids || (m ->> 'id');
        if jsonb_typeof(m -> 'title') is distinct from 'string' or jsonb_typeof(m -> 'description') is distinct from 'string' then
            raise exception 'Course "%": module "%" needs a title and a description', p_id, m ->> 'id';
        end if;
        if jsonb_typeof(m -> 'lessons') is distinct from 'array' or jsonb_array_length(m -> 'lessons') = 0 then
            raise exception 'Course "%": module "%" needs at least one lesson', p_id, m ->> 'id';
        end if;
        for l in select value from jsonb_array_elements(m -> 'lessons') loop
            if coalesce(l ->> 'id', '') !~ slug then
                raise exception 'Course "%": lesson "%" needs an "id" in lower-case-with-dashes', p_id, coalesce(l ->> 'title', l #>> '{}');
            end if;
            if (l ->> 'id') = any (lesson_ids) then
                raise exception 'Course "%": two lessons share the id "%"', p_id, l ->> 'id';
            end if;
            lesson_ids := lesson_ids || (l ->> 'id');
            if jsonb_typeof(l -> 'title') is distinct from 'string' then
                raise exception 'Course "%": lesson "%" needs a title', p_id, l ->> 'id';
            end if;
            if l ? 'exercise' and (
                jsonb_typeof(l -> 'exercise' -> 'prompt') is distinct from 'string'
                or jsonb_typeof(l -> 'exercise' -> 'files') is distinct from 'object'
                or coalesce(l -> 'exercise' -> 'check' ->> 'type', '') not in ('output', 'function')
            ) then
                raise exception 'Course "%": lesson "%" has an exercise without a prompt, files and an output or function check', p_id, l ->> 'id';
            end if;
        end loop;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog sync. The ids match app/lib/learning/progress-ids.ts:
-- path = course id, skill = '<course>/<module id>', lesson and challenge =
-- '<course>/<lesson id>', capstone = '<course>/capstone'.
-- ---------------------------------------------------------------------------

-- The skill of a course's first module that mentions functions; what courses
-- that build on it require.
create or replace function public._course_functions_skill(p_course text)
returns text
language sql
stable
set search_path = ''
as $$
    select p_course || '/' || (m.value ->> 'id')
    from public.courses c, jsonb_array_elements(c.definition -> 'modules') with ordinality as m(value, n)
    where c.id = p_course and (m.value ->> 'title') ~* 'function'
    order by m.n
    limit 1;
$$;

create or replace function public._sync_course_catalog(p_course text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    def jsonb;
    skill_ids text[];
    lesson_ids text[];
    challenge_ids text[];
    exercises integer;
    capstone jsonb;
    base_skill text;
    dependent record;
begin
    select definition into def from public.courses where id = p_course;
    if def is null then
        return;
    end if;

    select array_agg(p_course || '/' || (m.value ->> 'id') order by m.n)
    into skill_ids
    from jsonb_array_elements(def -> 'modules') with ordinality as m(value, n);

    select count(*) into exercises
    from jsonb_array_elements(def -> 'modules') m, jsonb_array_elements(m.value -> 'lessons') l
    where l.value ? 'exercise';

    -- Path. Prices match unlockCost() in progress-ids.ts: beginner courses
    -- are free, AI courses 750 coins, the rest 500.
    insert into public.learning_paths (id, subject, title, description, min_challenges, pass_mark, unlock_cost)
    values (
        p_course,
        case when def ->> 'category' = 'ai' then 'ai' else 'programming' end,
        def ->> 'title',
        def ->> 'tagline',
        ceil(exercises * 0.8)::integer,
        0.7,
        case
            when (def ->> 'level') ~* '^beginner' then 0
            when def ->> 'category' = 'ai' then 750
            else 500
        end
    )
    on conflict (id) do update set
        subject = excluded.subject, title = excluded.title, description = excluded.description,
        min_challenges = excluded.min_challenges, unlock_cost = excluded.unlock_cost;

    -- Skills, one per module
    insert into public.skills (id, path_id, name, position)
    select p_course || '/' || (m.value ->> 'id'), p_course, m.value ->> 'title', m.n
    from jsonb_array_elements(def -> 'modules') with ordinality as m(value, n)
    on conflict (id) do update set path_id = excluded.path_id, name = excluded.name, position = excluded.position;

    -- Each module builds on the one before it, and the first on the base
    -- course's functions module
    delete from public.skill_prerequisites where skill_id = any (skill_ids);
    insert into public.skill_prerequisites (skill_id, requires_skill_id, min_mastery)
    select skill_ids[i], skill_ids[i - 1], 0.5
    from generate_series(2, cardinality(skill_ids)) as i
    on conflict do nothing;
    if def ? 'buildsOn' then
        base_skill := public._course_functions_skill(def ->> 'buildsOn');
        if base_skill is not null and exists (select 1 from public.skills where id = base_skill) then
            insert into public.skill_prerequisites (skill_id, requires_skill_id, min_mastery)
            values (skill_ids[1], base_skill, 0.5)
            on conflict do nothing;
        end if;
    end if;
    -- Courses built on this one may have been added before it
    base_skill := public._course_functions_skill(p_course);
    if base_skill is not null then
        for dependent in
            select c.id, c.definition -> 'modules' -> 0 ->> 'id' as first_module
            from public.courses c
            where c.definition ->> 'buildsOn' = p_course and c.id <> p_course
        loop
            if exists (select 1 from public.skills where id = dependent.id || '/' || dependent.first_module) then
                insert into public.skill_prerequisites (skill_id, requires_skill_id, min_mastery)
                values (dependent.id || '/' || dependent.first_module, base_skill, 0.5)
                on conflict do nothing;
            end if;
        end loop;
    end if;

    -- Lessons, numbered through the whole course
    insert into public.course_lessons (id, path_id, skill_id, title, position)
    select p_course || '/' || (l.value ->> 'id'), p_course, p_course || '/' || (m.value ->> 'id'), l.value ->> 'title',
           row_number() over (order by m.n, l.n)
    from jsonb_array_elements(def -> 'modules') with ordinality as m(value, n),
         jsonb_array_elements(m.value -> 'lessons') with ordinality as l(value, n)
    on conflict (id) do update set
        path_id = excluded.path_id, skill_id = excluded.skill_id, title = excluded.title, position = excluded.position;

    -- A lesson's exercise is tracked as a challenge with the lesson's id
    insert into public.challenges (id, path_id, skill_id, title, prompt, hint, difficulty, kind, min_seconds)
    select p_course || '/' || (l.value ->> 'id'), p_course, p_course || '/' || (m.value ->> 'id'), l.value ->> 'title',
           l.value -> 'exercise' ->> 'prompt', l.value -> 'exercise' -> 'hints' ->> 0, 2, 'coding', 20
    from jsonb_array_elements(def -> 'modules') with ordinality as m(value, n),
         jsonb_array_elements(m.value -> 'lessons') with ordinality as l(value, n)
    where l.value ? 'exercise'
    on conflict (id) do update set
        path_id = excluded.path_id, skill_id = excluded.skill_id, title = excluded.title,
        prompt = excluded.prompt, hint = excluded.hint;

    -- Capstone. Without one in the definition the course gets the general
    -- capstone, the same as capstoneFor() in progress-ids.ts.
    capstone := coalesce(def -> 'capstone', jsonb_build_object(
        'title', (def ->> 'title') || ' capstone',
        'description', 'Build a small but complete project of your own choosing with what you learned in '
            || (def ->> 'title') || ', then submit it for review.',
        'requirements', jsonb_build_array(
            'Solves a real problem you can describe in a sentence',
            'Uses the core ideas from at least half of the course''s modules',
            'Handles bad input and errors without crashing',
            'Organized into sensible files and functions',
            'Includes a short README explaining how to run it and your design decisions',
            'Includes at least a few tests, or a documented way to check it works'
        )
    ));
    insert into public.projects (id, path_id, title, description, requirements, skill_ids, is_capstone, xp, achievement_id)
    values (
        p_course || '/capstone', p_course, capstone ->> 'title', capstone ->> 'description',
        capstone -> 'requirements', skill_ids, true, 500, capstone ->> 'achievementId'
    )
    on conflict (id) do update set
        title = excluded.title, description = excluded.description, requirements = excluded.requirements,
        skill_ids = excluded.skill_ids, achievement_id = excluded.achievement_id;
    update public.learning_paths set capstone_project_id = p_course || '/capstone' where id = p_course;

    -- What the course no longer has, with the progress recorded against it
    select coalesce(array_agg(p_course || '/' || (l.value ->> 'id')), '{}'),
           coalesce(array_agg(p_course || '/' || (l.value ->> 'id')) filter (where l.value ? 'exercise'), '{}')
    into lesson_ids, challenge_ids
    from jsonb_array_elements(def -> 'modules') m, jsonb_array_elements(m.value -> 'lessons') l;

    delete from public.course_lessons where path_id = p_course and not (id = any (lesson_ids));
    delete from public.challenges where path_id = p_course and generated_for is null and not (id = any (challenge_ids));
    delete from public.skills where path_id = p_course and not (id = any (skill_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public._courses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'UPDATE' and new.id <> old.id then
        raise exception 'Course ids cannot change: progress is stored against "%". Create a new course instead.', old.id;
    end if;
    perform public.validate_course(new.id, new.definition);
    new.updated_at := now();
    return new;
end;
$$;

create or replace function public._courses_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public._sync_course_catalog(new.id);
    return null;
end;
$$;

-- Deleting a course would take every learner's progress, XP evidence and
-- certificates for it along with its catalog rows. Once anyone has enrolled,
-- unpublish it instead (published = false). The catalog rows of a course
-- nobody has started are removed with it.
create or replace function public._courses_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (select 1 from public.course_enrollments where path_id = old.id)
       or exists (select 1 from public.lesson_progress p join public.course_lessons l on l.id = p.lesson_id where l.path_id = old.id) then
        raise exception 'Course "%" has learners. Set published = false to hide it; deleting it would erase their progress.', old.id
            using hint = 'To erase it anyway, delete from public.learning_paths where id = ''' || old.id || ''' first.';
    end if;
    delete from public.learning_paths where id = old.id;
    return old;
end;
$$;

drop trigger if exists courses_before_write on public.courses;
create trigger courses_before_write before insert or update on public.courses
    for each row execute function public._courses_before_write();

drop trigger if exists courses_after_write on public.courses;
create trigger courses_after_write after insert or update of definition on public.courses
    for each row execute function public._courses_after_write();

drop trigger if exists courses_before_delete on public.courses;
create trigger courses_before_delete before delete on public.courses
    for each row execute function public._courses_before_delete();

-- ---------------------------------------------------------------------------
-- Access: everyone reads published courses; writes need the service role
-- (the courses script) or the dashboard.
-- ---------------------------------------------------------------------------

alter table public.courses enable row level security;
revoke insert, update, delete, truncate on table public.courses from anon, authenticated;
grant select on table public.courses to anon, authenticated;

drop policy if exists "Published courses are public" on public.courses;
create policy "Published courses are public" on public.courses for select to anon, authenticated
    using (published);

revoke execute on function
    public._course_functions_skill(text),
    public._sync_course_catalog(text),
    public._courses_before_write(),
    public._courses_after_write(),
    public._courses_before_delete()
from public, anon, authenticated;
grant execute on function public._sync_course_catalog(text) to service_role;
-- Lets the courses script check a definition without saving it
revoke execute on function public.validate_course(text, jsonb) from public, anon, authenticated;
grant execute on function public.validate_course(text, jsonb) to service_role;
