import { CourseDefinition } from '../types';
import { VIBE_CODING_GUIDELINES } from './guidelines';

export const aiCodingAgents: CourseDefinition = {
    id: 'ai-coding-agents',
    title: 'AI Coding Agents',
    tagline: 'Put agents like Claude Code, Codex and Cursor to work on real codebases — safely, and with you in control.',
    level: 'Beginner → Intermediate',
    hours: 22,
    accent: '#D97757',
    badge: 'AGT',
    requires: ['git', 'node'],
    category: 'vibe',
    stack: 'Agents',
    tutorGuidelines: [
        ...VIBE_CODING_GUIDELINES,
        'Agent features (plan mode, slash commands, skills, hooks, subagents, headless mode) differ between products and change often. Teach the idea behind each feature, then have the learner find the exact command or setting in their agent\'s own docs or built-in help.',
        'For hands-on practice, use a throwaway project or a fresh Git branch so the learner can let the agent make changes without risking real work.',
        'Treat cost as part of the lesson: agents can use many tokens on one task. Encourage small, well-scoped tasks and checking usage in the provider\'s dashboard.',
    ],
    modules: [
        {
            title: 'From Chat to Agent',
            description: 'What changes when the AI can read files and run commands itself.',
            lessons: [
                'What makes an agent different from a chatbot',
                'The agent loop: read, plan, act, check',
                'Terminal, editor and cloud agents',
                'What agents are good at and where they struggle',
            ],
        },
        {
            title: 'Getting Started with a Coding Agent',
            description: 'Install one, point it at a project, and stay in charge.',
            lessons: [
                'Installing and signing in to a coding agent',
                'Your first session in an existing project',
                'Asking the agent to explain a codebase',
                'Approving file edits and commands',
                'Permission modes and why they matter',
            ],
        },
        {
            title: 'Steering the Agent',
            description: 'Keep a long task on track.',
            lessons: [
                'Plan mode: agree on the plan before any edits',
                'Breaking big work into small tasks',
                'Interrupting and redirecting mid-task',
                'Clearing and compacting context',
                'Resuming earlier sessions',
            ],
        },
        {
            title: 'Verifying Agent Work',
            description: 'Agents say "done" — your job is to check.',
            lessons: [
                'Reading diffs like a reviewer',
                'Making the agent run tests and linters',
                'Test-driven development with an agent',
                'Catching made-up APIs and fake fixes',
                'Asking the agent to review its own changes',
            ],
        },
        {
            title: 'Customizing Your Agent',
            description: 'Shape the agent around how you work.',
            lessons: [
                'Project instruction files',
                'Custom slash commands and reusable prompts',
                'Skills: packaged know-how for the agent',
                'Hooks: running your own scripts on agent events',
                'Subagents for focused side tasks',
                'Giving the agent new tools with MCP',
            ],
        },
        {
            title: 'Agents in Your Workflow',
            description: 'From one-off help to a regular part of how you ship.',
            lessons: [
                'Letting agents work on branches and worktrees',
                'Commit messages and pull requests with an agent',
                'Running agents headless in scripts and CI',
                'Running several agents in parallel',
            ],
        },
        {
            title: 'Safety & Cost',
            description: 'Powerful tools need guardrails.',
            lessons: [
                'Sandboxing and least privilege',
                'Why "skip all permissions" modes are dangerous',
                'Prompt injection from files, web pages and issues',
                'Tracking usage and cost',
            ],
        },
        {
            title: 'Capstone: Ship a Change with an Agent',
            description: 'Take one real change from issue to pull request.',
            lessons: [
                'Picking an issue in a real project',
                'Planning the change with the agent',
                'Implementing it with tests',
                'Reviewing, committing and opening a pull request',
            ],
        },
    ],
};
