import { CourseDefinition } from '../types';
import { AI_ACCURACY_GUIDELINES } from './guidelines';

export const generativeAi: CourseDefinition = {
    id: 'generative-ai',
    title: 'Generative AI & LLM Apps',
    tagline: 'Build reliable apps on top of large language models: prompts, RAG, tools, and evaluation.',
    level: 'Intermediate (Python required)',
    hours: 25,
    accent: '#10A37F',
    badge: 'GEN',
    category: 'ai',
    stack: 'Python',
    tutorGuidelines: [
        ...AI_ACCURACY_GUIDELINES,
        'LLM provider SDKs and model names change often. Before writing API code, ask which provider and API key the learner has, check the installed SDK version, and take model IDs from the provider\'s docs or its list-models call. Never guess a model ID.',
        'Never hard-code, print, or commit API keys. Load them from environment variables and add .env to .gitignore.',
        'API calls can cost money. Mention it, keep test prompts small, and do not run loops of API calls without the learner agreeing.',
        'If the learner has no API key, teach with a local open-weight model (only if one is installed) or a mocked response, and say clearly which one you are using.',
    ],
    modules: [
        {
            title: 'How LLMs Work',
            description: 'The mental model you need before building anything.',
            lessons: [
                'Tokens and tokenization',
                'Next-token prediction',
                'Context windows and their limits',
                'Temperature and sampling',
                'Why LLMs hallucinate',
                'What LLMs are good and bad at',
            ],
        },
        {
            title: 'Prompt Engineering',
            description: 'Get consistent, useful output from a model.',
            lessons: [
                'Writing clear instructions',
                'System prompts and roles',
                'Few-shot examples',
                'Asking for structured output (JSON)',
                'Asking the model to reason step by step',
                'Iterating on prompts systematically',
            ],
        },
        {
            title: 'Calling LLM APIs',
            description: 'From a first request to production-ready calls.',
            lessons: [
                'API keys and environment variables',
                'Your first request with an official SDK',
                'Multi-turn conversations',
                'Streaming responses',
                'Handling errors, retries, and rate limits',
                'Tokens, latency, and cost',
            ],
        },
        {
            title: 'Embeddings & Semantic Search',
            description: 'Search by meaning instead of keywords.',
            lessons: [
                'What embeddings are',
                'Cosine similarity',
                'Storing and searching vectors',
                'Exercise: semantic search over your notes',
            ],
        },
        {
            title: 'Retrieval-Augmented Generation (RAG)',
            description: 'Ground a model\'s answers in your own documents.',
            lessons: [
                'Why RAG reduces hallucinations',
                'Loading and chunking documents',
                'Retrieving relevant chunks',
                'Building the grounded prompt',
                'Citing sources in answers',
                'Saying "I don\'t know" when the documents lack the answer',
                'Evaluating retrieval and answer quality',
            ],
        },
        {
            title: 'Tool Use & Agents',
            description: 'Let a model call functions and take actions safely.',
            lessons: [
                'Function calling',
                'The agent loop: think, act, observe',
                'Validating tool arguments',
                'Guardrails and human approval for risky actions',
                'Exercise: an assistant that uses a calculator and a search tool',
            ],
        },
        {
            title: 'Evaluation, Security & Safety',
            description: 'Make LLM apps you can trust.',
            lessons: [
                'Building an evaluation set',
                'Automated and human evaluation',
                'Prompt injection and how to defend against it',
                'Protecting private data',
                'Content moderation',
            ],
        },
        {
            title: 'Beyond Text',
            description: 'A tour of other generative models.',
            lessons: [
                'Running open-weight models locally',
                'Image generation and diffusion models: the idea',
                'Speech-to-text and text-to-speech',
                'Multimodal models',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'Build a documentation Q&A assistant that cites its sources.',
            lessons: [
                'Scoping the assistant',
                'Ingesting and indexing documents',
                'Retrieval and grounded answers',
                'Building an evaluation set and measuring quality',
                'Hardening against prompt injection',
                'Shipping a simple interface',
            ],
        },
    ],
};
