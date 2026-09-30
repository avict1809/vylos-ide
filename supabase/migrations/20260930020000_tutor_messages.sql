-- The tutor's memory: what was said with the voice and text tutors, kept per
-- account so the tutor remembers the learner across sessions and computers.
--
-- The app keeps its own copy and is the one that reads it; this table is the
-- backup it syncs to in batches (app/lib/memory/conversation-sync.ts), and
-- where a new computer fetches history from on first sign-in. Ids are made on
-- the device, so a retried upload never stores a message twice.

create table if not exists public.tutor_messages (
    id uuid primary key,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    session_id uuid not null,
    channel text not null check (channel in ('voice', 'text')),
    -- 'summary': the notes written when a session ends; the tutor's memory of it
    role text not null check (role in ('user', 'tutor', 'action', 'summary')),
    text text not null check (char_length(text) between 1 and 8000),
    -- The course lesson ("courseId/lessonId") or personal topic it was about
    lesson_key text check (char_length(lesson_key) <= 200),
    created_at timestamptz not null
);

create index if not exists tutor_messages_user_created_idx on public.tutor_messages (user_id, created_at desc);

alter table public.tutor_messages enable row level security;
revoke all on table public.tutor_messages from anon, authenticated;
grant select, insert, delete on table public.tutor_messages to authenticated;

drop policy if exists "Accounts save their own tutor messages" on public.tutor_messages;
create policy "Accounts save their own tutor messages"
    on public.tutor_messages for insert
    to authenticated
    with check (user_id = auth.uid());

drop policy if exists "Accounts read their own tutor messages" on public.tutor_messages;
create policy "Accounts read their own tutor messages"
    on public.tutor_messages for select
    to authenticated
    using (user_id = auth.uid());

-- "Forget my conversations" in the app
drop policy if exists "Accounts delete their own tutor messages" on public.tutor_messages;
create policy "Accounts delete their own tutor messages"
    on public.tutor_messages for delete
    to authenticated
    using (user_id = auth.uid());
