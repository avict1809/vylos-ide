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
    const [changedFiles, setChangedFiles] = useState<GitFile[]>([]);
    const [branchName, setBranchName] = useState<string | null>(null);
    const [commitMessage, setCommitMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refreshGit = useCallback(async () => {
        if (!projectRoot || !window.electron) return;
        setLoading(true);
        setError(null);
        try {
            const electron = (window as any).electron;
            const status = await electron.git.status(projectRoot);
            setChangedFiles(status);
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

    if (!projectRoot) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle size={32} className="text-[var(--vylos-text-secondary)] mb-4" />
                <p className="text-xs text-gray-400">Open a folder to use Source Control.</p>
            </div>
        );
    }

    if (error && changedFiles.length === 0) {
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

    const staged = changedFiles.filter(f => !['??', ' M', ' D'].includes(f.status));
    const unstaged = changedFiles.filter(f => ['??', ' M', ' D'].includes(f.status));

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-grey-dark)]">
            <div className="p-3 border-b border-[var(--vylos-grey-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <GitBranch size={16} className="text-[var(--vylos-green)]" />
                    <span className="text-xs font-bold text-white uppercase tracking-widest">{branchName || 'No Branch'}</span>
                </div>
                <button
                    onClick={refreshGit}
                    className={cn("p-1.5 hover:bg-[var(--vylos-grey-medium)] rounded transition-colors text-gray-400 hover:text-white", loading && "animate-spin")}
                    disabled={loading}
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            <div className="p-3 bg-[var(--vylos-grey-dark)] border-b border-[var(--vylos-grey-border)]">
                <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Commit message..."
                    className="w-full h-20 bg-[var(--vylos-black)] border border-[var(--vylos-grey-border)] rounded p-2 text-xs text-white focus:outline-none focus:border-[var(--vylos-green)] resize-none"
                />
                <button
                    onClick={handleCommit}
                    disabled={!commitMessage.trim() || staged.length === 0 || loading}
                    className="w-full mt-2 py-2 bg-[var(--vylos-green-dark)] hover:bg-[var(--vylos-green)] disabled:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--vylos-black)] text-[10px] font-bold rounded transition-colors uppercase tracking-widest"
                >
                    {loading ? 'Committing...' : 'Commit'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="px-3 py-2 text-[10px] font-bold text-[var(--vylos-text-secondary)] uppercase tracking-widest opacity-50 bg-[var(--vylos-grey-medium)]/30">
                    Changes ({unstaged.length})
                </div>
                {unstaged.map((file, i) => (
                    <div key={i} className="group flex items-center justify-between px-3 py-1.5 hover:bg-[var(--vylos-grey-medium)] transition-colors cursor-default">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <span className={cn(
                                "text-[10px] font-bold w-4",
                                file.status === '??' ? "text-green-500" : "text-yellow-500"
                            )}>
                                {file.status === '??' ? 'U' : file.status.trim()}
                            </span>
                            <span className="text-xs text-gray-300 truncate" title={file.path}>{file.path}</span>
                        </div>
                        <button
                            onClick={() => handleStage(file.path)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--vylos-grey-dark)] rounded text-[var(--vylos-green)] transition-all"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                ))}

                <div className="px-3 py-2 text-[10px] font-bold text-[var(--vylos-text-secondary)] uppercase tracking-widest opacity-50 bg-[var(--vylos-grey-medium)]/30 mt-2">
                    Staged Changes ({staged.length})
                </div>
                {staged.map((file, i) => (
                    <div key={i} className="group flex items-center justify-between px-3 py-1.5 hover:bg-[var(--vylos-grey-medium)] transition-colors cursor-default">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-[10px] font-bold w-4 text-green-500">
                                {file.status[0] !== ' ' ? file.status[0] : file.status[1]}
                            </span>
                            <span className="text-xs text-gray-300 truncate" title={file.path}>{file.path}</span>
                        </div>
                        <button
                            onClick={() => handleUnstage(file.path)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--vylos-grey-dark)] rounded text-red-500 transition-all"
                        >
                            <Minus size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
