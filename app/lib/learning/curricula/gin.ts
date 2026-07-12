import { Course } from '../types';

export const gin: Course = {
    id: 'gin',
    title: 'Go Web Development with Gin',
    tagline: 'Production Go APIs: routing, middleware, databases, and clean architecture.',
    level: 'Intermediate (Go required)',
    hours: 16,
    accent: '#00ADD8',
    badge: 'GIN',
    category: 'framework',
    stack: 'Go',
    modules: [
        {
            title: 'Getting Started',
            description: 'From net/http to Gin, and why frameworks help.',
            lessons: [
                'A server with plain net/http (the baseline)',
                'What Gin adds: router, binding, middleware',
                'Installing Gin and the first server',
                'gin.Context: the heart of every handler',
                'Project layout for a web service',
            ],
        },
        {
            title: 'Routing',
            description: 'Clean URL design with Gin’s router.',
            lessons: [
                'Routes and HTTP methods',
                'Path parameters',
                'Query strings',
                'Route groups (and versioned APIs)',
                'Serving static files',
            ],
        },
        {
            title: 'Requests & Responses',
            description: 'Binding, validation, and JSON in/out.',
            lessons: [
                'Binding JSON bodies to structs',
                'Validation tags (binding:"required")',
                'Custom validation messages',
                'JSON responses and status codes',
                'A consistent response envelope',
                'Exercise: validated create endpoint',
            ],
        },
        {
            title: 'Middleware',
            description: 'Cross-cutting behavior, the Gin way.',
            lessons: [
                'How middleware chains work',
                'Built-ins: logger and recovery',
                'Writing custom middleware',
                'Passing data with context keys',
                'CORS and request IDs',
            ],
        },
        {
            title: 'Database Layer',
            description: 'Postgres from Go, two ways.',
            lessons: [
                'database/sql + sqlx',
                'GORM overview (and trade-offs)',
                'Repository pattern in Go',
                'Migrations (golang-migrate)',
                'Connection pools and timeouts',
                'Exercise: CRUD backed by Postgres',
            ],
        },
        {
            title: 'Authentication',
            description: 'Secure endpoints with JWT.',
            lessons: [
                'Password hashing with bcrypt',
                'Login endpoint issuing JWTs',
                'Auth middleware verifying tokens',
                'Role checks',
                'Refresh strategy overview',
            ],
        },
        {
            title: 'Structure & Configuration',
            description: 'A codebase your future team can navigate.',
            lessons: [
                'Layers: handler → service → repository',
                'Config from env (envconfig/viper)',
                'Structured logging (slog)',
                'Error handling conventions',
                'Graceful shutdown with context',
            ],
        },
        {
            title: 'Testing',
            description: 'Table-driven tests for HTTP.',
            lessons: [
                'httptest with Gin',
                'Table-driven handler tests',
                'Testing middleware',
                'Test database strategy',
            ],
        },
        {
            title: 'Deployment',
            description: 'Tiny containers, fast startups.',
            lessons: [
                'Building static binaries',
                'Multi-stage Dockerfiles',
                'Health and readiness endpoints',
                'Deploying and monitoring basics',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'A complete Go REST API.',
            lessons: [
                'Scoping: URL shortener or tasks API',
                'Routes, handlers, services',
                'Postgres repository + migrations',
                'JWT auth',
                'Tests and Docker deploy',
            ],
        },
    ],
};
