'use client';

import { Settings as SettingsIcon, Sliders, Monitor, Keyboard, Info, Plus, Minus } from 'lucide-react';
import { useConfigStore } from '@/app/lib/stores/config-store';

export default function SettingsView() {
    const { fontSize, setFontSize, autoSave, setAutoSave, voiceTutorEnabled, setVoiceTutorEnabled } = useConfigStore();

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)] text-[var(--vylos-text-primary)]">
            <div className="p-3 border-b border-[var(--vylos-grey-border)]">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--vylos-text-secondary)]">Settings</h2>
            </div>

            <div className="flex-1 overflow-y-auto">
                <SettingCategory icon={<Monitor size={16} />} title="Appearance">
                    <div className="px-4 py-2 hover:bg-[#1a1a1a] flex justify-between items-center group transition-colors">
                        <span className="text-xs text-gray-500 group-hover:text-gray-300">Font Size</span>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setFontSize(fontSize - 1)} className="p-1 hover:bg-[#333] rounded"><Minus size={12} /></button>
                            <span className="text-[11px] text-[var(--vylos-green)]">{fontSize}px</span>
                            <button onClick={() => setFontSize(fontSize + 1)} className="p-1 hover:bg-[#333] rounded"><Plus size={12} /></button>
                        </div>
                    </div>
                    <SettingItem label="Theme" value="Vylos Dark" />
                </SettingCategory>

                <SettingCategory icon={<Keyboard size={16} />} title="Editor">
                    <div onClick={() => setAutoSave(!autoSave)}>
                        <SettingItem label="Auto Save" type="toggle" enabled={autoSave} />
                    </div>
                </SettingCategory>

                <SettingCategory icon={<Sliders size={16} />} title="AI Assistance">
                    <div onClick={() => setVoiceTutorEnabled(!voiceTutorEnabled)}>
                        <SettingItem label="Voice Tutor" type="toggle" enabled={voiceTutorEnabled} />
                    </div>
                </SettingCategory>

                <div className="mt-auto p-4 border-t border-[var(--vylos-grey-border)] flex items-center gap-3 select-none">
                    <div className="p-2 bg-[var(--vylos-green-dark)] rounded text-white font-bold text-xs shadow-lg">V.1.0</div>
                    <div>
                        <div className="text-xs font-bold">Vylos AI</div>
                        <div className="text-[10px] text-gray-500">Learning First IDE</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SettingCategory({ icon, title, children }: { icon: React.ReactNode, title: string, children: React.ReactNode }) {
    return (
        <div className="py-4 border-b border-[#1a1a1a]">
            <div className="px-4 flex items-center gap-2 mb-3 text-gray-400">
                {icon}
                <h3 className="text-sm font-medium">{title}</h3>
            </div>
            <div className="space-y-1">
                {children}
            </div>
        </div>
    );
}

function SettingItem({ label, value, type = 'text', enabled }: { label: string, value?: string, type?: 'text' | 'toggle', enabled?: boolean }) {
    return (
        <div className="px-4 py-2 hover:bg-[#1a1a1a] flex justify-between items-center group transition-colors cursor-pointer">
            <span className="text-xs text-gray-500 group-hover:text-gray-300">{label}</span>
            {type === 'text' ? (
                <span className="text-[11px] text-[var(--vylos-green)] opacity-80">{value}</span>
            ) : (
                <div className={`w-8 h-4 rounded-full relative transition-colors ${enabled ? 'bg-[var(--vylos-green-dark)]' : 'bg-gray-700'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${enabled ? 'left-4.5' : 'left-0.5'}`} />
                </div>
            )}
        </div>
    );
}
