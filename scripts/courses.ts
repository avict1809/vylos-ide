/**
 * Adds and edits the courses in Supabase (public.courses). See docs/courses.md.
 *
 *     npm run courses -- list
 *     npm run courses -- new <id>             start courses/<id>.json from a template
 *     npm run courses -- pull <id>... | --all download courses into courses/<id>.json
 *     npm run courses -- push <file>...       validate and save; add --check to only validate
 *
 * Course files are working copies (courses/ is git-ignored): the database is
 * the source of truth, so pull before editing a course someone else may have
 * changed. Writing needs SUPABASE_SERVICE_ROLE_KEY in the environment or in
 * .env.local, next to NEXT_PUBLIC_SUPABASE_URL. Never put that key in the app.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseCourse } from '../app/lib/learning/course-registry';
import { lessonSlug, type CourseDefinition } from '../app/lib/learning/types';

const ROOT = join(__dirname, '..');
const COURSES_DIR = join(ROOT, 'courses');
const SCHEMA = '../supabase/course.schema.json';
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A course file: the row's columns next to the definition's fields. */
type CourseFile = { $schema?: string; id: string; position?: number; published?: boolean } & Record<string, unknown>;

class UsageError extends Error {}

function loadEnv() {
    for (const file of ['.env.local', '.env']) {
        const path = join(ROOT, file);
        if (existsSync(path)) process.loadEnvFile(path);
    }
}

