import { useState } from 'react';
import { generateRoadmap } from '@/app/lib/ai/roadmap-generator';
import { useRoadmapStore } from '@/app/lib/stores/roadmap-store';
import { Sparkles, GraduationCap, Code2, Rocket } from 'lucide-react';
import { cn } from '@/app/lib/utils';

const SUGGESTIONS = [
    { label: 'Full Stack Web', icon: Globe },
    { label: 'Python for AI', icon: Cpu },
    { label: 'Cloud Architecture', icon: Cloud },
    { label: 'Game Development', icon: Gamepad2 }
];

import { Globe, Cpu, Cloud, Gamepad2 } from 'lucide-react';

export default function RoadmapCreator() {
    const [goal, setGoal] = useState('');
    const [loading, setLoading] = useState(false);
    const setRoadmap = useRoadmapStore((state) => state.setRoadmap);

    const handleCreate = async (inputGoal?: string) => {
        const finalGoal = inputGoal || goal;
        if (!finalGoal) return;
        setLoading(true);
        const roadmap = await generateRoadmap(finalGoal);
        if (roadmap) {
            setRoadmap(roadmap);
        }
        setLoading(false);
    };

    return (
        <div className="h-full flex flex-col items-center justify-center p-8 bg-[var(--vylos-black)] text-center animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-[var(--vylos-green-dark)]/20 rounded-2xl flex items-center justify-center mb-6 border border-[var(--vylos-green-dark)] shadow-[0_0_30px_rgba(0,255,0,0.1)]">
                <GraduationCap size={32} className="text-[var(--vylos-green)]" />
            </div>

            <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter italic">Vylos <span className="text-[var(--vylos-green)]">Academia</span></h1>
            <p className="text-sm text-gray-500 mb-8 max-w-[280px]">Define your ambition. Vylos will architect your personalized mastery path.</p>

            <div className="w-full max-w-sm space-y-4">
                <div className="relative group">
                    <input
                        type="text"
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        placeholder="What do you want to master?"
                        className="w-full px-4 py-4 bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] text-white rounded-xl focus:border-[var(--vylos-green)] outline-none transition-all pr-12 text-sm shadow-2xl"
                        onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
                    />
                    <button
                        onClick={() => handleCreate()}
                        disabled={loading || !goal}
                        className="absolute right-2 top-2 bottom-2 px-3 bg-[var(--vylos-green)] text-black rounded-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-0 disabled:scale-95"
                    >
                        {loading ? <Rocket size={18} className="animate-bounce" /> : <Sparkles size={18} />}
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4">
                    {SUGGESTIONS.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => { setGoal(s.label); handleCreate(s.label); }}
                            className="flex items-center gap-2 p-3 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] rounded-xl text-[11px] text-gray-400 hover:text-white transition-all text-left group"
                        >
                            <s.icon size={14} className="group-hover:text-[var(--vylos-green)]" />
                            <span className="truncate">{s.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {loading && (
                <div className="mt-8 flex flex-col items-center gap-3">
                    <div className="flex gap-1">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-1.5 h-1.5 bg-[var(--vylos-green)] rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                        ))}
                    </div>
                    <span className="text-[10px] text-[var(--vylos-green)] font-bold uppercase tracking-widest">Architecting Roadmap...</span>
                </div>
            )}
        </div>
    );
}
