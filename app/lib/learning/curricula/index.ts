import { CourseDefinition } from '../types';
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

/**
 * The courses that ship with Vylos, registered by the course registry at
 * startup. Each course's `category` decides its catalog section; order here is
 * the order within a section.
 */
export const BUILTIN_COURSES: CourseDefinition[] = [
    // Languages
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
    // Frameworks & Platforms
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
    // AI & Data Science
    ai,
    machineLearning,
    deepLearning,
    generativeAi,
    dataScience,
    // Cybersecurity
    cybersecurity,
    webSecurity,
    // CS Essentials
    dsa,
    linux,
    git,
    networking,
    devops,
    systemDesign,
];
