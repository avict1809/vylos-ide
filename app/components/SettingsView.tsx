'use client';

import React from 'react';
import {
    Monitor,
    Type,
    Terminal as TerminalIcon,
    Layout,
    Eye,
    EyeOff,
    Plus,
    Minus,
    AlignLeft,
    WrapText,
    Settings as SettingsIcon
} from 'lucide-react';
import { useConfigStore } from '@/app/lib/stores/config-store';
import { cn } from '@/app/lib/utils';

export default function SettingsView() {
    const {
        fontSize, setFontSize,
        terminalFontSize, setTerminalFontSize,
        autoSave, setAutoSave,
        minimapEnabled, setMinimapEnabled,
        lineNumbers, setLineNumbers,
        wordWrap, setWordWrap,
        theme, setTheme
    } = useConfigStore();

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)] text-[var(--vylos-text-primary)]">
            <div className="p-4 border-b border-[var(--vylos-grey-border)] flex items-center gap-2">
                <SettingsIcon size={16} className="text-[var(--vylos-green)]" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--vylos-text-secondary)]">Preferences</h2>
            </div>

            <div className="flex-1 overflow-y-auto pb-8">
                {/* Editor Settings */}
                <SettingCategory icon={<Layout size={16} />} title="Editor">
                    <div className="px-4 py-3 flex justify-between items-center group">
                        <div className="flex flex-col">
                            <span className="text-xs font-medium text-gray-300">Font Size</span>
                            <span className="text-[10px] text-gray-500">Global editor text size</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setFontSize(Math.max(8, fontSize - 1))}
                                className="p-1.5 hover:bg-[var(--vylos-grey-medium)] rounded text-gray-400 hover:text-white transition-colors"
                            >
                                <Minus size={12} />
                            </button>
                            <span className="text-[11px] font-mono text-[var(--vylos-green)] w-8 text-center">{fontSize}px</span>
                            <button
                                onClick={() => setFontSize(Math.min(32, fontSize + 1))}
                                className="p-1.5 hover:bg-[var(--vylos-grey-medium)] rounded text-gray-400 hover:text-white transition-colors"
                            >
                                <Plus size={12} />
                            </button>
                        </div>
                    </div>

                    <ToggleSetting
                        label="Minimap"
                        description="Show code overview on the right"
                        enabled={minimapEnabled}
                        onChange={setMinimapEnabled}
                        icon={<Eye size={14} />}
                    />

                    <ToggleSetting
                        label="Line Numbers"
                        description="Show line numbers in gutter"
                        enabled={lineNumbers === 'on'}
                        onChange={(val) => setLineNumbers(val ? 'on' : 'off')}
                        icon={<AlignLeft size={14} />}
                    />

                    <ToggleSetting
                        label="Word Wrap"
                        description="Wrap long lines to viewport"
                        enabled={wordWrap === 'on'}
                        onChange={(val) => setWordWrap(val ? 'on' : 'off')}
                        icon={<WrapText size={14} />}
                    />
                </SettingCategory>

                {/* Terminal Settings */}
                <SettingCategory icon={<TerminalIcon size={16} />} title="Terminal">
                    <div className="px-4 py-3 flex justify-between items-center group">
                        <div className="flex flex-col">
                            <span className="text-xs font-medium text-gray-300">Terminal Font Size</span>
                            <span className="text-[10px] text-gray-500">Size of text in the terminal panel</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setTerminalFontSize(Math.max(8, terminalFontSize - 1))}
                                className="p-1.5 hover:bg-[var(--vylos-grey-medium)] rounded text-gray-400 hover:text-white transition-colors"
                            >
                                <Minus size={12} />
                            </button>
                            <span className="text-[11px] font-mono text-[var(--vylos-green)] w-8 text-center">{terminalFontSize}px</span>
                            <button
                                onClick={() => setTerminalFontSize(Math.min(24, terminalFontSize + 1))}
                                className="p-1.5 hover:bg-[var(--vylos-grey-medium)] rounded text-gray-400 hover:text-white transition-colors"
                            >
                                <Plus size={12} />
                            </button>
                        </div>
                    </div>
                </SettingCategory>

                {/* General Settings */}
                <SettingCategory icon={<Monitor size={16} />} title="System">
                    <ToggleSetting
                        label="Auto Save"
                        description="Automatically save files on change"
                        enabled={autoSave}
                        onChange={setAutoSave}
                    />

                    <div className="px-4 py-3 flex justify-between items-center group">
                        <div className="flex flex-col">
                            <span className="text-xs font-medium text-gray-300">Theme</span>
                            <span className="text-[10px] text-gray-500">More themes coming soon! 🚀</span>
                        </div>
                        <div className="px-3 py-1 bg-[var(--vylos-grey-medium)]/50 rounded text-gray-500 text-[10px] font-bold uppercase tracking-widest border border-dashed border-gray-700">
                            Vylos Dark
                        </div>
                    </div>
                </SettingCategory>

                <div className="mt-8 px-6 py-6 border-t border-[var(--vylos-grey-border)] flex flex-col items-center gap-2">
                    <div className="px-4 py-1.5 bg-[var(--vylos-green-dark)]/10 border border-[var(--vylos-green-dark)] rounded text-[var(--vylos-green)] font-bold text-[10px] uppercase tracking-widest shadow-sm">
                        Enterprise Edition
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">Vylos AI IDE v1.2.0</span>
                </div>
            </div>
        </div>
    );
}

function SettingCategory({ icon, title, children }: { icon: React.ReactNode, title: string, children: React.ReactNode }) {
    return (
        <div className="mt-2">
            <div className="px-4 py-3 flex items-center gap-2 text-[var(--vylos-text-secondary)] bg-[var(--vylos-grey-medium)]/20 border-y border-[var(--vylos-grey-border)]/30 select-none">
                {icon}
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-80">{title}</h3>
            </div>
            <div className="flex flex-col">
                {children}
            </div>
        </div>
    );
}

interface ToggleSettingProps {
    label: string;
    description: string;
    enabled: boolean;
    onChange: (val: boolean) => void;
    icon?: React.ReactNode;
}

function ToggleSetting({ label, description, enabled, onChange, icon }: ToggleSettingProps) {
    return (
        <div
            onClick={() => onChange(!enabled)}
            className="px-4 py-3 hover:bg-[var(--vylos-grey-medium)]/30 flex justify-between items-center group transition-colors cursor-pointer"
        >
            <div className="flex items-center gap-3">
                {icon && <div className="text-gray-500 group-hover:text-[var(--vylos-green)] transition-colors">{icon}</div>}
                <div className="flex flex-col">
                    <span className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">{label}</span>
                    <span className="text-[10px] text-gray-500 group-hover:text-gray-400 transition-colors">{description}</span>
                </div>
            </div>
            <div className={cn(
                "w-8 h-4 rounded-full relative transition-all duration-200 border",
                enabled ? "bg-[var(--vylos-green-dark)] border-[var(--vylos-green)]" : "bg-[var(--vylos-grey-medium)] border-transparent"
            )}>
                <div className={cn(
                    "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all duration-200",
                    enabled ? "left-[1.125rem] bg-[var(--vylos-black)]" : "left-0.5 bg-gray-500"
                )} />
            </div>
        </div>
    );
}
