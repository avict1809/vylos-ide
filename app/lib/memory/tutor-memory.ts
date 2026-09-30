'use client';

import { useAuthStore } from '../stores/auth-store';
import { useVoiceStore } from '../stores/voice-store';
import { activePersonalPlan } from '../stores/personal-tutor-store';
import { useConversationStore, type StoredMessage } from '../stores/conversation-store';
import { topicTitle } from './session-notes';

/**
 * What the tutor remembers of earlier sessions, for its instructions: the
 * study notes written when each session ended (session-notes), plus the last
 * lines of the most recent conversation on the same lesson or topic, word for
 * word, so the tutor picks up exactly where it stopped instead of starting the
 * topic over. The chat on screen still starts empty; only the tutor is told.
 *
 * Read from this computer's copy (conversation-store), so starting a session
 * never waits on the network. Notes on the same lesson or topic come first.
 * Sessions still on screen are left out: they're the conversation itself (a
 * resumed lesson's transcript goes in through the resume block instead).
 */

const MAX_NOTES = 6;
const MAX_CHARS = 4000;
/** Lines of the last conversation given word for word, so the tutor knows exactly where it stopped */
const TAIL_LINES = 14;
const MAX_TAIL_LINE = 400;

function dateLabel(at: number): string {
    const days = Math.floor((Date.now() - at) / 86_400_000);
    if (days === 0) return 'earlier today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** What a conversation is about: the lesson being taught, or the personal topic. */
export function currentLessonKey(): string | null {
    const lesson = useVoiceStore.getState().lessonContext;
    if (lesson) return `${lesson.courseId}/${lesson.lessonId}`;
    const plan = activePersonalPlan();
    return plan ? `personal:${plan.id}` : null;
}

// Lines of conversations that are on screen right now. The text tutor registers
// its own (it imports the tutor's instructions, so it can't be imported here).
const liveSources: (() => string[])[] = [() => useVoiceStore.getState().transcript.map((e) => e.text)];

export function registerLiveConversation(source: () => string[]) {
    liveSources.push(source);
}

interface Note {
    sessionId: string;
    at: number;
    channel: StoredMessage['channel'];
    lessonKey: string | null;
    /** The study notes, or null when the session ended without them */
    text: string | null;
    /** The learner said something (a session they never spoke in isn't remembered) */
    spoke: boolean;
}

export interface Memory {
    /** For the tutor's instructions ('' when there's nothing to remember) */
    block: string;
    /** There's a conversation on this lesson or topic to pick up from */
    continues: boolean;
}

const NOTHING: Memory = { block: '', continues: false };

export function buildMemory(opts: { lessonKey: string | null } = { lessonKey: currentLessonKey() }): Memory {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return NOTHING;
    const store = useConversationStore.getState();
    const mine = store.messages.filter((m) => m.userId === userId);

    // Sessions on screen now: the current ones, and any whose lines are showing
    const liveTexts = new Set(liveSources.flatMap((source) => source()).map((t) => t.trim()));
    const liveSessions = new Set([store.voiceSessionId, store.textSessionId]);
    for (const m of mine) if (m.role !== 'summary' && liveTexts.has(m.text)) liveSessions.add(m.sessionId);

    // One note per earlier session in which the learner took part
    const notes = new Map<string, Note>();
    for (const m of mine) {
        if (liveSessions.has(m.sessionId) || m.role === 'action') continue;
        const note = notes.get(m.sessionId) ?? { sessionId: m.sessionId, at: m.at, channel: m.channel, lessonKey: m.lessonKey, text: null, spoke: false };
        note.at = Math.max(note.at, m.at);
        note.lessonKey = note.lessonKey ?? m.lessonKey;
        if (m.role === 'summary') note.text = m.text;
        if (m.role === 'user') note.spoke = true;
        notes.set(m.sessionId, note);
    }
    const earlier = [...notes.values()].filter((n) => n.spoke || n.text);
    if (earlier.length === 0) return NOTHING;

    const newest = (a: Note, b: Note) => b.at - a.at;
    const sameTopic = opts.lessonKey ? earlier.filter((n) => n.lessonKey === opts.lessonKey).sort(newest) : [];
    const others = earlier.filter((n) => !sameTopic.includes(n)).sort(newest);
    const picked = [...sameTopic, ...others].slice(0, MAX_NOTES).sort((a, b) => a.at - b.at);

    // The conversation to pick up from: the last one on this lesson or topic, or
    // simply the last one when chatting freely. Another lesson starts fresh.
    const resumeFrom = sameTopic[0] ?? (opts.lessonKey ? null : others[0] ?? null);

    let body = picked
        .map((n) => {
            const topic = topicTitle(n.lessonKey);
            const heading = `${dateLabel(n.at)}, ${n.channel === 'voice' ? 'voice' : 'chat'}${topic ? ` — ${topic}` : ''}`;
            // Notes are written after a session ends, so the latest may not have them yet
            return n.text ? `(${heading})\n${n.text}` : `(${heading})\n- no notes yet${n === resumeFrom ? ' — see where you left off below' : ''}`;
        })
        .join('\n\n');
    if (body.length > MAX_CHARS) body = `…${body.slice(-MAX_CHARS)}`;

    const notesBlock = `
WHAT YOU REMEMBER ABOUT THIS LEARNER — your notes from earlier sessions${sameTopic.length > 0 ? ' (including this lesson/topic)' : ''}, oldest first:
${body}
`;
    if (!resumeFrom) {
        return { continues: false, block: `${notesBlock}
They're starting something different now. Don't continue an earlier conversation; use the notes to teach better: build on what they already showed they understand, come back to what they found hard when it fits, and you may mention it briefly ("last time, loops were tricky").
` };
    }

    const tail = mine
        .filter((m) => m.sessionId === resumeFrom.sessionId && (m.role === 'user' || m.role === 'tutor'))
        .slice(-TAIL_LINES)
        .map((m) => {
            const line = `${m.role === 'tutor' ? 'Tutor' : 'Learner'}: ${m.text}`;
            return line.length > MAX_TAIL_LINE ? `${line.slice(0, MAX_TAIL_LINE)}…` : line;
        })
        .join('\n');

    return { continues: true, block: `${notesBlock}
WHERE YOU LEFT OFF — the end of your last conversation (${dateLabel(resumeFrom.at)}, ${resumeFrom.channel === 'voice' ? 'by voice' : 'in the chat'}), word for word:
${tail}

CONTINUE FROM THERE. Open by saying in one short sentence exactly where you stopped (e.g. "Last time we got to binary search — you were about to work out the middle index. Let's pick that up."), then carry on from that exact point: if a question, task, exercise or quiz was open, go back to it; if you were partway through explaining something, finish it. Don't restart the topic from the beginning and don't re-teach what they already did. Only if they say they want something else, follow them instead.
` };
}
