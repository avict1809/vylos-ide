'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LessonRef } from '../learning/lesson-utils';

export interface TutorVoice {
    name: string;
    description: string;
}

// Prebuilt voices supported by the Gemini Live native-audio models
export const TUTOR_VOICES: TutorVoice[] = [
    { name: 'Zephyr', description: 'Bright & warm' },
    { name: 'Puck', description: 'Upbeat & playful' },
    { name: 'Charon', description: 'Deep & informative' },
    { name: 'Kore', description: 'Firm & clear' },
    { name: 'Fenrir', description: 'Energetic' },
    { name: 'Leda', description: 'Youthful & friendly' },
    { name: 'Orus', description: 'Calm & steady' },
    { name: 'Aoede', description: 'Breezy & light' },
];

export const DEFAULT_VOICE = 'Zephyr';

export function isSupportedVoice(name: string | undefined): boolean {
    return !!name && TUTOR_VOICES.some((v) => v.name === name);
}

export type VoiceStatus = 'idle' | 'connecting' | 'live';

export interface TranscriptEntry {
    id: number;
    role: 'tutor' | 'user' | 'action';
    text: string;
}

const MAX_TRANSCRIPT = 200;
let nextEntryId = 1;

interface VoiceStore {
    // The voice the learner picked for the *next* session
    selectedVoice: string;
    // The voice the running session is actually speaking with. Fixed when the
    // session is set up and never changed while it lasts, so the tutor cannot
    // switch voice mid-lesson. Outlives the session so a resumed lesson is
    // continued in the same voice it was started in.
    sessionVoice: string | null;
    status: VoiceStatus;
    error: string | null;
    // Caption line currently being spoken (accumulates transcript fragments)
    currentCaption: string;
    // What the learner is currently saying (accumulates until the tutor replies)
    pendingUserSpeech: string;
    // Full session transcript shown in the tutor sidebar
    transcript: TranscriptEntry[];
    // What the tutor is doing in the editor right now, e.g. "Writing code…"
    activity: string | null;
    // The curriculum lesson the tutor is currently teaching (null = free-form session)
    lessonContext: LessonRef | null;

    setLessonContext: (ref: LessonRef | null) => void;
    setSelectedVoice: (name: string) => void;
    /** Locks the voice for a session that is about to start. */
    setSessionVoice: (name: string) => void;
    setStatus: (status: VoiceStatus) => void;
    setError: (error: string | null) => void;
    appendCaption: (fragment: string) => void;
    clearCaption: () => void;
    /** Pushes the in-progress caption into the transcript as a finished tutor turn. */
    flushCaption: () => void;
    appendUserSpeech: (fragment: string) => void;
    addAction: (text: string) => void;
    clearTranscript: () => void;
    setActivity: (activity: string | null) => void;
    resetSession: () => void;
}

function pushEntry(transcript: TranscriptEntry[], role: TranscriptEntry['role'], text: string): TranscriptEntry[] {
    const trimmed = text.trim();
    if (!trimmed) return transcript;
    return [...transcript, { id: nextEntryId++, role, text: trimmed }].slice(-MAX_TRANSCRIPT);
}

export const useVoiceStore = create<VoiceStore>()(
    persist(
        (set) => ({
            selectedVoice: DEFAULT_VOICE,
            sessionVoice: null,
            status: 'idle',
            error: null,
            currentCaption: '',
            pendingUserSpeech: '',
            transcript: [],
            activity: null,
            lessonContext: null,

            setLessonContext: (lessonContext) => set({ lessonContext }),
            // Guard the one value the Live API rejects outright: an unknown
            // prebuilt voice name closes the session at setup.
            setSelectedVoice: (selectedVoice) =>
                set({ selectedVoice: isSupportedVoice(selectedVoice) ? selectedVoice : DEFAULT_VOICE }),
            setSessionVoice: (sessionVoice) =>
                set({ sessionVoice: isSupportedVoice(sessionVoice) ? sessionVoice : DEFAULT_VOICE }),
            setStatus: (status) => set({ status }),
            setError: (error) => set({ error }),
            appendCaption: (fragment) =>
                set((s) => {
                    // The tutor started replying: the learner's utterance is complete
                    const transcript = s.pendingUserSpeech
                        ? pushEntry(s.transcript, 'user', s.pendingUserSpeech)
                        : s.transcript;
                    return {
                        transcript,
                        pendingUserSpeech: '',
                        currentCaption: s.currentCaption + fragment,
                    };
                }),
            clearCaption: () => set({ currentCaption: '' }),
            flushCaption: () =>
                set((s) => ({
                    transcript: pushEntry(s.transcript, 'tutor', s.currentCaption),
                    currentCaption: '',
                })),
            appendUserSpeech: (fragment) =>
                set((s) => ({ pendingUserSpeech: s.pendingUserSpeech + fragment })),
            addAction: (text) =>
                set((s) => ({ transcript: pushEntry(s.transcript, 'action', text) })),
            clearTranscript: () => set({ transcript: [], currentCaption: '', pendingUserSpeech: '' }),
            setActivity: (activity) => set({ activity }),
            resetSession: () =>
                set((s) => ({
                    status: 'idle',
                    activity: null,
                    // Preserve whatever was mid-air when the session ended
                    transcript: pushEntry(
                        s.pendingUserSpeech ? pushEntry(s.transcript, 'user', s.pendingUserSpeech) : s.transcript,
                        'tutor',
                        s.currentCaption
                    ),
                    currentCaption: '',
                    pendingUserSpeech: '',
                })),
        }),
        {
            name: 'vylos-voice',
            // Keep the lesson position and chat history so an interrupted lesson
            // can be continued later — even after an app restart.
            partialize: (state) => ({
                selectedVoice: state.selectedVoice,
                sessionVoice: state.sessionVoice,
                lessonContext: state.lessonContext,
                transcript: state.transcript,
            }),
            onRehydrateStorage: () => (state) => {
                if (!state) return;
                // Avoid id collisions between restored entries and new ones
                if (state.transcript?.length) {
                    nextEntryId = Math.max(...state.transcript.map((e) => e.id)) + 1;
                }
                // A voice persisted by an older build may no longer be offered
                if (!isSupportedVoice(state.selectedVoice)) {
                    state.selectedVoice = DEFAULT_VOICE;
                }
                if (state.sessionVoice && !isSupportedVoice(state.sessionVoice)) {
                    state.sessionVoice = null;
                }
            },
        }
    )
);
