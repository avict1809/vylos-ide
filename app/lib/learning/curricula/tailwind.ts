import { CourseDefinition } from '../types';

export const tailwind: CourseDefinition = {
    id: 'tailwind',
    title: 'Tailwind CSS Mastery',
    tagline: 'Utility-first styling — design directly in your markup, fast.',
    level: 'Intermediate (HTML & CSS required)',
    hours: 12,
    accent: '#38BDF8',
    badge: 'TW',
    category: 'framework',
    stack: 'HTML & CSS',
    modules: [
        {
            title: 'Getting Started',
            description: 'The utility-first idea and a working setup.',
            lessons: [
                'Why utility-first (and the objections, answered)',
                'Setup with the Vite plugin',
                'The Play CDN for quick experiments',
                'Editor IntelliSense',
                'How the compiler generates only what you use',
            ],
        },
        {
            title: 'Core Utilities',
            description: 'The vocabulary you will use every day.',
            lessons: [
                'Spacing: padding, margin, gap',
                'Sizing: width, height, max/min',
                'Colors and opacity',
                'Typography: size, weight, line height',
                'Borders, rounding, and shadows',
                'Arbitrary values ([13px]) when needed',
            ],
        },
        {
            title: 'Layout',
            description: 'Flexbox and Grid at utility speed.',
            lessons: [
                'display utilities',
                'Flexbox: direction, justify, align, wrap',
                'Grid: columns, spans, gaps',
                'Positioning and z-index',
                'Container and centering patterns',
                'Exercise: rebuild three classic layouts',
            ],
        },
        {
            title: 'States & Responsive Design',
            description: 'Variants: the feature that makes Tailwind scale.',
            lessons: [
                'Hover, focus, active, disabled',
                'Group and peer variants',
                'Responsive prefixes (sm:, md:, lg:)',
                'Mobile-first thinking in Tailwind',
                'Dark mode (dark:)',
                'Exercise: responsive nav with dropdown',
            ],
        },
        {
            title: 'Components Without a Framework',
            description: 'Reuse patterns without losing the utility workflow.',
            lessons: [
                'Extracting components (in your JS framework)',
                'When @apply helps (and when it hurts)',
                'Composition patterns for variants (cva idea)',
                'Headless UI and accessible primitives',
            ],
        },
        {
            title: 'Customization & Theming',
            description: 'Make Tailwind speak your design language.',
            lessons: [
                'The @theme directive and design tokens',
                'Custom colors, fonts, and spacing scales',
                'Custom utilities and variants',
                'Plugins overview',
                'Sharing a theme across projects',
            ],
        },
        {
            title: 'Real UI Build',
            description: 'The patterns every product needs.',
            lessons: [
                'Navbar and footer',
                'Cards and pricing tables',
                'Forms that look professional',
                'Modals and toasts',
                'Tables and empty states',
                'Skeletons and loading states',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'A pixel-solid site, utility-first end to end.',
            lessons: [
                'Recreating a professional design (landing page)',
                'Dashboard shell with sidebar',
                'Dark mode across the whole app',
                'Responsive audit',
                'Final polish and deploy',
            ],
        },
    ],
};
