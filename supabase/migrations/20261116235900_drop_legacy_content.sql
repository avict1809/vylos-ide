-- Removes an older, hand-made content schema that was never part of these
-- migrations and that no code in vylos-ide or vylos-web uses: courses (old
-- shape: slug, language, order_index), modules, lessons, exercises,
-- submissions, user_progress, user_stats, user_environment, the
-- content_manifest view, and the record_activity / award_badge functions
-- that wrote user_stats. Its `courses` table blocks the new public.courses
-- (20261117000000_courses.sql).
--
-- A full dump of the public schema and data was taken first (2026-11-17,
-- kept outside the repo). Nothing runs unless `courses` still has the old
-- shape, and nothing uses CASCADE: if anything else depends on these
-- objects, the drop fails and the whole push rolls back.

do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'courses' and column_name = 'slug'
    ) or exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'courses' and column_name = 'definition'
    ) then
        return;
    end if;

    drop view if exists public.content_manifest;
    drop function if exists public.award_badge(text);
    drop function if exists public.record_activity(integer, integer);

    drop table if exists public.submissions;
    drop table if exists public.user_progress;
    drop table if exists public.user_environment;
    drop table if exists public.exercises;
    drop table if exists public.lessons;
    drop table if exists public.modules;
    drop table if exists public.courses;
    drop table if exists public.user_stats;
end;
$$;
