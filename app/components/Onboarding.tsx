'use client';

import React, { useState } from 'react';
import { Sparkles, Code, GraduationCap, ArrowRight, CheckCircle2, Layout, Zap, Globe } from 'lucide-react';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { cn } from '@/app/lib/utils';

export default function Onboarding() {
    const [step, setStep] = useState(1);
    const { login, setHasCompletedOnboarding } = useAuthStore();
    const [email, setEmail] = useState('');

    const nextStep = () => {
        if (step < 3) setStep(step + 1);
    };

    const handleComplete = () => {
        if (!email) {
            alert('Please enter your email to sign in.');
            return;
        }
        login(email);
        setHasCompletedOnboarding(true);
    };

    return (
        <div className="fixed inset-0 z-50 bg-[var(--vylos-black)] flex items-center justify-center p-6">
            <div className="max-w-2xl w-full bg-[#0d0d0d] border border-[var(--vylos-grey-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[500px]">

                {/* Visual Side */}
                <div className="md:w-1/2 bg-[var(--vylos-grey-medium)] p-8 flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                        <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-[radial-gradient(circle_at_center,var(--vylos-green)_0%,transparent_70%)]" />
                    </div>

                    <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in duration-700">
                        <img src="/logo.svg" alt="Vylos Logo" className="w-40 h-40 mb-6 drop-shadow-[0_0_15px_rgba(0,255,0,0.3)]" />
                        <h1 className="text-3xl font-black tracking-tighter text-white">VYLOS<span className="text-[var(--vylos-green)]">AI</span></h1>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-bold mt-2">Next Gen Learning IDE</p>
                    </div>

                    <div className="mt-12 w-full space-y-4 relative z-10">
                        <StepIndicator current={step} />
                    </div>
                </div>

                {/* Content Side */}
                <div className="md:w-1/2 p-8 flex flex-col">
                    <div className="flex-1">
                        {step === 1 && (
                            <div className="animate-in slide-in-from-right duration-500">
                                <h2 className="text-2xl font-bold text-white mb-4">Welcome to the future of coding.</h2>
                                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                                    Vylos is more than just an editor. It's an intelligent learning environment designed to help you master programming.
                                </p>
                                <div className="space-y-4">
                                    <FeatureItem
                                        icon={<Sparkles className="text-[var(--vylos-green)]" size={18} />}
                                        title="AI-Powered Context"
                                        desc="AI insights directly in your editor."
                                    />
                                    <FeatureItem
                                        icon={<GraduationCap className="text-[var(--vylos-green)]" size={18} />}
                                        title="Curated Learning"
                                        desc="Personalized roadmaps for every project."
                                    />
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="animate-in slide-in-from-right duration-500">
                                <h2 className="text-2xl font-bold text-white mb-4">Powerful Features.</h2>
                                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                                    Everything you need, built-in. From integrated Git management to advanced terminal capabilities.
                                </p>
                                <div className="space-y-4">
                                    <FeatureItem
                                        icon={<Layout className="text-[var(--vylos-green)]" size={18} />}
                                        title="Sleek Interface"
                                        desc="Zero distractions. Just pure coding flow."
                                    />
                                    <FeatureItem
                                        icon={<Zap className="text-[var(--vylos-green)]" size={18} />}
                                        title="Performance First"
                                        desc="Lightning fast response times for all tools."
                                    />
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="animate-in slide-in-from-right duration-500">
                                <h2 className="text-2xl font-bold text-white mb-2">Ready to start?</h2>
                                <p className="text-sm text-gray-400 mb-8">Sign in with your Vylos account to sync your progress and access premium AI features.</p>

                                <div className="space-y-4">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Email Address</label>
                                        <input
                                            type="email"
                                            placeholder="you@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full bg-black border border-[var(--vylos-grey-border)] rounded-lg px-4 py-3 text-sm focus:border-[var(--vylos-green)] outline-none transition-colors"
                                        />
                                    </div>
                                    <button
                                        onClick={handleComplete}
                                        className="w-full bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] text-black font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 shadow-[0_0_15px_rgba(0,255,0,0.2)]"
                                    >
                                        Sign In & Start Coding <Globe size={18} />
                                    </button>
                                    <p className="text-[10px] text-center text-gray-600">
                                        By signing in, you agree to our Terms of Service.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {step < 3 && (
                        <div className="mt-8 flex justify-end">
                            <button
                                onClick={nextStep}
                                className="flex items-center gap-2 text-sm font-bold text-[var(--vylos-green)] hover:text-[var(--vylos-green-accent)] transition-colors group"
                            >
                                Continue <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function FeatureItem({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="flex items-start gap-4 p-3 bg-black/40 rounded-xl border border-white/5 group hover:border-[var(--vylos-green)]/30 transition-colors">
            <div className="mt-1">{icon}</div>
            <div>
                <h4 className="text-xs font-bold text-gray-200">{title}</h4>
                <p className="text-[11px] text-gray-500">{desc}</p>
            </div>
        </div>
    );
}

function StepIndicator({ current }: { current: number }) {
    return (
        <div className="flex justify-center gap-2">
            {[1, 2, 3].map((s) => (
                <div
                    key={s}
                    className={cn(
                        "h-1 transition-all duration-300 rounded-full",
                        current === s ? "w-8 bg-[var(--vylos-green)]" : "w-4 bg-gray-700"
                    )}
                />
            ))}
        </div>
    );
}
