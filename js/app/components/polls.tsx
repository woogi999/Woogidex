// A poll under a post or comment, and the box for writing one. Data and
// rules: js/features/polls.ts.

import { useEffect, useState } from 'react';
import { api, state } from '../../core/app.ts';
import {
    MAX_OPTIONS, POLL_LENGTHS, canSeeVoters, deletePoll, fetchPollVoters, myChoices, pollClosed, pollFor, refreshPoll, votePoll,
    type Poll, type PollDraft, type PollParent, type VoterVisibility
} from '../../features/polls.ts';
import { Icon } from './Icon.tsx';
import { Link } from './Link.tsx';
import { Avatar } from './Avatar.tsx';
import { Modal } from './Modal.tsx';
import { EmojiInput, EmojiText } from './EmojiInput.tsx';
import { openDialog, registerDialog, type DialogProps } from '../dialogs.tsx';
import { useStore } from '../store.ts';
import { SkeletonRows } from './Skeleton.tsx';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function timeLeft(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'Final results';
    const h = Math.round(ms / 3600_000);
    return h < 1 ? 'Closes within the hour' : h < 48 ? `${plural(h, 'hour')} left` : `${plural(Math.round(h / 24), 'day')} left`;
}

/** The poll on a post or comment, if it has one. */
export function PollView({ kind, parentId }: { kind: PollParent; parentId: string }) {
    useStore();
    const poll = pollFor(kind, parentId);
    if (!poll) return null;
    return <PollCard poll={poll} />;
}

