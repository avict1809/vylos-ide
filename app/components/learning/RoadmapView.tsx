'use client';

import { useRoadmapStore } from '@/app/lib/stores/roadmap-store';
import { CheckCircle, Circle } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import RoadmapCreator from './RoadmapCreator';

export default function RoadmapView() {
    const { currentRoadmap, completeMilestone } = useRoadmapStore();

    if (!currentRoadmap) {
        return <RoadmapCreator />;
    }

    return (
        <div className="h-full overflow-y-auto p-4">
            <h2 className="text-xl font-bold text-[var(--vylos-green)] mb-1">{currentRoadmap.goal}</h2>
            <p className="text-sm text-[var(--vylos-text-secondary)] mb-4">Learning Path</p>

            <div className="space-y-4">
                {currentRoadmap.milestones.map((milestone, index) => (
                    <div key={milestone.id} className="relative pl-6 border-l-2 border-[var(--vylos-grey-border)]">
                        <div
                            className={cn(
                                "absolute -left-[9px] top-0 bg-[var(--vylos-black)] rounded-full",
                                milestone.completed ? "text-[var(--vylos-green)]" : "text-[var(--vylos-grey-light)]"
                            )}
                        >
                            {milestone.completed ? <CheckCircle size={16} /> : <Circle size={16} />}
                        </div>

                        <div className="bg-[var(--vylos-grey-medium)] p-3 rounded-md border border-[var(--vylos-grey-border)]">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-[var(--vylos-text-primary)]">{milestone.title}</h3>
                                <button
                                    onClick={() => completeMilestone(milestone.id)}
                                    className="text-xs text-[var(--vylos-green-accent)] hover:underline"
                                >
                                    {milestone.completed ? 'Completed' : 'Mark as Done'}
                                </button>
                            </div>
                            <p className="text-xs text-[var(--vylos-text-secondary)] mt-1">{milestone.description}</p>

                            {milestone.tasks.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {milestone.tasks.map((task, i) => (
                                        <li key={i} className="text-xs text-[var(--vylos-text-secondary)] flex items-center">
                                            <span className="w-1 h-1 bg-[var(--vylos-green-dark)] rounded-full mr-2"></span>
                                            {task}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
