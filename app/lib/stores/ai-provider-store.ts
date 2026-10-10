'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Where the thinking happens: Vylos AI in the cloud, or a model on the
 * learner's own machine.
 *
 * Two jobs, because they ask very different things of a model:
 *  - TUTOR: the teaching conversation, which is an agent loop — it only works
 *    on a model that can call tools reliably (Qwen, Devstral, and the like).
 *  - QUICK: the one-shot helpers (hover explanations, lesson notes, hints,
 *    roadmaps, error help). No tools, so almost any model can do these.
 *
 * The voice tutor is not here: it is a realtime audio session with Gemini Live
 * and has no local equivalent, so it always runs in the cloud.
 */

export const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434/v1';

export type AiMode = 'cloud' | 'local' | 'auto';
export type LocalStatus = 'unknown' | 'checking' | 'ready' | 'unreachable';
/** Whether a model can call tools: tested once, then remembered. */
export type ToolSupport = 'yes' | 'no' | 'unknown';

export interface LocalModel {
    id: string;
    /** Bytes on disk, when the runtime reports it */
    size?: number;
}

/** Which of the two jobs a request belongs to. */
export type AiJob = 'tutor' | 'quick';

export interface LocalTarget {
    endpoint: string;
    model: string;
}

interface AiProviderStore {
    mode: AiMode;
    endpoint: string;
    /** Model for the teaching conversation; must be able to call tools */
    tutorModel: string | null;
    /** Model for the one-shot helpers */
    quickModel: string | null;
    models: LocalModel[];
    status: LocalStatus;
    error: string | null;
    toolSupport: Record<string, ToolSupport>;

    setMode: (mode: AiMode) => void;
    setEndpoint: (endpoint: string) => void;
    setTutorModel: (model: string | null) => void;
    setQuickModel: (model: string | null) => void;
    setModels: (models: LocalModel[]) => void;
    setStatus: (status: LocalStatus, error?: string | null) => void;
    setToolSupport: (model: string, support: ToolSupport) => void;
}

export const useAiProviderStore = create<AiProviderStore>()(
    persist(
        (set) => ({
            mode: 'cloud',
            endpoint: DEFAULT_ENDPOINT,
            tutorModel: null,
            quickModel: null,
            models: [],
            status: 'unknown',
            error: null,
            toolSupport: {},

            setMode: (mode) => set({ mode }),
            setEndpoint: (endpoint) => set({ endpoint, status: 'unknown', models: [], error: null }),
            setTutorModel: (tutorModel) => set({ tutorModel }),
            setQuickModel: (quickModel) => set({ quickModel }),
            setModels: (models) => set({ models }),
            setStatus: (status, error = null) => set({ status, error }),
            setToolSupport: (model, support) =>
                set((s) => ({ toolSupport: { ...s.toolSupport, [model]: support } })),
        }),
        {
            name: 'vylos-ai-provider',
            // What was discovered is re-checked on demand; what was chosen is kept
            partialize: (s) => ({
                mode: s.mode,
                endpoint: s.endpoint,
                tutorModel: s.tutorModel,
                quickModel: s.quickModel,
                toolSupport: s.toolSupport,
            }),
        }
    )
);

/** True when a model is known not to be able to call tools. */
export const cannotUseTools = (model: string | null): boolean =>
    !!model && useAiProviderStore.getState().toolSupport[model] === 'no';

/**
 * The local model that should answer this job, or null to use Vylos AI.
 *
 * In `auto` a job goes local only when a model has been chosen for it — and
 * the tutor additionally only when that model is known to handle tools, so a
 * half-configured setup degrades to the cloud instead of teaching badly.
 */
export function localTarget(job: AiJob): LocalTarget | null {
    const { mode, endpoint, tutorModel, quickModel } = useAiProviderStore.getState();
    if (mode === 'cloud' || !endpoint) return null;

    const model = job === 'tutor' ? tutorModel : quickModel;
    if (!model) {
        // Told to stay local with nothing picked for this job: the other
        // model is still better than silently going back online.
        const fallback = job === 'tutor' ? quickModel : tutorModel;
        return mode === 'local' && fallback ? { endpoint, model: fallback } : null;
    }
    if (mode === 'auto' && job === 'tutor' && cannotUseTools(model)) return null;
    return { endpoint, model };
}
