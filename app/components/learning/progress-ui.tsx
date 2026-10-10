'use client';

import type { ReactNode } from 'react';
import { cn } from '@/app/lib/utils';

export const pct = (value: number) => `${Math.round(value * 100)}%`;

/** A thin progress bar; `tone` separates course progress (sky) from mastery (green). */
export function Bar({ value, tone = 'green', className, label }: { value: number; tone?: 'green' | 'sky' | 'amber'; className?: string; label: string }) {
    const clamped = Math.min(1, Math.max(0, value));
    return (
        <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clamped * 100)}
            className={cn('h-1.5 w-full bg-[#18181b] rounded-full overflow-hidden border border-[#27272a]', className)}
        >
            <div
                className={cn(
                    'h-full transition-all duration-700 ease-out',
                    tone === 'green' && 'bg-[var(--vylos-green)]',
                    tone === 'sky' && 'bg-sky-400',
                    tone === 'amber' && 'bg-amber-400'
                )}
                style={{ width: `${clamped * 100}%` }}
            />
        </div>
    );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('rounded-xl border border-[#27272a] bg-[#09090b] p-4', className)}>{children}</div>;
}

export function CardTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-500">
                {icon} {children}
            </h3>
            {right}
        </div>
    );
}

export function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-[var(--vylos-green)] transition-colors"
        >
            ← {children}
        </button>
    );
}

export function PrimaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            className={cn(
                'flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-[10px] uppercase tracking-widest transition-all active:scale-[0.98]',
                className
            )}
        >
            {children}
        </button>
    );
}

export function SecondaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            className={cn(
                'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-[#27272a] hover:border-[#3f3f46] disabled:opacity-50 text-gray-300 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-colors',
                className
            )}
        >
            {children}
        </button>
    );
}

/** Honest labelling for anything Acyrx scored. */
export function AiAssessmentNote({ className }: { className?: string }) {
    return (
        <p className={cn('text-[9px] leading-relaxed text-gray-600', className)}>
            Acyrx assessment: an AI&apos;s opinion to learn from, not an official or objective measurement.
        </p>
    );
}
