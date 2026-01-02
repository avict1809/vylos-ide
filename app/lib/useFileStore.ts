import { create } from 'zustand';

interface FileNode {
    name: string;
    isDirectory: boolean;
    path: string;
    children?: FileNode[];
    isExpanded?: boolean;
}

interface FileStore {
    activeFile: FileNode | null;
    fileContent: string;
    isReading: boolean;
    setActiveFile: (file: FileNode | null) => void;
    setFileContent: (content: string) => void;
    setIsReading: (isReading: boolean) => void;
}

export const useFileStore = create<FileStore>((set) => ({
    activeFile: null,
    fileContent: '',
    isReading: false,
    setActiveFile: (file) => set({ activeFile: file }),
    setFileContent: (content) => set({ fileContent: content }),
    setIsReading: (isReading) => set({ isReading }),
}));
