'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Everything said with the voice and text tutors, kept on this computer. It is
 * what the tutor's memory is read from (app/lib/memory/tutor-memory.ts), so
 * remembering never waits on the network. Messages not yet in the database
 * are the outbox: conversation-sync sends them in batches, and on a new
 * computer it fills this in from the database once.
 */

export type ConversationChannel = 'voice' | 'text';
/** 'summary' is the notes written when a session ends: what the tutor remembers of it */
export type ConversationRole = 'user' | 'tutor' | 'action' | 'summary';

export interface StoredMessage {
    /** A UUID made here, so a retried upload can't store it twice */
    id: string;
    userId: string;
    sessionId: string;
    channel: ConversationChannel;
    role: ConversationRole;
    text: string;
    /** The lesson ("courseId/lessonId") or personal topic ("personal:<id>") it was about */
    lessonKey: string | null;
    at: number;
    synced: boolean;
}

/** Kept on this computer; the database holds the rest */
const MAX_LOCAL = 3000;
export const MAX_MESSAGE_CHARS = 4000;

interface ConversationStore {
    messages: StoredMessage[];
    /** Accounts whose history has been fetched from the database on this computer */
    pulledFor: string[];
    /** The conversations happening now. The written one lasts until the learner starts over, across restarts */
    voiceSessionId: string;
    textSessionId: string;

    add: (message: Omit<StoredMessage, 'synced'>) => void;
    markSynced: (ids: string[]) => void;
    /** Adds messages fetched from the database, skipping ones already here. */
    merge: (messages: StoredMessage[]) => void;
    markPulled: (userId: string) => void;
    /** Drops an account's history from this computer. */
    forget: (userId: string) => void;
    newVoiceSession: () => void;
    newTextSession: () => void;
}

/** Oldest first; unsent messages are never the ones dropped to make room. */
function capped(messages: StoredMessage[]): StoredMessage[] {
    if (messages.length <= MAX_LOCAL) return messages;
    let excess = messages.length - MAX_LOCAL;
    return messages.filter((m) => {
        if (excess > 0 && m.synced) {
            excess--;
            return false;
        }
        return true;
    });
}

export const useConversationStore = create<ConversationStore>()(
    persist(
        (set) => ({
            messages: [],
            pulledFor: [],
            voiceSessionId: newId(),
            textSessionId: newId(),

            add: (message) =>
                set((s) => ({
                    messages: capped([...s.messages, { ...message, text: message.text.slice(0, MAX_MESSAGE_CHARS), synced: false }]),
                })),
            markSynced: (ids) => {
                const done = new Set(ids);
                set((s) => ({ messages: s.messages.map((m) => (done.has(m.id) ? { ...m, synced: true } : m)) }));
            },
            merge: (incoming) =>
                set((s) => {
                    const have = new Set(s.messages.map((m) => m.id));
                    const fresh = incoming.filter((m) => !have.has(m.id));
                    if (fresh.length === 0) return s;
                    return { messages: capped([...s.messages, ...fresh].sort((a, b) => a.at - b.at)) };
                }),
            markPulled: (userId) =>
                set((s) => (s.pulledFor.includes(userId) ? s : { pulledFor: [...s.pulledFor, userId] })),
            forget: (userId) =>
                set((s) => ({
                    messages: s.messages.filter((m) => m.userId !== userId),
                    pulledFor: s.pulledFor.filter((id) => id !== userId),
                })),
            newVoiceSession: () => set({ voiceSessionId: newId() }),
            newTextSession: () => set({ textSessionId: newId() }),
        }),
        {
            name: 'vylos-conversations',
            version: 1,
            // A voice session never outlives the app; the written chat does
            partialize: (s) => ({ messages: s.messages, pulledFor: s.pulledFor, textSessionId: s.textSessionId }),
        }
    )
);

/** A v4 UUID, for message and session ids the database accepts. */
export function newId(): string {
    const native = globalThis.crypto?.randomUUID?.();
    if (native) return native;
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
