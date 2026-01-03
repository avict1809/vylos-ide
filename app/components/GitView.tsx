'use client';

import { useState, useEffect, useCallback } from 'react';
import { GitBranch, Plus, Minus, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { useFileStore } from '@/app/lib/useFileStore';
import { cn } from '@/app/lib/utils';

interface GitFile {
    status: string;
    path: string;
}

export default function GitView() {
    const { projectRoot } = useFileStore();
    const [stagedFiles, setStagedFiles] = useState<GitFile[]>([]);
    const [unstagedFiles, setUnstagedFiles] = useState<GitFile[]>([]);
    const [branchName, setBranchName] = useState<string | null>(null);
    const [commitMessage, setCommitMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [pushing, setPushing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refreshGit = useCallback(async () => {
        if (!projectRoot || !window.electron) return;
        setLoading(true);
        setError(null);
        try {
            const electron = (window as any).electron;
            const { unstaged, staged } = await electron.git.status(projectRoot);
            setUnstagedFiles(unstaged || []);
            setStagedFiles(staged || []);

            const branch = await electron.git.branch(projectRoot);
            setBranchName(branch);
        } catch (err) {
            setError("Failed to load Git status. Is this a Git repository?");
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [projectRoot]);

    useEffect(() => {
        refreshGit();
    }, [refreshGit]);

    const handleStage = async (path: string) => {
        if (!projectRoot) return;
        const success = await (window as any).electron.git.stage(projectRoot, path);
        if (success) refreshGit();
    };

    const handleUnstage = async (path: string) => {
        if (!projectRoot) return;
        const success = await (window as any).electron.git.unstage(projectRoot, path);
        if (success) refreshGit();
    };

    const handleStageAll = async () => {
        if (!projectRoot) return;
        setLoading(true);
        const success = await (window as any).electron.git.stageAll(projectRoot);
        if (success) refreshGit();
        setLoading(false);
    };

    const handleUnstageAll = async () => {
        if (!projectRoot) return;
        setLoading(true);
        const success = await (window as any).electron.git.unstageAll(projectRoot);
        if (success) refreshGit();
        setLoading(false);
    };

    const handleCommit = async () => {
        if (!projectRoot || !commitMessage.trim()) return;
        setLoading(true);
        const success = await (window as any).electron.git.commit(projectRoot, commitMessage);
        if (success) {
            setCommitMessage('');
            refreshGit();
        } else {
            setError("Commit failed. Check staging area.");
        }
        setLoading(false);
    };

    const handlePush = async () => {
        if (!projectRoot) return;
        setPushing(true);
        const success = await (window as any).electron.git.push(projectRoot);
        if (success) {
            // Push successful mock
        } else {
            setError("Push failed.");
        }
        setPushing(false);
    };

    if (!projectRoot) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle size={32} className="text-[var(--vylos-text-secondary)] mb-4" />
                <p className="text-xs text-gray-400">Open a folder to use Source Control.</p>
            </div>
        );
    }

    if (error && unstagedFiles.length === 0 && stagedFiles.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle size={32} className="text-red-500 mb-4" />
                <p className="text-xs text-gray-400 mb-4">{error}</p>
                <button
                    onClick={refreshGit}
                    className="px-3 py-1.5 bg-[var(--vylos-grey-medium)] hover:bg-[var(--vylos-grey-light)] text-[var(--vylos-text-primary)] text-[10px] font-bold rounded uppercase tracking-wider"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-[#000000]">
            <div className="p-4 border-b border-[#1a1a1a] flex items-center justify-between bg-gradient-to-br from-[#050505] to-black">
                <div className="flex items-center gap-2">
                    <GitBranch size={16} className="text-[var(--vylos-green)]" />
                    <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">{branchName || 'main'}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handlePush}
                        title="Push Changes"
                        className={cn(
                            "p-2 hover:bg-[#1a1a1a] rounded-lg transition-all text-gray-500 hover:text-[var(--vylos-green)]",
                            pushing && "animate-pulse"
                        )}
                        disabled={loading || pushing}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10M12 2l-4 4M12 2l4 4M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /></svg>
                    </button>
                    <button
                        onClick={refreshGit}
                        className={cn("p-2 hover:bg-[#1a1a1a] rounded-lg transition-all text-gray-500 hover:text-white", loading && "animate-spin")}
                        disabled={loading || pushing}
                        title="Refresh Status"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            <div className="p-4 bg-black space-y-3">
                <div className="relative group">
                    <textarea
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder="Message (Ctrl+Enter to commit)"
                        className="w-full h-24 bg-[#09090b] border border-[#1a1a1a] rounded-xl p-3 text-[13px] text-white focus:outline-none focus:border-[var(--vylos-green-dark)] resize-none transition-all placeholder:text-gray-600"
                        onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && handleCommit()}
                    />
                    <div className="absolute bottom-3 right-3 opacity-0 group-focus-within:opacity-100 transition-opacity">
                        <span className="text-[9px] text-gray-500 font-mono uppercase">Ctrl+Enter</span>
                    </div>
                </div>
                <button
                    onClick={handleCommit}
                    disabled={!commitMessage.trim() || stagedFiles.length === 0 || loading}
                    className="w-full py-2.5 bg-[#10b981] hover:bg-[#34d399] disabled:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-black text-[11px] font-black rounded-xl transition-all uppercase tracking-widest shadow-lg active:scale-[0.98]"
                >
                    {loading ? 'Processing...' : 'Commit Changes'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Changes Header */}
                <div className="flex items-center justify-between px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] bg-[#050505] border-y border-[#1a1a1a]">
                    <div className="flex items-center gap-2">
                        <span>Changes</span>
                        <span className="px-1.5 py-0.5 bg-[#111] border border-[#222] rounded text-[9px]">{unstagedFiles.length}</span>
                    </div>
                    {unstagedFiles.length > 0 && (
                        <button
                            onClick={handleStageAll}
                            className="px-2 py-1 bg-[var(--vylos-green-dark)]/10 hover:bg-[var(--vylos-green-dark)]/20 border border-[var(--vylos-green-dark)]/30 rounded text-[9px] text-[var(--vylos-green)] font-black transition-all active:scale-95"
                        >
                            STAGE ALL
                        </button>
                    )}
                </div>

                {/* Unstaged Files */}
                <div className="mb-4">
                    {unstagedFiles.length === 0 ? (
                        <div className="px-4 py-8 text-center text-[11px] text-gray-600 italic">No pending changes</div>
                    ) : (
                        unstagedFiles.map((file, i) => (
                            <GitFileItem
                                key={i}
                                file={file}
                                onAction={() => handleStage(file.path)}
                                actionIcon={<Plus size={14} />}
                                actionTitle="Stage Change"
                            />
                        ))
                    )}
                </div>

                {/* Staged Header */}
                <div className="flex items-center justify-between px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] bg-[#050505] border-y border-[#1a1a1a]">
                    <div className="flex items-center gap-2">
                        <span>Staged</span>
                        <span className="px-1.5 py-0.5 bg-[#111] border border-[#222] rounded text-[9px]">{stagedFiles.length}</span>
                    </div>
                    {stagedFiles.length > 0 && (
                        <button
                            onClick={handleUnstageAll}
                            className="px-2 py-1 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 rounded text-[9px] text-gray-500 hover:text-red-500 font-black transition-all"
                        >
                            UNSTAGE ALL
                        </button>
                    )}
                </div>

                {/* Staged Files */}
                <div>
                    {stagedFiles.map((file, i) => (
                        <GitFileItem
                            key={i}
                            file={file}
                            onAction={() => handleUnstage(file.path)}
                            actionIcon={<Minus size={14} />}
                            actionTitle="Unstage Change"
                            isStaged
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function GitFileItem({ file, onAction, actionIcon, actionTitle, isStaged }: { file: GitFile; onAction: () => void; actionIcon: any; actionTitle: string; isStaged?: boolean }) {
    return (
        <div className="group flex items-center justify-between px-4 py-2 hover:bg-[#09090b] transition-colors cursor-default border-b border-white/[0.02]">
            <div className="flex items-center gap-3 overflow-hidden">
                <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center text-[10px] font-black",
                    file.status === 'A' ? "bg-green-500/10 text-green-500" :
                        file.status === 'D' ? "bg-red-500/10 text-red-500" :
                            "bg-yellow-500/10 text-yellow-500"
                )}>
                    {file.status}
                </div>
                <span className="text-[13px] text-gray-400 group-hover:text-gray-200 truncate transition-colors" title={file.path}>
                    {file.path.split(/[\\/]/).pop()}
                    <span className="ml-2 text-[10px] opacity-40 font-normal">
                        {file.path.split(/[\\/]/).slice(0, -1).join('/')}
                    </span>
                </span>
            </div>
            <button
                onClick={onAction}
                title={actionTitle}
                className={cn(
                    "opacity-0 group-hover:opacity-100 p-1.5 hover:bg-black rounded-lg transition-all active:scale-90",
                    isStaged ? "text-red-500/70 hover:text-red-500" : "text-[var(--vylos-green)]"
                )}
            >
                {actionIcon}
            </button>
        </div>
    );
}
