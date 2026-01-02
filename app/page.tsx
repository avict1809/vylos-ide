'use client';

import {
  Separator,
  Panel,
  Group,
} from "react-resizable-panels";

import ActivityBar from "./components/ActivityBar";
import SidePanel from "./components/SidePanel";
import EditorArea from "./components/EditorArea";
import StatusBar from "./components/StatusBar";

export default function Home() {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[var(--vylos-black)] text-[var(--vylos-text-primary)]">

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">

        {/* Activity Bar (Fixed Width) */}
        <ActivityBar />

        {/* Resizable Panels */}
        <Group orientation="horizontal" className="h-full w-full">

          {/* Side Panel (File Explorer, etc.) */}
          <Panel defaultSize={20} minSize={140} className="bg-[var(--vylos-grey-dark)]">
            <SidePanel />
          </Panel>

          <Separator className="w-1 bg-[var(--vylos-black)] hover:bg-[var(--vylos-green)] transition-colors" />

          {/* Editor Area */}
          <Panel defaultSize={80}>
            <EditorArea />
          </Panel>

        </Group>
      </div>

      {/* Status Bar (Fixed Height) */}
      <StatusBar />
    </div>
  );
}
