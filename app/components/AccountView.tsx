'use client';

import React, { useState } from 'react';
import { User, ShieldCheck, CreditCard, LogOut, ExternalLink, Zap, CheckCircle2, WifiOff, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import {
    PAID_PLANS,
    PLAN_NAMES,
    openBillingPortal,
    startCheckout,
    useCurrentPlan,
    type Billing,
    type CurrentPlan,
    type PaidPlanId,
    type PlanId,
} from '@/app/lib/billing';
import { webUrl } from '@/electron/site';

// What each plan gives, in the app's words. The full comparison is on vylos.co/pricing.
const PLAN_BENEFITS: Record<PlanId, string[]> = {
    seed: ['Full IDE and every course', 'AI on your own local models'],
    root: ['Voice tutor', 'Text AI on your own local models'],
    sprout: ['Voice tutor', 'Chat lessons, hints and error help on Vylos AI', 'Verifiable certificates'],
    canopy: ['Everything in Sprout', '2x the Vylos AI usage of Sprout', 'Priority support'],
};

const formatDate = (date: Date) => date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

export default function AccountView() {
    const { user, logout, isOfflineSession } = useAuthStore();
    const current = useCurrentPlan(user?.id);

    if (!user) return null;

    const plan = current?.plan ?? 'seed';
    const paid = plan !== 'seed';

    return (
        <div className="h-full flex flex-col bg-[#000000]">
            <div className="p-6 border-b border-[#1a1a1a] flex items-center justify-between bg-gradient-to-br from-[#050505] to-black">
                <div className="flex items-center gap-2">
                    <User size={14} className="text-[var(--vylos-green)]" />
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Profile Center</span>
                </div>
                <button
                    onClick={() => logout()}
                    className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded transition-colors group relative"
                    title="Logout"
                >
                    <LogOut size={14} />
                    <span className="absolute right-full mr-2 py-0.5 px-1.5 bg-red-500 text-white text-[9px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Sign Out
                    </span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Profile Header */}
                <div className="p-6 flex flex-col items-center border-b border-[var(--vylos-grey-border)]/50">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--vylos-green-dark)] to-[var(--vylos-black)] border-2 border-[var(--vylos-green)] mb-4 flex items-center justify-center shadow-[0_0_20px_rgba(0,255,0,0.1)] overflow-hidden">
                        {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-3xl font-black text-white">{user.name.charAt(0).toUpperCase()}</span>
                        )}
                    </div>
                    <h3 className="text-lg font-bold text-white">{user.name}</h3>
                    <p className="text-xs text-gray-500">{user.email}</p>

                    <div className="mt-4 px-3 py-1 bg-[var(--vylos-green-dark)]/20 border border-[var(--vylos-green-dark)] rounded-full flex items-center gap-2">
                        <ShieldCheck size={12} className="text-[var(--vylos-green)]" />
                        <span className="text-[10px] font-bold text-[var(--vylos-green)] uppercase tracking-wider">
                            {current ? `${PLAN_NAMES[plan]} plan` : 'Checking plan…'}
                        </span>
                    </div>

                    {isOfflineSession && (
                        <p className="mt-3 text-[10px] text-gray-500 flex items-center gap-1.5">
                            <WifiOff size={11} className="text-yellow-500" />
                            Offline — signed in from your saved session
                        </p>
                    )}
                </div>

                {/* Plan */}
                <div className="p-4 space-y-4">
                    {!current ? (
                        <div className="bg-[var(--vylos-grey-medium)]/30 border border-[var(--vylos-grey-border)] rounded-xl p-4">
                            <p className="text-[11px] text-gray-500">Checking your plan…</p>
                        </div>
                    ) : (
                    <div className="bg-[var(--vylos-grey-medium)]/30 border border-[var(--vylos-grey-border)] rounded-xl p-4">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 className="text-xs font-bold text-gray-300">{PLAN_NAMES[plan]}</h4>
                                <p className="text-[10px] text-gray-500">
                                    {!paid
                                        ? 'Free forever'
                                        : current?.cancelAtPeriodEnd && current.periodEnd
                                            ? `Ends on ${formatDate(current.periodEnd)}`
                                            : current?.periodEnd
                                                ? `Billed ${current.billing} · renews ${formatDate(current.periodEnd)}`
                                                : `Billed ${current?.billing ?? 'monthly'}`}
                                </p>
                            </div>
                            <CreditCard size={16} className="text-gray-500" />
                        </div>

                        {current?.status === 'past_due' && (
                            <p className="mb-4 flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2 text-[10px] text-yellow-300">
                                <AlertTriangle size={12} className="mt-px shrink-0" />
                                Your last payment didn&apos;t go through. Update your card to keep {PLAN_NAMES[plan]}.
                            </p>
                        )}

                        {current.credits && <CreditsMeter credits={current.credits} />}

                        <div className="space-y-3">
                            {PLAN_BENEFITS[plan].map((benefit) => <BenefitItem key={benefit} label={benefit} />)}
                        </div>

                        {paid && <ManageButton />}
                    </div>
                    )}
                </div>

                {/* Upgrade: Seed and Root have more to gain */}
                {current && (plan === 'seed' || plan === 'root') && <UpgradePicker current={plan} />}
            </div>

            <div className="p-8 border-t border-[#1a1a1a] bg-black">
                <p className="text-[9px] text-center text-gray-700 uppercase tracking-[0.4em] font-black italic">Vylos AI // Identity v2.1</p>
            </div>
        </div>
    );
}

// A billing action's outcome, shown under its button
type ActionState = { busy: false; message: string | null; ok?: boolean } | { busy: true };

