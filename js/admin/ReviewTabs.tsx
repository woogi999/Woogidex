// The review queue and everything around it: cases (reports, filter hits,
// repeats, copy rings, stylometry), appeals, similarity signals, the numbers
// (false-positive and reversal rates, workload), and the moderation settings
// with the VPN network list. Every action is an admin_* RPC from migration
// 20261025120000_moderation_system.sql, which re-checks permission and rank.
// Content here is user-written: it goes through React's escaping, never markup.

import { useEffect, useState, type ChangeEvent } from 'react';
import { Icon } from '../app/components/Icon.tsx';
import { useStore } from '../app/store.ts';
import { ask, can, getClient, showToast } from './core.ts';
import { timeAgo as timeAgoShort } from '../features/moderation-model.ts';
import { ListState } from './ui.tsx';

async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const client = await getClient();
    const { data, error } = await client.rpc(fn, args);
    if (error) throw error;
    return data as T;
}

const SOURCE_LABEL: Record<string, string> = {
    report: 'reports', rule: 'filter rule', duplicate: 'repeats', coordination: 'copy ring', limit: 'limited account',
    stylometry: 'writing style', staff: 'opened by staff'
};
const DECISIONS: Record<string, { label: string; perm: string; tone: string; durations: [number, string][] | null; blurb: string }> = {
    dismiss: { label: 'Dismiss', perm: 'delete_content', tone: '', durations: null, blurb: 'No rule break. Held content comes back. Automatic cases dismissed here count as false positives.' },
    remove: { label: 'Remove', perm: 'delete_content', tone: 'warn', durations: null, blurb: 'Takes the content down, no strike. The writer can appeal. A removed Fakémon is deleted and cannot come back.' },
    warn: { label: 'Remove + warn', perm: 'warn', tone: 'warn', durations: null, blurb: 'Takes the content down and gives a strike. Strikes escalate on their own.' },
    restrict: { label: 'Remove + limit', perm: 'mute', tone: 'warn', durations: [[7, '7 days'], [30, '30 days'], [90, '90 days'], [0, 'until lifted']], blurb: 'Takes the content down. New posts and comments from this account wait for review.' },
    suspend: { label: 'Remove + suspend', perm: 'ban', tone: 'danger', durations: [[1, '1 day'], [7, '7 days'], [30, '30 days'], [0, 'permanent']], blurb: 'Takes the content down and suspends the account.' }
};
const LIMITS_NOTE = 'A similarity score is a lead for review, not proof. Shared slang, topics, copied memes or a shared network do not show that two accounts have one owner. Never act on a score alone.';

const what = (c: any) => c.target_kind === 'comment' ? `${c.comment_kind} comment` : c.target_kind;

// ==================== review queue ====================

