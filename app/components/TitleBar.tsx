"use client";

import { X, Minus, Square, Copy } from "lucide-react";
import { useState, useEffect } from "react";
import { useFileStore } from "../lib/useFileStore";

export function TitleBar() {
    const { activeFile } = useFileStore();
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        if (!window?.electron?.window) return;

        const update = async () => {
            setIsMaximized(await window.electron.window.isMaximized());
        };

        update();

        const cleanupMax = window.electron.window.onMaximize(update);
        const cleanupUnmax = window.electron.window.onUnmaximize(update);

        return () => {
            cleanupMax();
            cleanupUnmax();
        };
    }, []);

    const MENUS = ["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"];

    return (
        <div
            className="
        h-8 flex items-center bg-[#09090b]
        border-b border-[#27272a]
        text-[12.5px] text-gray-300
        select-none
        [-webkit-app-region:drag]
      "
            onDoubleClick={() => window.electron?.window.toggleMaximize()}
        >
            {/* Left: App icon + Menus */}
            <div className="flex items-center gap-1 pl-2 [-webkit-app-region:no-drag]">
                <div className="w-3 h-3 bg-[var(--vylos-green)] rounded-sm mr-2" />

                {MENUS.map(menu => (
                    <div
                        key={menu}
                        className="
              px-2 py-[2px]
              rounded
              cursor-default
              hover:bg-[#27272a]
              transition-colors
            "
                    >
                        {menu}
                    </div>
                ))}
            </div>

            {/* Center: Title (true VS Code style) */}
            <div className="flex-1 text-center pointer-events-none truncate text-gray-400">
                vylos — ai
                {activeFile && (
                    <>
                        <span className="opacity-50"> — </span>
                        <span>{activeFile.name}</span>
                    </>
                )}
            </div>

            {/* Right: Window controls */}
            <div className="flex items-center pr-1 [-webkit-app-region:no-drag]">
                <TitleButton onClick={() => window.electron?.window.minimize()}>
                    <Minus size={14} />
                </TitleButton>

                <TitleButton onClick={() => window.electron?.window.toggleMaximize()}>
                    {isMaximized ? (
                        <Copy size={12} className="rotate-180" />
                    ) : (
                        <Square size={12} />
                    )}
                </TitleButton>

                <TitleButton danger onClick={() => window.electron?.window.close()}>
                    <X size={14} />
                </TitleButton>
            </div>
        </div>
    );
}

function TitleButton({
    children,
    onClick,
    danger,
}: {
    children: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`
        h-8 w-11 flex items-center justify-center
        transition-colors
        ${danger
                    ? "hover:bg-red-500/30 hover:text-red-500"
                    : "hover:bg-[#27272a] hover:text-white"}
      `}
        >
            {children}
        </button>
    );
}
