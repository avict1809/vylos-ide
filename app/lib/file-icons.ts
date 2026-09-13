// Explorer icons from the bundled Material Icon Theme (public/icon-themes/material).
// Returns null when there's no specific icon, so the caller can use its default.

const ICON_ROOT = '/icon-themes/material/icons';

// Exact file names (lowercase)
const FILE_NAMES: Record<string, string> = {
    'package.json': 'nodejs',
    'package-lock.json': 'npm',
    '.npmrc': 'npm',
    'yarn.lock': 'yarn',
    'pnpm-lock.yaml': 'pnpm',
    'pnpm-workspace.yaml': 'pnpm',
    'tsconfig.json': 'tsconfig',
    'jsconfig.json': 'jsconfig',
    '.gitignore': 'git',
    '.gitattributes': 'git',
    '.gitmodules': 'git',
    'dockerfile': 'docker',
    '.dockerignore': 'docker',
    'docker-compose.yml': 'docker',
    'docker-compose.yaml': 'docker',
    'compose.yml': 'docker',
    'readme.md': 'readme',
    'readme': 'readme',
    'license': 'license',
    'license.md': 'license',
    'license.txt': 'license',
    'changelog.md': 'changelog',
    'contributing.md': 'contributing',
    'makefile': 'makefile',
    'cmakelists.txt': 'cmake',
    '.prettierrc': 'prettier',
    '.babelrc': 'babel',
    'build.gradle': 'gradle',
    'build.gradle.kts': 'gradle',
    'pom.xml': 'maven',
    'requirements.txt': 'python',
    'pyproject.toml': 'python',
    'nginx.conf': 'nginx',
};

// Config files that come in several extensions (vite.config.ts, .eslintrc.json…)
const FILE_PREFIXES: [string, string][] = [
    ['.env', 'tune'],
    ['.eslintrc', 'eslint'],
    ['eslint.config.', 'eslint'],
    ['.prettierrc.', 'prettier'],
    ['prettier.config.', 'prettier'],
    ['vite.config.', 'vite'],
    ['vitest.config.', 'vitest'],
    ['jest.config.', 'jest'],
    ['tailwind.config.', 'tailwindcss'],
    ['next.config.', 'next'],
    ['nuxt.config.', 'nuxt'],
    ['babel.config.', 'babel'],
    ['webpack.config.', 'webpack'],
    ['rollup.config.', 'rollup'],
    ['tsconfig.', 'tsconfig'],
];

const EXTENSIONS: Record<string, string> = {
    ts: 'typescript', mts: 'typescript', cts: 'typescript',
    tsx: 'react_ts', jsx: 'react',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    py: 'python', pyw: 'python', ipynb: 'jupyter',
    json: 'json', jsonc: 'json',
    md: 'markdown', mdx: 'markdown',
    html: 'html', htm: 'html',
    css: 'css', scss: 'sass', sass: 'sass', less: 'less',
    java: 'java', c: 'c', h: 'h',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'hpp', hh: 'hpp',
    cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
    swift: 'swift', kt: 'kotlin', kts: 'kotlin', dart: 'dart', lua: 'lua',
    sh: 'console', bash: 'console', zsh: 'console', fish: 'console',
    ps1: 'powershell',
    yml: 'yaml', yaml: 'yaml', xml: 'xml', toml: 'toml',
    ini: 'settings', cfg: 'settings', conf: 'settings',
    lock: 'lock',
    svg: 'svg',
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', ico: 'image',
    pdf: 'pdf',
    zip: 'zip', tar: 'zip', gz: 'zip', rar: 'zip', '7z': 'zip',
    txt: 'document', log: 'log',
    sql: 'database', db: 'database', sqlite: 'database',
    csv: 'table', tsv: 'table',
    pem: 'certificate', crt: 'certificate', key: 'key',
    mp4: 'video', mov: 'video', webm: 'video', mkv: 'video',
    mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
    ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
    exe: 'exe', msi: 'exe',
    r: 'r', jl: 'julia', scala: 'scala', hs: 'haskell',
    ex: 'elixir', exs: 'elixir', erl: 'erlang', clj: 'clojure',
    vim: 'vim', graphql: 'graphql', gql: 'graphql', prisma: 'prisma', tf: 'terraform',
    vue: 'vue', svelte: 'svelte', astro: 'astro',
};

