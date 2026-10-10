import { CourseDefinition } from '../types';

export const axum: CourseDefinition = {
    id: 'axum',
    title: 'Rust Web with Axum',
    tagline: 'Type-safe, blazing-fast web services on tokio.',
    level: 'Intermediate (Rust required)',
    hours: 16,
    accent: '#DEA584',
    badge: 'AXM',
    requires: ['rust'],
    category: 'framework',
    stack: 'Rust',
    modules: [
        {
            title: 'Getting Started',
            description: 'Async Rust, tokio, and your first Axum server.',
            lessons: [
                'Async Rust refresher (futures, .await)',
                'tokio: the async runtime',
                'Setting up an Axum project',
                'Routers and handlers',
                'Running and testing with curl',
            ],
        },
        {
            title: 'Routing & Extractors',
            description: 'Axum’s magic: typed request data via function arguments.',
            lessons: [
                'Route definitions and methods',
                'Path and Query extractors',
                'Json extractor for bodies',
                'State: sharing app data',
                'Headers and the full request',
                'Extractor ordering rules',
            ],
        },
        {
            title: 'Responses & Error Handling',
            description: 'Everything returns IntoResponse — use that well.',
            lessons: [
                'IntoResponse and status codes',
                'Json responses',
                'A custom AppError type',
                'thiserror for error definitions',
                'Mapping errors to HTTP responses',
                'The ? operator in handlers',
            ],
        },
        {
            title: 'Middleware & Tower',
            description: 'Layers for logging, CORS, and auth.',
            lessons: [
                'Tower services and layers (the concept)',
                'tracing + tower-http for request logs',
                'CORS layer',
                'Custom middleware with from_fn',
                'Timeouts and limits',
            ],
        },
        {
            title: 'Database with sqlx',
            description: 'Compile-time-checked SQL against Postgres.',
            lessons: [
                'sqlx setup and connection pools',
                'query! and query_as! macros',
                'Migrations with sqlx-cli',
                'CRUD queries in handlers',
                'Transactions',
                'Exercise: persistent todos API',
            ],
        },
        {
            title: 'Authentication',
            description: 'JWT auth with proper password storage.',
            lessons: [
                'Hashing with argon2',
                'Register and login endpoints',
                'Creating and validating JWTs',
                'An auth extractor for protected routes',
                'Role-based checks',
            ],
        },
        {
            title: 'Project Structure & Config',
            description: 'Idiomatic organization for a growing service.',
            lessons: [
                'Modules: routes, models, errors, db',
                'Configuration with dotenvy/figment',
                'AppState design',
                'Graceful shutdown',
            ],
        },
        {
            title: 'Testing',
            description: 'Exercise the real router in tests.',
            lessons: [
                'Testing handlers with tower::ServiceExt (oneshot)',
                'Integration tests with a test database',
                'Testing auth flows',
            ],
        },
        {
            title: 'Deployment',
            description: 'Small, fast, safe containers.',
            lessons: [
                'Release builds and binary size',
                'Multi-stage Docker (distroless)',
                'Health endpoints and observability',
                'Deploying the service',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'A production-shaped Rust API.',
            lessons: [
                'Scoping: pastebin or bookmarks API',
                'Routes and extractors',
                'sqlx data layer with migrations',
                'JWT auth end to end',
                'Tests and Docker deploy',
            ],
        },
    ],
};
