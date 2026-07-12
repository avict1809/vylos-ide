'use client';

import { useState } from 'react';
import { GraduationCap, Search, Sparkles, ChevronRight, Clock, Layers, Target, Code2, Boxes } from 'lucide-react';
import { LANGUAGE_COURSES, FRAMEWORK_COURSES } from '@/app/lib/learning/curricula';
import { Course, courseProgress, totalLessons } from '@/app/lib/learning/types';
import { useCourseStore } from '@/app/lib/stores/course-store';
import { useRoadmapStore } from '@/app/lib/stores/roadmap-store';
import { cn } from '@/app/lib/utils';

interface CourseCatalogProps {
    onCustomPath?: () => void;
    onResumeRoadmap?: () => void;
    onOpenCourse?: (id: string) => void;
}

export default function CourseCatalog({ onCustomPath, onResumeRoadmap, onOpenCourse }: CourseCatalogProps) {
    const [query, setQuery] = useState('');
    const { completedLessons, setActiveCourse } = useCourseStore();
    const { currentRoadmap } = useRoadmapStore();
    const openCourse = onOpenCourse ?? setActiveCourse;

    const matches = (course: Course) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
            course.title.toLowerCase().includes(q) ||
            course.id.toLowerCase().includes(q) ||
            course.tagline.toLowerCase().includes(q) ||
            (course.stack ?? '').toLowerCase().includes(q)
        );
    };

    const languages = LANGUAGE_COURSES.filter(matches);
    const frameworks = FRAMEWORK_COURSES.filter(matches);

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            {/* Header */}
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-9 h-9 bg-[var(--vylos-green-dark)]/20 rounded-xl flex items-center justify-center border border-[var(--vylos-green-dark)] shrink-0">
                        <GraduationCap size={18} className="text-[var(--vylos-green)]" />
                    </div>
                    <div>
                        <h1 className="text-sm font-black text-white uppercase tracking-tighter italic leading-none">
                            Vylos <span className="text-[var(--vylos-green)]">Academia</span>
                        </h1>
                        <p className="text-[10px] text-gray-500 mt-1">Structured mastery paths, module by module.</p>
                    </div>
                </div>

                {/* Search */}
                <div className="relative mt-4">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search languages & frameworks..."
                        className="w-full pl-8 pr-3 py-2 bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] focus:border-[var(--vylos-green)] text-white text-xs rounded-lg outline-none transition-all"
                    />
                </div>
            </div>

            {/* Course list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Resume AI roadmap card */}
                {currentRoadmap && onResumeRoadmap && (
                    <button
                        onClick={onResumeRoadmap}
                        className="w-full flex items-center gap-3 p-4 bg-[var(--vylos-green-dark)]/10 border border-[var(--vylos-green-dark)]/40 hover:border-[var(--vylos-green)] rounded-xl text-left transition-all group"
                    >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--vylos-green-dark)]/20 border border-[var(--vylos-green-dark)] shrink-0">
                            <Target size={16} className="text-[var(--vylos-green)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--vylos-green)]">Custom Path in progress</div>
                            <div className="text-xs font-bold text-white truncate mt-0.5">{currentRoadmap.goal}</div>
                        </div>
                        <ChevronRight size={14} className="text-gray-600 group-hover:text-[var(--vylos-green)] group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                )}

                {languages.length > 0 && (
                    <SectionHeader icon={Code2} label="Languages" count={languages.length} />
                )}
                {languages.map((course) => (
                    <CourseCard
                        key={course.id}
                        course={course}
                        completed={completedLessons[course.id]}
                        onOpen={() => openCourse(course.id)}
                    />
                ))}

                {frameworks.length > 0 && (
                    <SectionHeader icon={Boxes} label="Frameworks & Platforms" count={frameworks.length} />
                )}
                {frameworks.map((course) => (
                    <CourseCard
                        key={course.id}
                        course={course}
                        completed={completedLessons[course.id]}
                        onOpen={() => openCourse(course.id)}
                    />
                ))}

                {languages.length === 0 && frameworks.length === 0 && (
                    <div className="text-center py-10 text-xs text-gray-600">No paths match “{query}”.</div>
                )}

                {/* Custom AI path card */}
                {onCustomPath && !currentRoadmap && (
                    <button
                        onClick={onCustomPath}
                        className={cn(
                            'w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all group',
                            'bg-[#18181b]/40 border border-dashed border-[#3f3f46] hover:border-[var(--vylos-green)]'
                        )}
                    >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#18181b] border border-[#27272a] shrink-0">
                            <Sparkles size={15} className="text-gray-500 group-hover:text-[var(--vylos-green)] transition-colors" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors">Custom Path</h3>
                            <p className="text-[10px] text-gray-500 mt-0.5">Something else in mind? Let Vylos architect a path for any goal.</p>
                        </div>
                        <ChevronRight size={13} className="text-gray-700 group-hover:text-[var(--vylos-green)] transition-colors shrink-0" />
                    </button>
                )}
            </div>
        </div>
    );
}

function SectionHeader({ icon: Icon, label, count }: { icon: any; label: string; count: number }) {
    return (
        <div className="flex items-center gap-2 pt-3 pb-1 first:pt-0">
            <Icon size={11} className="text-[var(--vylos-green)]" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">{label}</span>
            <span className="text-[9px] font-mono text-gray-700">{count}</span>
            <div className="flex-1 h-px bg-[#1a1a1a]" />
        </div>
    );
}

function CourseCard({ course, completed, onOpen }: { course: Course; completed: string[] | undefined; onOpen: () => void }) {
    const progress = courseProgress(course, completed);
    const started = progress.done > 0;

    return (
        <button
            onClick={onOpen}
            className="w-full p-4 bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] rounded-xl text-left transition-all group"
        >
            <div className="flex items-start gap-3">
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 border"
                    style={{
                        backgroundColor: `${course.accent}1f`,
                        borderColor: `${course.accent}40`,
                        color: course.accent,
                    }}
                >
                    {course.badge}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <h3 className="text-xs font-bold text-gray-200 group-hover:text-white truncate transition-colors">
                                {course.title}
                            </h3>
                            {course.stack && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-[#18181b] border border-[#27272a] text-gray-500">
                                    {course.stack}
                                </span>
                            )}
                        </div>
                        <ChevronRight size={13} className="text-gray-700 group-hover:text-[var(--vylos-green)] group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed mt-0.5 line-clamp-2">{course.tagline}</p>
                    <div className="flex items-center gap-3 mt-2 text-[9px] text-gray-600 font-medium uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                            <Layers size={9} /> {course.modules.length} modules
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock size={9} /> ~{course.hours}h
                        </span>
                        <span className="truncate">{course.level}</span>
                    </div>
                </div>
            </div>

            {started ? (
                <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-[#18181b] rounded-full overflow-hidden border border-[#27272a]">
                        <div
                            className="h-full bg-[var(--vylos-green)] transition-all duration-500"
                            style={{ width: `${progress.percent}%` }}
                        />
                    </div>
                    <span className="text-[9px] font-mono text-[var(--vylos-green)] shrink-0">
                        {progress.percent === 100 ? 'Completed' : `${progress.percent}%`}
                    </span>
                </div>
            ) : (
                <div className="mt-3 text-[9px] text-gray-600 font-bold uppercase tracking-widest">
                    {totalLessons(course)} lessons
                </div>
            )}
        </button>
    );
}
