import { CourseDefinition } from '../types';

export const svelte: CourseDefinition = {
    id: 'svelte',
    title: 'Svelte & SvelteKit',
    tagline: 'The compiler framework — less code, no virtual DOM, full-stack with Kit.',
    level: 'Intermediate (JavaScript required)',
    hours: 18,
    accent: '#FF3E00',
    badge: 'SV',
    category: 'framework',
    stack: 'JavaScript',
    modules: [
        {
            title: 'Getting Started',
            description: 'Why Svelte compiles away, and a SvelteKit project tour.',
            lessons: [
                'Svelte’s idea: a compiler, not a runtime',
                'Scaffolding a SvelteKit app',
                'Anatomy of a .svelte component',
                'Script, markup, style — scoped by default',
                'Dev tools and the inspector',
            ],
        },
        {
            title: 'Reactivity with Runes',
            description: 'Svelte 5’s explicit reactivity: $state, $derived, $effect.',
            lessons: [
                '$state: reactive variables',
                '$derived: computed values',
                '$effect: side effects',
                'Deep reactivity with objects and arrays',
                '$props and component inputs',
                'Bindings with bind:',
                'Exercise: reactive budget calculator',
            ],
        },
        {
            title: 'Templates & Logic',
            description: 'Control flow, events, and lists in Svelte markup.',
            lessons: [
                '{#if} blocks',
                '{#each} blocks and keys',
                '{#await} for promises',
                'Event handling',
                'Class and style directives',
                'Transitions and animations (transition:, animate:)',
            ],
        },
        {
            title: 'Components in Depth',
            description: 'Composition with snippets, events, and shared state.',
            lessons: [
                'Component props and fallback values',
                'Snippets (and how they replace slots)',
                'Callback props for child→parent communication',
                'Shared reactive state in .svelte.js files',
                'Context API',
                'Exercise: reusable modal and tabs',
            ],
        },
        {
            title: 'SvelteKit Routing',
            description: 'File-based routing with layouts and dynamic pages.',
            lessons: [
                'Routes: +page.svelte conventions',
                'Layouts: +layout.svelte',
                'Dynamic parameters [slug]',
                'Navigation and prefetching',
                'Error and fallback pages',
            ],
        },
        {
            title: 'Loading Data',
            description: 'Server-first data with load functions.',
            lessons: [
                '+page.server.js load functions',
                'Universal vs server load',
                'Using load data in pages',
                'Streaming and awaiting slow data',
                'Invalidation and reruns',
            ],
        },
        {
            title: 'Forms & Actions',
            description: 'Progressive enhancement done for you.',
            lessons: [
                'Form actions in +page.server.js',
                'use:enhance',
                'Validation and returning errors',
                'Multiple actions per page',
                'Exercise: CRUD without client JS',
            ],
        },
        {
            title: 'API Routes & Deployment',
            description: 'Endpoints, hooks, and shipping with adapters.',
            lessons: [
                '+server.js endpoints',
                'Hooks: handle and auth patterns',
                'Environment variables',
                'Adapters: Vercel, Node, static',
                'Deploying the app',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'A full-stack SvelteKit application.',
            lessons: [
                'Scoping: notes app or link shortener',
                'Routes and layouts',
                'Database with load + actions',
                'Auth with hooks and cookies',
                'Transitions polish',
                'Deploy and review',
            ],
        },
    ],
};