export function QueueTab() {
    useStore();
    const [filter, setFilter] = useState({ status: 'active', source: '', assigned: 'any' });
    const [state, setState] = useState<{ loading: boolean; error: string; rows: any[] }>({ loading: true, error: '', rows: [] });
    const [openId, setOpenId] = useState<string | null>(null);

    async function load() {
        setState(s => ({ ...s, loading: true, error: '' }));
        try {
            const rows = await rpc<any[]>('admin_list_cases', { p_status: filter.status, p_source: filter.source, p_assigned: filter.assigned, p_limit: 200 });
            setState({ loading: false, error: '', rows: rows || [] });
        } catch (e: any) {
            setState({ loading: false, error: 'Could not load the queue: ' + e.message, rows: [] });
        }
    }
    useEffect(() => { load(); }, [filter.status, filter.source, filter.assigned]);
    const pick = (k: keyof typeof filter) => (e: ChangeEvent<HTMLSelectElement>) => setFilter(f => ({ ...f, [k]: e.target.value }));

    return (
        <>
            <div className="admin-section-head">
                <h3>Review queue</h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={load}><Icon name="refresh-cw" /> Reload</button>
            </div>
            <p className="admin-section-sub">Everything that needs a human: user reports, filter hits that hide or flag, repeated posts, copy rings across accounts, limited accounts and writing-style leads. Escalated cases come first and need a moderator who can suspend. Hidden items stay hidden from everyone but their writer until you decide.</p>
            <div className="admin-search-bar">
                <select value={filter.status} onChange={pick('status')} aria-label="Status">
                    <option value="active">Open and escalated</option>
                    <option value="escalated">Escalated only</option>
                    <option value="resolved">Closed</option>
                    <option value="all">Everything</option>
                </select>
                <select value={filter.source} onChange={pick('source')} aria-label="Source">
                    <option value="">Any source</option>
                    {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={filter.assigned} onChange={pick('assigned')} aria-label="Assigned">
                    <option value="any">Anyone</option>
                    <option value="me">Assigned to me</option>
                    <option value="none">Nobody yet</option>
                </select>
            </div>
            {state.loading || state.error || !state.rows.length
                ? <ListState loading={state.loading} error={state.error} empty="Nothing waiting. Nice." />
                : state.rows.map(c => (
                    <div key={c.id} className={`admin-case prio-${c.priority} ${c.status}`}>
                        <button type="button" className="admin-case-head" aria-expanded={openId === c.id} onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                            <span className="admin-case-what">
                                {c.status === 'escalated' && <span className="admin-hit-pill block">escalated</span>}
                                {c.decision && <span className={`admin-hit-pill ${c.decision === 'dismiss' ? 'clear' : 'flag'}`}>{c.decision}{c.reversed ? ' · reversed' : ''}</span>}
                                <strong>{what(c)}</strong> by {c.target_name || 'unknown'}
                                {c.hold_state && <span className="admin-perm-pill">{c.hold_state}</span>}
                                {c.sources.map((s: string) => <span key={s} className="admin-perm-pill">{SOURCE_LABEL[s] || s}</span>)}
                                {c.report_count > 0 && <span className="admin-perm-pill">{c.report_count} reporter{c.report_count === 1 ? '' : 's'}</span>}
                            </span>
                            <span className="admin-case-meta">{c.assignee_name ? `with ${c.assignee_name} · ` : ''}{timeAgoShort(c.created_at)}</span>
                            {c.excerpt && <span className="admin-case-excerpt">{c.excerpt}</span>}
                        </button>
                        {openId === c.id && <CaseDetail id={c.id} onChanged={load} />}
                    </div>
                ))}
        </>
    );
}

function CaseDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const load = () => rpc('admin_get_case', { p_case: id }).then(setData).catch(e => setError(e.message));
    useEffect(() => { load(); }, [id]);
    if (error) return <div className="admin-empty admin-error">{error}</div>;
    if (!data) return <div className="admin-empty">Loading…</div>;
    const c = data.case;
    const t = data.target || {};
    const open = c.status !== 'resolved';

    async function act(fn: string, args: Record<string, unknown>, done: string) {
        try { await rpc(fn, args); showToast(done, 'success'); load(); onChanged(); }
        catch (e: any) { showToast(e.message || 'That did not work.', 'error'); }
    }
    async function decide(key: string) {
        const d = DECISIONS[key];
        const answer = await ask({ title: `${d.label}: ${what(c)} by ${t.username || 'unknown'}`, blurb: d.blurb, confirm: d.label,
            durations: d.durations, danger: d.tone === 'danger', requireReason: key !== 'dismiss' });
        if (!answer) return;
        act('admin_decide_case', { p_case: id, p_decision: key, p_reason: answer.reason, p_amount: answer.amount }, `${d.label}: done`);
    }
    async function escalate() {
        const answer = await ask({ title: 'Escalate this case', blurb: 'Sends it to staff who can suspend. Say what worries you.', confirm: 'Escalate' });
        if (answer) act('admin_escalate_case', { p_case: id, p_reason: answer.reason }, 'Escalated');
    }
    async function reopen() {
        const answer = await ask({ title: 'Reopen this case', blurb: 'Use this to correct a mistake. The old decision counts as reversed in the numbers.', confirm: 'Reopen' });
        if (answer) act('admin_reopen_case', { p_case: id, p_reason: answer.reason }, 'Reopened');
    }

    return (
        <div className="admin-case-body">
            <section>
                <h4>Content {data.exists ? '' : '(deleted)'}</h4>
                <blockquote className="admin-case-text">{data.current_text || c.snapshot || 'No copy kept.'}</blockquote>
                {c.snapshot && data.current_text && c.snapshot !== data.current_text && (
                    <><small>As first flagged:</small><blockquote className="admin-case-text">{c.snapshot}</blockquote></>
                )}
            </section>
            <section>
                <h4>Account</h4>
                <p>@{t.username || 'unknown'} · joined {t.created_at ? new Date(t.created_at).toLocaleDateString() : '?'} · {t.warnings ?? 0} strike{t.warnings === 1 ? '' : 's'}
                    {t.limit && <> · <span className="admin-perm-pill">limited</span></>}</p>
            </section>
            <section>
                <h4>Why it is here</h4>
                <ul className="admin-case-list">
                    {c.evidence.map((ev: any, i: number) => (
                        <li key={i}>
                            <strong>{SOURCE_LABEL[ev.source] || ev.source}</strong>
                            {ev.rules?.length > 0 && <> · rules: {ev.rules.map((r: any) => `${r.label} (${r.action}, ${r.severity})`).join(', ')}</>}
                            {ev.duplicates && <> · same text {Number(ev.duplicates.repeats) + 1}x from this account{ev.duplicates.ring?.length ? `, plus ${ev.duplicates.ring.length} other account${ev.duplicates.ring.length === 1 ? '' : 's'} in 1 hour` : ''}</>}
                            {ev.reason && <> · report: {ev.reason}</>}
                            {ev.edit && <> · after an edit</>}
                        </li>
                    ))}
                </ul>
                {data.reports.length > 0 && (
                    <ul className="admin-case-list">
                        {data.reports.map((r: any) => <li key={r.id}><strong>{r.reason}</strong> from {r.reporter || 'someone'}{r.details ? `: ${r.details}` : ''}</li>)}
                    </ul>
                )}
            </section>
            {data.signals && data.signals.length > 0 && (
                <section>
                    <h4>Similar accounts</h4>
                    <p className="admin-section-sub">{LIMITS_NOTE}</p>
                    <ul className="admin-case-list">
                        {data.signals.map((s: any) => <li key={s.id}><SignalLine s={s} other={s.other} /></li>)}
                    </ul>
                </section>
            )}
            {(data.prior_actions.length > 0 || data.prior_cases.length > 0) && (
                <section>
                    <h4>Earlier moderation</h4>
                    <ul className="admin-case-list">
                        {data.prior_actions.map((a: any, i: number) => (
                            <li key={i}>{a.action}{a.reversed ? ' (reversed)' : ''} by {a.actor} · {timeAgoShort(a.created_at)}{a.reason ? ` · ${a.reason}` : ''}</li>
                        ))}
                    </ul>
                </section>
            )}
            <section>
                <h4>Notes and history</h4>
                <ul className="admin-case-list">
                    {data.notes.map((n: any) => <li key={n.id}><strong>{n.author}</strong>: {n.body} <small>{timeAgoShort(n.created_at)}</small></li>)}
                    {data.history.map((h: any, i: number) => <li key={`h${i}`} className="admin-case-event">{h.actor || 'system'} {h.event.replace(/_/g, ' ')}{h.details?.decision ? `: ${h.details.decision}` : ''} <small>{timeAgoShort(h.created_at)}</small></li>)}
                </ul>
                <div className="admin-search-bar">
                    <input type="text" placeholder="Add a note for other staff" value={note} onChange={e => setNote(e.target.value)} maxLength={4000} />
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!note.trim()} onClick={async () => { await act('admin_add_case_note', { p_case: id, p_body: note }, 'Note added'); setNote(''); }}>Add note</button>
                </div>
            </section>
            <div className="admin-case-actions">
                {open ? (
                    <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => act('admin_assign_case', { p_case: id, p_to_me: c.assigned_to == null }, c.assigned_to == null ? 'Assigned to you' : 'Unassigned')}>
                            {c.assigned_to == null ? 'Take it' : 'Unassign'}
                        </button>
                        {c.status === 'open' && <button type="button" className="btn btn-secondary btn-sm" onClick={escalate}>Escalate</button>}
                        {Object.entries(DECISIONS).map(([k, d]) => (
                            <button key={k} type="button" className={`btn btn-sm ${d.tone === 'danger' ? 'btn-danger' : d.tone === 'warn' ? 'btn-secondary admin-btn-warn' : 'btn-primary'}`}
                                disabled={!can(d.perm)} onClick={() => decide(k)}>{d.label}</button>
                        ))}
                    </>
                ) : (
                    <>
                        <span className="admin-section-sub">Closed: {c.decision}{c.decision_reason ? ` · ${c.decision_reason}` : ''}</span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={reopen}>Reopen</button>
                    </>
                )}
            </div>
        </div>
    );
}

