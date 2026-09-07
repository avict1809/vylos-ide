'use client';

import React from 'react';
import {
    Monitor,
    Type,
    Layout,
    Eye,
    EyeOff,
    Plus,
    Minus,
    AlignLeft,
    WrapText,
    Settings as SettingsIcon,
    AudioLines,
    Lock
} from 'lucide-react';
import { useConfigStore } from '@/app/lib/stores/config-store';
import { useVoiceStore, TUTOR_VOICES } from '@/app/lib/stores/voice-store';
import { cn } from '@/app/lib/utils';

export default function SettingsView() {
    const {
        fontSize, setFontSize,
        autoSave, setAutoSave,
        minimapEnabled, setMinimapEnabled,
        lineNumbers, setLineNumbers,
        wordWrap, setWordWrap,
        theme, setTheme
    } = useConfigStore();

    const { selectedVoice, setSelectedVoice, sessionVoice, status } = useVoiceStore();
    // The Live API fixes the voice when a session is set up, so it stays locked
    // for as long as the tutor is connected.
    const voiceLocked = status === 'live' || status === 'connecting';

    return (
        <div className="h-full flex flex-col bg-[#000000]">
            <div className="p-6 border-b border-[#1a1a1a] bg-gradient-to-br from-[#050505] to-black">
                <div className="flex items-center gap-2 mb-1">
                    <SettingsIcon size={14} className="text-[var(--vylos-green)]" />
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Preferences</span>
                </div>
                <h2 className="text-lg font-black text-white italic uppercase tracking-tighter">System <span className="text-[var(--vylos-green)]">Configuration</span></h2>
            </div>

            <div className="flex-1 overflow-y-auto pb-8">
                <div className="space-y-8 px-6 pt-4">
                    <section>
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-1 h-1 bg-[var(--vylos-green)] rounded-full" />
                            Editor Display
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between py-2">
                                <div>
                                    <h4 className="text-[13px] font-bold text-gray-200">Font Size</h4>
                                    <p className="text-[11px] text-gray-500">Global editor text size</p>
                                </div>
                                <div className="flex items-center gap-3 bg-[#09090b] border border-[#1a1a1a] rounded-lg p-1 px-3">
                                    <button onClick={() => setFontSize(Math.max(8, fontSize - 1))} className="p-1 hover:text-[var(--vylos-green)] transition-colors"><Minus size={12} /></button>
                                    <span className="text-[11px] font-mono text-[var(--vylos-green)] w-8 text-center">{fontSize}</span>
                                    <button onClick={() => setFontSize(Math.min(32, fontSize + 1))} className="p-1 hover:text-[var(--vylos-green)] transition-colors"><Plus size={12} /></button>
                                </div>
                            </div>

                            <ToggleSetting label="Minimap" description="Show code overview on the right" enabled={minimapEnabled} onChange={setMinimapEnabled} icon={<Eye size={14} />} />
                            <ToggleSetting label="Line Numbers" description="Show line numbers in gutter" enabled={lineNumbers === 'on'} onChange={(val) => setLineNumbers(val ? 'on' : 'off')} icon={<AlignLeft size={14} />} />
                            <ToggleSetting label="Word Wrap" description="Wrap long lines to viewport" enabled={wordWrap === 'on'} onChange={(val) => setWordWrap(val ? 'on' : 'off')} icon={<WrapText size={14} />} />
                        </div>
                    </section>

                    <section>
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-1 h-1 bg-[var(--vylos-green)] rounded-full" />
                            Voice Tutor
                        </h3>

                        <div className="flex items-start justify-between gap-4 py-2 mb-3">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-[#09090b] border border-[#1a1a1a] rounded-lg text-gray-500">
                                    <AudioLines size={14} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[13px] font-bold text-gray-300">Tutor Voice</span>
                                    <span className="text-[11px] text-gray-500">
                                        The voice your tutor speaks with during a lesson
                                    </span>
                                </div>
                            </div>
                            <span className="shrink-0 mt-1 text-[11px] font-mono text-[var(--vylos-green)]">
                                {voiceLocked ? (sessionVoice ?? selectedVoice) : selectedVoice}
                            </span>
                        </div>

                        {voiceLocked && (
                            <div className="mb-3 px-3 py-2.5 bg-[#09090b] border border-[#1a1a1a] rounded-lg flex items-start gap-2.5">
                                <Lock size={12} className="text-gray-500 mt-0.5 shrink-0" />
                                <p className="text-[11px] text-gray-400 leading-relaxed">
                                    A tutor session is running in the{' '}
                                    <span className="text-[var(--vylos-green)] font-bold">{sessionVoice ?? selectedVoice}</span>{' '}
                                    voice. The voice stays fixed for the whole session — end it to choose a different one.
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            {TUTOR_VOICES.map((voice) => {
                                const active = voiceLocked
                                    ? (sessionVoice ?? selectedVoice) === voice.name
                                    : selectedVoice === voice.name;
                                return (
                                    <button
                                        key={voice.name}
                                        disabled={voiceLocked}
                                        onClick={() => setSelectedVoice(voice.name)}
                                        className={cn(
                                            'p-2.5 rounded-lg border text-left transition-all',
                                            active
                                                ? 'border-[var(--vylos-green)] bg-[var(--vylos-green)]/10'
                                                : 'border-[#1a1a1a] bg-[#09090b]',
                                            voiceLocked
                                                ? 'opacity-40 cursor-not-allowed'
                                                : !active && 'hover:border-gray-600'
                                        )}
                                    >
                                        <div className={cn(
                                            'text-xs font-bold',
                                            active ? 'text-[var(--vylos-green)]' : 'text-gray-200'
                                        )}>
                                            {voice.name}
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">{voice.description}</div>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-gray-600 mt-3">
                            Applies the next time you start a lesson. A resumed lesson continues in the voice it began with.
                        </p>
                    </section>
                </div>

                <div className="mt-12 px-8 py-8 border-t border-[#1a1a1a] flex flex-col items-center gap-3">
                    <div className="px-3 py-1 bg-[var(--vylos-green-dark)]/10 border border-[var(--vylos-green-dark)]/30 rounded-full text-[var(--vylos-green)] font-black text-[9px] uppercase tracking-widest animate-pulse">
                        Vylos System v0.1.0 // ENTERPRISE
                    </div>
                    <span className="text-[9px] text-gray-700 font-black uppercase tracking-[0.2em] italic">Architected for Professional Mastery</span>
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
            className="py-3 flex justify-between items-center group cursor-pointer"
        >
            <div className="flex items-center gap-4">
                {icon && <div className="p-2 bg-[#09090b] border border-[#1a1a1a] rounded-lg text-gray-500 group-hover:text-[var(--vylos-green)] group-hover:border-[var(--vylos-green-dark)]/30 transition-all">{icon}</div>}
                <div className="flex flex-col">
                    <span className="text-[13px] font-bold text-gray-300 group-hover:text-white transition-colors">{label}</span>
                    <span className="text-[11px] text-gray-500 group-hover:text-gray-400 transition-colors">{description}</span>
                </div>
            </div>
            <div className={cn(
                "w-10 h-5 rounded-full p-1 transition-all duration-300 border",
                enabled ? "bg-[var(--vylos-green-dark)]/20 border-[var(--vylos-green-dark)] shadow-[0_0_10px_rgba(0,255,0,0.1)]" : "bg-[#1f1f23]/30 border-[#27272a]"
            )}>
                <div className={cn(
                    "w-2.5 h-2.5 rounded-full transition-all duration-300",
                    enabled ? "translate-x-5 bg-[var(--vylos-green)] shadow-[0_0_8px_var(--vylos-green)]" : "translate-x-0 bg-gray-600"
                )} />
            </div>
        </div>
    );
}
