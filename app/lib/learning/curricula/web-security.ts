import { CourseDefinition } from '../types';
import { SECURITY_ETHICS_GUIDELINES } from './guidelines';

export const webSecurity: CourseDefinition = {
    id: 'web-security',
    title: 'Secure Coding & AppSec',
    tagline: 'Write code that holds up against real attacks. Find and fix vulnerabilities in your own apps.',
    level: 'Intermediate (web development basics)',
    hours: 30,
    accent: '#F97316',
    badge: 'APP',
    category: 'security',
    stack: 'Web',
    tutorGuidelines: [
        ...SECURITY_ETHICS_GUIDELINES,
        'Demonstrate every vulnerability in a tiny app the learner writes and runs on localhost, then fix it in the same file so they see the before and after.',
        'Mark deliberately vulnerable code clearly with a comment such as "# INSECURE: for learning only", and never leave it as the final version.',
        'Check security tools (bandit, semgrep, pip-audit, npm audit, OWASP ZAP) are installed before running them, and ask before installing.',
    ],
    modules: [
        {
            title: 'The Secure Development Mindset',
            description: 'Think like an attacker so you can build like a defender.',
            lessons: [
                'Why secure coding matters',
                'Trust boundaries and untrusted input',
                'Threat modeling with STRIDE',
                'Validate input, encode output',
                'Secure by default and fail safely',
                'Security in the development lifecycle',
            ],
        },
        {
            title: 'Injection',
            description: 'When data gets treated as code.',
            lessons: [
                'SQL injection: see it break a login',
                'Fixing SQL injection with parameterized queries',
                'Command injection',
                'Path traversal',
                'Server-side template injection',
                'NoSQL injection',
            ],
        },
        {
            title: 'XSS & Browser Security',
            description: 'Protect users from scripts that should not run.',
            lessons: [
                'Reflected, stored, and DOM-based XSS',
                'Context-aware output encoding',
                'How frameworks escape output, and how to bypass it by accident',
                'Content Security Policy',
                'The same-origin policy and CORS',
                'Clickjacking and frame protections',
            ],
        },
        {
            title: 'Authentication & Sessions',
            description: 'Log users in without letting attackers in.',
            lessons: [
                'Storing passwords safely',
                'Session management',
                'Cookie flags: HttpOnly, Secure, SameSite',
                'JWT pitfalls',
                'Rate limiting and brute-force protection',
                'Password reset flows done right',
            ],
        },
        {
            title: 'Authorization',
            description: 'Make sure users can only do what they are allowed to.',
            lessons: [
                'Insecure direct object references (IDOR)',
                'Role-based access control',
                'Always check on the server',
                'Mass assignment',
                'Exercise: find and fix broken access control',
            ],
        },
        {
            title: 'Secrets & Configuration',
            description: 'Keep keys out of code and systems locked down.',
            lessons: [
                'Why secrets must never be committed',
                'Environment variables and secret managers',
                'Scanning git history for leaked secrets',
                'Security misconfiguration',
                'Safe error messages and logging',
            ],
        },
        {
            title: 'Dependencies & Supply Chain',
            description: 'Your app is only as secure as the code it imports.',
            lessons: [
                'Known-vulnerable dependencies',
                'Auditing with pip-audit and npm audit',
                'Lockfiles and pinned versions',
                'Typosquatting and malicious packages',
                'Software bills of materials (SBOMs)',
            ],
        },
        {
            title: 'Cryptography in Code',
            description: 'Use crypto correctly, which mostly means not inventing your own.',
            lessons: [
                'Use vetted libraries, never homemade crypto',
                'Secure random numbers (the secrets module)',
                'Verifying TLS certificates',
                'Common crypto mistakes in real code',
            ],
        },
        {
            title: 'API Security',
            description: 'Protect the endpoints behind modern apps.',
            lessons: [
                'The OWASP API Security Top 10 overview',
                'Schema validation for requests',
                'Rate limiting and quotas',
                'Error handling without leaking details',
            ],
        },
        {
            title: 'Security Testing',
            description: 'Find vulnerabilities before attackers do.',
            lessons: [
                'Static analysis with Bandit and Semgrep',
                'Dynamic scanning of your local app with OWASP ZAP',
                'Writing security unit tests',
                'A secure code review checklist',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'Audit a deliberately vulnerable app you build, then secure it.',
            lessons: [
                'Building the vulnerable app',
                'Threat modeling it',
                'Finding the vulnerabilities',
                'Fixing each one with tests',
                'Writing the audit report',
            ],
        },
    ],
};
