import { loader } from '@monaco-editor/react';

// Monaco loads from the app itself, not from a CDN. By default
// @monaco-editor/react fetches it from cdn.jsdelivr.net at runtime, which
// would run third-party code in a window that can reach the file system and
// the terminal, and would leave the editor blank offline. The files are
// copied from node_modules/monaco-editor into public/monaco by
// scripts/copy-monaco.mjs before every dev run and build.
loader.config({ paths: { vs: '/monaco/vs' } });
