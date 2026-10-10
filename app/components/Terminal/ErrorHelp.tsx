'use client';

import { useEffect, useState } from 'react';
import { FileCode2, Lightbulb, Loader2, MessageSquare, Sparkles, Wand2, X } from 'lucide-react';
import Markdown from '../ui/Markdown';
import { explainRun, type ErrorExplanation } from '@/app/lib/ai/explain-error';
import { sendTutorMessage } from '@/app/lib/ai/text-tutor';
import type { TermRun } from '@/app/lib/stores/terminal-store';
import { useFileStore } from '@/app/lib/useFileStore';
import { useVoiceStore } from '@/app/lib/stores/voice-store';
import { resolveLesson } from '@/app/lib/learning/lesson-utils';
import { highlightLines, revealLine } from '@/app/lib/editor-bridge';

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Plain-language help for a failed run: what, where, why, then hints, then the fix. */
export default function ErrorHelp({ run, onClose }: { run: TermRun; onClose: () => void }) {
    const [result, setResult] = useState<ErrorExplanation | { error: string } | null>(null);
    const [hintsShown, setHintsShown] = useState(0);
    const [showFix, setShowFix] = useState(false);

    useEffect(() => {
        // The parent keys this panel by run, so each run starts with fresh state
        let alive = true;
        const ref = useVoiceStore.getState().lessonContext;
        const lesson = ref ? resolveLesson(ref) : null;
        void explainRun(run, lesson?.lessonTitle).then((r) => { if (alive) setResult(r); });
        return () => { alive = false; };
    }, [run]);

    const openLocation = async (file: string, line: number | null) => {
        await useFileStore.getState().openFileByPath(file);
        if (!line) return;
        // The editor remounts for a newly opened file; point once it's there
        setTimeout(() => { revealLine(line); highlightLines(line, line); }, 350);
    };

    const askTutor = () => {
        useFileStore.getState().setActiveView('ai');
        void sendTutorMessage(`I ran \`${run.command}\` and it failed with exit code ${run.exitCode}:\n\n\`\`\`\n${run.output.slice(-1500)}\n\`\`\`\n\nCan you help me understand what went wrong? Please give me a hint rather than the answer.`);
    };

    const explanation = result && !('error' in result) ? result : null;

    return (
        <aside
            aria-label="Error help"
            className="absolute top-0 right-0 bottom-0 w-[380px] max-w-[70%] bg-[#0c0c0e] border-l border-[#27272a] shadow-[-8px_0_24px_rgba(0,0,0,0.5)] flex flex-col z-10"
        >
            <div className="flex items-center gap-2 px-3 h-8 border-b border-[#27272a] shrink-0">
                <Lightbulb size={12} className="text-amber-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex-1">What went wrong</span>
                <button onClick={onClose} title="Close" className="p-1 text-gray-500 hover:text-gray-200"><X size={12} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-[11.5px] leading-relaxed text-gray-300">
                {!result && (
                    <p className="flex items-center gap-2 text-gray-500"><Loader2 size={12} className="animate-spin" /> Reading the error…</p>
                )}
                {result && 'error' in result && <p className="text-red-300">{result.error}</p>}

                {explanation && (
                    <>
                        <p className="text-[12.5px] font-semibold text-gray-100">{explanation.summary}</p>
                        {explanation.file && (
                            <button
                                onClick={() => void openLocation(explanation.file!, explanation.line)}
                                className="flex items-center gap-1.5 text-[10.5px] font-mono text-[var(--vylos-green-accent)] hover:text-[var(--vylos-green)]"
                                title="Open the file at this line"
                            >
                                <FileCode2 size={11} /> {baseName(explanation.file)}{explanation.line ? `, line ${explanation.line}` : ''}
                            </button>
                        )}
                        {explanation.explanation && <Markdown text={explanation.explanation} />}

                        {explanation.hints.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                                {explanation.hints.slice(0, hintsShown).map((hint, i) => (
                                    <div key={i} className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2">
                                        <span className="font-mono text-[10px] text-amber-300/80 shrink-0 mt-px">Hint {i + 1}</span>
                                        <Markdown text={hint} />
                                    </div>
                                ))}
                                {hintsShown < explanation.hints.length && (
                                    <button onClick={() => setHintsShown(hintsShown + 1)} className="flex items-center gap-1.5 text-[10.5px] font-semibold text-amber-300 hover:text-amber-200">
                                        <Lightbulb size={11} /> {hintsShown === 0 ? 'Give me a hint' : 'Another hint'}
                                    </button>
                                )}
                            </div>
                        )}

                        {explanation.fix && (hintsShown > 0 || explanation.hints.length === 0) && (
                            showFix ? (
                                <div className="rounded-lg border border-[#27272a] p-2.5">
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1">The fix</p>
                                    <Markdown text={explanation.fix} />
                                </div>
                            ) : (
                                <button onClick={() => setShowFix(true)} className="flex items-center gap-1.5 text-[10.5px] text-gray-400 hover:text-gray-200">
                                    <Wand2 size={11} /> Show me the fix
                                </button>
                            )
                        )}
                    </>
                )}
            </div>

            <div className="px-3.5 py-2.5 border-t border-[#27272a] space-y-2 shrink-0">
                <button
                    onClick={askTutor}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-[#27272a] hover:border-[#3f3f46] text-[10.5px] text-gray-300 hover:text-white"
                >
                    <MessageSquare size={11} /> Ask the tutor about it
                </button>
                <p className="flex items-center gap-1 text-[9px] text-gray-600"><Sparkles size={9} /> Written by Vylos AI from the error output. It can be wrong.</p>
            </div>
        </aside>
    );
}
