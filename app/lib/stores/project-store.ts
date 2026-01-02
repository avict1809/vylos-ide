import { create } from 'zustand';

export interface ProjectState {
    projectPath: string | null;
    fileTree: any[]; // Define a proper FileNode type later
    setProjectPath: (path: string) => void;
    setFileTree: (tree: any[]) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
    projectPath: null,
    fileTree: [],
    setProjectPath: (path) => set({ projectPath: path }),
    setFileTree: (tree) => set({ fileTree: tree }),
}));
