import { VYLOS_WEB_URL } from '@/electron/site';

/**
 * The Content Security Policy for the packaged app's window. The window can
 * reach the file system and the terminal through the preload bridge, so the
 * policy makes sure only the app's own code ever runs in it, and that it only
 * talks to the services Vylos uses:
 *
 * - scripts and workers: the app itself, plus blob: for Monaco's and the
 *   extension sandbox's workers; 'unsafe-inline' for Next's inline bootstrap
 *   (the static export can't carry per-request nonces). No 'unsafe-eval'.
 * - connections: Supabase (API, auth, realtime), the website (billing), and
 *   Gemini Live for the voice tutor.
 * - no plugins, no <base> tricks, no form posts anywhere.
 *
 * Applied in production builds only: the Next dev server needs eval.
 */
function origin(url: string | undefined): string | null {
    try {
        return url ? new URL(url).origin : null;
    } catch {
        return null;
    }
}

export function contentSecurityPolicy(): string {
    const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const web = origin(VYLOS_WEB_URL);
    const connect = [
        "'self'",
        supabase,
        supabase?.replace(/^http/, 'ws'),
        web,
        'https://generativelanguage.googleapis.com',
        'wss://generativelanguage.googleapis.com',
    ].filter(Boolean);

    return [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' blob:",
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        `connect-src ${connect.join(' ')}`,
        "media-src 'self' blob: data:",
        "frame-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
    ].join('; ');
}
