'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from './supabase';
import { webUrl } from '@/electron/site';

// The account's paid plan. Plans are bought on vylos.co through Polar; its
// webhook records them in public.subscriptions, and public.current_plans is
// the one that counts right now (see
// supabase/migrations/20260930000000_subscriptions.sql). No row means Seed.

export type PlanId = 'seed' | 'root' | 'sprout' | 'canopy';

export interface CurrentPlan {
    plan: PlanId;
    billing: 'monthly' | 'yearly' | null;
    /** Polar's status; 'past_due' means a payment failed and Polar is retrying */
    status: string | null;
    /** When it renews, or ends if cancelled */
    periodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    /** This month's Vylos AI credits (public.my_credits), or null on Seed */
    credits: { allowance: number; used: number; resetsAt: Date; voiceOnly: boolean } | null;
}

export const PLAN_NAMES: Record<PlanId, string> = {
    seed: 'Seed',
    root: 'Root',
    sprout: 'Sprout',
    canopy: 'Canopy',
};

const SEED: CurrentPlan = { plan: 'seed', billing: null, status: null, periodEnd: null, cancelAtPeriodEnd: false, credits: null };

async function fetchCredits(): Promise<CurrentPlan['credits']> {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('my_credits');
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) return null;
    return {
        // Stored in millicredits
        allowance: Number(row.allowance_milli) / 1000,
        used: Number(row.used_milli) / 1000,
        resetsAt: new Date(row.resets_at),
        voiceOnly: !!row.voice_only,
    };
}

export async function fetchCurrentPlan(userId: string): Promise<CurrentPlan> {
    const supabase = getSupabase();
    if (!supabase) return SEED;
    const [{ data, error }, credits] = await Promise.all([
        supabase
            .from('current_plans')
            .select('plan, billing, status, current_period_end, cancel_at_period_end')
            .eq('user_id', userId)
            .maybeSingle(),
        fetchCredits(),
    ]);
    // Before the migration runs the view doesn't exist; treat that as Seed
    if (error || !data) return SEED;
    return {
        plan: data.plan as PlanId,
        billing: data.billing,
        status: data.status,
        periodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
        cancelAtPeriodEnd: !!data.cancel_at_period_end,
        credits,
    };
}

/**
 * The signed-in account's plan. Re-checked whenever the window regains focus,
 * which is when someone comes back from paying or managing it in the browser.
 */
export function useCurrentPlan(userId: string | null | undefined) {
    const [plan, setPlan] = useState<CurrentPlan | null>(null);

    useEffect(() => {
        if (!userId) return;
        let active = true;
        const load = () => void fetchCurrentPlan(userId).then((p) => { if (active) setPlan(p); });
        load();
        window.addEventListener('focus', load);
        return () => {
            active = false;
            window.removeEventListener('focus', load);
        };
    }, [userId]);

    return plan;
}

// --- Buying and managing a plan -------------------------------------------
// The app calls vylos.co's billing API with its own session, so nobody has to
// sign in again in the browser: the API answers with a Polar page (checkout or
// customer portal), which opens in the system browser. Prices and credits are
// shown here too; keep them in step with vylos-web lib/plans.ts.

export type Billing = 'monthly' | 'yearly';
export type PaidPlanId = Exclude<PlanId, 'seed'>;

export const PAID_PLANS: { id: PaidPlanId; tagline: string; monthly: number; yearly: number; credits: number; voiceOnly?: boolean }[] = [
    { id: 'root', tagline: 'The voice tutor, with text AI on your local models', monthly: 10, yearly: 96, credits: 10, voiceOnly: true },
    { id: 'sprout', tagline: 'Voice, chat lessons, hints and certificates', monthly: 20, yearly: 192, credits: 20 },
    { id: 'canopy', tagline: 'Everything in Sprout, with 2x the usage', monthly: 40, yearly: 384, credits: 40 },
];

type BillingResult = { ok: true } | { ok: false; error: string };

const BILLING_MESSAGES: Record<string, string> = {
    signed_out: 'Your session has expired. Sign out and back in, then try again.',
    offline: "You're offline. Connect to the internet and try again.",
    already_subscribed: 'You already have a plan. Opening your subscription so you can change it…',
    no_customer: "This account doesn't have a plan yet.",
    not_configured: "Plans aren't on sale yet. Everything in Seed is free in the meantime.",
};

async function callBilling(path: string, body?: unknown): Promise<{ url?: string; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { error: 'not_configured' };
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { error: navigator.onLine ? 'signed_out' : 'offline' };
    try {
        const response = await fetch(webUrl(path), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        return (await response.json().catch(() => ({ error: 'failed' }))) as { url?: string; error?: string };
    } catch {
        return { error: navigator.onLine ? 'failed' : 'offline' };
    }
}

/** Opens Polar in the system browser (the main process sends window.open there). */
function openInBrowser(url: string) {
    window.open(url, '_blank', 'noopener');
}

/** Opens Polar's customer portal: change plan, switch billing, card, invoices, cancel. */
export async function openBillingPortal(): Promise<BillingResult> {
    const result = await callBilling('/api/billing/portal');
    if (result.url) {
        openInBrowser(result.url);
        return { ok: true };
    }
    const error = result.error ?? 'failed';
    return { ok: false, error: BILLING_MESSAGES[error] ?? "Couldn't open your subscription. Try again in a moment." };
}

/** Starts a Polar checkout for this account and opens it in the browser. */
export async function startCheckout(plan: PaidPlanId, billing: Billing): Promise<BillingResult> {
    const result = await callBilling('/api/checkout', { plan, billing });
    if (result.url) {
        openInBrowser(result.url);
        return { ok: true };
    }
    // Changing an existing plan happens in the portal, never a second checkout
    if (result.error === 'already_subscribed') return openBillingPortal();
    const error = result.error ?? 'failed';
    return { ok: false, error: BILLING_MESSAGES[error] ?? "Couldn't start the checkout. Try again in a moment." };
}
