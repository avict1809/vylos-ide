'use client';

import { newTextChat, sendTutorMessage } from '../ai/text-tutor';
import { usePersonalTutorStore, type PersonalPlan } from '../stores/personal-tutor-store';
import { useVoiceStore } from '../stores/voice-store';
import { useFileStore } from '../useFileStore';

/**
 * Starting personal tutoring, by chat or by voice. Both go through the same
 * tutor as the courses; the only difference is what the tutor is told to
 * teach, which comes from the personal topic instead of a curriculum lesson.
 */

const FIRST_SESSION = 'Please start tutoring me on my personal topic.';
const LATER_SESSION = 'Let us continue with my personal topic where we left off.';

const kickoff = (plan: PersonalPlan) =>
    plan.covered.length === 0 && plan.struggling.length === 0 ? FIRST_SESSION : LATER_SESSION;

/**
 * Makes `plan` the topic the tutor teaches. A course lesson takes precedence
 * in the prompt, so leaving it is what puts the tutor in personal mode.
 */
function focusOn(plan: PersonalPlan) {
    usePersonalTutorStore.getState().setActivePlan(plan.id);
    usePersonalTutorStore.getState().touchPlan(plan.id);
    useVoiceStore.getState().setLessonContext(null);
}

/** Teaches the topic in writing, in the Vylos AI panel. */
export async function startPersonalChat(plan: PersonalPlan) {
    focusOn(plan);
    newTextChat();
    useFileStore.getState().setActiveView('ai');
    await sendTutorMessage(kickoff(plan), { hidden: true });
}

/** Teaches the topic out loud; picked up by the voice orb. */
export function startPersonalVoice(plan: PersonalPlan) {
    focusOn(plan);
    useVoiceStore.getState().clearTranscript();
    window.dispatchEvent(new CustomEvent('vylos:start-personal'));
}

/** Leaves personal tutoring without deleting the topic. */
export function leavePersonalTutoring() {
    usePersonalTutorStore.getState().setActivePlan(null);
}