function SignalLine({ s, other }: { s: any; other?: any }) {
    const pct = s.percentile != null ? ` · higher than ${Number(s.percentile).toFixed(1)}% of pairs` : '';
    const features = (s.features || []).slice(0, 4).map((f: any) => f.name).join(', ');
    return (
        <>
            <span className={`admin-hit-pill ${s.band === 'high' ? 'block' : 'flag'}`}>{s.kind} · {s.band}</span>{' '}
            {other && <>@{other.username || 'deleted'}{other.banned_until && new Date(other.banned_until) > new Date() ? ' (suspended)' : ''} </>}
            <small>score {Number(s.score).toFixed(2)}{pct}{s.samples_a ? ` · samples ${s.samples_a}/${s.samples_b}` : ''}{features ? ` · driven by ${features}` : ''}</small>
            {(s.notes || []).map((n: string, i: number) => <small key={i} className="admin-signal-note">{n}</small>)}
        </>
    );
}

// ==================== appeals ====================

export function AppealsTab() {
    useStore();
    const [status, setStatus] = useState('open');
    const [state, setState] = useState<{ loading: boolean; error: string; rows: any[] }>({ loading: true, error: '', rows: [] });
    async function load() {
        setState(s => ({ ...s, loading: true, error: '' }));
        try { setState({ loading: false, error: '', rows: await rpc<any[]>('admin_list_appeals', { p_status: status }) || [] }); }
        catch (e: any) { setState({ loading: false, error: e.message, rows: [] }); }
    }
    useEffect(() => { load(); }, [status]);

    async function decide(ap: any, decision: 'upheld' | 'reversed') {
        const answer = await ask({
            title: decision === 'reversed' ? 'Accept the appeal' : 'Turn down the appeal',
            blurb: decision === 'reversed' ? 'Undoes the decision: lifts a mute, suspension or limit, removes the strike and brings removed posts and comments back. The person gets your reply.' : 'The decision stays. The person gets your reply.',
            confirm: decision === 'reversed' ? 'Reverse it' : 'Keep it'
        });
        if (!answer) return;
        try { await rpc('admin_decide_appeal', { p_appeal: ap.id, p_decision: decision, p_reply: answer.reason }); showToast('Appeal answered', 'success'); load(); }
        catch (e: any) { showToast(e.message || 'Could not answer that appeal.', 'error'); }
    }

    return (
        <>
            <div className="admin-section-head">
                <h3>Appeals</h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={load}><Icon name="refresh-cw" /> Reload</button>
            </div>
            <p className="admin-section-sub">People appeal from Settings &gt; Safety within 30 days. A moderator cannot answer an appeal of their own decision (setting: second reviewer). Reversals feed the reversal rate on the Numbers tab.</p>
            <div className="admin-search-bar">
                <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
                    <option value="open">Open</option><option value="reversed">Reversed</option><option value="upheld">Upheld</option><option value="all">Everything</option>
                </select>
            </div>
            {state.loading || state.error || !state.rows.length
                ? <ListState loading={state.loading} error={state.error} empty="No appeals." />
                : state.rows.map(ap => (
                    <div key={ap.id} className="admin-case">
                        <div className="admin-case-body">
                            <p><strong>@{ap.user?.username || 'unknown'}</strong> appeals <strong>{ap.action?.action}</strong> by {ap.action?.actor} · {timeAgoShort(ap.created_at)}</p>
                            {ap.action?.reason && <p className="admin-section-sub">Reason given: {ap.action.reason}</p>}
                            {ap.action?.excerpt && <blockquote className="admin-case-text">{ap.action.excerpt}</blockquote>}
                            <p>{ap.body}</p>
                            {ap.status === 'open' ? (
                                <div className="admin-case-actions">
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => decide(ap, 'upheld')}>Keep decision</button>
                                    <button type="button" className="btn btn-primary btn-sm" onClick={() => decide(ap, 'reversed')}>Reverse it</button>
                                </div>
                            ) : <p className="admin-section-sub">{ap.status} by {ap.decider || 'staff'}: {ap.staff_reply}</p>}
                        </div>
                    </div>
                ))}
        </>
    );
}

