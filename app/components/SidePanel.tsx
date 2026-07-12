'use client';

import { FileExplorer } from "./FileExplorer";
import AIChatView from "./AIChatView";
import RoadmapView from "./learning/RoadmapView";
import SearchView from "./SearchView";
import GitView from "./GitView";
import SettingsView from "./SettingsView";
import AccountView from "./AccountView";
import TutorPanel from "./voice/TutorPanel";
import { useFileStore } from "../lib/useFileStore";
import { useRoadmapStore } from "../lib/stores/roadmap-store";
import { useCourseStore } from "../lib/stores/course-store";
import { useEffect } from "react";

export default function SidePanel() {
    const { activeView, setActiveView } = useFileStore();
    const { currentRoadmap } = useRoadmapStore();
    const { activeCourseId } = useCourseStore();

    // Feature Gating: If user tries to access AI without a learning path (course or roadmap), redirect to Learning
    useEffect(() => {
        if (activeView === 'ai' && !currentRoadmap && !activeCourseId) {
            setActiveView('learning');
        }
    }, [activeView, currentRoadmap, activeCourseId, setActiveView]);

    return (
        <div className="h-full flex flex-col bg-[#000000] animate-in slide-in-from-left-2 duration-300">
            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {activeView === 'explorer' && <FileExplorer />}
                {activeView === 'search' && <SearchView />}
                {activeView === 'git' && <GitView />}
                {activeView === 'ai' && <AIChatView />}
                {activeView === 'learning' && <RoadmapView />}
                {activeView === 'settings' && <SettingsView />}
                {activeView === 'account' && <AccountView />}
                {activeView === 'tutor' && <TutorPanel />}
            </div>
        </div>
    );
}
