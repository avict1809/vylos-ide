'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Cloud, HardDrive, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import {
    DEFAULT_ENDPOINT, useAiProviderStore, type AiMode,
} from '@/app/lib/stores/ai-provider-store';
import { probeToolSupport, refreshLocalModels } from '@/app/lib/ai/local-provider';
import { cn } from '@/app/lib/utils';

/**
 * Choosing who does the thinking: Vylos AI, or a model the learner runs
 * themselves. Anything that speaks the OpenAI chat API works — Ollama, LM
 * Studio, llama.cpp — including one on another machine on their network.
 */

const MODES: { id: AiMode; label: string; hint: string }[] = [
    { id: 'cloud', label: 'Vylos AI', hint: 'Nothing to install. Daily limits apply.' },
    { id: 'local', label: 'My models', hint: 'Everything runs on your machine. No limits, works offline.' },
    { id: 'auto', label: 'Auto', hint: 'Your models where they fit, Vylos AI for the rest.' },
];

const gb = (bytes?: number) => (bytes ? ` · ${(bytes / 1e9).toFixed(1)} GB` : '');

export default function LocalAiSettings() {
    const {
        mode, setMode, endpoint, setEndpoint, tutorModel, setTutorModel,
        quickModel, setQuickModel, models, status, error, toolSupport,
    } = useAiProviderStore();
    const [draft, setDraft] = useState(endpoint);
    const [testing, setTesting] = useState(false);

    // Look for models as soon as the learner opts in, so the lists are filled
    useEffect(() => {
        if (mode !== 'cloud' && status === 'unknown') void refreshLocalModels(endpoint);
    }, [mode, status, endpoint]);

    const support = tutorModel ? toolSupport[tutorModel] ?? 'unknown' : 'unknown';

    const check = async () => {
        const trimmed = draft.trim() || DEFAULT_ENDPOINT;
        setDraft(trimmed);
        if (trimmed !== endpoint) setEndpoint(trimmed);
        await refreshLocalModels(trimmed);
    };

    /** Picking a tutor model is also when we find out whether it can teach. */
    const chooseTutor = async (id: string) => {
        setTutorModel(id || null);
        if (!id || toolSupport[id]) return;
        setTesting(true);
        try {
            await probeToolSupport({ endpoint, model: id });
        } finally {
            setTesting(false);
        }
    };

    return (
        <section>
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-1 h-1 bg-[var(--vylos-green)] rounded-full" />
                AI Models
            </h3>

            <div className="grid grid-cols-3 gap-2">
                {MODES.map((m) => (
                    <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        className={cn(
                            'px-3 py-2 rounded-lg border text-left transition-all',
                            mode === m.id
                                ? 'border-[var(--vylos-green)] bg-[var(--vylos-green)]/10'
                                : 'border-[#27272a] hover:border-[#3f3f46]'
                        )}
                    >
                        <span className={cn('flex items-center gap-1.5 text-[11px] font-bold',
                            mode === m.id ? 'text-[var(--vylos-green)]' : 'text-gray-300')}>
                            {m.id === 'cloud' ? <Cloud size={11} /> : m.id === 'local' ? <HardDrive size={11} /> : <Wand2 size={11} />}
                            {m.label}
                        </span>
                    </button>
                ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                {MODES.find((m) => m.id === mode)?.hint}
            </p>

            {mode !== 'cloud' && (
                <div className="mt-5 space-y-4">
                    <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-1.5">
                            Server address
                        </label>
                        <div className="flex gap-2">
                            <input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') void check(); }}
                                spellCheck={false}
                                placeholder={DEFAULT_ENDPOINT}
                                className="flex-1 px-3 py-2 bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] focus:border-[var(--vylos-green)] text-white text-[11px] font-mono rounded-lg outline-none transition-all"
                            />
                            <button
                                onClick={() => void check()}
                                disabled={status === 'checking'}
                                className="px-3 rounded-lg border border-[#27272a] hover:border-[var(--vylos-green)] text-gray-300 hover:text-white text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 transition-all"
                            >
                                {status === 'checking'
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <RefreshCw size={12} />}
                            </button>
                        </div>
                        <p className="mt-1.5 text-[10px] leading-relaxed">
                            {status === 'ready' && (
                                <span className="text-[var(--vylos-green)]">
                                    {models.length} model{models.length === 1 ? '' : 's'} ready.
                                </span>
                            )}
                            {status === 'unreachable' && <span className="text-amber-300/90">{error}</span>}
                            {(status === 'unknown' || status === 'checking') && (
                                <span className="text-gray-600">Ollama serves this at {DEFAULT_ENDPOINT}.</span>
                            )}
                        </p>
                    </div>

                    <ModelPicker
                        label="Teaching model"
                        hint="Runs the lessons. Needs to be able to call tools — Qwen and Devstral can."
                        value={tutorModel}
                        models={models}
                        onChange={(id) => void chooseTutor(id)}
                    />
                    <p className="-mt-2 text-[10px] leading-relaxed">
                        {testing ? (
                            <span className="flex items-center gap-1.5 text-gray-500">
                                <Loader2 size={10} className="animate-spin" /> Checking whether it can use tools…
                            </span>
                        ) : !tutorModel ? null : support === 'yes' ? (
                            <span className="flex items-center gap-1.5 text-[var(--vylos-green)]">
                                <Check size={10} /> Can use tools. Anything under about 7B will still struggle.
                            </span>
                        ) : support === 'no' ? (
                            <span className="flex items-start gap-1.5 text-amber-300/90">
                                <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                                This one didn&apos;t manage a tool call, so lessons {mode === 'auto' ? 'will use Vylos AI instead' : 'may not work'}. Try Qwen or Devstral.
                            </span>
                        ) : (
                            <button onClick={() => void chooseTutor(tutorModel)} className="text-gray-500 hover:text-gray-300">
                                Not tested yet — check it now
                            </button>
                        )}
                    </p>

                    <ModelPicker
                        label="Quick answers"
                        hint="Hover explanations, lesson notes, hints and error help. Any model will do."
                        value={quickModel}
                        models={models}
                        onChange={(id) => setQuickModel(id || null)}
                    />

                    <p className="text-[10px] text-gray-600 leading-relaxed border-t border-[#1a1a1a] pt-3">
                        The voice tutor always uses Vylos AI — speaking and listening in real time has no local
                        equivalent yet.
                    </p>
                </div>
            )}
        </section>
    );
}

function ModelPicker({ label, hint, value, models, onChange }: {
    label: string;
    hint: string;
    value: string | null;
    models: { id: string; size?: number }[];
    onChange: (id: string) => void;
}) {
    return (
        <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-1.5">{label}</label>
            <select
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                disabled={models.length === 0}
                className="w-full px-3 py-2 bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] focus:border-[var(--vylos-green)] text-white text-[11px] rounded-lg outline-none transition-all disabled:opacity-50"
            >
                <option value="">{models.length ? 'Use Vylos AI' : 'No models found'}</option>
                {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.id}{gb(m.size)}</option>
                ))}
            </select>
            <p className="mt-1 text-[10px] text-gray-600 leading-relaxed">{hint}</p>
        </div>
    );
}
