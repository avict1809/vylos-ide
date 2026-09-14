'use client';

import { AlertTriangle, BookOpen, Cpu, FolderOpen, Puzzle, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { useExtensionStore, useExtensionSettings, ExtensionInfo, EXTENSION_DAILY_AI_LIMIT } from '@/app/lib/stores/extension-store';
import type { Permission } from '@/app/lib/extensions/validate';
import { reloadExtensions } from '@/app/lib/extensions/loader';
import { useCourseStore } from '@/app/lib/stores/course-store';
import { useFileStore } from '@/app/lib/useFileStore';
import { cn } from '@/app/lib/utils';

const GUIDE_URL = 'https://github.com/avict1809/vylos-ide/blob/main/docs/EXTENSIONS.md';

const STATUS: Record<ExtensionInfo['status'], { label: string; className: string }> = {
    active: { label: 'Active', className: 'text-[var(--vylos-green)] border-[var(--vylos-green-dark)] bg-[var(--vylos-green-dark)]/10' },
    error: { label: 'Not loaded', className: 'text-red-400 border-red-900/60 bg-red-950/30' },
    skipped: { label: 'Skipped', className: 'text-gray-500 border-[#27272a] bg-[#18181b]' },
    'needs-approval': { label: 'Needs approval', className: 'text-amber-300 border-amber-900/60 bg-amber-950/30' },
};

/** What each permission lets an extension do, in the learner's terms. */
const PERMISSION_TEXT: Record<Permission, string> = {
    'workspace.read': 'Read the files in your open project, including the one you are editing',
    'workspace.write': 'Create and change files in your open project',
    'terminal.run': 'Run commands in the terminal. This gives it the same access to your computer as you have.',
    'ai.generate': `Use Vylos AI (up to ${EXTENSION_DAILY_AI_LIMIT} requests a day, counted toward your own limit)`,
    'learner.read': "See which lessons you've completed",
};

export default function ExtensionsView() {
    const { dir, extensions, loading, error } = useExtensionStore();
    const available = typeof window !== 'undefined' && !!window.electron?.extensions;

    return (
        <div className="h-full flex flex-col bg-[#000000]">
            <div className="p-6 border-b border-[#1a1a1a] bg-gradient-to-br from-[#050505] to-black">
                <div className="flex items-center gap-2 mb-1">
                    <Puzzle size={14} className="text-[var(--vylos-green)]" />
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Extensions</span>
                </div>
                <h2 className="text-lg font-black text-white italic uppercase tracking-tighter">
                    Installed <span className="text-[var(--vylos-green)]">Extensions</span>
                </h2>
                {available && (
                    <>
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => void window.electron.extensions.openFolder()}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#09090b] border border-[#27272a] hover:border-[var(--vylos-green-dark)] hover:text-[var(--vylos-green)] rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-400 transition-colors"
                            >
                                <FolderOpen size={12} /> Open Folder
                            </button>
                            <button
                                onClick={() => void reloadExtensions()}
                                disabled={loading}
                                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#09090b] border border-[#27272a] hover:border-[var(--vylos-green-dark)] hover:text-[var(--vylos-green)] rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-400 transition-colors disabled:opacity-50"
                                title="Read the extensions folder again"
                            >
                                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Reload
                            </button>
                        </div>
                        {dir && (
                            <p className="mt-2 text-[10px] font-mono text-gray-600 truncate" title={dir}>{dir}</p>
                        )}
                    </>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!available ? (
                    <p className="text-[11px] text-gray-500 leading-relaxed">Extensions are available in the Vylos desktop app.</p>
                ) : error ? (
                    <p className="text-[11px] text-red-400 leading-relaxed">{error}</p>
                ) : extensions.length === 0 ? (
                    <EmptyState loading={loading} />
                ) : (
                    extensions.map((ext) => <ExtensionCard key={ext.folder} ext={ext} />)
                )}
            </div>
        </div>
    );
}

function EmptyState({ loading }: { loading: boolean }) {
    if (loading) return <p className="text-[11px] text-gray-600">Reading the extensions folder…</p>;
    return (
        <div className="text-center px-2 py-8">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#09090b] border border-[#1a1a1a] flex items-center justify-center">
                <Puzzle size={16} className="text-gray-600" />
            </div>
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest">No extensions installed</h3>
            <p className="text-[11px] text-gray-500 leading-relaxed mt-2">
                Put an extension&apos;s folder into the extensions folder and it appears here right away.
            </p>
            <a
                href={GUIDE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-4 text-[10px] font-bold uppercase tracking-widest text-[var(--vylos-green)] hover:underline"
            >
                <BookOpen size={11} /> How to make an extension
            </a>
        </div>
    );
}

function ExtensionCard({ ext }: { ext: ExtensionInfo }) {
    const status = STATUS[ext.status];
    const openCourse = (id: string) => {
        useCourseStore.getState().setActiveCourse(id);
        useFileStore.getState().setActiveView('learning');
    };

    return (
        <div className="p-4 bg-[#09090b] border border-[#27272a] rounded-xl">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="text-xs font-bold text-gray-200 truncate" title={ext.path}>
                        {ext.displayName}
                        {ext.version && <span className="ml-1.5 font-mono font-normal text-gray-600">v{ext.version}</span>}
                    </h3>
                    <p className="text-[10px] text-gray-500 truncate">
                        {ext.publisher ? `by ${ext.publisher}` : ext.folder}
                    </p>
                </div>
                <span className={cn('shrink-0 px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase tracking-wider', status.className)}>
                    {status.label}
                </span>
            </div>

            {ext.description && <p className="text-[11px] text-gray-400 leading-relaxed mt-2">{ext.description}</p>}

            {ext.runsCode && ext.id && (ext.status === 'needs-approval'
                ? <Approval ext={ext} />
                : ext.status === 'active' && <CodeStatus ext={ext} />)}

            {ext.courses.length > 0 && (
                <div className="mt-3 space-y-1">
                    {ext.courses.map((course) => (
                        <button
                            key={course.id}
                            onClick={() => openCourse(course.id)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[11px] text-gray-300 hover:bg-[#18181b] hover:text-[var(--vylos-green)] transition-colors"
                        >
                            <BookOpen size={11} className="shrink-0 text-gray-600" />
                            <span className="truncate">{course.title}</span>
                        </button>
                    ))}
                </div>
            )}

            <Problems icon={XCircle} className="text-red-400" items={ext.errors} />
            <Problems icon={AlertTriangle} className="text-amber-400/90" items={ext.warnings} />
            {ext.id && <Output extId={ext.id} />}
        </div>
    );
}

function PermissionList({ permissions }: { permissions: Permission[] }) {
    if (permissions.length === 0) {
        return <p className="text-[11px] text-gray-400 leading-relaxed">It asks for no permissions: it can only add what it registers, such as tutor tools.</p>;
    }
    return (
        <ul className="space-y-1">
            {permissions.map((p) => (
                <li key={p} className={cn('flex items-start gap-1.5 text-[11px] leading-relaxed', p === 'terminal.run' ? 'text-amber-200' : 'text-gray-300')}>
                    <span className="mt-[6px] w-1 h-1 rounded-full bg-current shrink-0" />
                    {PERMISSION_TEXT[p]}
                </li>
            ))}
        </ul>
    );
}

function Approval({ ext }: { ext: ExtensionInfo }) {
    const allow = () => {
        useExtensionSettings.getState().approve(ext.id!, ext.permissions);
        void reloadExtensions();
    };
    return (
        <div className="mt-3 p-3 rounded-lg border border-amber-900/50 bg-amber-950/20 space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
                <Cpu size={12} /> Runs code from {ext.publisher}
            </p>
            {ext.newPermissions.length > 0 ? (
                <>
                    <p className="text-[11px] text-gray-400 leading-relaxed">This version asks for more than you allowed before:</p>
                    <PermissionList permissions={ext.newPermissions} />
                </>
            ) : (
                <>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                        It runs in a sandbox with no internet access. If you allow it, it can:
                    </p>
                    <PermissionList permissions={ext.permissions} />
                </>
            )}
            <button
                onClick={allow}
                className="w-full mt-1 py-2 rounded-lg bg-amber-300 hover:bg-amber-200 text-black text-[10px] font-bold uppercase tracking-widest transition-colors"
            >
                Allow and enable
            </button>
        </div>
    );
}

function CodeStatus({ ext }: { ext: ExtensionInfo }) {
    const runtime = useExtensionStore((s) => s.runtime[ext.id!]);
    const disable = () => {
        useExtensionSettings.getState().revoke(ext.id!);
        void reloadExtensions();
    };
    const state = runtime?.state ?? 'starting';
    return (
        <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <span className={cn(
                    'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest',
                    state === 'running' ? 'text-[var(--vylos-green)]' : state === 'failed' ? 'text-red-400' : 'text-gray-500'
                )}>
                    <Cpu size={11} /> {state === 'running' ? 'Code running' : state === 'failed' ? 'Code stopped' : 'Starting…'}
                </span>
                <button onClick={disable} className="text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-red-400 transition-colors">
                    Disable
                </button>
            </div>
            {runtime?.error && <p className="text-[10px] font-mono text-red-400 leading-relaxed break-words">{runtime.error}</p>}
            {runtime && runtime.contributions.length > 0 && (
                <ul className="space-y-0.5">
                    {runtime.contributions.map((c) => (
                        <li key={c.reg} className="text-[11px] text-gray-300 truncate">· {c.label}</li>
                    ))}
                </ul>
            )}
            <details className="text-[10px] text-gray-500">
                <summary className="cursor-pointer select-none flex items-center gap-1 hover:text-gray-300">
                    <ShieldCheck size={11} /> Allowed: {ext.permissions.length ? ext.permissions.join(', ') : 'no extra permissions'}
                </summary>
                <div className="mt-2"><PermissionList permissions={ext.permissions} /></div>
            </details>
        </div>
    );
}

function Output({ extId }: { extId: string }) {
    const lines = useExtensionStore((s) => s.logs[extId]);
    if (!lines?.length) return null;
    return (
        <details className="mt-3 border-t border-[#1a1a1a] pt-2">
            <summary className="cursor-pointer select-none text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-300">
                Output ({lines.length})
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto text-[10px] leading-relaxed font-mono whitespace-pre-wrap break-words">
                {lines.map((l, i) => (
                    <div key={i} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-400/90' : 'text-gray-400'}>{l.text}</div>
                ))}
            </pre>
        </details>
    );
}

function Problems({ icon: Icon, className, items }: { icon: typeof XCircle; className: string; items: string[] }) {
    if (items.length === 0) return null;
    return (
        <ul className="mt-3 space-y-1.5 border-t border-[#1a1a1a] pt-3">
            {items.map((item, i) => (
                <li key={i} className={cn('flex items-start gap-1.5 text-[10px] leading-relaxed font-mono break-words', className)}>
                    <Icon size={11} className="shrink-0 mt-[2px]" />
                    <span className="min-w-0">{item}</span>
                </li>
            ))}
        </ul>
    );
}
