'use client';

import type { Disposable } from '../disposable';
import type { CourseDefinition } from '../learning/types';
import { registerCourse } from '../learning/course-registry';
import { ExtensionInfo, useExtensionSettings, useExtensionStore } from '../stores/extension-store';
import { compareVersions, ExtensionManifest, Permission, validateCourse, validateManifest } from './validate';
import { startCodeExtensions } from './code-host';

/**
 * Loads installed extensions: course packs into the course registry, and
 * code extensions into the sandbox (code-host.ts) once the learner has
 * approved them. An extension loads completely or not at all: a single broken
 * file keeps all of it out, and the Extensions panel says why.
 */

export interface ResolvedExtension {
    info: ExtensionInfo;
    manifest?: ExtensionManifest;
    courses: CourseDefinition[];
    /** The "main" file's source, for a code extension */
    code?: string;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function checkExtension(scan: ExtensionScan, appVersion: string): ResolvedExtension {
    const info: ExtensionInfo = {
        folder: scan.folder,
        path: scan.path,
        displayName: scan.folder,
        status: 'error',
        errors: [],
        warnings: [],
        courses: [],
        runsCode: false,
        permissions: [],
        newPermissions: [],
    };
    if (scan.manifestError) {
        info.errors.push(`package.json ${scan.manifestError}`);
        return { info, courses: [] };
    }

    // Show whatever identifies the extension, even when package.json has problems
    const raw = (scan.manifest ?? {}) as Record<string, unknown>;
    info.displayName = str(raw.displayName) ?? str(raw.name) ?? scan.folder;
    info.publisher = str(raw.publisher);
    info.version = str(raw.version);
    info.description = str(raw.description);

    const checked = validateManifest(scan.manifest, appVersion);
    info.errors.push(...checked.errors.map((e) => `package.json: ${e}`));
    info.warnings.push(...checked.warnings.map((w) => `package.json: ${w}`));
    const manifest = checked.value;
    if (!manifest) return { info, courses: [] };
    info.id = manifest.id;
    info.runsCode = !!manifest.main;
    info.permissions = manifest.permissions;
    if (manifest.main && scan.codeError) info.errors.push(`${manifest.main} ${scan.codeError}`);

    const courses: CourseDefinition[] = [];
    for (const file of scan.courses) {
        if (file.error) {
            info.errors.push(`${file.path} ${file.error}`);
            continue;
        }
        const course = validateCourse(file.json, manifest);
        info.errors.push(...course.errors.map((e) => `${file.path}: ${e}`));
        info.warnings.push(...course.warnings.map((w) => `${file.path}: ${w}`));
        if (!course.value) continue;
        if (courses.some((c) => c.id === course.value!.id)) {
            info.errors.push(`${file.path}: another course in this extension already has the id "${course.value.id.split('.').pop()}"`);
            continue;
        }
        courses.push(course.value);
    }

    info.status = info.errors.length ? 'error' : 'active';
    return info.status === 'active' ? { info, manifest, courses, code: scan.code } : { info, manifest, courses: [] };
}

/**
 * Validates every scanned folder and settles clashes between them. `grants`
 * are the permissions the learner approved per extension. Pure: registers
 * nothing.
 */
export function resolveExtensions(scans: ExtensionScan[], appVersion: string, grants: Record<string, Permission[]>): ResolvedExtension[] {
    const resolved = scans.map((scan) => checkExtension(scan, appVersion));

    // The same extension in two folders (e.g. two versions): the newest wins
    const newest = new Map<string, ResolvedExtension>();
    for (const r of resolved) {
        if (!r.manifest) continue;
        const current = newest.get(r.manifest.id);
        if (!current || compareVersions(r.manifest.version, current.manifest!.version) > 0) newest.set(r.manifest.id, r);
    }
    for (const r of resolved) {
        const winner = r.manifest && newest.get(r.manifest.id);
        if (winner && winner !== r) {
            r.info.status = 'skipped';
            r.info.errors = [];
            r.info.warnings = [`Not loaded: version ${winner.manifest!.version} in "${winner.info.folder}" is newer`];
            r.courses = [];
        }
    }

    // Code runs only once the learner approved the extension and everything it asks for
    for (const r of resolved) {
        if (r.info.status !== 'active' || !r.manifest?.main) continue;
        const granted = grants[r.manifest.id];
        const missing = r.manifest.permissions.filter((p) => !granted?.includes(p));
        if (!granted || missing.length) {
            r.info.status = 'needs-approval';
            r.info.newPermissions = granted ? missing : [];
            r.courses = [];
            r.code = undefined;
        }
    }

    // Two extensions from one publisher can't both provide the same course
    const owner = new Map<string, string>();
    for (const r of resolved) {
        if (r.info.status !== 'active') continue;
        const clash = r.courses.find((c) => owner.has(c.id));
        if (clash) {
            r.info.status = 'error';
            r.info.errors.push(`The course "${clash.id}" is already provided by the extension "${owner.get(clash.id)}"`);
            r.courses = [];
            continue;
        }
        r.courses.forEach((c) => owner.set(c.id, r.info.id!));
    }
    return resolved;
}

let registrations: Disposable[] = [];

/** Replaces the previously loaded extensions with these. */
async function apply(resolved: ResolvedExtension[]) {
    registrations.forEach((r) => r.dispose());
    registrations = [];
    for (const r of resolved) {
        if (r.info.status !== 'active') continue;
        const mine: Disposable[] = [];
        try {
            for (const course of r.courses) mine.push(registerCourse(course));
            r.info.courses = r.courses.map((c) => ({ id: c.id, title: c.title }));
            registrations.push(...mine);
        } catch (e) {
            // e.g. two lessons in one course end up with the same id
            mine.forEach((d) => d.dispose());
            r.info.status = 'error';
            r.info.errors.push(e instanceof Error ? e.message : String(e));
        }
    }
    await startCodeExtensions(resolved.flatMap((r) =>
        r.info.status === 'active' && r.manifest?.main && r.code !== undefined
            ? [{
                id: r.manifest.id,
                version: r.manifest.version,
                displayName: r.manifest.displayName,
                publisher: r.manifest.publisher,
                permissions: r.manifest.permissions,
                main: r.manifest.main,
                code: r.code,
            }]
            : []
    ));
}

async function load() {
    const electron = window.electron;
    if (!electron?.extensions) return;
    const store = useExtensionStore.getState();
    store.set({ loading: true });
    try {
        const [appVersion, scan] = await Promise.all([electron.getVersion(), electron.extensions.scan()]);
        const resolved = resolveExtensions(scan.extensions, appVersion, useExtensionSettings.getState().grants);
        // Show the list before code starts, so runtime status has a card to land on
        store.set({ dir: scan.dir, extensions: resolved.map((r) => r.info), loading: true, error: null });
        await apply(resolved);
        store.set({ extensions: resolved.map((r) => ({ ...r.info })), loading: false });
    } catch (e) {
        store.set({ loading: false, error: `Could not read the extensions folder: ${e instanceof Error ? e.message : e}` });
    }
}

let queue: Promise<void> = Promise.resolve();

/** Re-reads the extensions folder. Calls queue up, so loads never overlap. */
export function reloadExtensions(): Promise<void> {
    queue = queue.then(load);
    return queue;
}

/** Loads extensions now and again whenever the extensions folder changes. Returns a stop function. */
export function startExtensions(): () => void {
    const api = window.electron?.extensions;
    if (!api) return () => { };
    void reloadExtensions();
    return api.onChanged(() => void reloadExtensions());
}
