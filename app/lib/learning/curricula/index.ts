import { Course, CourseCategory } from '../types';
import { python } from './python';
import { javascript } from './javascript';
import { typescript } from './typescript';
import { java } from './java';
import { cpp } from './cpp';
import { c } from './c';
import { kotlin } from './kotlin';
import { swift } from './swift';
import { go } from './go';
import { htmlCss } from './html-css';
import { rust } from './rust';
import { csharp } from './csharp';
import { ruby } from './ruby';
import { php } from './php';
import { sql } from './sql';
import { postgresql } from './postgresql';
import { react } from './react';
import { nextjs } from './nextjs';
import { vue } from './vue';
import { angular } from './angular';
import { svelte } from './svelte';
import { nodeExpress } from './node-express';
import { django } from './django';
import { flask } from './flask';
import { fastapi } from './fastapi';
import { spring } from './spring';
import { android } from './android';
import { ios } from './ios';
import { aspnet } from './aspnet';
import { unity } from './unity';
import { rails } from './rails';
import { laravel } from './laravel';
import { gin } from './gin';
import { axum } from './axum';
import { qt } from './qt';
import { tailwind } from './tailwind';
import { ai } from './ai';
import { machineLearning } from './machine-learning';
import { deepLearning } from './deep-learning';
import { generativeAi } from './generative-ai';
import { dataScience } from './data-science';
import { cybersecurity } from './cybersecurity';
import { webSecurity } from './web-security';
import { dsa } from './dsa';
import { linux } from './linux';
import { git } from './git';
import { networking } from './networking';
import { devops } from './devops';
import { systemDesign } from './system-design';

export const LANGUAGE_COURSES: Course[] = [
    python,
    javascript,
    typescript,
    java,
    cpp,
    c,
    kotlin,
    swift,
    go,
    htmlCss,
    rust,
    csharp,
    ruby,
    php,
    sql,
    postgresql,
];

export const FRAMEWORK_COURSES: Course[] = [
    react,
    nextjs,
    vue,
    angular,
    svelte,
    nodeExpress,
    django,
    flask,
    fastapi,
    spring,
    android,
    ios,
    aspnet,
    unity,
    rails,
    laravel,
    gin,
    axum,
    qt,
    tailwind,
];

export const AI_COURSES: Course[] = [
    ai,
    machineLearning,
    deepLearning,
    generativeAi,
    dataScience,
];

export const SECURITY_COURSES: Course[] = [
    cybersecurity,
    webSecurity,
];

export const ESSENTIALS_COURSES: Course[] = [
    dsa,
    linux,
    git,
    networking,
    devops,
    systemDesign,
];

/** Catalog sections, in display order. */
export const COURSE_GROUPS: { category: CourseCategory; label: string; courses: Course[] }[] = [
    { category: 'language', label: 'Languages', courses: LANGUAGE_COURSES },
    { category: 'framework', label: 'Frameworks & Platforms', courses: FRAMEWORK_COURSES },
    { category: 'ai', label: 'AI & Data Science', courses: AI_COURSES },
    { category: 'security', label: 'Cybersecurity', courses: SECURITY_COURSES },
    { category: 'essentials', label: 'CS Essentials', courses: ESSENTIALS_COURSES },
];

export const COURSES: Course[] = COURSE_GROUPS.flatMap((group) => group.courses);

export const getCourse = (id: string): Course | undefined =>
    COURSES.find((course) => course.id === id);
