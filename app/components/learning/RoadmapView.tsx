'use client';

import { useState } from 'react';
import { useRoadmapStore } from '@/app/lib/stores/roadmap-store';
import { useCourseStore } from '@/app/lib/stores/course-store';
import { useCourse } from '@/app/lib/learning/course-registry';
import { CheckCircle, Circle, Trophy, ArrowRight, ArrowLeft, Target, Sparkles } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import RoadmapCreator from './RoadmapCreator';
import CourseCatalog from './CourseCatalog';
import CourseView from './CourseView';
import ExerciseView from './ExerciseView';
import LessonView from './LessonView';
import PersonalTutorView from './PersonalTutorView';
import { useExerciseStore } from '@/app/lib/stores/exercise-store';
import ProgressView from './ProgressView';
import CapstoneView from './CapstoneView';
import AssessmentView from './AssessmentView';
import CertificateView from './CertificateView';
import type { CourseSubView } from './CourseMasteryPanel';
import { PRACTICE_COURSE_ID, practiceOrigin } from '@/app/lib/learning/practice';
import { useCourseLock } from '@/app/lib/learning/course-access';
import LockedCourseView from './LockedCourseView';
import QuizView from './QuizView';
import ShopView from './ShopView';
import CommunityView from './CommunityView';

export default function RoadmapView() {
    const { currentRoadmap } = useRoadmapStore();
    const { activeCourseId, backToCatalog, openLesson, setOpenLesson } = useCourseStore();
    const [view, setView] = useState<'auto' | 'catalog' | 'creator' | 'personal' | 'progress' | 'shop' | 'community'>('auto');
    // A capstone, assessment or certificate page belongs to the course it was opened from
    const [opened, setOpened] = useState<{ courseId: string; view: CourseSubView } | null>(null);

    const course = useCourse(activeCourseId);
    const lock = useCourseLock(course);
    const { active: activeExercise, setActive: setActiveExercise } = useExerciseStore();

    const sub = opened?.courseId === activeCourseId ? opened.view : null;
    const setSub = (view: CourseSubView | null) => setOpened(view && activeCourseId ? { courseId: activeCourseId, view } : null);

    const openCourse = (id: string) => {
        useCourseStore.getState().setActiveCourse(id);
        setView('auto');
    };

    if (view === 'personal') {
        return <PersonalTutorView onBack={() => setView('catalog')} />;
    }

    if (view === 'progress') {
        return (
            <ProgressView
                onBack={() => setView('catalog')}
                onOpenCourse={openCourse}
                onOpenShop={() => setView('shop')}
                onOpenCommunity={() => setView('community')}
            />
        );
    }

    if (view === 'shop') {
        return <ShopView onBack={() => setView('progress')} onOpenCourse={openCourse} />;
    }

    if (view === 'community') {
        return <CommunityView onBack={() => setView('progress')} />;
    }

    if (view === 'creator' && !currentRoadmap) {
        return (
            <div className="h-full relative">
                <button
                    onClick={() => setView('catalog')}
                    className="absolute top-4 left-4 z-10 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-[var(--vylos-green)] transition-colors"
                >
                    <ArrowLeft size={11} /> Catalog
                </button>
                <RoadmapCreator />
            </div>
        );
    }

    if (view !== 'catalog') {
        // Paid courses show their price until unlocked, whichever of their pages was asked for
        if (course && lock.locked) {
            return (
                <LockedCourseView
                    course={course}
                    cost={lock.cost}
                    onBack={() => {
                        backToCatalog();
                        setActiveExercise(null);
                        setView('catalog');
                    }}
                />
            );
        }
        if (course && activeExercise?.courseId === course.id) {
            return (
                <ExerciseView
                    lessonRef={activeExercise}
                    onBack={() => {
                        setActiveExercise(null);
                        // Practice goes back to the course it was written for
                        if (course.id === PRACTICE_COURSE_ID) {
                            const origin = practiceOrigin(activeExercise.lessonId);
                            if (origin) useCourseStore.getState().setActiveCourse(origin.id);
                            else backToCatalog();
                        }
                    }}
                />
            );
        }
        if (course && openLesson?.courseId === course.id) {
            return <LessonView lessonRef={openLesson} onBack={() => setOpenLesson(null)} />;
        }
        if (course && course.id !== PRACTICE_COURSE_ID) {
            if (sub === 'capstone') return <CapstoneView course={course} onBack={() => setSub(null)} />;
            if (sub === 'assessment') return <AssessmentView course={course} onBack={() => setSub(null)} />;
            if (sub === 'certificate') return <CertificateView course={course} onBack={() => setSub(null)} />;
            if (sub?.startsWith('quiz:')) return <QuizView course={course} moduleIndex={Number(sub.slice(5))} onBack={() => setSub(null)} />;
            return (
                <CourseView
                    course={course}
                    onOpenSub={setSub}
                    onBack={() => {
                        backToCatalog();
                        setActiveExercise(null);
                        setView('catalog');
                    }}
                />
            );
        }
        if (currentRoadmap) {
            return (
                <AIRoadmapView
                    onBack={() => setView('catalog')}
                    onNewPath={() => setView('creator')}
                />
            );
        }
    }

    return (
        <CourseCatalog
            onOpenCourse={(id) => {
                useCourseStore.getState().setActiveCourse(id);
                setView('auto');
            }}
            onCustomPath={() => setView('creator')}
            onPersonalTutor={() => setView('personal')}
            onOpenProgress={() => setView('progress')}
            onResumeRoadmap={() => {
                backToCatalog();
                setView('auto');
            }}
        />
    );
}

