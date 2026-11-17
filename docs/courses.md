# Courses

Courses live in Supabase, in `public.courses`, not in the app's code. The app
downloads the published ones at startup and keeps a copy for offline use, so a
new or edited course reaches everyone without an app release.

Saving a course also updates the learning engine's catalog (`learning_paths`,
`skills`, `course_lessons`, `challenges`, `projects`) through a trigger, so XP,
mastery and certificates work for it right away. Schema and rules:
`supabase/migrations/20261117000000_courses.sql`.

## Adding or editing a course

The easiest way is the admin panel on the website, **vylos.co/admin** (in the
vylos-web repo). It has a form for the course, its modules and lessons, JSON for
exercises, and publish/hide buttons. To give an account access, run this in the
Supabase SQL editor:

```sql
insert into public.admins (user_id, note)
select id, 'owner' from auth.users where email = 'you@example.com';
```

The panel also has an overview of sign-ups, active learners, AI usage,
subscriptions, enrollments, integrity flags and education inquiries. Every
change made from it is recorded in `public.admin_audit_log`.

### From the command line

For scripted or bulk edits. You need `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API keys).
Put it in `.env.local`, which git ignores. Never put it in the app.

```bash
npm run courses -- new rust-async          # courses/rust-async.json from a template
# edit the file: VS Code checks it against supabase/course.schema.json
npm run courses -- push courses/rust-async.json --check   # validate only
npm run courses -- push courses/rust-async.json           # save

npm run courses -- pull python             # edit an existing course
npm run courses -- pull --all
npm run courses -- list
```

`courses/` is git-ignored: the files are working copies and the database is the
source of truth. Pull before you edit a course, so you don't overwrite a newer
version.

A new course starts with `"published": false`, so you can push it while you
work on it. Set it to `true` when it's ready. You can also edit rows directly in
the Supabase Table Editor, where the same validation applies.

## Rules that protect learners' progress

- **Ids are permanent.** Progress is stored against the course id, each
  module's `id` and each lesson's `id`. Reword titles freely, but keep the ids.
  `push` fills in missing ids from the titles and writes them back into your
  file.
- **Removing a lesson or module** from a course deletes the progress recorded
  against it.
- **To retire a course, unpublish it** (`"published": false`). The app hides it
  and everyone keeps their progress and certificates. The database refuses to
  delete a course that has learners.
- **Price:** a course whose `level` starts with "Beginner" is free. Other
  courses cost 500 coins, or 750 for AI courses.
- Exercises are checked by the app's validator (`app/lib/exercises/format.ts`)
  on push and again when the app loads them. A course that fails is skipped, but
  the rest of the catalog still loads.
