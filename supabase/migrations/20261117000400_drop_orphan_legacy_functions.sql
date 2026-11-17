-- Two trigger functions left over from the legacy content schema removed in
-- 20261116235900_drop_legacy_content.sql. No trigger uses them any more, and
-- the Supabase security advisor flags both for a mutable search_path. No
-- CASCADE: if something does still use them, this fails instead.
drop function if exists public.touch_updated_at();
drop function if exists public.stamp_completed_at();
