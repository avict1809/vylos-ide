/**
 * Writes supabase/catalog/learning-catalog.sql: the built-in courses as the
 * learning engine's catalog (paths, skills and their prerequisites, lessons,
 * challenges, capstone projects). Run it after changing a curriculum, then run
 * the SQL in the Supabase SQL editor (or `psql -f`):
 *
 *     npm run catalog:sql
 *
 * The SQL is idempotent. It also removes lessons, skills and challenges that
 * no longer exist in the app, along with the progress recorded against them:
 * lesson ids are stable by design (see LessonDefinition), but a skill's id is
 * its module's title, so renaming a module starts its mastery over.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCourseGroups } from '../app/lib/learning/course-registry';
import type { Course } from '../app/lib/learning/types';
import {
    capstoneFor,
    capstoneId,
    challengeDbId,
    lessonDbId,
    pathId,
    requiredChallenges,
    skillIds,
    unlockCost,
} from '../app/lib/learning/progress-ids';

const q = (value: string | null) => (value === null ? 'null' : `'${value.replace(/'/g, "''")}'`);
const json = (value: unknown) => `${q(JSON.stringify(value))}::jsonb`;
const list = (values: string[]) => values.map(q).join(', ');
const textArray = (values: string[]) => `array[${list(values)}]::text[]`;

// Framework courses build on their language: their first skill asks for the
// language's functions module.
const LANGUAGE_COURSES: Record<string, string> = {
    Python: 'python',
    JavaScript: 'javascript',
    'C#': 'csharp',
    Java: 'java',
    Kotlin: 'kotlin',
    PHP: 'php',
    Ruby: 'ruby',
    Go: 'go',
    Rust: 'rust',
    'C++': 'cpp',
    Swift: 'swift',
};

// Achievements a particular capstone earns
const CAPSTONE_ACHIEVEMENTS: Record<string, string> = { javascript: 'api_builder' };

const SUBJECTS: Partial<Record<NonNullable<Course['category']>, string>> = { ai: 'ai' };

const courses = getCourseGroups().flatMap((group) => group.courses).filter((course) => !course.extension);
const byId = new Map(courses.map((course) => [course.id, course]));

// Paths and skills for every course go first: prerequisites can point at
// another course's skills
const skillRows: string[] = [];
const out: string[] = [];

for (const course of courses) {
    const path = pathId(course);
    const skills = skillIds(course);
    const capstone = capstoneFor(course);
    const lessons = course.modules.flatMap((mod, mi) => mod.lessons.map((lesson) => ({ lesson, skill: skills[mi] })));
    const challenges = lessons.filter(({ lesson }) => lesson.exercise);

    out.push(`-- ${course.title}`);
    skillRows.push(
        'insert into public.learning_paths (id, subject, title, description, min_challenges, pass_mark, unlock_cost) values ' +
            `(${q(path)}, ${q(SUBJECTS[course.category ?? 'language'] ?? 'programming')}, ${q(course.title)}, ` +
            `${q(course.tagline)}, ${requiredChallenges(course)}, 0.7, ${unlockCost(course)})\n` +
            'on conflict (id) do update set subject = excluded.subject, title = excluded.title, ' +
            'description = excluded.description, min_challenges = excluded.min_challenges, unlock_cost = excluded.unlock_cost;'
    );

    skillRows.push(
        'insert into public.skills (id, path_id, name, position) values\n' +
            course.modules.map((mod, mi) => `    (${q(skills[mi])}, ${q(path)}, ${q(mod.title)}, ${mi + 1})`).join(',\n') +
            '\non conflict (id) do update set path_id = excluded.path_id, name = excluded.name, position = excluded.position;'
    );

    // Each module builds on the one before it
    const prerequisites: [string, string][] = skills.slice(1).map((skill, i) => [skill, skills[i]]);
    const language = course.stack && LANGUAGE_COURSES[course.stack];
    const base = language && language !== course.id ? byId.get(language) : undefined;
    if (base) {
        const functions = base.modules.findIndex((mod) => /function/i.test(mod.title));
        if (functions !== -1) prerequisites.push([skills[0], skillIds(base)[functions]]);
    }
    out.push(`delete from public.skill_prerequisites where skill_id = any (${textArray(skills)});`);
    if (prerequisites.length) {
        out.push(
            'insert into public.skill_prerequisites (skill_id, requires_skill_id, min_mastery) values\n' +
                prerequisites.map(([skill, requires]) => `    (${q(skill)}, ${q(requires)}, 0.5)`).join(',\n') +
                '\non conflict do nothing;'
        );
    }

    out.push(
        'insert into public.course_lessons (id, path_id, skill_id, title, position) values\n' +
            lessons
                .map(({ lesson, skill }, i) => `    (${q(lessonDbId(course.id, lesson.id))}, ${q(path)}, ${q(skill)}, ${q(lesson.title)}, ${i + 1})`)
                .join(',\n') +
            '\non conflict (id) do update set path_id = excluded.path_id, skill_id = excluded.skill_id, ' +
            'title = excluded.title, position = excluded.position;'
    );

    if (challenges.length) {
        out.push(
            'insert into public.challenges (id, path_id, skill_id, title, prompt, hint, difficulty, kind, min_seconds) values\n' +
                challenges
                    .map(({ lesson, skill }) => {
                        const exercise = lesson.exercise!;
                        return `    (${q(challengeDbId(course.id, lesson.id))}, ${q(path)}, ${q(skill)}, ${q(lesson.title)}, ` +
                            `${q(exercise.prompt)}, ${q(exercise.hints?.[0] ?? null)}, 2, 'coding', 20)`;
                    })
                    .join(',\n') +
                '\non conflict (id) do update set path_id = excluded.path_id, skill_id = excluded.skill_id, ' +
                'title = excluded.title, prompt = excluded.prompt, hint = excluded.hint;'
        );
    }

    out.push(
        'insert into public.projects (id, path_id, title, description, requirements, skill_ids, is_capstone, xp, achievement_id) values ' +
            `(${q(capstoneId(course))}, ${q(path)}, ${q(capstone.title)}, ${q(capstone.description)}, ` +
            `${json(capstone.requirements)}, ${textArray(skills)}, true, 500, ${q(CAPSTONE_ACHIEVEMENTS[course.id] ?? null)})\n` +
            'on conflict (id) do update set title = excluded.title, description = excluded.description, ' +
            'requirements = excluded.requirements, skill_ids = excluded.skill_ids, achievement_id = excluded.achievement_id;'
    );
    out.push(`update public.learning_paths set capstone_project_id = ${q(capstoneId(course))} where id = ${q(path)};`);

    // What the curriculum no longer has
    out.push(
        `delete from public.course_lessons where path_id = ${q(path)} and not (id = any (${textArray(lessons.map(({ lesson }) => lessonDbId(course.id, lesson.id)))}));`
    );
    out.push(
        `delete from public.challenges where path_id = ${q(path)} and generated_for is null and not (id = any (${textArray(challenges.map(({ lesson }) => challengeDbId(course.id, lesson.id)))}));`
    );
    out.push(`delete from public.skills where path_id = ${q(path)} and not (id = any (${textArray(skills)}));`);
    out.push('');
}

const statements = [
    '-- Generated by scripts/learning-catalog.ts (npm run catalog:sql). Do not edit by hand.',
    `-- ${courses.length} courses`,
    'begin;',
    '',
    ...skillRows,
    '',
    ...out,
    'commit;',
    '',
].join('\n');
const target = join(__dirname, '..', 'supabase', 'catalog', 'learning-catalog.sql');
writeFileSync(target, statements);
console.log(`Wrote ${target}: ${courses.length} courses`);
