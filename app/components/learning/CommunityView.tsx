'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Flame, Heart, Loader2, MessageSquare, Trophy, UserMinus, UserPlus, Users } from 'lucide-react';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { useProgressStore } from '@/app/lib/stores/progress-store';
import { api, profileUrl, reasonOf, type FeedComment, type FeedItem, type LeaderboardRow } from '@/app/lib/learning/progress-api';
import { BackButton, Card, pct } from './progress-ui';
import { cn } from '@/app/lib/utils';

type Tab = 'leaderboard' | 'following' | 'projects';
type Board = 'weekly' | 'friends' | 'all_time';

const BOARDS: [Board, string][] = [['weekly', 'This week'], ['friends', 'Friends'], ['all_time', 'All time']];

function Leaderboard({ myHandle }: { myHandle: string | null }) {
    const [board, setBoard] = useState<Board>('weekly');
    const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.leaderboard(board)
            .then((r) => { if (!cancelled) { setRows(r); setError(null); } })
            .catch((e) => { if (!cancelled) setError(reasonOf(e)); });
        return () => { cancelled = true; };
    }, [board]);

    return (
        <div className="space-y-3">
            <div className="flex gap-1.5">
                {BOARDS.map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => { setRows(null); setBoard(id); }}
                        className={cn(
                            'px-2.5 py-1 rounded-full border text-[10px]',
                            board === id ? 'border-[var(--vylos-green)] text-[var(--vylos-green)]' : 'border-[#27272a] text-gray-500 hover:text-gray-200'
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {!rows && !error && <p className="flex items-center gap-2 text-[11px] text-gray-500"><Loader2 size={12} className="animate-spin" /> Loading…</p>}
            {error && <p className="text-[10.5px] text-red-300">{error}</p>}
            {rows && rows.length === 0 && (
                <p className="text-[11px] text-gray-500">
                    {board === 'friends' ? 'Nobody you follow is on the leaderboard yet.' : 'Nobody on this board yet.'}
                </p>
            )}
            {rows && rows.length > 0 && (
                <Card className="p-0">
                    <ol>
                        {rows.map((row) => (
                            <li
                                key={row.handle}
                                className={cn('flex items-center gap-2 px-3 py-2 border-b border-[#1f1f22] last:border-0 text-[11px]', row.handle === myHandle && 'bg-[var(--vylos-green-dark)]/10')}
                            >
                                <span className={cn('w-6 text-right font-mono', row.rank <= 3 ? 'text-[var(--vylos-green)] font-bold' : 'text-gray-600')}>{row.rank}</span>
                                <span className="flex-1 min-w-0 truncate text-gray-200">{row.display_name}</span>
                                <span className="text-[9px] text-gray-500">L{row.level} · {row.league}</span>
                                <span className="w-16 text-right font-mono text-gray-300">{Math.round(row.value).toLocaleString()} XP</span>
                            </li>
                        ))}
                    </ol>
                </Card>
            )}
            <p className="text-[9.5px] text-gray-600 leading-relaxed">
                Ranked by XP from demonstrated learning. You only appear if you turn on leaderboards in My progress, and you can
                turn it off any time.
            </p>
        </div>
    );
}

function Following() {
    const [people, setPeople] = useState<Awaited<ReturnType<typeof api.following>> | null>(null);
    const [handle, setHandle] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => api.following().then(setPeople).catch((e) => setError(reasonOf(e))), []);
    useEffect(() => { void load(); }, [load]);

    const follow = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.follow(handle.replace(/^@/, ''));
            setHandle('');
            await load();
        } catch (e) {
            setError(reasonOf(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.toLowerCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter' && handle.trim()) void follow(); }}
                    placeholder="@handle"
                    className="flex-1 min-w-0 px-2.5 py-1.5 bg-black border border-[#27272a] focus:border-[var(--vylos-green)] rounded-lg text-[11px] text-white font-mono outline-none"
                />
                <button
                    onClick={() => void follow()}
                    disabled={busy || !handle.trim()}
                    className="flex items-center gap-1 px-3 rounded-lg border border-[#27272a] text-[10px] font-bold text-gray-300 hover:text-white disabled:opacity-40"
                >
                    <UserPlus size={11} /> Follow
                </button>
            </div>
            {error && <p className="text-[10.5px] text-red-300">{error}</p>}
            {people && people.length === 0 && (
                <p className="text-[11px] text-gray-500">Follow friends by their handle to compare progress on the Friends board and see their projects first.</p>
            )}
            {people && people.length > 0 && (
                <Card className="p-0">
                    <ul>
                        {people.map((person) => (
                            <li key={person.handle} className="flex items-center gap-2 px-3 py-2 border-b border-[#1f1f22] last:border-0 text-[11px]">
                                <div className="flex-1 min-w-0">
                                    <p className="text-gray-200 truncate">{person.display_name}</p>
                                    <p className="text-[9.5px] text-gray-500">
                                        @{person.handle}
                                        {person.level != null && ` · Level ${person.level}`}
                                        {person.streak ? <span> · <Flame size={9} className="inline text-orange-400" /> {person.streak}</span> : null}
                                    </p>
                                </div>
                                {person.is_public && (
                                    <a href={profileUrl(person.handle)} target="_blank" rel="noreferrer" title="Public profile" className="p-1 text-gray-500 hover:text-[var(--vylos-green)]">
                                        <ExternalLink size={11} />
                                    </a>
                                )}
                                <button
                                    onClick={async () => { await api.unfollow(person.handle).catch(() => undefined); void load(); }}
                                    title="Unfollow"
                                    className="p-1 text-gray-600 hover:text-red-300"
                                >
                                    <UserMinus size={11} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    );
}

function Comments({ item, onCount }: { item: FeedItem; onCount: (n: number) => void }) {
    const [comments, setComments] = useState<FeedComment[] | null>(null);
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    // The parent's callback changes every render; only the latest one matters
    const countRef = useRef(onCount);
    useEffect(() => { countRef.current = onCount; });

    const load = useCallback(
        () => api.comments(item.submission_id).then((c) => { setComments(c); countRef.current(c.length); }).catch((e) => setError(reasonOf(e))),
        [item.submission_id]
    );
    useEffect(() => { void load(); }, [load]);

    const post = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.addComment(item.submission_id, text);
            setText('');
            await load();
        } catch (e) {
            setError(reasonOf(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-2 pt-2 border-t border-[#1f1f22] space-y-2">
            {comments?.map((c) => (
                <div key={c.id} className="text-[10.5px]">
                    <p className="text-gray-500">
                        {c.handle ? `@${c.handle}` : c.display_name}
                        {c.helpful && <span className="ml-1 text-[var(--vylos-green)]">· marked helpful</span>}
                    </p>
                    <p className="text-gray-300 whitespace-pre-wrap">{c.body}</p>
                    {c.can_mark_helpful && (
                        <button
                            onClick={async () => { await api.markHelpful(c.id).catch((e) => setError(reasonOf(e))); void load(); }}
                            className="mt-0.5 flex items-center gap-1 text-[9.5px] text-gray-500 hover:text-[var(--vylos-green)]"
                        >
                            <Heart size={9} /> This helped (+50 XP for them)
                        </button>
                    )}
                </div>
            ))}
            {!item.is_mine && (
                <div className="flex gap-2">
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        maxLength={2000}
                        placeholder="Kind, specific feedback…"
                        className="flex-1 min-w-0 px-2.5 py-1.5 bg-black border border-[#27272a] focus:border-[var(--vylos-green)] rounded-lg text-[11px] text-white outline-none"
                    />
                    <button
                        onClick={() => void post()}
                        disabled={busy || !text.trim()}
                        className="px-3 rounded-lg border border-[#27272a] text-[10px] font-bold text-gray-300 hover:text-white disabled:opacity-40"
                    >
                        Send
                    </button>
                </div>
            )}
            {error && <p className="text-[10px] text-red-300">{error}</p>}
        </div>
    );
}

function Projects() {
    const [feed, setFeed] = useState<FeedItem[] | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.projectFeed().then(setFeed).catch((e) => setError(reasonOf(e)));
    }, []);

    const setCount = useCallback(
        (id: string) => (n: number) => setFeed((items) => items?.map((i) => (i.submission_id === id ? { ...i, comments: n } : i)) ?? null),
        []
    );

    if (error) return <p className="text-[10.5px] text-red-300">{error}</p>;
    if (!feed) return <p className="flex items-center gap-2 text-[11px] text-gray-500"><Loader2 size={12} className="animate-spin" /> Loading…</p>;
    if (feed.length === 0) {
        return <p className="text-[11px] text-gray-500">No shared projects yet. Pass a capstone and tick &quot;Share this project&quot; to be the first.</p>;
    }

    return (
        <ul className="space-y-2">
            {feed.map((item) => (
                <li key={item.submission_id}>
                    <Card className="p-3">
                        <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="text-[11.5px] font-bold text-gray-100">{item.project}</p>
                                <p className="text-[9.5px] text-gray-500">
                                    {item.is_mine ? 'You' : `@${item.handle}`} · {item.course}
                                    {item.followed && !item.is_mine && ' · following'}
                                </p>
                            </div>
                            <span className="text-[10px] font-mono text-gray-400" title="Acyrx review score">{pct(item.overall_score)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[10px]">
                            {item.repo_url && (
                                <a href={item.repo_url} target="_blank" rel="noreferrer nofollow" className="flex items-center gap-1 text-gray-400 hover:text-[var(--vylos-green)]">
                                    <ExternalLink size={10} /> Code
                                </a>
                            )}
                            <button
                                onClick={() => setOpen(open === item.submission_id ? null : item.submission_id)}
                                className="flex items-center gap-1 text-gray-400 hover:text-white"
                            >
                                <MessageSquare size={10} /> {item.comments} {item.comments === 1 ? 'comment' : 'comments'}
                            </button>
                        </div>
                        {open === item.submission_id && <Comments item={item} onCount={setCount(item.submission_id)} />}
                    </Card>
                </li>
            ))}
        </ul>
    );
}

/** Learning with others: friends, leaderboards and each other's projects. Competition stays optional. */
export default function CommunityView({ onBack }: { onBack: () => void }) {
    const user = useAuthStore((s) => s.user);
    const myHandle = useProgressStore((s) => (user && s.progressFor === user.id ? s.profile?.handle ?? null : null));
    const [tab, setTab] = useState<Tab>('leaderboard');

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            <div className="p-5 pb-3 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <BackButton onClick={onBack}>My progress</BackButton>
                <h1 className="mt-3 flex items-center gap-2 text-base font-black text-white"><Users size={15} /> Community</h1>
                <div className="mt-3 flex gap-4 text-[10px] font-bold uppercase tracking-widest">
                    {([['leaderboard', 'Leaderboard', Trophy], ['following', 'Following', UserPlus], ['projects', 'Projects', MessageSquare]] as const).map(([id, label, Icon]) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            className={cn('flex items-center gap-1 pb-1 border-b-2', tab === id ? 'border-[var(--vylos-green)] text-white' : 'border-transparent text-gray-500 hover:text-gray-300')}
                        >
                            <Icon size={10} /> {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                {!user ? (
                    <p className="text-[11px] text-gray-400">Sign in to follow friends, see leaderboards and share projects.</p>
                ) : tab === 'leaderboard' ? (
                    <Leaderboard myHandle={myHandle} />
                ) : tab === 'following' ? (
                    <Following />
                ) : (
                    <Projects />
                )}
            </div>
        </div>
    );
}
