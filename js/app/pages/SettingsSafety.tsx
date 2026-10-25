// Settings > Safety: hidden words, comments hidden on your things, what
// moderators did on your account (with appeals), and the reports you sent.
// Registered from SettingsAccount.tsx. Calls: js/features/safety.ts.

import { useEffect, useState } from 'react';
import { api } from '../../core/app.ts';
import { openDialog } from '../dialogs.tsx';
import { Icon } from '../components/Icon.tsx';
import { SkeletonRows } from '../components/Skeleton.tsx';
import { HIDDEN_WORDS_MAX, REPORT_STATUS, appealState, historyLabel, parseHiddenWords, reportTargetLabel } from '../../features/safety-model.ts';
import {
    loadHiddenComments, loadHiddenWords, loadModerationHistory, loadMyReports, saveHiddenWords, setCommentHidden
} from '../../features/safety.ts';

const when = (iso: string) => iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

export function HiddenWordsGroup() {
    const [text, setText] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => { loadHiddenWords().then(w => setText(w.join('\n'))); }, []);
    const count = text === null ? 0 : parseHiddenWords(text).length;

    async function save() {
        if (text === null || saving) return;
        setSaving(true);
        const words = parseHiddenWords(text);
        const problem = await saveHiddenWords(words);
        setSaving(false);
        if (problem) { api.showToast?.(problem, 'error'); return; }
        setText(words.join('\n'));
        api.showToast?.(words.length ? `Saved ${words.length} hidden word${words.length === 1 ? '' : 's'}.` : 'Hidden words cleared.', 'success');
    }

    if (text === null) return <SkeletonRows count={2} label="Loading hidden words" />;
    return (
        <div className="safety-group">
            <p className="safety-lead">Comments on your posts, Fakémon, profile and events that use these words are hidden from everyone but the person who wrote them. You can still see and unhide them below. One word or phrase per line.</p>
            <textarea className="safety-words" rows={5} value={text} onChange={e => setText(e.target.value)} aria-label="Hidden words"
                placeholder={'spoilers\nfree codes'} />
            <div className="safety-row">
                <small>{count}/{HIDDEN_WORDS_MAX}</small>
                <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>Save words</button>
            </div>
        </div>
    );
}

const TABLE_LABEL: Record<string, string> = { post_comments: 'post', mon_comments: 'Fakémon', profile_comments: 'profile', event_comments: 'event' };

export function HiddenCommentsGroup() {
    const [state, setState] = useState<{ rows: any[]; error: string } | null>(null);
    const load = () => loadHiddenComments().then(setState);
    useEffect(() => { load(); }, []);
    if (!state) return <SkeletonRows count={2} label="Loading hidden comments" />;
    if (state.error) return <p className="safety-lead">{state.error}</p>;
    if (!state.rows.length) return <p className="safety-lead">No hidden comments on your things.</p>;
    return (
        <ul className="safety-list">
            {state.rows.map(r => (
                <li key={`${r.kind}-${r.id}`}>
                    <div>
                        <small>@{r.author || 'someone'} on your {TABLE_LABEL[r.kind] || 'post'} · {r.source === 'owner' ? 'hidden by you' : 'hidden word'}</small>
                        <p>{r.body}</p>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
                        const problem = await setCommentHidden(r.kind, r.id, false);
                        if (problem) api.showToast?.(problem, 'error'); else { api.showToast?.('Comment shown again.', 'success'); load(); }
                    }}>Unhide</button>
                </li>
            ))}
        </ul>
    );
}

export function StandingGroup() {
    const [state, setState] = useState<{ rows: any[]; error: string } | null>(null);
    const load = () => loadModerationHistory().then(setState);
    useEffect(() => { load(); }, []);
    if (!state) return <SkeletonRows count={2} label="Loading your account history" />;
    if (state.error) return <p className="safety-lead">{state.error}</p>;
    if (!state.rows.length) return <p className="safety-lead"><Icon name="check-circle" size={14} /> Nothing here. Your account is in good standing.</p>;
    return (
        <>
            <p className="safety-lead">What moderators or the filter did on your account in the last year. You can appeal most of them within 30 days. A different moderator reviews each appeal.</p>
            <ul className="safety-list">
                {state.rows.map(r => {
                    const appeal = appealState(r);
                    return (
                        <li key={r.id}>
                            <div>
                                <small>{when(r.created_at)} · {r.automatic ? 'automatic' : 'staff'}{r.expires_at && new Date(r.expires_at).getFullYear() < 9999 ? ` · until ${when(r.expires_at)}` : ''}</small>
                                <p><strong>{historyLabel(r.action)}</strong>{r.reason ? `: ${r.reason}` : ''}</p>
                                {r.excerpt && <blockquote className="safety-excerpt">{r.excerpt}</blockquote>}
                                {r.appeal?.reply && <p className="safety-reply"><strong>Staff answer:</strong> {r.appeal.reply}</p>}
                            </div>
                            {appeal === 'can' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDialog('appeal', { entry: r, onSent: load })}>Appeal</button>}
                            {appeal === 'open' && <span className="safety-pill">Appeal waiting</span>}
                            {appeal === 'upheld' && <span className="safety-pill muted">Appeal turned down</span>}
                            {appeal === 'reversed' && <span className="safety-pill good">Reversed</span>}
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

export function MyReportsGroup() {
    const [state, setState] = useState<{ rows: any[]; error: string } | null>(null);
    useEffect(() => { loadMyReports().then(setState); }, []);
    if (!state) return <SkeletonRows count={2} label="Loading your reports" />;
    if (state.error) return <p className="safety-lead">{state.error}</p>;
    if (!state.rows.length) return <p className="safety-lead">You have not reported anything. Use the ⋯ menu on a post, comment, Fakémon or profile to report it.</p>;
    return (
        <ul className="safety-list">
            {state.rows.map(r => {
                const st = REPORT_STATUS[r.status] || REPORT_STATUS.open;
                return (
                    <li key={r.id}>
                        <div>
                            <small>{when(r.created_at)} · {reportTargetLabel(r.target_kind)} · {r.reason.replace('_', ' ')}</small>
                            {r.excerpt && <p>{r.excerpt}</p>}
                        </div>
                        <span className={`safety-pill ${st.tone}`}>{st.label}</span>
                    </li>
                );
            })}
        </ul>
    );
}
