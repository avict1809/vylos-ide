import * as pty from 'node-pty';

export class PtyService {
    private ptyProcess: pty.IPty | null = null;
    private onData: (data: string) => void;

    constructor(onData: (data: string) => void) {
        this.onData = onData;
    }

    create() {
        if (this.ptyProcess) return;

        const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

        this.ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: process.env.HOME || process.cwd(),
            env: process.env as any
        });

        this.ptyProcess.onData((data) => {
            this.onData(data);
        });
    }

    write(data: string) {
        this.ptyProcess?.write(data);
    }

    resize(cols: number, rows: number) {
        this.ptyProcess?.resize(cols, rows);
    }

    kill() {
        this.ptyProcess?.kill();
        this.ptyProcess = null;
    }
}
