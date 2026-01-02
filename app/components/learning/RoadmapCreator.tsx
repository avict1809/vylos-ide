'use client';

import { useState } from 'react';
import { generateRoadmap } from '@/app/lib/ai/roadmap-generator';
import { useRoadmapStore } from '@/app/lib/stores/roadmap-store';

export default function RoadmapCreator() {
    const [goal, setGoal] = useState('');
    const [loading, setLoading] = useState(false);
    const setRoadmap = useRoadmapStore((state) => state.setRoadmap);

    const handleCreate = async () => {
        if (!goal) return;
        setLoading(true);
        const roadmap = await generateRoadmap(goal);
        if (roadmap) {
            setRoadmap(roadmap);
        }
        setLoading(false);
    };

    return (
        <div className="p-4 bg-[var(--vylos-grey-dark)] rounded-lg border border-[var(--vylos-grey-border)]">
            <h2 className="text-[var(--vylos-green-accent)] mb-2 font-bold">Start a New Learning Path</h2>
            <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Learn Python for Data Science"
                className="w-full p-2 mb-2 bg-[var(--vylos-black)] border border-[var(--vylos-grey-border)] text-white rounded focus:border-[var(--vylos-green)] outline-none"
            />
            <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full bg-[var(--vylos-green-dark)] hover:bg-[var(--vylos-green)] text-white p-2 rounded transition-colors disabled:opacity-50"
            >
                {loading ? 'Generating Path...' : 'Create Roadmap'}
            </button>
        </div>
    );
}
