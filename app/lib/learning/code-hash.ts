/**
 * Fingerprint of a set of files, used to spot identical project submissions
 * and to prove the files sent for review are the ones submitted. Must match
 * codeHash() in supabase/functions/learning/index.ts: files sorted by path,
 * each written as path, length and content.
 */
export async function codeHash(files: Record<string, string>): Promise<string> {
    const canonical = Object.keys(files)
        .sort()
        .map((path) => `${path}\n${files[path].length}\n${files[path]}`)
        .join('\n');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
