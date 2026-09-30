import { CourseDefinition } from '../types';
import { VIBE_CODING_GUIDELINES } from './guidelines';

export const vibeCoding: CourseDefinition = {
    id: 'vibe-coding',
    title: 'Vibe Coding Foundations',
    tagline: 'Build real software by describing it to Claude, ChatGPT or another AI — and learn enough to steer, check and fix what it writes.',
    level: 'Beginner',
    hours: 20,
    accent: '#F97316',
    badge: 'VC',
    requires: ['git'],
    category: 'vibe',
    stack: 'Any AI',
    tutorGuidelines: [
        ...VIBE_CODING_GUIDELINES,
        'This is a first course: assume no programming experience. Explain every term the first time it appears, and keep projects to plain HTML/CSS/JavaScript or small Python scripts that run without extra setup.',
        'Build the learner\'s confidence without hiding the truth: vibe coding is fast for small projects, but they still own every bug, and understanding grows by asking the AI "why" often.',
    ],
    modules: [
        {
            title: 'What Vibe Coding Is',
            description: 'The idea, the promise, and the limits.',
            lessons: [
                'What vibe coding is (and isn\'t)',
                'Where vibe coding shines and where it breaks',
                'The vibe coder mindset: you are the product owner and the reviewer',
                'How AI coding assistants work under the hood',
                'Why AI makes confident mistakes',
            ],
        },
        {
            title: 'Your AI Toolkit',
            description: 'The kinds of AI tools out there and how to pick yours.',
            lessons: [
                'Chat assistants: Claude, ChatGPT and Gemini',
                'AI-powered editors and in-editor assistants',
                'Terminal coding agents',
                'App builders that generate whole projects',
                'Choosing a toolkit for your budget and goals',
                'Setting up your workspace: editor, terminal, Git and Node or Python',
            ],
        },
        {
            title: 'Talking to AI About Code',
            description: 'Prompts that get you working code instead of guesses.',
            lessons: [
                'Describing what you want: goal, context, constraints',
                'Giving examples of the input and output you expect',
                'Asking for one small step at a time',
                'Asking the AI to explain its code',
                'Asking for options and trade-offs before code',
                'Exercise: turn a vague idea into a clear prompt',
            ],
        },
        {
            title: 'The Build Loop',
            description: 'Prompt, run, check, refine — the rhythm of every vibe-coded project.',
            lessons: [
                'Prompt, run, check, refine',
                'Putting AI code into the right files',
                'Running your project and reading the output',
                'Describing bugs precisely: error, expected, actual',
                'Sharing error messages and logs the right way',
                'Knowing when to start a fresh conversation',
            ],
        },
        {
            title: 'Reading Just Enough Code',
            description: 'You don\'t have to write it all, but you do have to follow it.',
            lessons: [
                'Files, folders and project structure',
                'Variables, functions and data at a glance',
                'Following the flow of a program',
                'Spotting code the AI made up',
                'Using the AI as your personal code explainer',
            ],
        },
        {
            title: 'Safety Nets',
            description: 'Experiment freely because you can always go back.',
            lessons: [
                'Git as your undo button',
                'Committing after every working step',
                'Seeing what changed with git diff',
                'Rolling back when the AI breaks things',
                'Keeping secrets out of prompts and code',
            ],
        },
        {
            title: 'Capstone: Your First Vibe-Coded App',
            description: 'Take a small idea from nothing to something you can show people.',
            lessons: [
                'Picking a small, finishable idea',
                'Writing a one-page plan',
                'Building the first working version',
                'Adding features one at a time',
                'Fixing bugs with the AI',
                'Polishing and sharing your app',
            ],
        },
    ],
};
