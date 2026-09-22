'use client';

import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabase } from '../supabase';
import { deviceHeaders } from '../device';
import { VYLOS_WEB_URL } from '@/electron/site';

/**
 * Typed calls into the learning engine (supabase/migrations/*_learning_engine.sql
 * and supabase/functions/learning). The server decides XP, mastery and
 * everything a certificate rests on; the app only reports what happened.
 */

export interface LevelInfo {
    level: number;
    title: string;
    xp: number;
    level_min_xp: number;
    next_level_xp: number | null;
}

export interface QuestProgress {
    id: string;
    cadence: 'daily' | 'weekly';
    title: string;
    target: number;
    progress: number;
    xp: number;
    completed: boolean;
}

export interface MyProgress {
    level: LevelInfo;
    subjects: Record<string, LevelInfo>;
    coins: number;
    streak: number;
    weekly_streak: number;
    today: { minutes: number; goal_minutes: number; goal_met: boolean };
    week: { day: string; goal_met: boolean }[];
    quests: QuestProgress[];
    skills: { skill_id: string; name: string; mastery: number }[];
    achievements: { id: string; name: string; icon: string; earned_at: string }[];
}

export interface MyProfile {
    handle: string | null;
    display_name: string | null;
    is_public: boolean;
    show_on_leaderboards: boolean;
    daily_goal_minutes: 10 | 20 | 30 | 60;
    timezone: string;
}

export interface SkillNode {
    skill_id: string;
    name: string;
    position: number;
    mastery: number;
    evidence_count: number;
    status: 'mastered' | 'in_progress' | 'available' | 'locked';
    missing_prerequisites: string[];
}

export interface CourseMastery {
    course_progress: number;
    knowledge_mastery: number;
    strong: string[];
    needs_practice: string[];
}

interface Requirement {
    met: boolean;
}

export interface CertificateReadiness {
    lessons: Requirement & { done: number; total: number };
    quizzes: Requirement & { passed: number; total: number };
    challenges: Requirement & { passed: number; required: number };
    capstone: Requirement;
    assessment: Requirement & { score: number | null; pass_mark: number };
    integrity: Requirement;
}

/** What an activity earned; every learner RPC returns some of this. */
export interface Award {
    xp?: number;
    achievements?: string[];
    mastery_before?: number;
    mastery_after?: number;
    skill_id?: string;
    flag?: string | null;
}

export class NotSignedIn extends Error {}

function client() {
    const supabase = getSupabase();
    if (!supabase) throw new NotSignedIn('Vylos is not connected to its server in this build.');
    return supabase;
}

/** True when the error means "try again later" (offline, server down), not "this will never work". */
export function isTransient(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /fetch|network|timeout|Failed to fetch|503|502|504/i.test(message);
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client().rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
}

const numeric = (value: unknown) => (value == null ? value : Number(value));

export const api = {
    myProgress: () => rpc<MyProgress>('my_progress'),

    async myProfile(userId: string): Promise<MyProfile | null> {
        const { data, error } = await client()
            .from('profiles')
            .select('handle, display_name, is_public, show_on_leaderboards, daily_goal_minutes, timezone')
            .eq('id', userId)
            .maybeSingle();
        if (error) throw new Error(`profile: ${error.message}`);
        return data as MyProfile | null;
    },

    /** Returns the database's message on failure (e.g. a handle that's taken). */
    async updateProfile(userId: string, patch: Partial<MyProfile>): Promise<string | null> {
        const { error } = await client().from('profiles').update(patch).eq('id', userId);
        if (!error) return null;
        if (error.code === '23505') return 'That handle is taken.';
        if (error.code === '23514') return 'Handles are 3–24 lowercase letters, numbers or underscores.';
        return error.message;
    },

    /** Course ids the server's catalog knows. Courses from extensions aren't tracked. */
    async trackedPaths(): Promise<string[]> {
        const { data, error } = await client().from('learning_paths').select('id');
        if (error) throw new Error(`learning_paths: ${error.message}`);
        return (data ?? []).map((row) => row.id as string);
    },

    completeLesson: (lessonId: string, seconds: number) =>
        rpc<Award>('complete_lesson', { p_lesson_id: lessonId, p_seconds_spent: Math.round(seconds) }),

    importLessonProgress: (lessonIds: string[]) => rpc<number>('import_lesson_progress', { p_lesson_ids: lessonIds }),

    recordChallengeAttempt: (challengeId: string, passed: boolean, hints: number, seconds: number, codeHash?: string) =>
        rpc<Award>('record_challenge_attempt', {
            p_challenge_id: challengeId,
            p_passed: passed,
            p_hints_used: hints,
            p_duration_seconds: Math.round(seconds),
            p_code_hash: codeHash ?? null,
        }),

    logLearningTime: (minutes: number) =>
        rpc<Award & { minutes: number; goal_minutes: number; goal_met: boolean; streak: number }>('log_learning_time', { p_minutes: minutes }),

    recordProgramRun: () => rpc<boolean>('record_program_run'),

    enroll: (pathId: string) => rpc<void>('enroll', { p_path_id: pathId }),

    async skillTree(pathId: string): Promise<SkillNode[]> {
        const rows = await rpc<SkillNode[]>('skill_tree', { p_path_id: pathId });
        return rows.map((row) => ({ ...row, mastery: Number(row.mastery) }));
    },

    courseMastery: (pathId: string) => rpc<CourseMastery>('course_mastery', { p_path_id: pathId }),

    certificateReadiness: (pathId: string) => rpc<CertificateReadiness>('certificate_readiness', { p_path_id: pathId }),

    async recommendPaths(): Promise<{ path_id: string; title: string; readiness: number }[]> {
        const rows = await rpc<{ path_id: string; title: string; readiness: number }[]>('recommend_paths', { p_limit: 4 });
        return rows.map((row) => ({ ...row, readiness: Number(row.readiness) }));
    },

    addPracticeChallenge: (skillId: string, title: string, prompt: string, hint: string, difficulty: number) =>
        rpc<string>('add_practice_challenge', {
            p_skill_id: skillId,
            p_title: title,
            p_prompt: prompt,
            p_hint: hint,
            p_difficulty: difficulty,
        }),

    submitProject: (projectId: string, repoUrl: string | null, codeHash: string) =>
        rpc<{ submission_id: string; status: 'submitted' | 'flagged' }>('submit_project', {
            p_project_id: projectId,
            p_repo_url: repoUrl,
            p_code_hash: codeHash,
        }),

    /** The learner's own latest submission (others' shared ones are readable too, hence the user filter). */
    async latestSubmission(userId: string, projectId: string) {
        const { data } = await client()
            .from('project_submissions')
            .select('id, status, review, overall_score, submitted_at, reviewed_at, is_public')
            .eq('user_id', userId)
            .eq('project_id', projectId)
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        return data
            ? { ...data, overall_score: numeric(data.overall_score) as number | null } as {
                id: string;
                status: 'submitted' | 'passed' | 'needs_work' | 'flagged';
                review: ProjectReview | null;
                overall_score: number | null;
                submitted_at: string;
                reviewed_at: string | null;
                is_public: boolean;
            }
            : null;
    },

    async setSubmissionPublic(submissionId: string, isPublic: boolean) {
        const { error } = await client().from('project_submissions').update({ is_public: isPublic }).eq('id', submissionId);
        if (error) throw new Error(error.message);
    },

    async myCertificate(userId: string, pathId: string): Promise<{ id: string; issued_at: string } | null> {
        const { data } = await client()
            .from('certificates')
            .select('id, issued_at')
            .eq('user_id', userId)
            .eq('path_id', pathId)
            .eq('status', 'valid')
            .maybeSingle();
        return data;
    },
};

