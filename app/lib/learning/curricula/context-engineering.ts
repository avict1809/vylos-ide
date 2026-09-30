import { CourseDefinition } from '../types';
import { VIBE_CODING_GUIDELINES } from './guidelines';

export const contextEngineering: CourseDefinition = {
    id: 'context-engineering',
    title: 'Prompt & Context Engineering for Code',
    tagline: 'Get consistently good code from Claude, ChatGPT and coding agents by giving them the right instructions and the right context.',
    level: 'Beginner → Intermediate',
    hours: 18,
    accent: '#A855F7',
    badge: 'CTX',
    category: 'vibe',
    stack: 'Prompting',
    tutorGuidelines: [
        ...VIBE_CODING_GUIDELINES,
        'Show, don\'t assert: when comparing two prompts, have the learner try both in their own assistant and compare the real results. Never claim one wording is guaranteed to work better.',
        'Project memory files differ between tools (CLAUDE.md for Claude Code, AGENTS.md for Codex and others, rules files for editors). Teach what goes in them, and have the learner check their tool\'s docs for the exact file name and location.',
    ],
    modules: [
        {
            title: 'Why Context Is Everything',
            description: 'What the model actually sees, and why it matters.',
            lessons: [
                'What the model sees: the context window',
                'Why the same prompt gives different answers',
                'Context rot: why long chats get worse',
                'Signal vs noise: what to include and what to leave out',
            ],
        },
        {
            title: 'Specs Before Code',
            description: 'Decide what to build before asking anyone to build it.',
            lessons: [
                'Writing a product brief',
                'User stories and acceptance criteria',
                'Choosing the tech stack with the AI',
                'Letting the AI interview you about requirements',
                'Turning a spec into a task list',
            ],
        },
        {
            title: 'Prompt Patterns for Coding',
            description: 'Reusable shapes for the prompts you write every day.',
            lessons: [
                'Goal, context, constraints, output format',
                'Plan first, then implement',
                'Asking for tests alongside code',
                'Refactoring prompts',
                'Debugging prompts: hypotheses before fixes',
                'Code review prompts',
                'Prompt anti-patterns to avoid',
            ],
        },
        {
            title: 'Project Memory Files',
            description: 'Teach the assistant your project once instead of every session.',
            lessons: [
                'Why assistants forget between sessions',
                'CLAUDE.md, AGENTS.md and editor rules files',
                'What belongs in a project memory file',
                'Documenting conventions, commands and gotchas',
                'Keeping memory files short and current',
            ],
        },
        {
            title: 'Feeding the Right Context',
            description: 'Give the model exactly what it needs for the task at hand.',
            lessons: [
                'Sharing only the relevant files',
                'Using docs and examples as context',
                'Giving the AI up-to-date library documentation',
                'Screenshots and mockups as context',
                'Summaries and handoff notes between sessions',
            ],
        },
        {
            title: 'Working Across Models',
            description: 'Use more than one model without getting confused.',
            lessons: [
                'Getting a second opinion from another model',
                'A strong model to plan, a fast model to build',
                'Comparing answers critically',
            ],
        },
        {
            title: 'Capstone: Spec-Driven Build',
            description: 'Take a small app from spec to working code using well-structured prompts.',
            lessons: [
                'Writing the spec for a small app',
                'Creating a project memory file',
                'Building it from the task list',
                'Reviewing and improving your prompts',
            ],
        },
    ],
};
