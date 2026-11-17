// Copies Monaco's prebuilt editor (node_modules/monaco-editor/min/vs) into
// public/monaco/vs, where app/lib/monaco-loader.ts loads it from. Runs before
// `npm run dev` and `npm run build`; skips the copy when it's already current.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pkgPath = require.resolve('monaco-editor/package.json', { paths: [root] });
const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
const source = join(dirname(pkgPath), 'min', 'vs');
const target = join(root, 'public', 'monaco', 'vs');
const marker = join(root, 'public', 'monaco', 'VERSION');

if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === version && existsSync(target)) {
    process.exit(0);
}
rmSync(join(root, 'public', 'monaco'), { recursive: true, force: true });
cpSync(source, target, { recursive: true });
writeFileSync(marker, `${version}\n`);
console.log(`Copied monaco-editor ${version} to public/monaco/vs`);
