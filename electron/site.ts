// The Vylos website. Sign-in, docs and the legal pages all live there, so this
// one address is the only thing to change when the site moves. Set
// VYLOS_WEB_URL to try a local copy of vylos-web (e.g. http://localhost:3000).
// Shared by the Electron main process and the renderer.
export const VYLOS_WEB_URL = (
    (typeof process !== 'undefined' && process.env.VYLOS_WEB_URL) || 'https://vylos.co'
).replace(/\/+$/, '');

export const webUrl = (path: string) => `${VYLOS_WEB_URL}${path}`;
