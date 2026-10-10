'use client';

import { generateContent, isAiError } from '../ai/gemini-client';
import { getCourse } from '../learning/course-registry';
import { resolveLesson } from '../learning/lesson-utils';
import { usePersonalTutorStore } from '../stores/personal-tutor-store';
import { newId, useConversationStore, type StoredMessage } from '../stores/conversation-store';

/**
 * Study notes for a finished session: what was covered, what the learner
 * showed they understand, what they found hard, where it stopped. The tutor's
 * memory is made of these, never of the old conversation itself, so a new
 * session starts fresh while still knowing what the learner has studied.
 *
 * Written once per session when it ends (voice hang-up, a new or different
 * chat), with the learner's own model if they set one up. Sessions that ended
 * without notes — the app closed, or no AI was reachable — get them on the
 * next start.
 */

const MAX_TRANSCRIPT_CHARS = 12_000;
const MAX_NOTES_CHARS = 1200;
/** Sessions without notes caught up on at start, newest first */
const CATCH_UP = 3;

const inFlight = new Set<string>();

/** "Python Mastery — Lists and tuples", or the personal topic, or null. */
export function topicTitle(lessonKey: string | null): string | null {
    if (!lessonKey) return null;
    if (lessonKey.startsWith('personal:')) {
        const id = lessonKey.slice('personal:'.length);
        const plan = usePersonalTutorStore.getState().plans.find((p) => p.id === id);
        return plan ? `personal topic "${plan.topic}"` : 'a personal topic';
    }
    const [courseId, lessonId] = lessonKey.split('/');
    const lesson = courseId && lessonId ? resolveLesson({ courseId, lessonId }) : null;
    if (lesson) return `${lesson.course.title} — ${lesson.lessonTitle}`;
    return getCourse(courseId)?.title ?? null;
}

const spoken = (m: StoredMessage) => m.role === 'user' || m.role === 'tutor';

function transcriptOf(messages: StoredMessage[]): string {
    const text = messages
        .map((m) => (m.role === 'user' ? `Learner: ${m.text}` : m.role === 'tutor' ? `Tutor: ${m.text}` : `[${m.text}]`))
        .join('\n');
    // Long sessions: the end matters most for where they stopped
    return text.length > MAX_TRANSCRIPT_CHARS ? `…${text.slice(-MAX_TRANSCRIPT_CHARS)}` : text;
}

/** Writes the notes for one session, unless it has them or had no real exchange. */
export async function summarizeSession(sessionId: string): Promise<void> {
    if (inFlight.has(sessionId)) return;
    const all = useConversationStore.getState().messages.filter((m) => m.sessionId === sessionId);
    if (all.some((m) => m.role === 'summary')) return;
    const talk = all.filter((m) => m.role !== 'summary');
    // A session where the learner never said anything has nothing to remember
    if (!talk.some((m) => m.role === 'user') || !talk.some(spoken)) return;

    inFlight.add(sessionId);
    try {
        const last = talk[talk.length - 1];
        const topic = topicTitle(last.lessonKey);
        const prompt = `Below is a tutoring session between a programming tutor and a learner${topic ? ` about ${topic}` : ''}.

Write study notes the tutor can read before their NEXT session with this learner. 2-4 short bullet points, plain text, starting with "- ":
- what was covered
- what the learner showed they understand (only what they actually demonstrated)
- what they found hard or got wrong
- where the session stopped, if a task or quiz was left unfinished

Facts only: no greetings, no advice, no quoting the conversation. Under 80 words.

SESSION:
${transcriptOf(talk)}`;

        const notes = (await generateContent(prompt, 'session-notes')).trim();
        // No AI reachable (offline, no plan, limit reached): try again next start
        if (!notes || isAiError(notes)) return;

        useConversationStore.getState().add({
            id: newId(),
            userId: last.userId,
            sessionId,
            channel: last.channel,
            role: 'summary',
            text: notes.slice(0, MAX_NOTES_CHARS),
            lessonKey: last.lessonKey,
            at: last.at + 1,
        });
    } finally {
        inFlight.delete(sessionId);
    }
}

/** Notes for recent sessions that ended without them (the app was closed mid-session). */
export async function catchUpSessionNotes(userId: string): Promise<void> {
    const store = useConversationStore.getState();
    const live = new Set([store.voiceSessionId, store.textSessionId]);
    const lastAt = new Map<string, number>();
    const summarized = new Set<string>();
    for (const m of store.messages) {
        if (m.userId !== userId || live.has(m.sessionId)) continue;
        if (m.role === 'summary') summarized.add(m.sessionId);
        else lastAt.set(m.sessionId, Math.max(lastAt.get(m.sessionId) ?? 0, m.at));
    }
    const pending = [...lastAt.entries()]
        .filter(([id]) => !summarized.has(id))
        .sort((a, b) => b[1] - a[1])
        .slice(0, CATCH_UP);
    for (const [id] of pending) await summarizeSession(id);
}
