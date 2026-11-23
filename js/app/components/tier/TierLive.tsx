// Live tier lists on screen (the data side is js/features/tier-live.ts).
//   LiveHost      the host's panel in the tier maker: the join code, the
//                 voters, which item is on show (event), "Place by the votes"
//   LiveViewer    /toolbox/live/<code>: an audience member's page

import { useEffect, useState } from 'react';
import { api, state } from '../../../core/app.ts';
import { Icon } from '../Icon.tsx';
import { Link } from '../Link.tsx';
import { ItemArt } from './TierBoard.tsx';
import { moveMon, type TierList } from '../../../features/tier-lists.ts';
import {
    endLive, followLive, liveByCode, liveLink, loadVotes, majority, setLiveMode, showItem, startLive, vote,
    type LiveMode, type LiveSession, type Votes
} from '../../../features/tier-live.ts';

const EMPTY: Votes = { tally: {}, mine: {}, voters: 0 };

/** Keeps a session and its votes current while it is on screen. */
function useLive(session: LiveSession | null, setSession: (s: LiveSession | null) => void) {
    const [votes, setVotes] = useState<Votes>(EMPTY);
    useEffect(() => {
        if (!session) { setVotes(EMPTY); return; }
        let live = true;
        const refresh = async () => {
            const [v, s] = await Promise.all([loadVotes(session.id), liveByCode(session.code)]);
            if (!live) return;
            setVotes(v);
            if (s) setSession(s);
        };
        refresh();
        const stop = followLive(session.id, refresh);
        return () => { live = false; stop(); };
    }, [session?.id]);
    return votes;
}

/** The tier the votes chose for an item, as a small tag on it. */
export function voteBadge(list: TierList, votes: Votes) {
    const top = majority(list, votes.tally);
    return (id: string) => {
        const t = list.tiers.find(x => x.id === top[id]);
        if (!t) return null;
        const n = Object.values(votes.tally[id] || {}).reduce((a, b) => a + b, 0);
        return <span className="tm-vote-tag" style={{ background: t.color }} title={`${n} vote${n === 1 ? '' : 's'}`}>{t.name} · {n}</span>;
    };
}

