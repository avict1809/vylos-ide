import { Course } from '../types';
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

export const COURSES: Course[] = [...LANGUAGE_COURSES, ...FRAMEWORK_COURSES];

export const getCourse = (id: string): Course | undefined =>
    COURSES.find((course) => course.id === id);
