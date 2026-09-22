'use client';

import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

/**
 * Per-device account limits: a computer can be where at most 2 accounts start,
 * and at most 4 accounts can sign in on it (supabase/functions/device-register).
 * The id is a hash of the OS install id, computed in the main process.
 */

let deviceId: Promise<string | null> | null = null;

/** This computer's id, or null outside the desktop app. */
export function getDeviceId(): Promise<string | null> {
    deviceId ??= window.electron?.device
        ? window.electron.device.getId().catch(() => {
            deviceId = null; // try again next time
            return null;
        })
        : Promise.resolve(null);
    return deviceId;
}

/** Header the AI functions use to check the account is registered on this device. */
export async function deviceHeaders(): Promise<Record<string, string>> {
    const id = await getDeviceId();
    return id ? { 'x-vylos-device': id } : {};
}

/**
 * `ok: false` means the server refused this account on this device, with a
 * message for the learner. `ok: null` means it couldn't be checked (offline,
 * or the server doesn't have device limits yet); the AI functions still
 * enforce the limit, so the app lets the learner in.
 */
export type DeviceCheck = { ok: true } | { ok: false; message: string } | { ok: null };

/** Records the signed-in account on this device. Pass the token when no session is set yet. */
export async function registerDevice(accessToken?: string): Promise<DeviceCheck> {
    const supabase = getSupabase();
    const headers = await deviceHeaders();
    if (!supabase || !headers['x-vylos-device']) return { ok: null };

    const { error } = await supabase.functions.invoke('device-register', {
        body: {},
        headers: { ...headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
    if (!error) return { ok: true };
    if (error instanceof FunctionsHttpError && (error.context as Response).status === 403) {
        const body = await (error.context as Response).json().catch(() => null);
        return { ok: false, message: body?.error || 'This computer has reached its account limit.' };
    }
    console.error('Device registration failed:', error);
    return { ok: null };
}