export function LiveHost({ list, session, setSession, onApply, onBadge }: {
    list: TierList; session: LiveSession | null; setSession: (s: LiveSession | null) => void;
    onApply: (l: TierList) => void; onBadge: (fn: ((id: string) => React.ReactNode) | null) => void;
}) {
    const [mode, setMode] = useState<LiveMode>('voting');
    const [busy, setBusy] = useState(false);
    const votes = useLive(session, setSession);
    useEffect(() => { onBadge(session ? voteBadge(session.list, votes) : null); }, [votes, session]);
    if (!state.user) return <p className="tm-side-help">Sign in to run a live tier list.</p>;
    if (!session) {
        return (
            <div className="tm-live">
                <p className="tm-side-help">Open this list to an audience: a stream, a group, a class. Everyone signs in at the link and votes where each item goes, live.</p>
                <div className="segmented" role="radiogroup" aria-label="Live mode">
                    <button type="button" role="radio" aria-checked={mode === 'voting'} className={mode === 'voting' ? 'active' : ''} onClick={() => setMode('voting')}>Live voting</button>
                    <button type="button" role="radio" aria-checked={mode === 'event'} className={mode === 'event' ? 'active' : ''} onClick={() => setMode('event')}>Live event</button>
                </div>
                <small>{mode === 'voting' ? 'Every item is open. Each viewer places them all.' : 'You show one item at a time, and everyone votes on it.'}</small>
                <button type="button" className="btn btn-primary" disabled={busy || !Object.keys(list.mons).length}
                    onClick={async () => { setBusy(true); setSession(await startLive(list, mode)); setBusy(false); }}>
                    <Icon name="signal" size={16} />Go live
                </button>
            </div>
        );
    }
    const s = session;
    const top = majority(s.list, votes.tally);
    const copy = async () => { try { await navigator.clipboard.writeText(liveLink(s.code)); api.showToast?.('Link copied.', 'success'); } catch { /* the code is on screen */ } };
    const placeByVotes = () => {
        let next = list;
        for (const [mon, tier] of Object.entries(top)) if (next.mons[mon] && next.tiers.some(t => t.id === tier)) next = moveMon(next, mon, tier);
        onApply(next);
    };
    const waiting = Object.keys(s.list.mons).filter(id => !top[id]);
    return (
        <div className="tm-live">
            <div className="tm-live-code">
                <small>Join code</small>
                <strong>{s.code}</strong>
                <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Icon name="link" size={14} />Copy the link</button>
            </div>
            <p className="tm-side-help">{votes.voters} voter{votes.voters === 1 ? '' : 's'} so far. {s.status === 'closed' ? 'This session has ended.' : ''}</p>
            {s.status === 'open' && (
                <>
                    <div className="segmented" role="radiogroup" aria-label="Live mode">
                        {(['voting', 'event'] as const).map(m => (
                            <button key={m} type="button" role="radio" aria-checked={s.mode === m} className={s.mode === m ? 'active' : ''}
                                onClick={async () => { if (await setLiveMode(s.id, m)) setSession({ ...s, mode: m, current_mon: null }); }}>{m === 'voting' ? 'Live voting' : 'Live event'}</button>
                        ))}
                    </div>
                    {s.mode === 'event' && (
                        <div className="tm-live-event">
                            <small>On show now: <strong>{s.current_mon ? s.list.mons[s.current_mon]?.name : 'nothing'}</strong></small>
                            <button type="button" className="btn btn-primary btn-sm" disabled={!waiting.length}
                                onClick={async () => { const next = waiting.find(id => id !== s.current_mon) || waiting[0]; if (next && await showItem(s.id, next)) setSession({ ...s, current_mon: next }); }}>
                                <Icon name="forward" size={14} />Show the next one
                            </button>
                            <div className="tm-live-pick">
                                {Object.values(s.list.mons).map(m => (
                                    <button key={m.id} type="button" className={s.current_mon === m.id ? 'is-on' : ''}
                                        onClick={async () => { if (await showItem(s.id, m.id)) setSession({ ...s, current_mon: m.id }); }}>{m.name}</button>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
            <button type="button" className="btn btn-secondary btn-sm" disabled={!Object.keys(top).length} onClick={placeByVotes}><Icon name="check" size={14} />Place by the votes</button>
            {s.status === 'open'
                ? <button type="button" className="btn btn-danger btn-sm" onClick={async () => { if (await endLive(s.id)) setSession({ ...s, status: 'closed', current_mon: null }); }}>End the live list</button>
                : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSession(null)}>Close</button>}
        </div>
    );
}

/** /toolbox/live/<code>: vote on someone's live tier list. */
export function LiveViewer({ code }: { code: string }) {
    const [session, setSession] = useState<LiveSession | null>(null);
    const [missing, setMissing] = useState(false);
    useEffect(() => {
        setMissing(false);
        if (!state.user) return;
        liveByCode(code).then(s => { setSession(s); setMissing(!s); });
    }, [code, state.user?.id]);
    const votes = useLive(session, setSession);
    if (!state.user) {
        return (
            <div className="tm-viewer tm-viewer-empty">
                <h1>Live tier list</h1>
                <p>Sign in to vote.</p>
                <button type="button" className="btn btn-primary" onClick={() => api.openAuthModal?.('signin')}>Sign in</button>
            </div>
        );
    }
    if (missing || session?.status === 'closed') {
        return (
            <div className="tm-viewer tm-viewer-empty">
                <h1>{session ? 'This live tier list has ended' : 'No live tier list with that code'}</h1>
                <p>Check the code with the host, or make your own in the <Link to="toolbox">Toolbox</Link>.</p>
            </div>
        );
    }
    if (!session) return <div className="tm-viewer tm-viewer-empty"><p>Joining...</p></div>;
    const list = session.list;
    const cast = async (mon: string, tier: string) => { await vote(session.id, mon, tier); };
    const top = majority(list, votes.tally);
    const Choices = ({ mon }: { mon: string }) => (
        <div className="tm-viewer-choices" role="group" aria-label={`Where ${list.mons[mon]?.name} goes`}>
            {list.tiers.map(t => (
                <button key={t.id} type="button" className={votes.mine[mon] === t.id ? 'is-mine' : ''} style={{ ['--c' as any]: t.color }}
                    aria-pressed={votes.mine[mon] === t.id} onClick={() => cast(mon, t.id)}>{t.name}</button>
            ))}
        </div>
    );
    const on = session.current_mon && list.mons[session.current_mon] ? session.current_mon : null;
    return (
        <div className="tm-viewer">
            <header className="tm-viewer-head">
                <span className="tm-live-dot" aria-hidden="true" /><small>Live · {votes.voters} voting</small>
                <h1>{list.title}</h1>
            </header>
            {session.mode === 'event' ? (
                on ? (
                    <div className="tm-viewer-stage">
                        <div className="tm-mode-card is-big"><span className="tm-mode-pic"><ItemArt m={list.mons[on]} /></span><strong>{list.mons[on].name}</strong></div>
                        <Choices mon={on} />
                    </div>
                ) : <p className="tm-viewer-wait">Waiting for the host to show the first one...</p>
            ) : (
                <ul className="tm-viewer-list">
                    {Object.values(list.mons).map(m => (
                        <li key={m.id}>
                            <span className="tm-viewer-item"><span className="tm-mode-pic"><ItemArt m={m} /></span><strong>{m.name}</strong></span>
                            <Choices mon={m.id} />
                        </li>
                    ))}
                </ul>
            )}
            <section className="tm-viewer-results" aria-label="What everyone says so far">
                <h2>What everyone says so far</h2>
                {list.tiers.map(t => {
                    const ids = Object.keys(top).filter(id => top[id] === t.id);
                    return ids.length ? <div key={t.id} className="tm-viewer-tier"><b style={{ background: t.color }}>{t.name}</b><span>{ids.map(id => list.mons[id]?.name).join(', ')}</span></div> : null;
                })}
                {!Object.keys(top).length && <p className="tm-side-help">No votes yet.</p>}
            </section>
        </div>
    );
}
