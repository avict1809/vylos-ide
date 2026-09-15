import { CourseDefinition } from '../types';
import { VIBE_CODING_GUIDELINES } from './guidelines';

export const mcp: CourseDefinition = {
    id: 'mcp',
    title: 'MCP: Model Context Protocol',
    tagline: 'Connect Claude, ChatGPT and coding agents to your tools and data with MCP servers — then build your own.',
    level: 'Intermediate (JS or Python basics)',
    hours: 20,
    accent: '#3B82F6',
    badge: 'MCP',
    requires: ['node'],
    category: 'vibe',
    stack: 'TS · Python',
    tutorGuidelines: [
        ...VIBE_CODING_GUIDELINES,
        'The MCP spec and SDKs are still evolving. Before writing server code, check the installed SDK version (npm ls @modelcontextprotocol/sdk, or pip show mcp) and follow the examples for that version from modelcontextprotocol.io or the SDK\'s README. Never guess an SDK function name — test it first.',
        'A stdio MCP server talks to its client over stdout, so it must not print anything else there. Log to stderr instead; stray console.log or print output breaks the connection.',
        'Launching the MCP Inspector or a third-party server with npx or uvx downloads and runs code. Ask the learner first, and only use well-known packages from their official repositories.',
        'Every MCP server runs with the learner\'s permissions. Practice with servers limited to a scratch folder or a test account, never with real credentials that can delete or send things.',
    ],
    modules: [
        {
            title: 'What MCP Is',
            description: 'The open standard for plugging tools and data into AI apps.',
            lessons: [
                'The problem MCP solves',
                'Hosts, clients and servers',
                'Tools, resources and prompts',
                'Local (stdio) and remote (HTTP) servers',
                'How a model decides to call a tool',
            ],
        },
        {
            title: 'Using MCP Servers',
            description: 'Give your AI apps new abilities without writing code.',
            lessons: [
                'Adding a server to a desktop AI app',
                'Adding a server to a coding agent',
                'Connectors and apps in chat assistants',
                'Filesystem and Git servers',
                'GitHub and issue-tracker servers',
                'Browser automation servers',
                'Database servers',
                'Documentation and search servers',
            ],
        },
        {
            title: 'MCP Safety',
            description: 'Connecting tools means trusting them — decide carefully.',
            lessons: [
                'Every server runs with your permissions',
                'Choosing trustworthy servers',
                'Least privilege: scoped folders and read-only tokens',
                'Prompt injection through tool results',
                'Tool poisoning and malicious descriptions',
                'Reviewing and approving tool calls',
            ],
        },
        {
            title: 'Building Your First MCP Server',
            description: 'From an empty folder to a tool your AI can call.',
            lessons: [
                'Choosing the TypeScript or Python SDK',
                'Setting up the project',
                'Defining your first tool',
                'Input schemas and validation',
                'Returning results and errors',
                'Testing with the MCP Inspector',
                'Connecting your server to an AI app',
            ],
        },
        {
            title: 'Beyond Tools',
            description: 'Resources, prompts, and tools models actually use well.',
            lessons: [
                'Exposing resources',
                'Reusable prompts',
                'Writing tool names and descriptions models understand',
                'Keeping tool output small and useful',
            ],
        },
        {
            title: 'Remote Servers',
            description: 'Serve many users over the network.',
            lessons: [
                'The Streamable HTTP transport',
                'Authentication with OAuth',
                'Deploying a remote server',
                'Logging and monitoring',
            ],
        },
        {
            title: 'Capstone: An MCP Server for Your Workflow',
            description: 'Give an AI assistant safe access to a tool or data source you use every day.',
            lessons: [
                'Designing tools for a real workflow',
                'Building the server',
                'Testing with real prompts',
                'Hardening and documenting',
                'Sharing your server',
            ],
        },
    ],
};
