import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Milestone {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    tasks: string[];
}

export interface Roadmap {
    id: string;
    goal: string;
    milestones: Milestone[];
}

interface RoadmapState {
    currentRoadmap: Roadmap | null;
    setRoadmap: (roadmap: Roadmap) => void;
    completeMilestone: (bgId: string) => void;
    clearRoadmap: () => void;
}

export const useRoadmapStore = create<RoadmapState>()(
    persist(
        (set) => ({
            currentRoadmap: null,
            setRoadmap: (roadmap) => set({ currentRoadmap: roadmap }),
            completeMilestone: (id) =>
                set((state) => {
                    if (!state.currentRoadmap) return {};
                    const newMilestones = state.currentRoadmap.milestones.map((m) =>
                        m.id === id ? { ...m, completed: true } : m
                    );
                    return { currentRoadmap: { ...state.currentRoadmap, milestones: newMilestones } };
                }),
            clearRoadmap: () => set({ currentRoadmap: null }),
        }),
        {
            name: 'vylos-roadmap',
        }
    )
);
