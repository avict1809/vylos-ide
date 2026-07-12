'use client';

import { useFileStore } from '../useFileStore';
import { useRoadmapStore } from '../stores/roadmap-store';
import { useTerminalStore } from '../stores/terminal-store';
import { useCourseStore } from '../stores/course-store';
import { useVoiceStore } from '../stores/voice-store';
import { lessonId } from '../learning/types';
import { getCourse } from '../learning/curricula';
import { nextLessonRef, resolveLesson } from '../learning/lesson-utils';
import { highlightLines, clearHighlights, revealLine } from '../editor-bridge';

const MAX_FILE_CHARS = 12000;
const TYPING_CHUNK = 6;      // characters typed per tick
const TYPING_TICK_MS = 12;   // delay between ticks

// Gemini Live function declarations for the tutor
export const tutorToolDeclarations = [
    {
        name: 'get_workspace_state',
        description: "See what the learner sees: the open project, open tabs, the active file and its full content, and their learning roadmap. Call this before teaching so you know the context.",
        parameters: { type: 'OBJECT', properties: {} },
    },
    {
        name: 'list_files',
        description: 'List files and folders in a directory of the project. Use it to explore the project structure.',
        parameters: {
            type: 'OBJECT',
            properties: {
                path: { type: 'STRING', description: 'Directory path. Omit for the project root. Relative paths are resolved against the project root.' },
            },
        },
    },
    {
        name: 'read_file',
        description: 'Read the content of a file in the project without opening it in the editor.',
        parameters: {
            type: 'OBJECT',
            properties: {
                path: { type: 'STRING', description: 'File path, absolute or relative to the project root.' },
            },
            required: ['path'],
        },
    },
    {
        name: 'open_file',
        description: 'Open a file in the editor so the learner can see it. The file becomes the active tab.',
        parameters: {
            type: 'OBJECT',
            properties: {
                path: { type: 'STRING', description: 'File path, absolute or relative to the project root.' },
            },
            required: ['path'],
        },
    },
    {
        name: 'create_file',
        description: 'Create a new empty file in the project and open it in the editor. Use write_code afterwards to fill it in while explaining.',
        parameters: {
            type: 'OBJECT',
            properties: {
                path: { type: 'STRING', description: 'File path for the new file, absolute or relative to the project root.' },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_code',
        description: "Type code into the active editor tab, visibly, like a tutor demonstrating at the keyboard. The learner watches it appear. Write SMALL increments (a few lines) and explain out loud while or after writing. Never dump a whole program at once.",
        parameters: {
            type: 'OBJECT',
            properties: {
                code: { type: 'STRING', description: 'The code to type.' },
                mode: { type: 'STRING', description: "'append' adds to the end of the file (default). 'replace' replaces the whole file content." },
            },
            required: ['code'],
        },
    },
    {
        name: 'highlight_lines',
        description: "Highlight a range of lines in the active file and scroll them into view — like pointing at the code while you explain it. Replaces any previous highlight.",
        parameters: {
            type: 'OBJECT',
            properties: {
                start_line: { type: 'NUMBER', description: 'First line to highlight (1-based).' },
                end_line: { type: 'NUMBER', description: 'Last line to highlight (1-based).' },
            },
            required: ['start_line', 'end_line'],
        },
    },
    {
        name: 'clear_highlights',
        description: 'Remove the current line highlight when you are done referring to that code.',
        parameters: { type: 'OBJECT', properties: {} },
    },
    {
        name: 'save_active_file',
        description: 'Save the active editor file to disk. Do this before running a file you just wrote or edited.',
        parameters: { type: 'OBJECT', properties: {} },
    },
    {
        name: 'complete_lesson',
        description: "Mark the CURRENT curriculum lesson as passed and get the next lesson to teach. Call this ONLY after the learner has practiced AND correctly answered your quiz questions on this lesson. Never call it just because you finished explaining, and never skip the quiz.",
        parameters: {
            type: 'OBJECT',
            properties: {
                quiz_summary: {
                    type: 'STRING',
                    description: 'One short line: what you quizzed the learner on and how they did.',
                },
            },
            required: ['quiz_summary'],
        },
    },
    {
        name: 'run_command',
        description: "Run a shell command in the integrated terminal, visible to the learner. Use it to RUN CODE with interpreters (e.g. 'python3 main.py', 'node app.js') after saving, and to show real output. Running code and reading errors together is core to practical teaching. The command runs in the project folder by default.",
        parameters: {
            type: 'OBJECT',
            properties: {
                command: { type: 'STRING', description: "The shell command, e.g. 'python3 hello.py'." },
                cwd: { type: 'STRING', description: 'Working directory. Defaults to the project root.' },
                timeout_seconds: { type: 'NUMBER', description: 'Max seconds to wait (default 30, max 120). The command is killed after this.' },
            },
            required: ['command'],
        },
    },
];

// --- Executor ---------------------------------------------------------------

let typingToken = 0;

/** Cancels an in-progress write_code animation (used when the session ends). */
export function cancelTutorActions() {
    typingToken++;
    clearHighlights();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resolvePath(p: string): string {
    const root = useFileStore.getState().projectRoot;
    if (!p) return root ?? '';
    if (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)) return p;
    return root ? `${root}/${p}`.replace(/\/+/g, '/') : p;
}

function truncate(text: string, max = MAX_FILE_CHARS) {
    return text.length > max ? text.slice(0, max) + `\n… [truncated, ${text.length} chars total]` : text;
}

async function typeIntoEditor(code: string, mode: 'append' | 'replace') {
    const token = ++typingToken;
    const store = useFileStore.getState();
    if (store.activeFileIndex === null) {
        return { error: 'No file is open in the editor. Open or create a file first.' };
    }

    const current = store.openFiles[store.activeFileIndex].content;
    const prefix = mode === 'replace'
        ? ''
        : current.length > 0 && !current.endsWith('\n') ? current + '\n' : current;

    for (let i = 0; i < code.length; i += TYPING_CHUNK) {
        if (typingToken !== token) return { error: 'Typing was interrupted.' };
        const typed = prefix + code.slice(0, i + TYPING_CHUNK);
        useFileStore.getState().updateActiveContent(typed);
        revealLine(typed.split('\n').length);
        await sleep(TYPING_TICK_MS);
    }

    const finalContent = prefix + code;
    useFileStore.getState().updateActiveContent(finalContent);
    return {
        ok: true,
        total_lines: finalContent.split('\n').length,
        note: 'The code is in the editor but NOT saved to disk yet; the learner can save with Ctrl+S.',
    };
}

export async function executeTutorTool(name: string, args: Record<string, any>): Promise<object> {
    const electron = window.electron;
    const store = () => useFileStore.getState();

    switch (name) {
        case 'get_workspace_state': {
            const s = store();
            const roadmap = useRoadmapStore.getState().currentRoadmap;
            const active = s.activeFileIndex !== null ? s.openFiles[s.activeFileIndex] : null;
            const ref = useVoiceStore.getState().lessonContext;
            const lesson = ref ? resolveLesson(ref) : null;
            return {
                project_root: s.projectRoot ?? 'No folder is open.',
                open_tabs: s.openFiles.map((f) => f.path),
                active_file: active
                    ? { path: active.path, line_count: active.content.split('\n').length, content: truncate(active.content) }
                    : 'No file is open in the editor.',
                current_lesson: lesson
                    ? {
                        course: lesson.course.title,
                        module: `${lesson.moduleIndex + 1}. ${lesson.moduleTitle}`,
                        lesson: `${lesson.number} ${lesson.lessonTitle}`,
                    }
                    : 'No curriculum lesson selected — free-form session.',
                roadmap: roadmap
                    ? {
                        goal: roadmap.goal,
                        milestones: roadmap.milestones.map((m) => ({ title: m.title, completed: m.completed })),
                    }
                    : 'No custom roadmap.',
            };
        }

        case 'complete_lesson': {
            const ref = useVoiceStore.getState().lessonContext;
            const lesson = ref ? resolveLesson(ref) : null;
            if (!ref || !lesson) return { error: 'No curriculum lesson is active in this session.' };

            useCourseStore.getState().completeLessons(ref.courseId, [lesson.lessonId]);

            const next = nextLessonRef(lesson.course, ref);
            if (!next) {
                useVoiceStore.getState().setLessonContext(null);
                return {
                    ok: true,
                    completed_lesson: `${lesson.number} ${lesson.lessonTitle}`,
                    course_complete: true,
                    note: `That was the FINAL lesson — the learner has completed the entire "${lesson.course.title}" course! Congratulate them warmly and suggest what to explore next.`,
                };
            }

            useVoiceStore.getState().setLessonContext(next);
            const nextInfo = resolveLesson(next)!;
            const newModule = next.moduleIndex !== ref.moduleIndex;
            return {
                ok: true,
                completed_lesson: `${lesson.number} ${lesson.lessonTitle}`,
                next_lesson: {
                    number: nextInfo.number,
                    title: nextInfo.lessonTitle,
                    module: nextInfo.moduleTitle,
                    starts_new_module: newModule,
                    ...(newModule ? { module_description: nextInfo.moduleDescription } : {}),
                },
                note: newModule
                    ? 'Congratulate the learner on finishing the module, give a short overview of the new module, then teach the next lesson with the same teach → practice → quiz workflow. Offer a break if they seem tired.'
                    : 'Briefly celebrate, then continue with the next lesson using the same teach → practice → quiz workflow.',
            };
        }

        case 'list_files': {
            if (!electron) return { error: 'File access unavailable.' };
            const dir = resolvePath(args.path ?? '');
            if (!dir) return { error: 'No project folder is open.' };
            const entries = await electron.fs.list(dir);
            return {
                path: dir,
                entries: entries.slice(0, 200).map((e: any) => ({ name: e.name, is_directory: e.isDirectory })),
            };
        }

        case 'read_file': {
            if (!electron) return { error: 'File access unavailable.' };
            const content = await electron.fs.read(resolvePath(args.path));
            return content === null ? { error: `Could not read ${args.path}` } : { path: args.path, content: truncate(content) };
        }

        case 'open_file': {
            const path = resolvePath(args.path);
            await store().openFileByPath(path);
            const s = store();
            const opened = s.activeFileIndex !== null && s.openFiles[s.activeFileIndex]?.path === path;
            return opened ? { ok: true, path } : { error: `Could not open ${args.path}` };
        }

        case 'create_file': {
            if (!electron) return { error: 'File access unavailable.' };
            const path = resolvePath(args.path);
            const created = await electron.fs.createFile(path);
            if (!created) return { error: `Could not create ${args.path}` };
            await store().openFileByPath(path);
            return { ok: true, path };
        }

        case 'write_code': {
            const mode = args.mode === 'replace' ? 'replace' : 'append';
            return await typeIntoEditor(String(args.code ?? ''), mode);
        }

        case 'highlight_lines': {
            const ok = highlightLines(Number(args.start_line), Number(args.end_line));
            return ok
                ? { ok: true, highlighted: `lines ${args.start_line}-${args.end_line}` }
                : { error: 'No editor is open to highlight.' };
        }

        case 'clear_highlights': {
            clearHighlights();
            return { ok: true };
        }

        case 'save_active_file': {
            const s = store();
            if (s.activeFileIndex === null) return { error: 'No file is open to save.' };
            const tab = s.openFiles[s.activeFileIndex];
            if (tab.path.startsWith('untitled-')) {
                return { error: 'This is an unsaved untitled tab. Create a real file with create_file and write the code there instead.' };
            }
            await s.saveActiveFile();
            const after = store();
            const saved = after.activeFileIndex !== null && !after.openFiles[after.activeFileIndex].isDirty;
            return saved ? { ok: true, path: tab.path } : { error: `Could not save ${tab.path}` };
        }

        case 'run_command': {
            const s = store();
            // Make sure the learner can watch the command run
            s.setShowTerminal(true);
            useTerminalStore.getState().init();

            const cwd = args.cwd ? resolvePath(String(args.cwd)) : s.projectRoot ?? undefined;
            const timeoutMs = Math.min(Math.max((Number(args.timeout_seconds) || 30), 1), 120) * 1000;
            const result = await useTerminalStore.getState().runCommand(String(args.command), cwd, timeoutMs);

            return {
                exit_code: result.exitCode,
                timed_out: result.timedOut,
                output: truncate(result.output, 16000) || '(no output)',
                ...(result.error ? { error: result.error } : {}),
            };
        }

        default:
            return { error: `Unknown tool: ${name}` };
    }
}

/** Human-readable activity labels shown in the UI while a tool runs. */
export function describeTutorTool(name: string, args: Record<string, any>): string {
    switch (name) {
        case 'get_workspace_state': return 'Looking at your workspace…';
        case 'list_files': return 'Exploring project files…';
        case 'read_file': return `Reading ${shortName(args.path)}…`;
        case 'open_file': return `Opening ${shortName(args.path)}…`;
        case 'create_file': return `Creating ${shortName(args.path)}…`;
        case 'write_code': return 'Writing code…';
        case 'highlight_lines': return `Pointing at lines ${args.start_line}–${args.end_line}`;
        case 'clear_highlights': return '';
        case 'save_active_file': return 'Saving file…';
        case 'complete_lesson': return 'Lesson passed ✓ — moving on';
        case 'run_command': return `Running: ${String(args.command ?? '').slice(0, 60)}`;
        default: return 'Working…';
    }
}

function shortName(p: unknown): string {
    return String(p ?? '').split(/[\\/]/).pop() || 'file';
}

// --- System prompt ----------------------------------------------------------

function buildLessonBlock(): string {
    const ref = useVoiceStore.getState().lessonContext;
    const lesson = ref ? resolveLesson(ref) : null;
    if (!ref || !lesson) return '';

    const done = new Set(useCourseStore.getState().completedLessons[ref.courseId] ?? []);
    const moduleList = lesson.course.modules[ref.moduleIndex].lessons
        .map((title, li) => {
            const mark = done.has(lessonId(ref.courseId, ref.moduleIndex, li))
                ? '[done]'
                : li === ref.lessonIndex ? '[CURRENT]' : '[todo]';
            return `  ${mark} ${ref.moduleIndex + 1}.${li + 1} ${title}`;
        })
        .join('\n');

    return `
STRUCTURED COURSE MODE — you are teaching a fixed curriculum, lesson by lesson:
- Course: "${lesson.course.title}" (module ${ref.moduleIndex + 1} of ${lesson.course.modules.length})
- Module: "${lesson.moduleTitle}" — ${lesson.moduleDescription}
- CURRENT LESSON: ${lesson.number} "${lesson.lessonTitle}"
This module's lessons:
${moduleList}

LESSON WORKFLOW — follow it strictly for EVERY lesson:
1. TEACH: explain the current lesson's topic hands-on with a small, concrete example in the editor. Only this lesson's topic — do not jump ahead.
2. PRACTICE: ask the learner to try a small variation themselves. Check their work with get_workspace_state and give specific feedback.
3. QUIZ: ask 2-3 short questions about this lesson — spoken questions or a tiny coding task. Ask ONE at a time and wait for the answer.
4. PASS: only when the learner answers the quiz well and you are confident they understand, call complete_lesson. If they struggle, re-teach it a different way and quiz again with different questions. NEVER call complete_lesson without a passed quiz, and never mark a lesson they didn't demonstrate.
5. CONTINUE: complete_lesson tells you the next lesson. Briefly celebrate, then teach it with the same workflow. If the learner sounds tired, offer to stop — progress is saved.
If the learner asks something unrelated, answer briefly and steer back to the current lesson.
`;
}

function buildResumeBlock(): string {
    const transcript = useVoiceStore.getState().transcript;
    if (transcript.length === 0) return '';

    const tail = transcript
        .slice(-24)
        .map((e) => {
            const line =
                e.role === 'tutor' ? `Tutor: ${e.text}`
                    : e.role === 'user' ? `Learner: ${e.text}`
                        : `[${e.text}]`;
            return line.length > 240 ? line.slice(0, 240) + '…' : line;
        })
        .join('\n');

    return `
RESUMING AN INTERRUPTED SESSION — you already taught part of this lesson earlier. The end of your previous conversation:
${tail}

Do NOT restart the lesson from the beginning or repeat what was already covered. Pick up exactly where the conversation left off; if a practice task or quiz was in progress, continue it.
`;
}

export function buildTutorSystemInstruction(opts: { resume?: boolean } = {}): string {
    const s = useFileStore.getState();
    const roadmap = useRoadmapStore.getState().currentRoadmap;
    const active = s.activeFileIndex !== null ? s.openFiles[s.activeFileIndex] : null;
    const nextMilestone = roadmap?.milestones.find((m) => !m.completed);
    const lessonBlock = buildLessonBlock();
    const resumeBlock = opts.resume ? buildResumeBlock() : '';
    const currentLesson = useVoiceStore.getState().lessonContext;

    return `You are Vylos, a friendly, patient programming tutor speaking with a learner inside their code editor. You talk with your voice; the learner hears you and sees their editor.
${lessonBlock}${resumeBlock}

TEACHING STYLE:
- Teach PRACTICALLY, like a tutor sitting next to the learner: demonstrate in the editor, don't lecture.
- Keep spoken turns SHORT (1-4 sentences). This is a conversation, not a monologue.
- Use your tools constantly: look at their workspace, open files, write code in small steps, and highlight the lines you are talking about.
- When you write code, write a FEW LINES at a time with write_code, then explain what you wrote and why. Build programs up incrementally.
- Frequently hand control back: ask the learner to try the next small step themselves, then check their work with get_workspace_state and give feedback.
- Use highlight_lines whenever you refer to specific code, like pointing with a finger.
- RUN THE CODE. After writing something meaningful, save it (save_active_file) and run it with run_command using the right interpreter (python3 for .py, node for .js). Talk about the real output together.
- When a run fails, that's a teaching moment: read the error out loud in simple words, highlight the offending line, and fix it together — or ask the learner to try fixing it first.
- Encourage the learner. Correct mistakes kindly and specifically.
- Use plain, simple English. Avoid jargon unless you explain it.

RULES:
- Call get_workspace_state at the start of the session and whenever the learner says they changed something.
- Never dump a complete solution at once. Small steps, always explained.
- If no file is open, create or open one before writing code.
- Always save_active_file before run_command on a file you just changed — the editor content is not on disk until saved.
- Only run commands relevant to the lesson (running scripts, checking versions). Never run destructive commands (rm, format, etc.).
- The learner's editor is the single source of truth — always check it rather than assuming.

CURRENT CONTEXT:
- Project folder: ${s.projectRoot ?? 'none open yet'}
- Active file: ${active ? active.path : 'none'}
- Learning goal: ${roadmap ? roadmap.goal : currentLesson ? 'the structured course above' : 'none chosen — ask the learner what they want to learn'}
- Next milestone: ${nextMilestone ? nextMilestone.title : 'n/a'}

${resumeBlock
        ? 'Start with a brief "welcome back", recap in ONE sentence where you left off, check the workspace with get_workspace_state, then continue the lesson from that exact point.'
        : currentLesson
            ? 'Start the session by greeting the learner briefly, looking at their workspace, then begin teaching the CURRENT LESSON right away.'
            : 'Start the session by greeting the learner briefly, looking at their workspace, and suggesting one concrete practical thing to do together.'}`;
}
