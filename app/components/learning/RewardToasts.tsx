'use client';

import { Flame, ShieldAlert, Sparkles, Trophy, X } from 'lucide-react';
import { useProgressStore } from '@/app/lib/stores/progress-store';
import { cn } from '@/app/lib/utils';

const ICONS = { xp: Sparkles, achievement: Trophy, goal: Flame, flag: ShieldAlert };

/** Small, brief notices for XP, achievements and the daily goal. Quiet by design: learning stays the focus. */
export default function RewardToasts() {
    const notices = useProgressStore((s) => s.notices);
    const dismiss = useProgressStore((s) => s.dismiss);
    if (notices.length === 0) return null;

    return (
        <div className="fixed bottom-10 right-4 z-[60] flex flex-col items-end gap-2 pointer-events-none" aria-live="polite">
            {notices.map((notice) => {
                const Icon = ICONS[notice.kind];
                return (
                    <div
                        key={notice.id}
                        className={cn(
                            'pointer-events-auto flex items-center gap-2 max-w-xs rounded-lg border px-3 py-2 text-[11px] shadow-lg animate-in slide-in-from-right-4 fade-in duration-300',
                            notice.kind === 'flag'
                                ? 'border-amber-500/30 bg-[#1a1407] text-amber-200'
                                : 'border-[var(--vylos-green-dark)]/50 bg-[#07130b] text-gray-100'
                        )}
                    >
                        <Icon size={13} className={notice.kind === 'flag' ? 'text-amber-300' : 'text-[var(--vylos-green)]'} />
                        <span className="flex-1">{notice.text}</span>
                        <button onClick={() => dismiss(notice.id)} className="text-gray-500 hover:text-gray-200" aria-label="Dismiss">
                            <X size={11} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