function client(): SupabaseClient {
    loadEnv();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new UsageError('NEXT_PUBLIC_SUPABASE_URL is not set (.env.local)');
    if (!key) {
        throw new UsageError(
            'SUPABASE_SERVICE_ROLE_KEY is not set. Copy it from Supabase: Project Settings > API keys > service_role, ' +
                'then run with SUPABASE_SERVICE_ROLE_KEY=... or add it to .env.local (git-ignored).'
        );
    }
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const fileFor = (id: string) => join(COURSES_DIR, `${id}.json`);

// Fields in reading order; the database hands jsonb keys back sorted by length
const FIELD_ORDER = [
    'title', 'tagline', 'level', 'hours', 'accent', 'badge', 'category', 'stack', 'buildsOn',
    'requires', 'tutorGuidelines', 'capstone', 'modules',
];
const rank = (key: string) => (FIELD_ORDER.includes(key) ? FIELD_ORDER.indexOf(key) : FIELD_ORDER.length);

/** Orders a module's or lesson's keys: id and title first, lessons and exercise last. */
function tidy(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(tidy);
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    if (!('title' in record) || !('lessons' in record || 'exercise' in record || 'id' in record)) return value;
    const first = ['id', 'title', 'description'].filter((k) => k in record);
    const last = ['lessons', 'exercise'].filter((k) => k in record);
    const middle = Object.keys(record).filter((k) => !first.includes(k) && !last.includes(k));
    return Object.fromEntries([...first, ...middle, ...last].map((k) => [k, k === 'lessons' ? tidy(record[k]) : record[k]]));
}

function writeCourseFile(path: string, course: CourseFile) {
    mkdirSync(COURSES_DIR, { recursive: true });
    const { id, position, published, ...definition } = course;
    delete definition.$schema;
    const fields = Object.keys(definition)
        .sort((a, b) => rank(a) - rank(b))
        .map((key) => [key, key === 'modules' ? tidy(definition[key]) : definition[key]]);
    const file = { $schema: SCHEMA, id, position, published, ...Object.fromEntries(fields) };
    writeFileSync(path, JSON.stringify(file, null, 4) + '\n');
}

/**
 * Gives every module and lesson an explicit id (the title's slug, as the app
 * would derive it) and turns bare lesson titles into objects. Ids are what
 * progress is stored against, so they're written into the file to be kept.
 */
function normalize(definition: Record<string, unknown>): Record<string, unknown> {
    const modules = Array.isArray(definition.modules) ? definition.modules : [];
    const moduleIds = new Map<string, number>();
    return {
        ...definition,
        modules: modules.map((mod: Record<string, unknown>, i: number) => {
            let id = typeof mod.id === 'string' && mod.id ? mod.id : undefined;
            if (!id) {
                const slug = lessonSlug(String(mod.title ?? '')) || `module-${i + 1}`;
                const n = (moduleIds.get(slug) ?? 0) + 1;
                moduleIds.set(slug, n);
                id = n === 1 ? slug : `${slug}-${n}`;
            }
            const { lessons, ...rest } = mod;
            delete rest.id;
            return {
                id,
                ...rest,
                lessons: (Array.isArray(lessons) ? lessons : []).map((lesson: unknown) => {
                    if (typeof lesson === 'string') return { id: lessonSlug(lesson), title: lesson };
                    const { id: lessonId, ...fields } = lesson as Record<string, unknown>;
                    return { id: typeof lessonId === 'string' && lessonId ? lessonId : lessonSlug(String(fields.title ?? '')), ...fields };
                }),
            };
        }),
    };
}

async function list() {
    const { data, error } = await client().from('courses').select('id, position, published, updated_at, definition->>title').order('position');
    if (error) throw new Error(error.message);
    for (const row of data as { id: string; position: number; published: boolean; updated_at: string; title: string }[]) {
        console.log(`${String(row.position).padStart(5)}  ${row.published ? '   ' : '(h)'} ${row.id.padEnd(24)} ${row.title}`);
    }
    console.log(`\n${data.length} courses. (h) = unpublished, hidden from the app.`);
}

function create(id: string | undefined) {
    if (!id || !ID.test(id)) throw new UsageError('Give the new course an id in lower-case-with-dashes, e.g. `new rust-async`');
    const path = fileFor(id);
    if (existsSync(path)) throw new UsageError(`${path} already exists`);
    writeCourseFile(path, {
        id,
        position: 1000,
        published: false,
        title: 'Course title',
        tagline: 'One line on what learners get out of it.',
        level: 'Beginner',
        hours: 10,
        accent: '#22c55e',
        badge: 'XX',
        category: 'language',
        requires: [],
        tutorGuidelines: [],
        capstone: {
            title: 'Final project',
            description: 'What the learner builds to finish the course.',
            requirements: ['First requirement', 'Second requirement'],
        },
        modules: [
            {
                id: 'getting-started',
                title: 'Getting Started',
                description: 'What this module covers.',
                lessons: [
                    { id: 'first-lesson', title: 'First lesson' },
                    {
                        id: 'hello-world',
                        title: 'Hello World',
                        exercise: {
                            prompt: 'Write a program that prints exactly `Hello, World!`',
                            files: { 'main.py': '# Print Hello, World! below\n' },
                            check: { type: 'output', cases: [{ expected: 'Hello, World!' }] },
                            hints: ['`print()` shows whatever you put between its parentheses.'],
                            solution: 'print("Hello, World!")\n',
                        },
                    },
                ],
            },
        ],
    });
    console.log(`Wrote ${path}. It's unpublished: set "published": true when it's ready, then push it.`);
}

async function pull(ids: string[]) {
    if (!ids.length) throw new UsageError('Name the courses to pull, or --all');
    let query = client().from('courses').select('id, position, published, definition').order('position');
    if (!ids.includes('--all')) query = query.in('id', ids);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const missing = ids.filter((id) => id !== '--all' && !data.some((row) => row.id === id));
    for (const row of data) {
        writeCourseFile(fileFor(row.id), { id: row.id, position: row.position, published: row.published, ...row.definition });
    }
    console.log(`Pulled ${data.length} course${data.length === 1 ? '' : 's'} into ${COURSES_DIR}`);
    if (missing.length) throw new Error(`Not found: ${missing.join(', ')}`);
}

async function push(args: string[]) {
    const check = args.includes('--check');
    const files = args.filter((a) => a !== '--check');
    if (!files.length) throw new UsageError('Name the course files to push, e.g. courses/python.json');
    const supabase = client();
    let failed = 0;

    for (const file of files) {
        const path = resolve(file);
        try {
            const { id, position, published, ...raw } = JSON.parse(readFileSync(path, 'utf8')) as CourseFile;
            delete raw.$schema;
            if (!id || !ID.test(id)) throw new Error('"id" must be lower-case-with-dashes');
            if (basename(path) !== `${id}.json`) console.warn(`  note: ${basename(path)} holds the course "${id}"`);
            const definition = normalize(raw);

            // The app's own checks, exercises included, then the database's
            parseCourse({ ...(definition as unknown as CourseDefinition), id });
            const { error: invalid } = await supabase.rpc('validate_course', { p_id: id, p_def: definition });
            if (invalid) throw new Error(invalid.message);

            if (check) {
                console.log(`✓ ${id}: valid`);
                continue;
            }
            const row: Record<string, unknown> = { id, definition };
            if (position !== undefined) row.position = position;
            if (published !== undefined) row.published = published;
            const { error } = await supabase.from('courses').upsert(row);
            if (error) throw new Error(error.message);
            // Ids the push filled in belong in the file from now on
            writeCourseFile(path, { id, position, published, ...definition });
            console.log(`✓ ${id}: saved${published === false ? ' (unpublished)' : ''}`);
        } catch (err) {
            failed++;
            console.error(`✗ ${file}: ${err instanceof Error ? err.message : err}`);
        }
    }
    if (failed) throw new Error(`${failed} of ${files.length} failed`);
}

async function main() {
    const [command, ...args] = process.argv.slice(2);
    switch (command) {
        case 'list': return list();
        case 'new': return create(args[0]);
        case 'pull': return pull(args);
        case 'push': return push(args);
        default: throw new UsageError('Commands: list, new <id>, pull <id>... | --all, push <file>... [--check]');
    }
}

main().catch((err) => {
    console.error(err instanceof UsageError ? err.message : `Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
});