function AIRoadmapView({ onBack, onNewPath }: { onBack: () => void; onNewPath: () => void }) {
    const { currentRoadmap, completeMilestone, clearRoadmap } = useRoadmapStore();

    if (!currentRoadmap) return null;

    const completedCount = currentRoadmap.milestones.filter(m => m.completed).length;
    const progress = (completedCount / currentRoadmap.milestones.length) * 100;

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            {/* Header Content */}
            <div className="p-6 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <div className="flex items-center justify-between mb-3">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-[var(--vylos-green)] transition-colors"
                    >
                        <ArrowLeft size={11} /> Catalog
                    </button>
                    <button
                        onClick={() => {
                            clearRoadmap();
                            onNewPath();
                        }}
                        className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-[var(--vylos-green)] transition-colors"
                    >
                        <Sparkles size={10} /> New Path
                    </button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                    <Target size={14} className="text-[var(--vylos-green)]" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--vylos-text-secondary)]">Current Objective</span>
                </div>
                <h2 className="text-xl font-black text-white leading-tight mb-4">{currentRoadmap.goal}</h2>

                {/* Progress Bar */}
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{completedCount} / {currentRoadmap.milestones.length} Milestones</span>
                        <span className="text-xs font-mono text-[var(--vylos-green)]">{Math.round(progress)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#18181b] rounded-full overflow-hidden border border-[#27272a]">
                        <div
                            className="h-full bg-[var(--vylos-green)] transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(0,255,0,0.3)]"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Milestones List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {currentRoadmap.milestones.map((milestone, index) => (
                    <div key={milestone.id} className="group relative pl-8 border-l border-[#27272a] last:border-transparent pb-2">
                        {/* Connecting Line Enhancement */}
                        <div className="absolute left-[-1px] top-0 bottom-0 w-px bg-gradient-to-b from-[var(--vylos-green)] to-transparent opacity-0 group-hover:opacity-20 transition-opacity" />

                        {/* Status Icon */}
                        <div
                            className={cn(
                                "absolute -left-[9px] top-0 w-[18px] h-[18px] flex items-center justify-center rounded-full border border-[var(--vylos-black)] transition-all duration-300",
                                milestone.completed
                                    ? "bg-[var(--vylos-green)] text-black"
                                    : "bg-[#18181b] text-gray-600 border-[#27272a]"
                            )}
                        >
                            {milestone.completed ? <CheckCircle size={12} strokeWidth={3} /> : <Circle size={10} />}
                        </div>

                        <div className={cn(
                            "p-4 rounded-xl border transition-all duration-300",
                            milestone.completed
                                ? "bg-[var(--vylos-green-dark)]/5 border-[var(--vylos-green-dark)]/20"
                                : "bg-[#09090b] border-[#27272a] hover:border-[#3f3f46]"
                        )}>
                            <div className="flex justify-between items-start mb-2">
                                <h3 className={cn(
                                    "text-sm font-bold tracking-tight",
                                    milestone.completed ? "text-[var(--vylos-green-accent)]" : "text-gray-200"
                                )}>
                                    {milestone.title}
                                </h3>
                                {!milestone.completed && (
                                    <button
                                        onClick={() => completeMilestone(milestone.id)}
                                        className="text-[10px] font-bold uppercase tracking-widest text-[var(--vylos-green)] hover:text-white transition-colors flex items-center gap-1 group/btn"
                                    >
                                        Verify <ArrowRight size={10} className="group-hover/btn:translate-x-1 transition-transform" />
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed mb-3">{milestone.description}</p>

                            {milestone.tasks.length > 0 && (
                                <div className="space-y-1.5 border-t border-[#27272a]/50 pt-3 mt-3">
                                    {milestone.tasks.map((task, i) => (
                                        <div key={i} className="flex items-start gap-2 text-[11px] text-gray-400">
                                            <div className="w-1 h-1 rounded-full bg-[var(--vylos-green)] mt-1.5 shrink-0 opacity-40" />
                                            <span>{task}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {progress === 100 && (
                <div className="p-4 bg-[var(--vylos-green-dark)]/20 border-t border-[var(--vylos-green-dark)]/30 flex items-center justify-center gap-2 animate-bounce">
                    <Trophy size={16} className="text-[var(--vylos-green)]" />
                    <span className="text-[10px] font-black text-[var(--vylos-green)] uppercase tracking-[0.2em]">Mastery Achieved</span>
                </div>
            )}
        </div>
    );
}
