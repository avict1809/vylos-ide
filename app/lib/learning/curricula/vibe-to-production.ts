import { CourseDefinition } from '../types';
import { VIBE_CODING_GUIDELINES } from './guidelines';

export const vibeToProduction: CourseDefinition = {
    id: 'vibe-to-production',
    title: 'Ship Your Vibe-Coded App',
    tagline: 'Take an AI-built prototype to a secure, tested, deployed product that real people can use.',
    level: 'Intermediate',
    hours: 25,
    accent: '#EAB308',
    badge: 'SHIP',
    requires: ['git', 'node'],
    category: 'vibe',
    stack: 'Full-stack',
    tutorGuidelines: [
        ...VIBE_CODING_GUIDELINES,
        'Security is the heart of this course. AI-built apps often ship with exposed keys, databases open to anyone, and missing server-side checks — show the learner how to test for each one on their own app, running locally.',
        'Never deploy, push to a remote, publish a package, or run anything that charges money on the learner\'s behalf. Walk them through it and let them run those steps themselves.',
        'Payment lessons use the provider\'s test mode and test card numbers only. Never handle real card data.',
        'Hosting, database and payment providers change their free tiers and pricing often. Compare kinds of services, not prices, and point the learner to each provider\'s current pricing page.',
    ],
    modules: [
        {
            title: 'From Prototype to Product',
            description: 'Why the demo works and the product doesn\'t — yet.',
            lessons: [
                'Why prototypes break in production',
                'Choosing a stack AI assistants know well',
                'Structuring a project so AI can keep working on it',
                'Cleaning up AI-generated mess with refactoring',
            ],
        },
        {
            title: 'Data & Users',
            description: 'Store data and let people sign in.',
            lessons: [
                'Designing your data model with AI',
                'Hosted databases and backends',
                'Adding sign-up and log-in',
                'Row-level security and access rules',
                'Migrations: changing the database safely',
            ],
        },
        {
            title: 'Security Essentials for Vibe Coders',
            description: 'The mistakes AI makes most, and how to catch them.',
            lessons: [
                'The most common holes in AI-built apps',
                'Secrets and environment variables',
                'Validating every input on the server',
                'Authorization: users only see their own data',
                'Asking AI for a security review — and checking it',
                'Made-up and malicious packages',
            ],
        },
        {
            title: 'Testing & Quality',
            description: 'Prove it works, and keep it working as the AI changes things.',
            lessons: [
                'Why tests matter more when AI writes the code',
                'Unit tests with AI',
                'End-to-end tests for key user flows',
                'Linting, formatting and type checking',
                'Continuous integration',
            ],
        },
        {
            title: 'Deploying',
            description: 'Put your app on the internet.',
            lessons: [
                'Hosting options for web apps',
                'Deploying from a Git repository',
                'Custom domains and HTTPS',
                'Development, staging and production environments',
                'Error tracking and logs',
            ],
        },
        {
            title: 'Payments, Costs & Limits',
            description: 'Charge money without losing money.',
            lessons: [
                'Accepting payments',
                'Controlling AI API costs in your app',
                'Rate limiting and abuse prevention',
                'Backups and recovery',
            ],
        },
        {
            title: 'Growing as a Vibe Coder',
            description: 'Keep getting better long after this course.',
            lessons: [
                'Learning from the code the AI writes',
                'When to learn the fundamentals properly',
                'Building a portfolio of shipped projects',
                'Staying current without chasing every new tool',
            ],
        },
        {
            title: 'Capstone: Launch a Product',
            description: 'Scope, build, secure, deploy and launch a small product.',
            lessons: [
                'Scoping a small product',
                'Building the core with an agent',
                'Securing and testing it',
                'Deploying it',
                'Launching and gathering feedback',
            ],
        },
    ],
};