// ==================== similarity signals ====================

export function SignalsTab() {
    useStore();
    const [filter, setFilter] = useState({ status: 'open', kind: '' });
    const [state, setState] = useState<{ loading: boolean; error: string; rows: any[] }>({ loading: true, error: '', rows: [] });
    const [busy, setBusy] = useState(false);
    async function load() {
        setState(s => ({ ...s, loading: true, error: '' }));
        try { setState({ loading: false, error: '', rows: await rpc<any[]>('admin_list_signals', { p_status: filter.status, p_kind: filter.kind }) || [] }); }
        catch (e: any) { setState({ loading: false, error: e.message, rows: [] }); }
    }
    useEffect(() => { load(); }, [filter.status, filter.kind]);

    async function exportCorpus() {
        const timing = window.confirm('Include posting times? Only say yes when you have a specific reason: times are more personal than text.\n\nOK = include times, Cancel = text only.');
        setBusy(true);
        try {
            const doc = await rpc('admin_export_style_corpus', { p_days: 180, p_min_items: 8, p_timing: timing });
            if (!doc?.export_id) { showToast(doc?.message || 'Not enough text to export.', 'warning'); return; }
            const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `woogidex-${new Date().toISOString().slice(0, 10)}.corpus.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
            showToast(`Exported ${doc.items.length} texts. The export expires in 7 days. Delete the file after the run.`, 'success');
        } catch (e: any) { showToast(e.message || 'Export failed.', 'error'); }
        finally { setBusy(false); }
    }
    async function importSignals(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { showToast('That file is too big for a signals file.', 'error'); return; }
        setBusy(true);
        try {
            const doc = JSON.parse(await file.text());
            const res = await rpc('admin_import_similarity', { p_doc: doc });
            showToast(`Imported ${res.imported} pair${res.imported === 1 ? '' : 's'}${res.skipped ? `, skipped ${res.skipped}` : ''}.`, 'success');
            load();
        } catch (err: any) { showToast(err.message || 'Import failed.', 'error'); }
        finally { setBusy(false); }
    }
    async function review(s: any, status: string) {
        const answer = await ask({ title: status === 'dismissed' ? 'Dismiss this lead' : 'Mark as reviewed', blurb: 'A short note helps the next person.', confirm: 'Save', requireReason: false });
        if (!answer) return;
        try { await rpc('admin_review_signal', { p_id: s.id, p_status: status, p_note: answer.reason }); load(); }
        catch (e: any) { showToast(e.message, 'error'); }
    }
    async function openCase(userId: string) {
        const answer = await ask({ title: 'Open a review case', blurb: 'Opens an account case in the queue, so the decision has a record.', confirm: 'Open case' });
        if (!answer) return;
        try { await rpc('admin_open_case', { p_kind: 'account', p_id: userId, p_comment_kind: null, p_reason: answer.reason }); showToast('Case opened in the queue', 'success'); }
        catch (e: any) { showToast(e.message, 'error'); }
    }

    return (
        <>
            <div className="admin-section-head">
                <h3>Similarity signals</h3>
                <span>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={exportCorpus}><Icon name="arrow-down-tray" /> Export corpus</button>{' '}
                    <label className={`btn btn-secondary btn-sm${busy ? ' is-disabled' : ''}`}><Icon name="arrow-up-tray" /> Import results<input type="file" accept="application/json,.json" hidden disabled={busy} onChange={importSignals} /></label>
                </span>
            </div>
            <p className="admin-section-sub">
                <strong>Copy rings</strong> come from the live duplicate check. <strong>Style</strong>, <strong>duplicate</strong> and <strong>timing</strong> pairs come from the offline lab
                (woogidex-backend/moderation-lab): export the corpus (public posts and comments only, under pseudonyms), run <code>python -m woogimod analyze</code>, and import the result.
                Bands compare a pair with every other pair in the same corpus: they are percentiles, not probabilities. {LIMITS_NOTE}
            </p>
            <div className="admin-search-bar">
                <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} aria-label="Status">
                    <option value="open">Open</option><option value="reviewed">Reviewed</option><option value="dismissed">Dismissed</option><option value="all">Everything</option>
                </select>
                <select value={filter.kind} onChange={e => setFilter(f => ({ ...f, kind: e.target.value }))} aria-label="Kind">
                    <option value="">Any kind</option><option value="coordination">Copy ring</option><option value="style">Writing style</option><option value="duplicate">Copied text</option><option value="timing">Timing</option>
                </select>
            </div>
            {state.loading || state.error || !state.rows.length
                ? <ListState loading={state.loading} error={state.error} empty="No signals." />
                : state.rows.map(s => (
                    <div key={s.id} className="admin-term-row">
                        <div>
                            <div className="admin-term-head">@{s.a?.username || 'deleted'} &harr; @{s.b?.username || 'deleted'}</div>
                            <SignalLine s={s} />
                            {s.review_note && <small>Note: {s.review_note}</small>}
                        </div>
                        <div className="admin-term-actions">
                            <button type="button" title="Open a case for the first account" onClick={() => openCase(s.a.id)}><Icon name="flag" /></button>
                            <button type="button" title="Mark reviewed" onClick={() => review(s, 'reviewed')}><Icon name="check-circle" /></button>
                            <button type="button" title="Dismiss" onClick={() => review(s, 'dismissed')}><Icon name="x" /></button>
                        </div>
                    </div>
                ))}
        </>
    );
}

// ==================== numbers ====================

const pct = (v: any) => v == null ? '–' : `${Math.round(Number(v) * 1000) / 10}%`;

export function NumbersTab() {
    useStore();
    const [days, setDays] = useState(30);
    const [data, setData] = useState<any>(null);
    const [access, setAccess] = useState<any[] | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        setData(null);
        rpc('admin_moderation_stats', { p_days: days }).then(setData).catch(e => setError(e.message));
        rpc<any[]>('admin_access_log', { p_limit: 100 }).then(setAccess).catch(() => setAccess([]));
    }, [days]);
    if (error) return <div className="admin-empty admin-error">{error}</div>;
    if (!data) return <div className="admin-empty">Loading…</div>;
    const tiles: [string, string | number, string][] = [
        ['Waiting', data.backlog, `${data.escalated} escalated`],
        ['Opened', data.opened, `last ${days} days`],
        ['Decided', data.resolved, data.median_hours != null ? `median ${data.median_hours} h to decide` : 'no decisions yet'],
        ['Automatic false positives', pct(data.automated?.rate), `${data.automated?.false_positive ?? 0} of ${data.automated?.decided ?? 0} machine-only cases`],
        ['Reports acted on', data.reports?.total ? pct(data.reports.actioned / data.reports.total) : '–', `${data.reports?.total ?? 0} reports, ${data.reports?.open ?? 0} open`],
        ['Appeal reversal rate', pct(data.appeals?.reversal_rate), `${data.appeals?.total ?? 0} appeals, ${data.appeals?.open ?? 0} open`]
    ];
    return (
        <>
            <div className="admin-section-head">
                <h3>Numbers</h3>
                <select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Period">
                    <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option>
                </select>
            </div>
            <p className="admin-section-sub">A machine-only case counts as a false positive when staff dismiss it or later reverse it. Use the per-rule numbers to fix or drop rules that are often wrong.</p>
            <div className="admin-stat-grid">
                {tiles.map(([label, value, sub]) => <div key={label} className="admin-stat"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>)}
            </div>
            <h4 className="admin-subhead">By source</h4>
            <p className="admin-section-sub">{Object.entries(data.by_source || {}).map(([k, v]) => `${SOURCE_LABEL[k] || k}: ${v}`).join(' · ') || 'nothing yet'}</p>
            <h4 className="admin-subhead">Decisions</h4>
            <p className="admin-section-sub">{Object.entries(data.by_decision || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'nothing yet'}</p>
            <h4 className="admin-subhead">Filter rules</h4>
            <table className="admin-ip-table">
                <thead><tr><th>rule</th><th>action</th><th>cases</th><th>acted on</th><th>wrong</th><th>wrong rate</th></tr></thead>
                <tbody>
                    {(data.rules || []).filter((r: any) => r.cases > 0).map((r: any) => (
                        <tr key={r.id}><td>{r.label}{r.enabled ? '' : ' (off)'}</td><td>{r.action}</td><td>{r.cases}</td><td>{r.actioned}</td><td>{r.dismissed}</td><td>{pct(r.cases ? r.dismissed / r.cases : null)}</td></tr>
                    ))}
                </tbody>
            </table>
            <p className="admin-section-sub">Rules that refuse a post (reject, block) open no case, so they do not show here. Their hits are in the Mod log.</p>
            <h4 className="admin-subhead">Who looked at sensitive records</h4>
            {!access ? <div className="admin-empty">Loading…</div> : !access.length ? <div className="admin-empty">Nothing logged.</div> : (
                <table className="admin-ip-table">
                    <thead><tr><th>when</th><th>staff</th><th>what</th><th>about</th></tr></thead>
                    <tbody>{access.map((a, i) => <tr key={i}><td>{timeAgoShort(a.created_at)}</td><td>{a.actor || '?'}</td><td>{a.what.replace(/_/g, ' ')}</td><td>{a.target_name || (a.details?.authors ? `${a.details.authors} accounts` : '')}</td></tr>)}</tbody>
                </table>
            )}
        </>
    );
}

// ==================== settings and VPN networks ====================

const SETTING_FIELDS: { key: string; label: string; type: 'number' | 'select' | 'bool'; options?: string[]; help: string }[] = [
    { key: 'flood_per_minute', label: 'Posts or comments a minute, per account', type: 'number', help: 'More than this is refused.' },
    { key: 'repeat_limit', label: 'Same text from one account in 24 h', type: 'number', help: 'At this count the repeat gets the action below.' },
    { key: 'repeat_action', label: 'Action on repeats', type: 'select', options: ['flag', 'hide', 'reject'], help: '' },
    { key: 'ring_size', label: 'Accounts with the same text in 1 h', type: 'number', help: 'A copy ring: opens a case and a coordination signal.' },
    { key: 'ring_action', label: 'Action on copy rings', type: 'select', options: ['flag', 'hide'], help: '' },
    { key: 'ring_min_chars', label: 'Shortest text a copy ring counts', type: 'number', help: 'Keeps "nice art!" out of it.' },
    { key: 'near_dup_threshold', label: 'Near-duplicate similarity (0.3 to 1)', type: 'number', help: 'Shingle overlap that counts as the same text.' },
    { key: 'report_autohide', label: 'Reporters that hide a post until review (0 = off)', type: 'number', help: 'Only accounts older than the age below count.' },
    { key: 'report_min_account_days', label: 'Account age for a report to count (days)', type: 'number', help: 'Stops new throwaway accounts from hiding posts.' },
    { key: 'appeal_window_days', label: 'Days to appeal', type: 'number', help: '' },
    { key: 'appeal_second_reviewer', label: 'Appeals need a second moderator', type: 'bool', help: 'Turn off only if you moderate alone.' },
    { key: 'evidence_days', label: 'Keep copies of reported text (days after a decision)', type: 'number', help: '' },
    { key: 'removed_content_days', label: 'Delete removed posts after (days, 0 = keep)', type: 'number', help: 'Never sooner than the appeal window.' },
    { key: 'fingerprint_days', label: 'Keep duplicate hashes (days)', type: 'number', help: 'Hashes only, never the text.' },
    { key: 'signal_days', label: 'Keep similarity signals (days)', type: 'number', help: '' },
    { key: 'dm_new_chats_per_hour', label: 'New chats an hour, per account', type: 'number', help: 'Message spam usually starts many new chats.' },
    { key: 'vpn_mode', label: 'VPN and hosting networks', type: 'select', options: ['block', 'off'], help: 'block: no posts, comments, reactions, follows or messages from listed networks. Reading always works. Staff are exempt.' },
    { key: 'vpn_require_proxy', label: 'Refuse Hub writes that skip the site', type: 'bool', help: 'Turn on only after the Worker that signs networks is live, or nobody can post.' }
];

export function SafetySettingsTab() {
    useStore();
    const [s, setS] = useState<any>(null);
    const [rules, setRules] = useState<any[] | null>(null);
    const [error, setError] = useState('');
    const [draft, setDraft] = useState({ asn: '', cidr: '', label: '' });
    const canEdit = can('manage_filter');
    const canNet = can('ban') && can('view_ips');

    const load = () => {
        rpc('admin_get_moderation_settings').then(setS).catch(e => setError(e.message));
        if (can('view_ips')) rpc<any[]>('admin_list_network_rules').then(setRules).catch(() => setRules([]));
    };
    useEffect(() => { load(); }, []);

    async function save() {
        const patch: Record<string, unknown> = {};
        for (const f of SETTING_FIELDS) patch[f.key] = f.type === 'number' ? Number(s[f.key]) : s[f.key];
        if (!canNet) { delete patch.vpn_mode; delete patch.vpn_require_proxy; }
        try { await rpc('admin_set_moderation_settings', { p: patch }); showToast('Settings saved', 'success'); load(); }
        catch (e: any) { showToast(e.message || 'Could not save.', 'error'); }
    }
    async function saveRule(r: any) {
        try {
            await rpc('admin_upsert_network_rule', { p_id: r.id ?? null, p_asn: r.asn ? Number(r.asn) : null, p_cidr: r.cidr || null, p_label: r.label, p_enabled: r.enabled ?? true });
            setDraft({ asn: '', cidr: '', label: '' });
            load();
        } catch (e: any) { showToast(e.message || 'Could not save that network.', 'error'); }
    }
    async function removeRule(r: any) {
        if (!window.confirm(`Remove ${r.label}? Writes from it work again.`)) return;
        try { await rpc('admin_delete_network_rule', { p_id: r.id }); load(); }
        catch (e: any) { showToast(e.message, 'error'); }
    }

    if (error) return <div className="admin-empty admin-error">{error}</div>;
    if (!s) return <div className="admin-empty">Loading…</div>;
    return (
        <>
            <div className="admin-section-head">
                <h3>Moderation settings</h3>
                {canEdit && <button type="button" className="btn btn-primary btn-sm" onClick={save}>Save</button>}
            </div>
            <div className="admin-settings-grid">
                {SETTING_FIELDS.map(f => (
                    <label key={f.key} className="form-group">
                        <span>{f.label}</span>
                        {f.type === 'bool'
                            ? <input type="checkbox" checked={!!s[f.key]} disabled={!canEdit || (f.key.startsWith('vpn') && !canNet)} onChange={e => setS({ ...s, [f.key]: e.target.checked })} />
                            : f.type === 'select'
                                ? <select value={s[f.key]} disabled={!canEdit || (f.key.startsWith('vpn') && !canNet)} onChange={e => setS({ ...s, [f.key]: e.target.value })}>{f.options!.map(o => <option key={o} value={o}>{o}</option>)}</select>
                                : <input type="number" step={f.key === 'near_dup_threshold' ? 0.05 : 1} value={s[f.key]} disabled={!canEdit} onChange={e => setS({ ...s, [f.key]: e.target.value })} />}
                        {f.help && <small>{f.help}</small>}
                    </label>
                ))}
            </div>
            {rules && (
                <>
                    <h4 className="admin-subhead">VPN and hosting networks</h4>
                    <p className="admin-section-sub">
                        Matched by Cloudflare's network number (ASN, signed by the Worker) or by address range. This catches datacenter VPNs and proxies, not every VPN.
                        Cloudflare (WARP) and Akamai (iCloud Private Relay) are left off on purpose: too many normal visitors use them.
                    </p>
                    {rules.map(r => (
                        <div key={r.id} className={`admin-term-row ${r.enabled ? '' : 'off'}`}>
                            <div><div className="admin-term-head">{r.label}</div><code>{r.asn ? `AS${r.asn}` : r.cidr}</code></div>
                            <div className="admin-term-actions">
                                <button type="button" title={r.enabled ? 'Disable' : 'Enable'} disabled={!canNet} onClick={() => saveRule({ ...r, enabled: !r.enabled })}><Icon name={r.enabled ? 'toggle-right' : 'toggle-left'} /></button>
                                <button type="button" title="Remove" disabled={!canNet} onClick={() => removeRule(r)}><Icon name="trash-2" /></button>
                            </div>
                        </div>
                    ))}
                    {canNet && (
                        <div className="admin-search-bar">
                            <input type="text" placeholder="Name, e.g. ExampleVPN" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />
                            <input type="number" placeholder="ASN" value={draft.asn} onChange={e => setDraft({ ...draft, asn: e.target.value })} />
                            <input type="text" placeholder="or range, e.g. 203.0.113.0/24" value={draft.cidr} onChange={e => setDraft({ ...draft, cidr: e.target.value })} />
                            <button type="button" className="btn btn-secondary btn-sm" disabled={!draft.label.trim() || (!draft.asn && !draft.cidr.trim())} onClick={() => saveRule({ ...draft, cidr: draft.cidr.trim() })}>Add</button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}
