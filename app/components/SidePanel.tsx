'use client';

import FileExplorer from './FileExplorer';

export default function SidePanel() {
    // Currently hardcoded to show File Explorer, will switch based on ActivityBar later
    return (
        <div className="h-full w-full">
            <FileExplorer />
        </div>
    );
}
