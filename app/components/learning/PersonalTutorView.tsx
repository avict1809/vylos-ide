'use client';

import { useState } from 'react';
import {
    ArrowLeft, BrainCircuit, Check, ChevronRight, MessageSquare, Mic, Plus, RefreshCw, Sparkles, Trash2, UserRound,
} from 'lucide-react';
import {
    MAX_GOAL_CHARS, MAX_TOPIC_CHARS, PERSONAL_LEVELS, usePersonalTutorStore,
    type PersonalLevel, type PersonalPlan,
} from '@/app/lib/stores/personal-tutor-store';
import { startPersonalChat, startPersonalVoice } from '@/app/lib/learning/personal-tutor';
import { cn } from '@/app/lib/utils';

/**
 * Personal tutoring: learning something of your own instead of enrolling in a
 * course. The learner names a topic, and the same tutor teaches it — by chat
 * or by voice — remembering across sessions what they got and what they didn't.
 */
export default function PersonalTutorView({ onBack }: { onBack: () => void }) {
    const { plans, activeId } = usePersonalTutorStore();
    const [creating, setCreating] = useState(false);

    const showForm = creating || plans.length === 0;

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black space-y-3">
                <button
                    onClick={showForm && plans.length > 0 ? () => setCreating(false) : onBack}
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-[var(--vylos-green)] transition-colors"
                >
                    <ArrowLeft size={11} /> {showForm && plans.length > 0 ? 'My topics' : 'Catalog'}
                </button>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-[var(--vylos-green-dark)]/20 rounded-xl flex items-center justify-center border border-[var(--vylos-green-dark)] shrink-0">
                        <UserRound size={18} className="text-[var(--vylos-green)]" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-sm font-black text-white uppercase tracking-tighter italic leading-none">
                            Personal <span className="text-[var(--vylos-green)]">Tutor</span>
                        </h1>
                        <p className="text-[10px] text-gray-500 mt-1">No course, no enrolling — just what you want to learn.</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {showForm ? (
                    <TopicForm onCreated={() => setCreating(false)} standalone={plans.length === 0} />
                ) : (
                    <>
                        {plans.map((plan) => (
                            <TopicCard key={plan.id} plan={plan} active={plan.id === activeId} />
                        ))}
                        <button
                            onClick={() => setCreating(true)}
                            className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all group bg-[#18181b]/40 border border-dashed border-[#3f3f46] hover:border-[var(--vylos-green)]"
                        >
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#18181b] border border-[#27272a] shrink-0">
                                <Plus size={15} className="text-gray-500 group-hover:text-[var(--vylos-green)] transition-colors" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors">Another topic</h3>
                                <p className="text-[10px] text-gray-500 mt-0.5">Keep as many as you like; the tutor remembers each one separately.</p>
                            </div>
                            <ChevronRight size={13} className="text-gray-700 group-hover:text-[var(--vylos-green)] transition-colors shrink-0" />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

function TopicForm({ onCreated, standalone }: { onCreated: () => void; standalone: boolean }) {
    const [topic, setTopic] = useState('');
    const [goal, setGoal] = useState('');
    const [level, setLevel] = useState<PersonalLevel>('new');
    const create = usePersonalTutorStore((s) => s.createPlan);

    const submit = (start: 'chat' | 'voice' | null) => {
        if (!topic.trim()) return;
        const plan = create({ topic, level, goal });
        onCreated();
        if (start === 'chat') void startPersonalChat(plan);
        if (start === 'voice') startPersonalVoice(plan);
    };

    return (
        <form onSubmit={(e) => { e.preventDefault(); submit('chat'); }} className="space-y-4">
            {standalone && (
                <p className="text-[11px] text-gray-500 leading-relaxed">
                    Tell the tutor what you want to learn. It teaches you one small step at a time, in your editor,
                    and picks up next session where you stopped.
                </p>
            )}

            <label className="block space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">What do you want to learn?</span>
                <input
                    autoFocus
                    value={topic}
                    maxLength={MAX_TOPIC_CHARS}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Recursion in Python, regex, my own Next.js app…"
                    className="w-full px-3 py-2 bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] focus:border-[var(--vylos-green)] text-white text-xs rounded-lg outline-none transition-all"
                />
            </label>

            <div className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">Where are you starting from?</span>
                <div className="space-y-1.5">
                    {PERSONAL_LEVELS.map((l) => (
                        <button
                            key={l.id}
                            type="button"
                            onClick={() => setLevel(l.id)}
                            className={cn(
                                'w-full flex items-baseline gap-2 px-3 py-2 rounded-lg border text-left transition-all',
                                level === l.id
                                    ? 'border-[var(--vylos-green)] bg-[var(--vylos-green)]/10'
                                    : 'border-[#27272a] hover:border-[#3f3f46]'
                            )}
                        >
                            <span className={cn('text-[11px] font-bold shrink-0', level === l.id ? 'text-[var(--vylos-green)]' : 'text-gray-300')}>
                                {l.label}
                            </span>
                            <span className="text-[9px] text-gray-500 truncate">{l.hint}</span>
                        </button>
                    ))}
                </div>
            </div>

            <label className="block space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">
                    Why? <span className="text-gray-700 normal-case tracking-normal font-medium">— optional, but it helps</span>
                </span>
                <textarea
                    rows={2}
                    value={goal}
                    maxLength={MAX_GOAL_CHARS}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="I keep failing interview questions about it…"
                    className="w-full px-3 py-2 bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] focus:border-[var(--vylos-green)] text-white text-xs rounded-lg outline-none transition-all resize-none"
                />
            </label>

            <div className="grid grid-cols-2 gap-2">
                <button
                    type="submit"
                    disabled={!topic.trim()}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] disabled:opacity-40 text-black text-[10px] font-bold uppercase tracking-wider transition-all"
                >
                    <MessageSquare size={12} /> Start by chatting
                </button>
                <button
                    type="button"
                    onClick={() => submit('voice')}
                    disabled={!topic.trim()}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-[#27272a] hover:border-[#3f3f46] disabled:opacity-40 text-gray-300 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all"
                >
                    <Mic size={12} /> Start by voice
                </button>
            </div>
        </form>
    );
}

function TopicCard({ plan, active }: { plan: PersonalPlan; active: boolean }) {
    const { deletePlan, resetProgress } = usePersonalTutorStore();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const levelLabel = PERSONAL_LEVELS.find((l) => l.id === plan.level)?.label ?? plan.level;

    return (
        <div
            className={cn(
                'p-4 rounded-xl border transition-all',
                active ? 'bg-[var(--vylos-green-dark)]/10 border-[var(--vylos-green-dark)]/40' : 'bg-[#09090b] border-[#27272a] hover:border-[#3f3f46]'
            )}
        >
            <div className="flex items-start gap-3">
                <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border',
                    active ? 'bg-[var(--vylos-green-dark)]/20 border-[var(--vylos-green-dark)]' : 'bg-[#18181b] border-[#27272a]'
                )}>
                    <BrainCircuit size={16} className={active ? 'text-[var(--vylos-green)]' : 'text-gray-500'} />
                </div>
                <div className="flex-1 min-w-0">
                    {active && (
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--vylos-green)]">Currently tutoring</p>
                    )}
                    <h3 className="text-xs font-bold text-gray-100 break-words leading-snug">{plan.topic}</h3>
                    {plan.goal && <p className="text-[10px] text-gray-500 leading-relaxed mt-0.5 line-clamp-2">{plan.goal}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[9px] text-gray-600 font-medium uppercase tracking-wider">
                        <span>{levelLabel}</span>
                        <span className="flex items-center gap-1"><Check size={9} /> {plan.covered.length} learned</span>
                        {plan.struggling.length > 0 && <span>{plan.struggling.length} to revisit</span>}
                    </div>
                </div>
            </div>

            {(plan.covered.length > 0 || plan.struggling.length > 0) && (
                <div className="mt-3 pt-3 border-t border-[#27272a]/60 space-y-1">
                    {plan.covered.slice(-3).map((c) => (
                        <p key={c} className="flex items-start gap-1.5 text-[10px] text-gray-400">
                            <Check size={9} className="mt-[3px] shrink-0 text-[var(--vylos-green)]" /> <span className="min-w-0">{c}</span>
                        </p>
                    ))}
                    {plan.struggling.slice(-2).map((c) => (
                        <p key={c} className="flex items-start gap-1.5 text-[10px] text-amber-300/80">
                            <RefreshCw size={9} className="mt-[3px] shrink-0" /> <span className="min-w-0">{c}</span>
                        </p>
                    ))}
                </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                    onClick={() => void startPersonalChat(plan)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] text-black text-[10px] font-bold uppercase tracking-wider transition-all"
                >
                    <MessageSquare size={12} /> {plan.covered.length ? 'Continue' : 'Start'} by chat
                </button>
                <button
                    onClick={() => startPersonalVoice(plan)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[#27272a] hover:border-[#3f3f46] text-gray-300 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all"
                >
                    <Mic size={12} /> By voice
                </button>
            </div>

            <div className="mt-2 flex items-center justify-end gap-3">
                {plan.covered.length + plan.struggling.length > 0 && (
                    <button
                        onClick={() => resetProgress(plan.id)}
                        title="Forget what the tutor remembers about this topic"
                        className="text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-300 transition-colors"
                    >
                        Reset memory
                    </button>
                )}
                {confirmDelete ? (
                    <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest">
                        <button onClick={() => deletePlan(plan.id)} className="text-red-400 hover:text-red-300">Delete</button>
                        <button onClick={() => setConfirmDelete(false)} className="text-gray-600 hover:text-gray-300">Cancel</button>
                    </span>
                ) : (
                    <button
                        onClick={() => setConfirmDelete(true)}
                        title="Remove this topic"
                        className="text-gray-700 hover:text-red-400 transition-colors"
                    >
                        <Trash2 size={11} />
                    </button>
                )}
            </div>
        </div>
    );
}

/** The card that opens this view from the course catalog. */
export function PersonalTutorCard({ onOpen, activeTopic }: { onOpen: () => void; activeTopic?: string }) {
    return (
        <button
            onClick={onOpen}
            className={cn(
                'w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all group border',
                activeTopic
                    ? 'bg-[var(--vylos-green-dark)]/10 border-[var(--vylos-green-dark)]/40 hover:border-[var(--vylos-green)]'
                    : 'bg-[#18181b]/40 border-dashed border-[#3f3f46] hover:border-[var(--vylos-green)]'
            )}
        >
            <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border',
                activeTopic ? 'bg-[var(--vylos-green-dark)]/20 border-[var(--vylos-green-dark)]' : 'bg-[#18181b] border-[#27272a]'
            )}>
                {activeTopic
                    ? <UserRound size={15} className="text-[var(--vylos-green)]" />
                    : <Sparkles size={15} className="text-gray-500 group-hover:text-[var(--vylos-green)] transition-colors" />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--vylos-green)]">
                    {activeTopic ? 'Personal tutoring in progress' : 'Personal Tutor'}
                </div>
                <h3 className="text-xs font-bold text-gray-200 group-hover:text-white truncate mt-0.5 transition-colors">
                    {activeTopic ?? 'Learn anything, one to one'}
                </h3>
                {!activeTopic && (
                    <p className="text-[10px] text-gray-500 mt-0.5">No course to enrol in — name a topic and get tutored on it.</p>
                )}
            </div>
            <ChevronRight size={13} className="text-gray-700 group-hover:text-[var(--vylos-green)] group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
    );
}