/** Opens Polar's customer portal in the browser, signed in as this account. */
function ManageButton() {
    const [state, setState] = useState<ActionState>({ busy: false, message: null });

    async function open() {
        setState({ busy: true });
        const result = await openBillingPortal();
        setState(result.ok
            ? { busy: false, ok: true, message: 'Opened in your browser. Changes show here when you come back.' }
            : { busy: false, message: result.error });
    }

    return (
        <div className="mt-6">
            <button
                type="button"
                onClick={open}
                disabled={state.busy}
                className="w-full py-2 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-bold text-gray-300 flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            >
                {state.busy ? <Loader2 size={12} className="animate-spin" /> : null}
                {state.busy ? 'Opening…' : 'Manage Subscription'}
                {!state.busy && <ExternalLink size={12} />}
            </button>
            {!state.busy && state.message && (
                <p className={`mt-2 text-[10px] ${state.ok ? 'text-gray-500' : 'text-yellow-300'}`}>{state.message}</p>
            )}
        </div>
    );
}

/** Picks a paid plan and opens its Polar checkout in the browser, already tied to this account. */
function UpgradePicker({ current }: { current: 'seed' | 'root' }) {
    const [billing, setBilling] = useState<Billing>('monthly');
    const [pending, setPending] = useState<PaidPlanId | null>(null);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
    // Root is already a plan: moving up from it happens through the portal
    const choices = PAID_PLANS.filter((p) => p.id !== current && (current === 'seed' || p.id !== 'root'));

    async function choose(id: PaidPlanId) {
        setPending(id);
        setMessage(null);
        const result = await startCheckout(id, billing);
        setPending(null);
        setMessage(result.ok
            ? { ok: true, text: 'Opened in your browser. Your plan updates here as soon as you finish.' }
            : { ok: false, text: result.error });
    }

    return (
        <div className="m-4 p-4 bg-gradient-to-br from-[var(--vylos-green-dark)]/40 to-black rounded-xl border border-[var(--vylos-green)]/30 relative overflow-hidden group">
            <Zap size={40} className="absolute -right-4 -bottom-4 text-[var(--vylos-green)] opacity-10 group-hover:rotate-12 transition-transform" />
            <h4 className="text-xs font-bold text-white mb-1">
                {current === 'seed' ? 'Add the Vylos AI tutor' : 'Get all of Vylos AI'}
            </h4>
            <p className="text-[10px] text-[var(--vylos-green-accent)] mb-3">
                {current === 'seed'
                    ? 'Pick a plan. You pay in your browser; it shows up here straight away.'
                    : 'Sprout adds chat lessons, hints and error help on Vylos AI, and certificates.'}
            </p>

            <div role="radiogroup" aria-label="Billing period" className="mb-3 flex rounded-lg border border-white/10 bg-black/60 p-0.5">
                {(['monthly', 'yearly'] as const).map((option) => (
                    <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={billing === option}
                        onClick={() => setBilling(option)}
                        className={`flex-1 rounded-md py-1 text-[10px] font-bold transition-colors ${billing === option ? 'bg-[var(--vylos-green)] text-black' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        {option === 'monthly' ? 'Monthly' : 'Yearly · save 20%'}
                    </button>
                ))}
            </div>

            <div className="space-y-2 relative">
                {choices.map((p) => {
                    const price = billing === 'yearly' ? p.yearly / 12 : p.monthly;
                    return (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => choose(p.id)}
                            disabled={pending !== null}
                            className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-left transition-colors hover:border-[var(--vylos-green)]/60 disabled:opacity-60"
                        >
                            <span className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-white">{PLAN_NAMES[p.id]}</span>
                                <span className="text-[11px] text-gray-300">
                                    {pending === p.id
                                        ? <Loader2 size={12} className="animate-spin text-[var(--vylos-green)]" />
                                        : <>${Number.isInteger(price) ? price : price.toFixed(2)}<span className="text-gray-500">/mo</span></>}
                                </span>
                            </span>
                            <span className="mt-0.5 block text-[10px] text-gray-500">
                                {p.tagline} · {p.credits} {p.voiceOnly ? 'voice credits' : 'credits'} a month
                                {billing === 'yearly' ? ` · $${p.yearly} a year` : ''}
                            </span>
                        </button>
                    );
                })}
            </div>

            {message && (
                <p className={`mt-3 text-[10px] ${message.ok ? 'text-gray-400' : 'text-yellow-300'}`}>{message.text}</p>
            )}
            <a
                href={webUrl('/pricing')}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[var(--vylos-green)] hover:underline"
            >
                Compare all plans <ExternalLink size={10} />
            </a>
        </div>
    );
}

const formatCredits = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function CreditsMeter({ credits }: { credits: NonNullable<CurrentPlan['credits']> }) {
    const left = Math.max(0, credits.allowance - credits.used);
    const share = credits.allowance > 0 ? Math.min(100, (credits.used / credits.allowance) * 100) : 100;
    return (
        <div className="mb-4 space-y-1.5">
            <div className="flex justify-between items-center text-[11px]">
                <span className="text-gray-400">{credits.voiceOnly ? 'Voice credits left' : 'Credits left'}</span>
                <span className="text-white font-mono">{formatCredits(left)} / {formatCredits(credits.allowance)}</span>
            </div>
            <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${share >= 90 ? 'bg-yellow-400' : 'bg-[var(--vylos-green)]'}`} style={{ width: `${100 - share}%` }} />
            </div>
            <p className="text-[10px] text-gray-500">Renew {formatDate(credits.resetsAt)}</p>
        </div>
    );
}

function BenefitItem({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2">
            <CheckCircle2 size={12} className="text-[var(--vylos-green)]" />
            <span className="text-[11px] text-gray-400">{label}</span>
        </div>
    );
}
