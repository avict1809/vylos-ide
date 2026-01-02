'use client';

import { FileExplorer } from "./FileExplorer";
import AIChatView from "./AIChatView";
import RoadmapView from "./learning/RoadmapView";
import SearchView from "./SearchView";
import GitView from "./GitView";
import SettingsView from "./SettingsView";
import { useFileStore } from "../lib/useFileStore";
import { useRoadmapStore } from "../lib/stores/roadmap-store";
import { useEffect } from "react";

export default function SidePanel() {
    const { activeView, setActiveView } = useFileStore();
    const { currentRoadmap } = useRoadmapStore();

    // Feature Gating: If user tries to access AI without a roadmap, redirect to Learning
    useEffect(() => {
        if (activeView === 'ai' && !currentRoadmap) {
            setActiveView('learning');
        }
    }, [activeView, currentRoadmap, setActiveView]);

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-grey-dark)] animate-in slide-in-from-left-2 duration-300">
            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {activeView === 'explorer' && <FileExplorer />}
                {activeView === 'search' && <SearchView />}
                {activeView === 'git' && <GitView />}
                {activeView === 'ai' && <AIChatView />}
                {activeView === 'learning' && <RoadmapView />}
                {activeView === 'settings' && (
                    <div className="p-4 text-sm text-gray-500 text-center">Settings are not implemented yet.</div>
                )}
            </div>
        </div>
    );
}
