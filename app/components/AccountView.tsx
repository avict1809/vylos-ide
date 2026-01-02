'use client';

import React from 'react';
import { User, ShieldCheck, CreditCard, LogOut, ExternalLink, Zap, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { cn } from '@/app/lib/utils';

export default function AccountView() {
    const { user, logout } = useAuthStore();

    if (!user) return null;

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)] text-[var(--vylos-text-primary)]">
            <div className="p-4 border-b border-[var(--vylos-grey-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <User size={16} className="text-[var(--vylos-green)]" />
                    <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--vylos-text-secondary)]">Account</h2>
                </div>
                <button
                    onClick={() => logout()}
                    className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded transition-colors"
                >
                    <LogOut size={14} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Profile Header */}
                <div className="p-6 flex flex-col items-center border-b border-[var(--vylos-grey-border)]/50">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--vylos-green-dark)] to-[var(--vylos-black)] border-2 border-[var(--vylos-green)] mb-4 flex items-center justify-center shadow-[0_0_20px_rgba(0,255,0,0.1)]">
                        <span className="text-3xl font-black text-white">{user.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white">{user.name}</h3>
                    <p className="text-xs text-gray-500">{user.email}</p>

                    <div className="mt-4 px-3 py-1 bg-[var(--vylos-green-dark)]/20 border border-[var(--vylos-green-dark)] rounded-full flex items-center gap-2">
                        <ShieldCheck size={12} className="text-[var(--vylos-green)]" />
                        <span className="text-[10px] font-bold text-[var(--vylos-green)] uppercase tracking-wider">{user.subscription} Edition</span>
                    </div>
                </div>

                {/* Subscription Details */}
                <div className="p-4 space-y-4">
                    <div className="bg-[var(--vylos-grey-medium)]/30 border border-[var(--vylos-grey-border)] rounded-xl p-4">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 className="text-xs font-bold text-gray-300">Active Subscription</h4>
                                <p className="text-[10px] text-gray-500">Your current plan and features</p>
                            </div>
                            <CreditCard size={16} className="text-gray-500" />
                        </div>

                        <div className="space-y-3">
                            <BenefitItem label="Unlimited AI Code Generation" />
                            <BenefitItem label="Voice Tutoring Access" />
                            <BenefitItem label="Custom Learning Roadmaps" />
                            <BenefitItem label="Cloud Sync (Enabled)" />
                        </div>

                        <button className="w-full mt-6 py-2 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-bold text-gray-300 flex items-center justify-center gap-2 transition-all">
                            Manage Subscription <ExternalLink size={12} />
                        </button>
                    </div>

                    <div className="p-4 space-y-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Usage Statistics</h4>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-400">AI Queries this month</span>
                            <span className="text-white font-mono">1,242 / 5,000</span>
                        </div>
                        <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--vylos-green)] w-[25%]" />
                        </div>
                    </div>
                </div>

                {/* Pro Upsell (if free, but we mocked enterprise) */}
                {user.subscription !== 'enterprise' && (
                    <div className="m-4 p-4 bg-gradient-to-br from-[var(--vylos-green-dark)]/40 to-black rounded-xl border border-[var(--vylos-green)]/30 relative overflow-hidden group">
                        <Zap size={40} className="absolute -right-4 -bottom-4 text-[var(--vylos-green)] opacity-10 group-hover:rotate-12 transition-transform" />
                        <h4 className="text-xs font-bold text-white mb-1">Upgrade to Enterprise</h4>
                        <p className="text-[10px] text-[var(--vylos-green-accent)] mb-3">Get advanced team features and priority support.</p>
                        <button className="w-full py-2 bg-[var(--vylos-green)] text-black text-[11px] font-black uppercase tracking-wider rounded-lg shadow-lg transform active:scale-95 transition-all">
                            View Plans
                        </button>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-[var(--vylos-grey-border)]/50 bg-[#0d0d0d]">
                <p className="text-[9px] text-center text-gray-600 uppercase tracking-widest font-medium">Vylos Account v1.0.0-stable</p>
            </div>
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