// Folder names (lowercase) -> folder-<icon>.svg / folder-<icon>-open.svg
const FOLDERS: Record<string, string> = {
    src: 'src', source: 'src',
    node_modules: 'node',
    '.git': 'git', '.github': 'github', '.vscode': 'vscode', '.claude': 'claude', '.husky': 'husky',
    components: 'components', component: 'components',
    public: 'public', static: 'public',
    dist: 'dist', build: 'dist', out: 'dist', release: 'dist',
    test: 'test', tests: 'test', __tests__: 'test', spec: 'test', e2e: 'test',
    docs: 'docs', doc: 'docs',
    images: 'images', image: 'images', img: 'images', icons: 'images', screenshots: 'images',
    config: 'config', configs: 'config', settings: 'config',
    lib: 'lib', libs: 'lib', vendor: 'lib',
    utils: 'utils', util: 'utils',
    helpers: 'helper', helper: 'helper',
    app: 'app', apps: 'app',
    scripts: 'scripts', bin: 'scripts',
    api: 'api', server: 'server', backend: 'server', client: 'client', frontend: 'client',
    routes: 'routes', router: 'routes',
    views: 'views', pages: 'views', screens: 'views',
    hooks: 'hook', hook: 'hook',
    include: 'include', includes: 'include',
    tmp: 'temp', temp: 'temp',
    database: 'database', db: 'database',
    migrations: 'migrations',
    android: 'android', ios: 'ios',
    core: 'core', shared: 'shared', common: 'shared',
    supabase: 'supabase', '.next': 'next',
    store: 'store', stores: 'store', state: 'store',
    constants: 'constant', constant: 'constant',
    logs: 'log', log: 'log',
    target: 'target',
    styles: 'css', style: 'css', css: 'css', sass: 'sass', scss: 'sass',
    assets: 'resource', resources: 'resource', res: 'resource',
    types: 'interface', interfaces: 'interface', typings: 'interface',
    middleware: 'middleware', middlewares: 'middleware',
    plugins: 'plugin', plugin: 'plugin',
    mocks: 'mock', mock: 'mock', __mocks__: 'mock', fixtures: 'mock',
    i18n: 'i18n', locales: 'i18n', locale: 'i18n', lang: 'i18n',
    fonts: 'font', font: 'font',
    packages: 'packages',
    functions: 'functions',
    layouts: 'layout', layout: 'layout',
    context: 'context', contexts: 'context',
    controllers: 'controller', controller: 'controller',
    tools: 'tools',
    theme: 'theme', themes: 'theme',
    electron: 'desktop',
    venv: 'python', '.venv': 'python',
    examples: 'examples', example: 'examples', samples: 'examples',
    coverage: 'coverage',
    prisma: 'prisma',
    video: 'video', videos: 'video', audio: 'audio',
};

export function fileIconUrl(name: string): string | null {
    const lower = name.toLowerCase();
    const byName = FILE_NAMES[lower] ?? FILE_PREFIXES.find(([prefix]) => lower.startsWith(prefix))?.[1];
    if (byName) return `${ICON_ROOT}/file/${byName}.svg`;

    const dot = lower.lastIndexOf('.');
    const icon = dot > 0 ? EXTENSIONS[lower.slice(dot + 1)] : undefined;
    return icon ? `${ICON_ROOT}/file/${icon}.svg` : null;
}

export function folderIconUrl(name: string, open: boolean): string {
    const icon = FOLDERS[name.toLowerCase()] ?? 'base';
    return `${ICON_ROOT}/folder/folder-${icon}${open ? '-open' : ''}.svg`;
}