function PollCard({ poll }: { poll: Poll }) {
    const picked = myChoices(poll);
    const closed = pollClosed(poll);
    const own = !!state.user && state.user.id === poll.user_id;
    const [peek, setPeek] = useState(false);
    const [draft, setDraft] = useState<number[]>([]);
    // results show once you've voted, when it's closed, to its author, or on
    // request, unless the author kept the totals hidden until it closes
    const counts = poll.counts;
    const hidden = counts === null;
    const results = !hidden && (closed || picked.length > 0 || own || peek || !state.user);
    const total = poll.multi ? Math.max(1, poll.voters) : Math.max(1, (counts || []).reduce((a, b) => a + b, 0));
    const top = Math.max(0, ...(counts || []));
    // hidden totals open up when the poll closes: read it again then (a second
    // late, for clock drift), or now if it closed while it was loaded hidden
    useEffect(() => {
        if (!hidden || !poll.closes_at) return;
        const ms = new Date(poll.closes_at).getTime() - Date.now();
        if (ms > 2 ** 31 - 1) return; // setTimeout's limit (~24 days); a reload by then will do
        const timer = setTimeout(() => refreshPoll(poll.id), Math.max(0, ms) + 1000);
        return () => clearTimeout(timer);
    }, [hidden, poll.id, poll.closes_at]);
    const choose = (i: number) => {
        if (closed || !state.user) return;
        if (!poll.multi) { votePoll(poll, picked.includes(i) ? [] : [i]); return; }
        // several answers: once you've voted, each click changes it; before, you tick then vote
        if (picked.length) { votePoll(poll, picked.includes(i) ? picked.filter(x => x !== i) : [...picked, i]); return; }
        setDraft(d => d.includes(i) ? d.filter(x => x !== i) : [...d, i]);
    };
    return (
        <div className={`poll${results ? ' is-results' : ''}`} role="group" aria-label={poll.question || 'Poll'}>
            {poll.question && <p className="poll-question"><EmojiText text={poll.question} /></p>}
            {poll.multi && !results && !picked.length && <p className="poll-hint">Pick as many as you like.</p>}
            <ul className="poll-options">
                {poll.options.map((o, i) => {
                    const n = counts?.[i] || 0;
                    const pct = Math.round((n / total) * 100);
                    const mineHere = picked.includes(i) || draft.includes(i);
                    return (
                        <li key={i}>
                            {results ? (
                                <button type="button" className={`poll-result${mineHere ? ' is-mine' : ''}${n === top && n > 0 ? ' is-top' : ''}`}
                                    disabled={closed || !state.user} onClick={() => choose(i)} aria-pressed={mineHere}
                                    title={closed ? undefined : mineHere ? 'Your vote. Click to take it back.' : 'Vote for this'}>
                                    <span className="poll-bar" style={{ transform: `scaleX(${pct / 100})` }} aria-hidden="true" />
                                    <span className="poll-label">{mineHere ? <Icon name="check-circle" size={18} /> : <span className="poll-slot" aria-hidden="true" />}<EmojiText text={o} /></span>
                                    <span className="poll-pct">{pct}%</span>
                                </button>
                            ) : (
                                <button type="button" className={`poll-choice${mineHere ? ' is-picked' : ''}`} aria-pressed={mineHere} disabled={closed || !state.user} onClick={() => choose(i)}>
                                    <span className={`poll-mark${poll.multi ? ' is-box' : ''}`} aria-hidden="true">{mineHere && <Icon name="check" size={12} />}</span><EmojiText text={o} />
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
            <div className="poll-meta">
                {/* the facts, dot-separated by the CSS so the dots always sit evenly */}
                <span className="poll-facts">
                    <span>{plural(poll.voters, 'vote')}</span>
                    {poll.closes_at && <span>{timeLeft(poll.closes_at)}</span>}
                    {hidden && <span>{poll.closes_at ? 'Results when it closes' : 'Only the author sees results'}</span>}
                    {poll.voterVisibility !== 'private' && (
                        <span className="poll-visibility" title={poll.voterVisibility === 'public' ? 'Everyone who can see the results can see who voted for what.' : 'The author can see who voted for what.'}>
                            <Icon name="eye" size={13} />{poll.voterVisibility === 'public' ? 'Votes are public' : 'Author sees votes'}
                        </span>
                    )}
                </span>
                {!results && !hidden && <button type="button" className="link-btn" onClick={() => setPeek(true)}>See results</button>}
                {canSeeVoters(poll) && poll.voters > 0 && <button type="button" className="link-btn" onClick={() => openDialog('poll-voters', { poll })}>See who voted</button>}
                {poll.multi && !closed && !picked.length && draft.length > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => { votePoll(poll, draft); setDraft([]); }}>Vote</button>}
                {picked.length > 0 && !closed && <button type="button" className="link-btn" onClick={() => votePoll(poll, [])}>Take back my vote</button>}
                {own && <button type="button" className="link-btn poll-remove" onClick={() => deletePoll(poll)}>Remove poll</button>}
            </div>
        </div>
    );
}

const VISIBILITY: Array<[VoterVisibility, string]> = [['private', 'Nobody'], ['owner', 'Only me'], ['public', 'Everyone']];

/** Writing a poll: the question (optional), two to six options, how long it runs, who sees what. */
export function PollEditor({ value, onChange, onRemove, compact = false }: { value: PollDraft; onChange: (d: PollDraft) => void; onRemove: () => void; compact?: boolean }) {
    const set = (patch: Partial<PollDraft>) => onChange({ ...value, ...patch });
    const setOption = (i: number, text: string) => set({ options: value.options.map((o, j) => j === i ? text : o) });
    return (
        <div className={`poll-editor${compact ? ' is-compact' : ''}`}>
            <div className="poll-editor-head">
                <span><Icon name="chart-bar" size={15} />Poll</span>
                <button type="button" className="link-btn" onClick={onRemove}>Remove poll</button>
            </div>
            {/* our emojis and Apple's, the :name autocomplete and the picker, as everywhere else.
                Every row keeps a slot for the remove button, so the fields all line up */}
            <div className="poll-editor-row">
                <EmojiInput singleLine rows={1} mentions={false} maxLength={200} value={value.question} onChange={question => set({ question })} placeholder="Ask a question (optional)" ariaLabel="Poll question" className="poll-editor-input" />
                <span className="poll-editor-x" aria-hidden="true" />
            </div>
            {value.options.map((o, i) => (
                <div className="poll-editor-row" key={i}>
                    <EmojiInput singleLine rows={1} mentions={false} maxLength={80} value={o} onChange={text => setOption(i, text)} placeholder={`Option ${i + 1}`} ariaLabel={`Option ${i + 1}`} className="poll-editor-input" />
                    {value.options.length > 2
                        ? <button type="button" className="poll-editor-x" aria-label={`Remove option ${i + 1}`} title="Remove option" onClick={() => set({ options: value.options.filter((_, j) => j !== i) })}><Icon name="x-mark" size={14} /></button>
                        : <span className="poll-editor-x" aria-hidden="true" />}
                </div>
            ))}
            {value.options.length < MAX_OPTIONS && (
                <button type="button" className="link-btn poll-editor-add" onClick={() => set({ options: [...value.options, ''] })}><Icon name="plus" size={13} />Add option</button>
            )}
            <div className="poll-editor-settings">
                <div className="poll-editor-line">
                    <label className="poll-editor-check"><input type="checkbox" checked={value.multi} onChange={e => set({ multi: e.target.checked })} />Allow several answers</label>
                    <label className="poll-editor-check" title="Off: only you see the totals until the poll closes.">
                        <input type="checkbox" checked={value.live} onChange={e => set({ live: e.target.checked })} />Show results while it's open
                    </label>
                </div>
                <div className="poll-editor-line">
                    <label className="poll-editor-pick">Who sees votes
                        <select value={value.voterVisibility} onChange={e => set({ voterVisibility: e.target.value as VoterVisibility })}>
                            {VISIBILITY.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                        </select>
                    </label>
                    <label className="poll-editor-pick">Runs for
                        <select value={value.hours ?? ''} onChange={e => set({ hours: e.target.value ? Number(e.target.value) : null })}>
                            {POLL_LENGTHS.map(([h, label]) => <option key={label} value={h ?? ''}>{label}</option>)}
                        </select>
                    </label>
                </div>
            </div>
        </div>
    );
}

/** Who voted for what, with a tab per option (polls that show it to you). */
function PollVotersDialog({ close, poll }: DialogProps<{ poll: Poll }>) {
    const [rows, setRows] = useState<Array<{ user: any; choices: number[] }> | null>(null);
    const [tab, setTab] = useState(-1);
    useEffect(() => {
        let live = true;
        fetchPollVoters(poll).then(r => { if (live) setRows(r); }, () => { if (live) setRows([]); });
        return () => { live = false; };
    }, [poll.id]);
    const list = (rows || []).filter(r => tab < 0 || r.choices.includes(tab));
    return (
        <Modal onClose={close} title={poll.question || 'Poll votes'} className="reaction-list-modal">
            <div className="reaction-list-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab < 0} className={tab < 0 ? 'active' : ''} onClick={() => setTab(-1)}>All {rows?.length ?? ''}</button>
                {poll.options.map((o, i) => (
                    <button key={i} type="button" role="tab" aria-selected={tab === i} className={tab === i ? 'active' : ''} onClick={() => setTab(i)}>
                        <EmojiText text={o} /> {rows ? rows.filter(r => r.choices.includes(i)).length : ''}
                    </button>
                ))}
            </div>
            <div className="reaction-list">
                {rows === null ? <SkeletonRows count={3} avatar label="Loading" />
                    : !list.length ? <p className="comment-empty">No votes here yet.</p>
                    : list.map(r => (
                        <Link key={r.user.id} to={`profile/${r.user.id}`} className="reaction-list-row" onClick={close}>
                            <Avatar userId={r.user.id} url={r.user.avatar_url} name={r.user.display_name || r.user.username} className="feed-avatar feed-avatar-sm" />
                            <span className="reaction-list-name">{r.user.display_name || r.user.username || 'Someone'}</span>
                            <span className="poll-voter-picks">{r.choices.map(c => poll.options[c]).filter(Boolean).join(', ')}</span>
                        </Link>
                    ))}
            </div>
        </Modal>
    );
}
registerDialog('poll-voters', PollVotersDialog);