// ---------------------------------------------------------------------------
// The learning Edge Function
// ---------------------------------------------------------------------------

export interface ProjectReview {
    correctness: number;
    code_quality: number;
    architecture: number;
    testing: number;
    understanding: number;
    requirements: { requirement: string; met: boolean; note: string }[];
    strengths: string[];
    improvements: string[];
    summary: string;
    reviewer: string;
}

export interface AssessmentQuestion {
    id: string;
    skill_name: string;
    question: string;
}

export interface AssessmentResult {
    score: number;
    pass_mark: number;
    passed: boolean;
    results: { id: string; skill_name: string; score: number; feedback: string }[];
}

/** A friendly message for a failed learning-function call. */
async function functionError(error: unknown): Promise<string> {
    if (error instanceof FunctionsHttpError) {
        const response = error.context as Response;
        if (response.status === 401) return 'Sign in to use this.';
        if (response.status === 429) {
            const body = await response.json().catch(() => null);
            return body?.error === 'Daily AI limit reached'
                ? "You've reached today's Vylos AI limit. It resets at midnight UTC."
                : body?.error ?? 'Try again later.';
        }
        const body = await response.json().catch(() => null);
        if (body?.error) return body.error;
    }
    return "Couldn't reach Vylos. Check your connection and try again.";
}

async function learning<T>(action: string, body: Record<string, unknown>): Promise<{ data: T } | { error: string }> {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Vylos is not connected to its server in this build.' };
    const { data, error } = await supabase.functions.invoke<T>('learning', {
        body: { action, ...body },
        headers: await deviceHeaders(),
    });
    if (error || !data) return { error: await functionError(error) };
    return { data };
}

export const learningAi = {
    reviewProject: (submissionId: string, files: Record<string, string>) =>
        learning<{ review: ProjectReview; overall: number; passed: boolean; result?: Award & { skills?: Record<string, { before: number; after: number }> }; already_reviewed?: boolean; status?: string }>(
            'review_project',
            { submission_id: submissionId, files }
        ),
    scoreExplanation: (skillId: string, concept: string, explanation: string) =>
        learning<{ score: number; feedback: string; misconceptions: string[]; result?: Award & { mastery?: number } }>(
            'score_explanation',
            { skill_id: skillId, concept, explanation }
        ),
    startAssessment: (pathId: string) =>
        learning<{ session_id: string; questions: AssessmentQuestion[]; pass_mark: number; resumed?: boolean }>('start_assessment', { path_id: pathId }),
    submitAssessment: (sessionId: string, answers: Record<string, string>) =>
        learning<AssessmentResult>('submit_assessment', { session_id: sessionId, answers }),
    issueCertificate: (pathId: string, holderName: string) =>
        learning<{ issued: boolean; certificate_id?: string; already_issued?: boolean; missing?: string[] }>('issue_certificate', {
            path_id: pathId,
            holder_name: holderName,
        }),
};

/** Where anyone can check a certificate. */
export const certificateUrl = (id: string) => `${VYLOS_WEB_URL}/verify/${id}`;

/** A learner's public profile on the website. */
export const profileUrl = (handle: string) => `${VYLOS_WEB_URL}/u/${handle}`;
