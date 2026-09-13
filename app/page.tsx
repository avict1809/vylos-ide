'use client';

import React from 'react';

import {
  Separator,
  Panel,
  Group,
} from "react-resizable-panels";

import dynamic from 'next/dynamic';
import MonacoEditor from "./components/MonacoEditor";
import { ActivityBar } from "./components/ActivityBar";
import SidePanel from "./components/SidePanel";
import EditorArea from "./components/EditorArea";
import StatusBar from "./components/StatusBar";
import VoiceOrb from "./components/voice/VoiceOrb";

import { useFileStore } from "./lib/useFileStore";
import { useAuthStore } from "./lib/stores/auth-store";
import Onboarding from "./components/Onboarding";

const Terminal = dynamic(() => import("./components/Terminal/Terminal"), { ssr: false });

export default function Home() {
  const [mounted, setMounted] = React.useState(false);
  const { showTerminal, restoreSession } = useFileStore();
  const { hasCompletedOnboarding, isAuthenticated } = useAuthStore();
  const showWorkbench = mounted && isAuthenticated && hasCompletedOnboarding;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Reopen the editors that were open when the app was last closed
  React.useEffect(() => {
    if (showWorkbench) restoreSession();
  }, [showWorkbench, restoreSession]);

  if (!mounted) {
    return <div className="h-full w-full bg-black" />;
  }

  if (!showWorkbench) {
    return <Onboarding />;
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[var(--vylos-black)] text-[var(--vylos-text-primary)]">

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">

        {/* Activity Bar (Fixed Width) */}
        <ActivityBar />

        {/* Resizable Panels (Horizontal) */}
        <Group orientation="horizontal" className="h-full w-full">

          {/* Side Panel (File Explorer, etc.) */}
          <Panel defaultSize={20} minSize={140} className="bg-[var(--vylos-grey-dark)]">
            <SidePanel />
          </Panel>

          <Separator className="w-[1px] bg-[var(--vylos-green)] transition-all duration-200" />

          {/* Main Workspace (Editor + Terminal) */}
          <Panel defaultSize={80}>
            <Group orientation="vertical" className="h-full w-full">

              {/* Editor area */}
              <Panel defaultSize={showTerminal ? 70 : 100}>
                <EditorArea />
              </Panel>

              {showTerminal && (
                <>
                  <Separator className="h-[1px] bg-[var(--vylos-black)] hover:bg-[var(--vylos-green)] transition-all duration-200" />
                  <Panel defaultSize={30} minSize={100} className="bg-[#09090b]">
                    <div className="h-full flex flex-col">
                      <div className="h-7 border-b border-[#27272a] flex items-center px-4 bg-[#09090b]">
                        <span className="text-[10px] uppercase tracking-widest text-[#10b981] font-bold">Terminal</span>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <Terminal />
                      </div>
                    </div>
                  </Panel>
                </>
              )}

            </Group>
          </Panel>

        </Group>
      </div>

      {/* Status Bar (Fixed Height) */}
      <StatusBar />

      {/* Voice Tutor Orb */}
      <VoiceOrb />
    </div>
  );
}
