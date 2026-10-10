/**
 * The developer tools courses can ask for, how to find them on the learner's
 * computer, and how to install them on each operating system. A course lists
 * tool ids in `requires`; it can't supply its own commands, so a course pack
 * never runs anything here but these fixed version checks.
 *
 * Install steps only use package names and winget ids that are stable; where
 * there isn't a reliable one-liner, the step points to the official page.
 */

/** Where install steps differ: Windows, macOS, and Linux by package manager. */
export type OsKey = 'windows' | 'mac' | 'apt' | 'dnf' | 'pacman' | 'linux';

export interface InstallStep {
    text: string;
    /** A command to copy into a terminal */
    command?: string;
}

export interface ToolDef {
    id: string;
    name: string;
    /** Commands that print the version, tried in order */
    detect: { unix: string[]; windows: string[] };
    version: RegExp;
    /** Oldest version the course features need, e.g. for the Run button */
    min?: string;
    minReason?: string;
    /** The official download or install page */
    url: string;
    install: Partial<Record<OsKey, InstallStep[]>>;
}

const reopen: InstallStep = { text: 'Close and reopen Vylos so it finds the new tool, then press Check again.' };

export const TOOLS: Record<string, ToolDef> = {
    python: {
        id: 'python',
        name: 'Python 3',
        detect: { unix: ['python3 --version', 'python --version'], windows: ['python --version', 'py -3 --version'] },
        version: /Python (3\.\d+(?:\.\d+)?)/,
        url: 'https://www.python.org/downloads/',
        install: {
            windows: [{ text: 'In PowerShell or Command Prompt, install Python with winget:', command: 'winget install -e --id Python.Python.3.13' }, reopen],
            mac: [{ text: 'With Homebrew (brew.sh):', command: 'brew install python' }],
            apt: [{ text: 'In a terminal:', command: 'sudo apt install python3 python3-pip python3-venv' }],
            dnf: [{ text: 'In a terminal:', command: 'sudo dnf install python3 python3-pip' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S python python-pip' }],
        },
    },
    node: {
        id: 'node',
        name: 'Node.js',
        detect: { unix: ['node --version'], windows: ['node --version'] },
        version: /v(\d+\.\d+\.\d+)/,
        url: 'https://nodejs.org/en/download',
        install: {
            windows: [{ text: 'Install the LTS version with winget:', command: 'winget install -e --id OpenJS.NodeJS.LTS' }, reopen],
            mac: [{ text: 'With Homebrew:', command: 'brew install node' }],
            apt: [
                { text: 'In a terminal:', command: 'sudo apt install nodejs npm' },
                { text: 'Ubuntu and Debian can ship an old version. If a lesson needs a newer one, follow the instructions on nodejs.org.' },
            ],
            dnf: [{ text: 'In a terminal:', command: 'sudo dnf install nodejs' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S nodejs npm' }],
        },
    },
    java: {
        id: 'java',
        name: 'Java (JDK)',
        detect: { unix: ['javac -version'], windows: ['javac -version'] },
        version: /javac (\d+(?:\.\d+)*)/,
        min: '11',
        minReason: 'Running a single .java file directly needs JDK 11 or newer.',
        url: 'https://adoptium.net/',
        install: {
            windows: [{ text: 'Install the Temurin JDK with winget:', command: 'winget install -e --id EclipseAdoptium.Temurin.21.JDK' }, reopen],
            mac: [{ text: 'With Homebrew:', command: 'brew install --cask temurin' }],
            apt: [{ text: 'In a terminal:', command: 'sudo apt install default-jdk' }],
            dnf: [{ text: 'In a terminal:', command: 'sudo dnf install java-21-openjdk-devel' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S jdk-openjdk' }],
        },
    },
    kotlin: {
        id: 'kotlin',
        name: 'Kotlin compiler',
        detect: { unix: ['kotlinc -version'], windows: ['kotlinc -version'] },
        version: /kotlinc-jvm (\d+\.\d+\.\d+)/,
        url: 'https://kotlinlang.org/docs/command-line.html',
        install: {
            mac: [{ text: 'With Homebrew:', command: 'brew install kotlin' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S kotlin' }],
            linux: [
                { text: 'Install SDKMAN, the tool the Kotlin docs recommend:', command: 'curl -s "https://get.sdkman.io" | bash' },
                { text: 'Open a new terminal, then:', command: 'sdk install kotlin' },
            ],
        },
    },
    cc: {
        id: 'cc',
        name: 'C/C++ compiler',
        detect: { unix: ['g++ --version', 'clang++ --version'], windows: ['g++ --version'] },
        version: /(\d+\.\d+(?:\.\d+)?)/,
        url: 'https://gcc.gnu.org/install/binaries.html',
        install: {
            windows: [
                { text: 'Install MSYS2, which provides GCC for Windows:', command: 'winget install -e --id MSYS2.MSYS2' },
                { text: 'Open "MSYS2 UCRT64" from the Start menu and install the compiler:', command: 'pacman -S --needed mingw-w64-ucrt-x86_64-gcc' },
                { text: 'Add C:\\msys64\\ucrt64\\bin to your PATH (Settings → System → About → Advanced system settings → Environment Variables).' },
                reopen,
            ],
            mac: [{ text: 'Install Apple\'s command line tools:', command: 'xcode-select --install' }],
            apt: [{ text: 'In a terminal:', command: 'sudo apt install build-essential' }],
            dnf: [{ text: 'In a terminal:', command: 'sudo dnf install gcc gcc-c++' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S gcc' }],
        },
    },
    go: {
        id: 'go',
        name: 'Go',
        detect: { unix: ['go version'], windows: ['go version'] },
        version: /go(\d+\.\d+(?:\.\d+)?)/,
        url: 'https://go.dev/dl/',
        install: {
            windows: [{ text: 'Install Go with winget:', command: 'winget install -e --id GoLang.Go' }, reopen],
            mac: [{ text: 'With Homebrew:', command: 'brew install go' }],
            apt: [
                { text: 'In a terminal:', command: 'sudo apt install golang-go' },
                { text: 'This version can be old. For the newest Go, use the download on go.dev.' },
            ],
            dnf: [{ text: 'In a terminal:', command: 'sudo dnf install golang' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S go' }],
        },
    },
    rust: {
        id: 'rust',
        name: 'Rust (cargo)',
        detect: { unix: ['cargo --version'], windows: ['cargo --version'] },
        version: /cargo (\d+\.\d+\.\d+)/,
        url: 'https://rustup.rs/',
        install: {
            windows: [
                { text: 'Install rustup with winget:', command: 'winget install -e --id Rustlang.Rustup' },
                { text: 'If rustup asks to install the Visual Studio C++ Build Tools, say yes: Rust needs them on Windows.' },
                reopen,
            ],
            mac: [{ text: 'Install rustup, the official installer:', command: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S rustup' }, { text: 'Then pick the stable toolchain:', command: 'rustup default stable' }],
            linux: [{ text: 'Install rustup, the official installer:', command: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" }, reopen],
        },
    },
    dotnet: {
        id: 'dotnet',
        name: '.NET SDK',
        detect: { unix: ['dotnet --version'], windows: ['dotnet --version'] },
        version: /^(\d+\.\d+\.\d+)/m,
        min: '10',
        minReason: 'Running a single .cs file directly needs .NET 10 or newer.',
        url: 'https://dotnet.microsoft.com/download',
        install: {
            windows: [{ text: 'Install the .NET SDK with winget:', command: 'winget install -e --id Microsoft.DotNet.SDK.10' }, reopen],
            mac: [{ text: 'With Homebrew:', command: 'brew install --cask dotnet-sdk' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S dotnet-sdk' }],
        },
    },
    ruby: {
        id: 'ruby',
        name: 'Ruby',
        detect: { unix: ['ruby --version'], windows: ['ruby --version'] },
        version: /ruby (\d+\.\d+\.\d+)/,
        url: 'https://www.ruby-lang.org/en/documentation/installation/',
        install: {
            windows: [{ text: 'Download and run the "Ruby+Devkit" installer from rubyinstaller.org.' }, reopen],
            mac: [{ text: 'macOS\'s built-in Ruby is old. Install a current one with Homebrew:', command: 'brew install ruby' }],
            apt: [{ text: 'In a terminal:', command: 'sudo apt install ruby-full' }],
            dnf: [{ text: 'In a terminal:', command: 'sudo dnf install ruby ruby-devel' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S ruby' }],
        },
    },
    php: {
        id: 'php',
        name: 'PHP',
        detect: { unix: ['php --version'], windows: ['php --version'] },
        version: /PHP (\d+\.\d+\.\d+)/,
        url: 'https://www.php.net/downloads.php',
        install: {
            windows: [{ text: 'Download PHP from windows.php.net, unzip it (for example to C:\\php) and add that folder to your PATH.' }, reopen],
            mac: [{ text: 'With Homebrew:', command: 'brew install php' }],
            apt: [{ text: 'In a terminal:', command: 'sudo apt install php-cli' }],
            dnf: [{ text: 'In a terminal:', command: 'sudo dnf install php-cli' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S php' }],
        },
    },
    git: {
        id: 'git',
        name: 'Git',
        detect: { unix: ['git --version'], windows: ['git --version'] },
        version: /git version (\d+\.\d+\.\d+)/,
        url: 'https://git-scm.com/downloads',
        install: {
            windows: [{ text: 'Install Git with winget:', command: 'winget install -e --id Git.Git' }, reopen],
            mac: [{ text: 'Install Apple\'s command line tools, which include Git:', command: 'xcode-select --install' }],
            apt: [{ text: 'In a terminal:', command: 'sudo apt install git' }],
            dnf: [{ text: 'In a terminal:', command: 'sudo dnf install git' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S git' }],
        },
    },
    docker: {
        id: 'docker',
        name: 'Docker',
        detect: { unix: ['docker --version'], windows: ['docker --version'] },
        version: /Docker version (\d+\.\d+\.\d+)/,
        url: 'https://docs.docker.com/get-started/get-docker/',
        install: {
            windows: [{ text: 'Install Docker Desktop with winget:', command: 'winget install -e --id Docker.DockerDesktop' }, reopen],
            mac: [{ text: 'Download Docker Desktop for Mac from docker.com and open it once to finish setup.' }],
            apt: [
                { text: 'In a terminal:', command: 'sudo apt install docker.io' },
                { text: 'Let your user run Docker without sudo (log out and back in afterwards):', command: 'sudo usermod -aG docker $USER' },
            ],
            pacman: [
                { text: 'In a terminal:', command: 'sudo pacman -S docker' },
                { text: 'Start Docker now and at every boot:', command: 'sudo systemctl enable --now docker.service' },
            ],
        },
    },
    sqlite: {
        id: 'sqlite',
        name: 'SQLite',
        detect: { unix: ['sqlite3 --version'], windows: ['sqlite3 --version'] },
        version: /^(\d+\.\d+\.\d+)/m,
        url: 'https://www.sqlite.org/download.html',
        install: {
            windows: [{ text: 'Install SQLite with winget:', command: 'winget install -e --id SQLite.SQLite' }, reopen],
            mac: [{ text: 'macOS includes SQLite. For a newer one, with Homebrew:', command: 'brew install sqlite' }],
            apt: [{ text: 'In a terminal:', command: 'sudo apt install sqlite3' }],
            dnf: [{ text: 'In a terminal:', command: 'sudo dnf install sqlite' }],
            pacman: [{ text: 'In a terminal:', command: 'sudo pacman -S sqlite' }],
        },
    },
    psql: {
        id: 'psql',
        name: 'PostgreSQL',
        detect: { unix: ['psql --version'], windows: ['psql --version'] },
        version: /PostgreSQL\)? (\d+(?:\.\d+)?)/,
        url: 'https://www.postgresql.org/download/',
        install: {
            windows: [{ text: 'On postgresql.org/download, choose Windows and run the installer. Keep the password you set: you\'ll need it to connect.' }, reopen],
            mac: [
                { text: 'With Homebrew:', command: 'brew install postgresql@17' },
                { text: 'Start the database server:', command: 'brew services start postgresql@17' },
            ],
            apt: [{ text: 'In a terminal (the server starts automatically):', command: 'sudo apt install postgresql' }],
            dnf: [
                { text: 'In a terminal:', command: 'sudo dnf install postgresql-server' },
                { text: 'Create the database files:', command: 'sudo postgresql-setup --initdb' },
                { text: 'Start the server now and at every boot:', command: 'sudo systemctl enable --now postgresql' },
            ],
        },
    },
    swift: {
        id: 'swift',
        name: 'Swift',
        detect: { unix: ['swift --version'], windows: ['swift --version'] },
        version: /Swift version (\d+\.\d+(?:\.\d+)?)/,
        url: 'https://www.swift.org/install/',
        install: {
            mac: [{ text: 'Install Apple\'s command line tools (or Xcode from the App Store for iOS apps):', command: 'xcode-select --install' }],
        },
    },
};

export const TOOL_IDS = Object.keys(TOOLS);

/** Numeric comparison of dotted versions: "21.0.2" vs "11". */
export function atLeast(version: string, min: string): boolean {
    const a = version.split('.').map(Number);
    const b = min.split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0, y = b[i] ?? 0;
        if (x !== y) return x > y;
    }
    return true;
}

/** The install steps for this computer, falling back from a specific Linux package manager to generic Linux steps. */
export function installSteps(tool: ToolDef, os: OsKey): InstallStep[] | null {
    return tool.install[os] ?? (os === 'apt' || os === 'dnf' || os === 'pacman' ? tool.install.linux : undefined) ?? null;
}

export const OS_LABELS: Record<OsKey, string> = {
    windows: 'Windows',
    mac: 'macOS',
    apt: 'Linux (Ubuntu, Debian, Mint…)',
    dnf: 'Linux (Fedora, RHEL…)',
    pacman: 'Linux (Arch, Manjaro, Garuda…)',
    linux: 'Linux',
};

/** Picks the package manager from /etc/os-release's ID and ID_LIKE. */
export function linuxFamily(osRelease: string | null): OsKey {
    const ids = (osRelease ?? '')
        .split('\n')
        .filter((l) => /^(ID|ID_LIKE)=/.test(l))
        .flatMap((l) => l.slice(l.indexOf('=') + 1).replace(/"/g, '').toLowerCase().split(/\s+/));
    if (ids.some((id) => ['arch', 'manjaro', 'endeavouros', 'garuda', 'artix'].includes(id))) return 'pacman';
    if (ids.some((id) => ['fedora', 'rhel', 'centos', 'rocky', 'almalinux'].includes(id))) return 'dnf';
    if (ids.some((id) => ['debian', 'ubuntu', 'linuxmint', 'pop', 'elementary', 'raspbian'].includes(id))) return 'apt';
    return 'linux';
}

/** Reads a tool's version out of its --version output. */
export function parseToolVersion(tool: ToolDef, output: string): string | null {
    return output.match(tool.version)?.[1] ?? null;
}
