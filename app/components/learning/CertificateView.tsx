'use client';

import { useEffect, useState } from 'react';
import { Award, CheckCircle2, Circle, ExternalLink, Loader2 } from 'lucide-react';
import type { Course } from '@/app/lib/learning/types';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { api, certificateUrl, learningAi, type CertificateReadiness } from '@/app/lib/learning/progress-api';
import { BackButton, Card, CardTitle, PrimaryButton, pct } from './progress-ui';

/** Earning a certificate: what it takes, where you stand, and claiming it once everything is met. */
export default function CertificateView({ course, onBack }: { course: Course; onBack: () => void }) {
    const user = useAuthStore((s) => s.user);
    const [readiness, setReadiness] = useState<CertificateReadiness | null>(null);
    const [certificate, setCertificate] = useState<{ id: string; issued_at: string } | null>(null);
    const [name, setName] = useState(user?.name ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!user) return;
        Promise.all([api.certificateReadiness(course.id), api.myCertificate(user.id, course.id)])
            .then(([r, c]) => {
                setReadiness(r);
                setCertificate(c);
            })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setLoaded(true));
    }, [user, course.id]);

    const claim = async () => {
        setBusy(true);
        setError(null);
        const res = await learningAi.issueCertificate(course.id, name);
        setBusy(false);
        if ('error' in res) return setError(res.error);
        if (res.data.certificate_id) {
            setCertificate({ id: res.data.certificate_id, issued_at: new Date().toISOString() });
        } else {
            setError('Not every requirement is met yet.');
        }
    };

    const rows = readiness && [
        { label: 'Every lesson completed', detail: `${readiness.lessons.done}/${readiness.lessons.total}`, met: readiness.lessons.met },
        { label: 'Every quiz passed', detail: readiness.quizzes.total ? `${readiness.quizzes.passed}/${readiness.quizzes.total}` : 'none in this course', met: readiness.quizzes.met },
        { label: 'Coding challenges solved', detail: `${readiness.challenges.passed}/${readiness.challenges.required}`, met: readiness.challenges.met },
        { label: 'Capstone project passed review', met: readiness.capstone.met },
        {
            label: 'Final assessment passed',
            detail: readiness.assessment.score != null ? `${pct(readiness.assessment.score)} (${pct(readiness.assessment.pass_mark)} needed)` : `${pct(readiness.assessment.pass_mark)} needed`,
            met: readiness.assessment.met,
        },
        { label: 'No unresolved integrity flags', met: readiness.integrity.met },
    ];
    const ready = !!rows && rows.every((r) => r.met);

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <BackButton onClick={onBack}>{course.title}</BackButton>
                <p className="mt-3 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[var(--vylos-green-accent)]">
                    <Award size={10} /> Certificate
                </p>
                <h2 className="mt-1 text-sm font-black text-white leading-snug">{course.title}</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!user && <p className="text-[11px] text-gray-400">Sign in to work toward a certificate.</p>}
                {user && !loaded && <p className="flex items-center gap-2 text-[11px] text-gray-500"><Loader2 size={12} className="animate-spin" /> Checking…</p>}

                {certificate && (
                    <Card className="text-center border-[var(--vylos-green-dark)]/50 py-6">
                        <p className="text-[10px] font-bold tracking-[0.4em] text-[var(--vylos-green)]">VYLOS</p>
                        <p className="mt-3 text-[9px] tracking-[0.3em] text-gray-500 uppercase">Certificate of</p>
                        <p className="mt-1 text-sm font-black text-white uppercase tracking-wide">{course.title}</p>
                        <p className="mt-4 font-mono text-[10px] text-gray-400">{certificate.id}</p>
                        <p className="text-[10px] text-gray-500">
                            Issued {new Date(certificate.issued_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        </p>
                        <a
                            href={certificateUrl(certificate.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-4 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--vylos-green)] hover:underline"
                        >
                            Public verification page <ExternalLink size={10} />
                        </a>
                        <p className="mt-2 text-[9.5px] text-gray-600">Share that link on LinkedIn, GitHub, your portfolio or résumé.</p>
                    </Card>
                )}

                {rows && !certificate && (
                    <Card>
                        <CardTitle>What it takes</CardTitle>
                        <ul className="space-y-1.5">
                            {rows.map((row) => (
                                <li key={row.label} className="flex items-center gap-2 text-[10.5px]">
                                    {row.met ? <CheckCircle2 size={12} className="text-[var(--vylos-green)] shrink-0" /> : <Circle size={12} className="text-gray-600 shrink-0" />}
                                    <span className="flex-1 text-gray-300">{row.label}</span>
                                    {row.detail && <span className="text-[9.5px] font-mono text-gray-500">{row.detail}</span>}
                                </li>
                            ))}
                        </ul>
                        <p className="mt-3 text-[9.5px] text-gray-500 leading-relaxed">
                            Certificates are for demonstrated skill, so watching lessons alone never earns one.
                        </p>
                    </Card>
                )}

                {ready && !certificate && (
                    <Card>
                        <CardTitle>Claim it</CardTitle>
                        <label className="text-[10px] text-gray-400" htmlFor="certificate-name">Name to print on the certificate</label>
                        <input
                            id="certificate-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={80}
                            className="mt-1 w-full px-2.5 py-1.5 bg-black border border-[#27272a] focus:border-[var(--vylos-green)] rounded-lg text-[12px] text-white outline-none"
                        />
                        <PrimaryButton onClick={() => void claim()} disabled={busy || name.trim().length < 2} className="mt-3 w-full">
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <Award size={12} />} Issue my certificate
                        </PrimaryButton>
                    </Card>
                )}

                {error && <p className="text-[10.5px] text-red-300 px-1">{error}</p>}

                <p className="text-[9.5px] text-gray-600 leading-relaxed px-1">
                    Vylos certificates recognise skills demonstrated on Vylos, with a public page anyone can use to verify them.
                    They are not accredited degrees or government qualifications. Project and assessment scores are Acyrx (AI) assessments.
                </p>
            </div>
        </div>
    );
}
