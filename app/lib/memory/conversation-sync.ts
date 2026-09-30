'use client';

import { getSupabase } from '../supabase';
import { useAuthStore } from '../stores/auth-store';
import { useVoiceStore, type TranscriptEntry } from '../stores/voice-store';
import { useTextTutorStore, type ChatEntry } from '../ai/text-tutor';
import { currentLessonKey } from './tutor-memory';
import { catchUpSessionNotes, summarizeSession } from './session-notes';
import {
    newId,
    useConversationStore,
    type ConversationChannel,
    type ConversationRole,
    type StoredMessage,
} from '../stores/conversation-store';

/**
 * Keeps the tutor's conversations in the database without talking to it on
 * every message:
 *
 * - Each message the voice or text tutor adds is saved on this computer at
 *   once (conversation-store), which is what the tutor's memory reads.
 * - Unsent messages go up in batches: every half minute, when a voice session
 *   ends, when the window is hidden, and when the connection comes back.
 * - History comes down once per app start: all of it (the latest 500) the
 *   first time an account signs in on this computer, afterwards only what
 *   other computers added since.
 * - When a session ends, its study notes are written (session-notes), which
 *   are all the tutor remembers of it.
 */

const FLUSH_EVERY_MS = 30 * 1000;
const BATCH = 200;
const PULL_LIMIT = 500;

let started = false;
let flushing = false;
let pullingFor: string | null = null;
const pulledThisRun = new Set<string>();

const userId = () => useAuthStore.getState().user?.id ?? null;

function record(channel: ConversationChannel, role: ConversationRole, text: string) {
    const id = userId();
    const trimmed = text.trim();
    if (!id || !trimmed) return;
    useConversationStore.getState().add({
        id: newId(),
        userId: id,
        // One id per conversation: a voice session from connect to hang-up, the
        // written chat until the learner starts over
        sessionId: channel === 'voice' ? useConversationStore.getState().voiceSessionId : useConversationStore.getState().textSessionId,
        channel,
        role,
        text: trimmed,
        lessonKey: currentLessonKey(),
        at: Date.now(),
    });
}

/** Records entries added since the last look (entry ids only ever grow). */
function watchEntries<T extends { id: number }>(
    entries: () => T[],
    subscribe: (listener: () => void) => void,
    onNew: (entry: T) => void,
) {
    let lastSeen = Math.max(0, ...entries().map((e) => e.id));
    subscribe(() => {
        const list = entries();
        for (const entry of list) if (entry.id > lastSeen) onNew(entry);
        lastSeen = Math.max(lastSeen, ...list.map((e) => e.id));
    });
}

/** Sends unsent messages for the signed-in account, a batch at a time. */
export async function flushConversations(): Promise<void> {
    const id = userId();
    const supabase = getSupabase();
    if (flushing || !id || !supabase || !navigator.onLine) return;
    flushing = true;
    try {
        for (;;) {
            const pending = useConversationStore.getState().messages.filter((m) => !m.synced && m.userId === id).slice(0, BATCH);
            if (pending.length === 0) break;
            const { error } = await supabase.from('tutor_messages').upsert(
                pending.map((m) => ({
                    id: m.id,
                    user_id: m.userId,
                    session_id: m.sessionId,
                    channel: m.channel,
                    role: m.role,
                    text: m.text,
                    lesson_key: m.lessonKey,
                    created_at: new Date(m.at).toISOString(),
                })),
                { onConflict: 'id', ignoreDuplicates: true },
            );
            // Offline, signed out on the server, or the table isn't there yet: try again later
            if (error) break;
            useConversationStore.getState().markSynced(pending.map((m) => m.id));
        }
    } finally {
        flushing = false;
    }
}

interface MessageRow {
    id: string;
    user_id: string;
    session_id: string;
    channel: ConversationChannel;
    role: ConversationRole;
    text: string;
    lesson_key: string | null;
    created_at: string;
}

/** Brings this computer's copy up to date with the database, once per app start. */
async function pull(id: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase || !navigator.onLine || pullingFor === id || pulledThisRun.has(id)) return;
    pullingFor = id;
    try {
        const store = useConversationStore.getState();
        let query = supabase
            .from('tutor_messages')
            .select('id, user_id, session_id, channel, role, text, lesson_key, created_at')
            .eq('user_id', id)
            .order('created_at', { ascending: false })
            .limit(PULL_LIMIT);
        // Already fetched here before: only what other computers added since
        if (store.pulledFor.includes(id)) {
            const latest = Math.max(0, ...store.messages.filter((m) => m.userId === id && m.synced).map((m) => m.at));
            if (latest) query = query.gt('created_at', new Date(latest).toISOString());
        }
        const { data, error } = await query;
        if (error) return;
        useConversationStore.getState().merge(
            ((data ?? []) as MessageRow[]).map((row): StoredMessage => ({
                id: row.id,
                userId: row.user_id,
                sessionId: row.session_id,
                channel: row.channel,
                role: row.role,
                text: row.text,
                lessonKey: row.lesson_key,
                at: new Date(row.created_at).getTime(),
                synced: true,
            })),
        );
        useConversationStore.getState().markPulled(id);
        pulledThisRun.add(id);
    } finally {
        pullingFor = null;
    }
}

/** Deletes the signed-in account's conversations here and in the database. */
export async function forgetConversations(): Promise<{ ok: boolean }> {
    const id = userId();
    if (!id) return { ok: false };
    const supabase = getSupabase();
    if (supabase) {
        const { error } = await supabase.from('tutor_messages').delete().eq('user_id', id);
        if (error) return { ok: false };
    }
    useConversationStore.getState().forget(id);
    // Otherwise the next pull would count this as a computer that has everything
    pulledThisRun.delete(id);
    return { ok: true };
}

export function startConversationSync() {
    if (started || typeof window === 'undefined') return;
    started = true;

    watchEntries<TranscriptEntry>(
        () => useVoiceStore.getState().transcript,
        (listener) => useVoiceStore.subscribe(listener),
        (entry) => record('voice', entry.role, entry.text),
    );
    watchEntries<ChatEntry>(
        () => useTextTutorStore.getState().entries,
        (listener) => useTextTutorStore.subscribe(listener),
        (entry) => {
            if (entry.role !== 'error') record('text', entry.role, entry.text);
        },
    );

    // A new voice session gets a new id; hanging up writes its notes and sends what was said
    useVoiceStore.subscribe((state, prev) => {
        if (state.status === 'connecting' && prev.status === 'idle') useConversationStore.getState().newVoiceSession();
        if (state.status === 'idle' && prev.status !== 'idle') {
            const ended = useConversationStore.getState().voiceSessionId;
            void summarizeSession(ended).finally(() => flushConversations());
        }
    });
    // Starting the written conversation over (a new chat, or another lesson) ends it
    useTextTutorStore.subscribe((state, prev) => {
        if (state.entries.length === 0 && prev.entries.length > 0) {
            const ended = useConversationStore.getState().textSessionId;
            useConversationStore.getState().newTextSession();
            void summarizeSession(ended).finally(() => flushConversations());
        }
    });

    const syncAccount = () => {
        const id = userId();
        if (!id) return;
        // Notes for sessions that ended while the app was closing come after the
        // pull, so another computer's notes aren't written twice
        void pull(id).then(() => catchUpSessionNotes(id)).then(() => flushConversations());
    };
    syncAccount();
    useAuthStore.subscribe((state, prev) => {
        if (state.user?.id !== prev.user?.id) syncAccount();
    });

    setInterval(() => void flushConversations(), FLUSH_EVERY_MS);
    window.addEventListener('online', syncAccount);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void flushConversations();
    });
}
