'use client';

import { useSyncExternalStore } from 'react';
import type { Disposable } from '../disposable';
import { getSupabase } from '../supabase';
import { registerCourse } from './course-registry';
import type { CourseDefinition } from './types';

/**
 * Courses come from public.courses in Supabase (supabase/migrations/*_courses.sql).
 * The last list downloaded is kept on disk, so the catalog shows up at once
 * and works offline; it's refreshed at startup and when the app comes back
 * online. A course that fails to parse is skipped, never the whole catalog.
 */

interface CourseRow {
    id: string;
    position: number;
    updated_at: string;
    definition: Omit<CourseDefinition, 'id' | 'order'>;
}

interface Cache {
    fetchedAt: string;
    rows: CourseRow[];
}

/** loading: nothing to show yet. offline: showing the saved copy. error: nothing saved and no connection. */
export type CourseSourceStatus = 'loading' | 'ready' | 'offline' | 'error';

// Not 'vylos-courses': that's the learner's progress (course-store.ts)
const CACHE_KEY = 'vylos-course-catalog';

const registered = new Map<string, { updatedAt: string; disposable: Disposable }>();
let status: CourseSourceStatus = 'loading';
const listeners = new Set<() => void>();

function setStatus(next: CourseSourceStatus) {
    if (status === next) return;
    status = next;
    listeners.forEach((listener) => listener());
}

function readCache(): Cache | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? (JSON.parse(raw) as Cache) : null;
    } catch {
        return null;
    }
}

function writeCache(rows: CourseRow[]) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: new Date().toISOString(), rows } satisfies Cache));
    } catch (err) {
        // Full or unavailable storage only costs the offline copy
        console.warn('Could not save the course list for offline use', err);
    }
}

/**
 * Registers new and changed courses and drops ones no longer listed. A
 * course that fails to parse keeps the version already showing, if any.
 */
function apply(rows: CourseRow[]) {
    const listed = new Set(rows.map((row) => row.id));
    for (const row of rows) {
        const current = registered.get(row.id);
        if (current?.updatedAt === row.updated_at) continue;
        try {
            // Register before disposing, so the course never blinks out
            const disposable = registerCourse({ ...row.definition, id: row.id, order: row.position });
            current?.disposable.dispose();
            registered.set(row.id, { updatedAt: row.updated_at, disposable });
        } catch (err) {
            console.error(`Skipping course "${row.id}":`, err instanceof Error ? err.message : err);
        }
    }
    for (const [id, entry] of registered) {
        if (listed.has(id)) continue;
        entry.disposable.dispose();
        registered.delete(id);
    }
}

let inFlight: Promise<void> | null = null;

/** Downloads the published courses. Safe to call often: concurrent calls share one request. */
export function refreshCourses(): Promise<void> {
    inFlight ??= (async () => {
        const supabase = getSupabase();
        try {
            if (!supabase) throw new Error('Supabase is not configured');
            const { data, error } = await supabase
                .from('courses')
                .select('id, position, updated_at, definition')
                .order('position')
                .order('id');
            if (error) throw new Error(error.message);
            const rows = data as CourseRow[];
            apply(rows);
            // All of it, so a course this version can't parse still loads
            // offline after an app update that can
            writeCache(rows);
            setStatus('ready');
        } catch (err) {
            console.warn('Could not download courses:', err instanceof Error ? err.message : err);
            setStatus(registered.size ? 'offline' : 'error');
        } finally {
            inFlight = null;
        }
    })();
    return inFlight;
}

/** Downloads courses now and again whenever the app reconnects. Returns a cleanup. */
export function startCourseSync(): () => void {
    void refreshCourses();
    const onOnline = () => void refreshCourses();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export const useCourseSourceStatus = () => useSyncExternalStore(subscribe, () => status, () => status);

// The saved copy registers as soon as this module loads, before the first
// render, so a course the learner had open is there when the app restores it.
if (typeof window !== 'undefined') {
    const cache = readCache();
    if (cache?.rows.length) {
        apply(cache.rows);
        setStatus('offline');
    }
}
