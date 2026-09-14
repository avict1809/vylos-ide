import type { CourseCategory, CourseDefinition, LessonDefinition } from '../learning/types';

/**
 * Checks extension files, which are untrusted JSON written by hand. Every
 * problem is reported with where it is (`modules[2].lessons[4]: …`) so an
 * author can fix it without guessing. The JSON Schemas in docs/extensions
 * describe the same rules for editor autocomplete; keep the two in step.
 */

/** What a code extension may ask for; users approve these before its code runs. */
export const PERMISSIONS = ['workspace.read', 'workspace.write', 'terminal.run', 'ai.generate', 'learner.read'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface ExtensionManifest {
    /** `<publisher>.<name>` */
    id: string;
    name: string;
    publisher: string;
    displayName: string;
    version: string;
    description?: string;
    engines: { vylos: string };
    /** Code entry point (a CommonJS file), for code extensions */
    main?: string;
    permissions: Permission[];
    contributes: { courses: string[] };
}

export interface Checked<T> {
    value?: T;
    errors: string[];
    warnings: string[];
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LESSON_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const CATEGORIES: CourseCategory[] = ['language', 'framework', 'ai', 'security', 'essentials'];

const MANIFEST_KEYS = ['name', 'publisher', 'displayName', 'version', 'description', 'engines', 'main', 'permissions', 'contributes', '$schema'];
const COURSE_KEYS = ['id', 'title', 'tagline', 'level', 'hours', 'accent', 'badge', 'category', 'stack', 'tutorGuidelines', 'modules', '$schema'];
// package.json doubles as an npm manifest, so npm's own fields are expected there
const NPM_KEYS = ['license', 'repository', 'author', 'homepage', 'bugs', 'keywords', 'private', 'scripts', 'devDependencies'];

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

class Problems {
    errors: string[] = [];
    warnings: string[] = [];
    error(where: string, message: string) { this.errors.push(where ? `${where}: ${message}` : message); }
    warn(where: string, message: string) { this.warnings.push(where ? `${where}: ${message}` : message); }

    unknownKeys(obj: Json, known: string[], where: string) {
        for (const key of Object.keys(obj)) {
            if (!known.includes(key)) this.warn(where ? `${where}.${key}` : key, 'unknown field, ignored (check the spelling)');
        }
    }

    /** A string of 1..max characters; reports and returns undefined otherwise. */
    text(obj: Json, key: string, where: string, max: number, required = true): string | undefined {
        const value = obj[key];
        const at = where ? `${where}.${key}` : key;
        if (value === undefined) {
            if (required) this.error(at, 'is required');
            return undefined;
        }
        if (typeof value !== 'string' || !value.trim()) {
            this.error(at, 'must be a non-empty string');
            return undefined;
        }
        if (value.length > max) {
            this.error(at, `must be at most ${max} characters (it has ${value.length})`);
            return undefined;
        }
        return value.trim();
    }
}

function parseVersion(v: string): [number, number, number] | null {
    const m = v.match(VERSION);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a: string, b: string): number {
    const pa = parseVersion(a) ?? [0, 0, 0];
    const pb = parseVersion(b) ?? [0, 0, 0];
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
}

/**
 * Whether `version` meets an `engines.vylos` range: `*`, `1.2.3`, `>=1.2.3`,
 * `^1.2.3` or `~1.2.3` (npm meanings). Returns null for any other syntax.
 */
export function satisfiesRange(range: string, version: string): boolean | null {
    const r = range.trim();
    if (r === '*') return true;
    const m = r.match(/^(\^|~|>=)?\s*(\d+\.\d+\.\d+)$/);
    const v = parseVersion(version);
    if (!m || !v) return null;
    const [op, base] = [m[1] ?? '', m[2]];
    const b = parseVersion(base)!;
    if (compareVersions(version, base) < 0) return false;
    if (op === '') return compareVersions(version, base) === 0;
    if (op === '>=') return true;
    if (op === '~') return v[0] === b[0] && v[1] === b[1];
    // ^: the leftmost non-zero part must match (^0.1.3 allows 0.1.x only)
    if (b[0] > 0) return v[0] === b[0];
    if (b[1] > 0) return v[0] === 0 && v[1] === b[1];
    return v[0] === 0 && v[1] === 0 && v[2] === b[2];
}

export function validateManifest(json: unknown, appVersion: string): Checked<ExtensionManifest> {
    const p = new Problems();
    if (!isObject(json)) {
        p.error('package.json', 'must be a JSON object');
        return p;
    }
    p.unknownKeys(json, [...MANIFEST_KEYS, ...NPM_KEYS], '');

    const name = p.text(json, 'name', '', 64);
    if (name && !ID.test(name)) p.error('name', 'use lowercase letters, digits and dashes, e.g. "python-basics"');
    const publisher = p.text(json, 'publisher', '', 64);
    if (publisher && !ID.test(publisher)) p.error('publisher', 'use lowercase letters, digits and dashes, e.g. "pyschool"');
    const displayName = p.text(json, 'displayName', '', 80, false);
    const description = p.text(json, 'description', '', 300, false);
    const version = p.text(json, 'version', '', 64);
    if (version && !parseVersion(version)) p.error('version', 'must look like 1.0.0');

    let vylos: string | undefined;
    if (!isObject(json.engines)) {
        p.error('engines', 'is required, e.g. { "vylos": ">=0.1.3" }');
    } else {
        vylos = p.text(json.engines, 'vylos', 'engines', 64);
        if (vylos) {
            const ok = satisfiesRange(vylos, appVersion);
            if (ok === null) p.error('engines.vylos', 'use one of: *, 1.2.3, >=1.2.3, ^1.2.3, ~1.2.3');
            else if (!ok) p.error('engines.vylos', `this extension needs Vylos ${vylos}, but this is Vylos ${appVersion}`);
        }
    }

    const main = p.text(json, 'main', '', 200, false);
    if (main && !/\.c?js$/.test(main)) p.error('main', 'must be a JavaScript file, e.g. "dist/extension.js"');

    const permissions: Permission[] = [];
    if (json.permissions !== undefined) {
        if (!Array.isArray(json.permissions)) {
            p.error('permissions', `must be a list, e.g. ["workspace.read"]`);
        } else {
            json.permissions.forEach((perm, i) => {
                if (!PERMISSIONS.includes(perm as Permission)) p.error(`permissions[${i}]`, `unknown permission; use: ${PERMISSIONS.join(', ')}`);
                else if (!permissions.includes(perm as Permission)) permissions.push(perm as Permission);
            });
            if (!main && permissions.length) p.warn('permissions', 'only code extensions (with "main") use permissions');
        }
    }

    const courses: string[] = [];
    if (json.contributes === undefined && main) {
        // A code extension doesn't have to contribute courses
    } else if (!isObject(json.contributes)) {
        p.error('contributes', main ? 'must be an object' : 'is required, e.g. { "courses": ["courses/intro.json"] }');
    } else {
        p.unknownKeys(json.contributes, ['courses'], 'contributes');
        const list = json.contributes.courses;
        if (list === undefined && main) {
            // nothing to contribute besides code
        } else if (!Array.isArray(list) || list.length === 0) {
            p.error('contributes.courses', 'must list at least one course file');
        } else {
            list.forEach((file, i) => {
                if (typeof file === 'string' && file.trim()) courses.push(file);
                else p.error(`contributes.courses[${i}]`, 'must be a path to a course JSON file');
            });
        }
    }

    if (p.errors.length === 0) {
        return {
            value: {
                id: `${publisher}.${name}`,
                name: name!,
                publisher: publisher!,
                displayName: displayName ?? name!,
                version: version!,
                description,
                engines: { vylos: vylos! },
                main,
                permissions,
                contributes: { courses },
            },
            errors: [],
            warnings: p.warnings,
        };
    }
    return p;
}

/**
 * Checks one contributed course file. The course is registered as
 * `<publisher>.<id>`, so it can never replace a built-in course or another
 * publisher's course.
 */
export function validateCourse(json: unknown, manifest: ExtensionManifest): Checked<CourseDefinition> {
    const p = new Problems();
    if (!isObject(json)) {
        p.error('', 'a course file must be a JSON object');
        return p;
    }
    p.unknownKeys(json, COURSE_KEYS, '');

    const id = p.text(json, 'id', '', 64);
    if (id && !ID.test(id)) p.error('id', 'use lowercase letters, digits and dashes, e.g. "python-basics"');
    const title = p.text(json, 'title', '', 80);
    const tagline = p.text(json, 'tagline', '', 200);
    const level = p.text(json, 'level', '', 40, false);
    const stack = p.text(json, 'stack', '', 30, false);

    let hours: number | undefined;
    if (typeof json.hours !== 'number' || !(json.hours > 0) || json.hours > 1000) {
        p.error('hours', 'must be a number of hours between 0 and 1000, e.g. 12');
    } else {
        hours = json.hours;
    }

    const accent = p.text(json, 'accent', '', 7, false);
    if (accent && !COLOR.test(accent)) p.error('accent', 'must be a hex color like "#3776AB"');
    const badge = p.text(json, 'badge', '', 3, false);

    let category: CourseCategory = 'language';
    if (json.category !== undefined) {
        if (CATEGORIES.includes(json.category as CourseCategory)) category = json.category as CourseCategory;
        else p.error('category', `must be one of: ${CATEGORIES.join(', ')}`);
    }

    let tutorGuidelines: string[] | undefined;
    if (json.tutorGuidelines !== undefined) {
        const list = json.tutorGuidelines;
        if (!Array.isArray(list) || list.length > 20) {
            p.error('tutorGuidelines', 'must be a list of at most 20 short rules');
        } else {
            tutorGuidelines = [];
            list.forEach((rule, i) => {
                if (typeof rule === 'string' && rule.trim() && rule.length <= 500) tutorGuidelines!.push(rule.trim());
                else p.error(`tutorGuidelines[${i}]`, 'must be a non-empty string of at most 500 characters');
            });
        }
    }

    const modules: CourseDefinition['modules'] = [];
    if (!Array.isArray(json.modules) || json.modules.length === 0) {
        p.error('modules', 'must list at least one module');
    } else if (json.modules.length > 50) {
        p.error('modules', 'at most 50 modules per course');
    } else {
        json.modules.forEach((mod, mi) => {
            const at = `modules[${mi}]`;
            if (!isObject(mod)) {
                p.error(at, 'must be an object with "title" and "lessons"');
                return;
            }
            p.unknownKeys(mod, ['title', 'description', 'lessons'], at);
            const modTitle = p.text(mod, 'title', at, 120);
            const description = p.text(mod, 'description', at, 500, false) ?? '';
            const lessons: LessonDefinition[] = [];
            if (!Array.isArray(mod.lessons) || mod.lessons.length === 0) {
                p.error(`${at}.lessons`, 'must list at least one lesson');
            } else if (mod.lessons.length > 200) {
                p.error(`${at}.lessons`, 'at most 200 lessons per module');
            } else {
                mod.lessons.forEach((lesson, li) => {
                    const lat = `${at}.lessons[${li}]`;
                    if (typeof lesson === 'string') {
                        if (lesson.trim() && lesson.length <= 200) lessons.push(lesson.trim());
                        else p.error(lat, 'a lesson title must be 1 to 200 characters');
                    } else if (isObject(lesson)) {
                        p.unknownKeys(lesson, ['id', 'title'], lat);
                        const lessonId = p.text(lesson, 'id', lat, 100);
                        const lessonTitle = p.text(lesson, 'title', lat, 200);
                        if (lessonId && !LESSON_ID.test(lessonId)) p.error(`${lat}.id`, 'use lowercase letters, digits and dashes');
                        else if (lessonId && lessonTitle) lessons.push({ id: lessonId, title: lessonTitle });
                    } else {
                        p.error(lat, 'must be a title, or { "id": ..., "title": ... }');
                    }
                });
            }
            if (modTitle) modules.push({ title: modTitle, description, lessons });
        });
    }

    if (p.errors.length > 0) return p;
    return {
        value: {
            id: `${manifest.publisher}.${id}`,
            title: title!,
            tagline: tagline!,
            level: level ?? 'All levels',
            hours: hours!,
            accent: accent ?? '#4ec9b0',
            badge: (badge ?? title!.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)).toUpperCase() || 'EX',
            category,
            stack,
            tutorGuidelines,
            extension: { id: manifest.id, displayName: manifest.displayName, publisher: manifest.publisher },
            modules,
        },
        errors: [],
        warnings: p.warnings,
    };
}
