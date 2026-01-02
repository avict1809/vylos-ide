export const fileSystem = {
    listDir: async (path: string) => {
        return await window.electron.fs.list(path);
    },
    readFile: async (path: string) => {
        return await window.electron.fs.read(path);
    },
    writeFile: async (path: string, content: string) => {
        return await window.electron.fs.write(path, content);
    },
};
