// "Feedback & bug reports", from the account menu: send a report, or follow
// the ones you sent under My reports, where each one is a thread you and the
// team reply in, like a support ticket. Sending and loading: js/features/feedback.ts.

import { useEffect, useState, type FormEvent } from 'react';
import { api, state } from '../../core/app.ts';
import { BODY_MAX, KINDS, STATUS, TITLE_MAX, hasNewReply, loadMyFeedback, loadTicket, sendFeedback, sendTicketReply, type MyReport, type TicketMessage } from '../../features/feedback.ts';
import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { Icon } from '../components/Icon.tsx';
import { useSlide } from '../hooks.ts';
import { SkeletonRows } from '../components/Skeleton.tsx';

type Tab = 'send' | 'mine';

const PLACEHOLDER: Record<string, string> = {
    bug: 'What happened, and what did you expect to happen? Steps to make it happen again help a lot.',
    idea: 'Describe the idea and what it would help you do.',
    feedback: 'What’s on your mind?'
};

function FeedbackDialog({ close, tab: initialTab = 'send', ticket = '' }: DialogProps<{ tab?: Tab; ticket?: string }>) {
    const [tab, setTab] = useState<Tab>(initialTab);
    const pane = useSlide(tab, ['send', 'mine'] as Tab[]);
    return (
        <Modal onClose={close} className="feedback-modal" overlayClassName="feedback-overlay" labelledBy="feedback-title">
            <div className="modal-header">
                <h3 id="feedback-title">Feedback &amp; bug reports</h3>
                <button className="modal-close" type="button" onClick={close} aria-label="Close"><Icon name="x" size={20} /></button>
            </div>
            <div className="modal-body">
                {!state.user ? (
                    <div className="feedback-signin">
                        <span className="feedback-signin-icon"><Icon name="message-circle-warning" /></span>
                        <strong>Sign in to send feedback</strong>
                        <p>You need an account to send a bug report, feedback or an idea. It lets us reply to you, and you can follow what happens to it under My reports.</p>
                        <button type="button" className="btn btn-primary" onClick={() => { close(); api.openAuthModal('signin'); }}>Sign in</button>
                        <button type="button" className="btn btn-secondary" onClick={() => { close(); api.openAuthModal('signup'); }}>Create an account</button>
                    </div>
                ) : (
                    <>
                        <div className="tabs feedback-tabs" role="tablist">
                            <button type="button" className={`tab${tab === 'send' ? ' active' : ''}`} role="tab" aria-selected={tab === 'send'} onClick={() => setTab('send')}>Send a report</button>
                            <button type="button" className={`tab${tab === 'mine' ? ' active' : ''}`} role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>My reports</button>
                        </div>
                        <div ref={pane}>
                            {tab === 'send' ? <SendForm close={close} onSent={() => setTab('mine')} /> : <MyReports onSend={() => setTab('send')} ticket={ticket} />}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

function SendForm({ close, onSent }: { close: () => void; onSent: () => void }) {
    const [kind, setKind] = useState('bug');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [withContext, setWithContext] = useState(true);
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);
    const hint = KINDS.find(k => k.key === kind)?.hint || '';

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (sending) return;
        setSending(true);
        const problem = await sendFeedback({ kind, title, body, withContext });
        setSending(false);
        setError(problem);
        if (!problem) onSent();
    }

    return (
        <form onSubmit={submit}>
            <div className="feedback-kinds" role="radiogroup" aria-label="What kind of report">
                {KINDS.map(k => (
                    <button key={k.key} type="button" className={`feedback-kind${k.key === kind ? ' active' : ''}`} role="radio" aria-checked={k.key === kind} onClick={() => setKind(k.key)}>
                        <Icon name={k.icon} /><span>{k.label}</span>
                    </button>
                ))}
            </div>
            <p className="feedback-hint">{hint}</p>
            <div className="form-group">
                <label htmlFor="feedback-report-title">Title</label>
                <input type="text" id="feedback-report-title" maxLength={TITLE_MAX} placeholder="A short summary" autoComplete="off" required autoFocus
                    value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="form-group">
                <label htmlFor="feedback-report-body">Details <span className="feedback-count">{body.length}/{BODY_MAX}</span></label>
                <textarea id="feedback-report-body" rows={6} maxLength={BODY_MAX} required placeholder={PLACEHOLDER[kind]}
                    value={body} onChange={e => setBody(e.target.value)} />
            </div>
            <label className="feedback-check">
                <input type="checkbox" checked={withContext} onChange={e => setWithContext(e.target.checked)} />
                <span>Include the page I’m on and my browser<small>Helps us reproduce a bug. Nothing else about your device is sent.</small></span>
            </label>
            <p className="auth-modal-error">{error}</p>
            <div className="feedback-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={sending}><Icon name="send" /> Send</button>
            </div>
        </form>
    );
}

const dateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Your reports, newest first; one opens its thread. */
function MyReports({ onSend, ticket: startTicket = '' }: { onSend: () => void; ticket?: string }) {
    const [result, setResult] = useState<{ rows: MyReport[]; error: string } | null>(null);
    const [open, setOpen] = useState(startTicket);
    const view = useSlide(open ? 'thread' : 'list', ['list', 'thread']);
    const load = () => loadMyFeedback().then(setResult);
    useEffect(() => { load(); }, []);

    if (!result) return <SkeletonRows count={3} label="Loading your reports" />;
    if (result.error) return <div className="feedback-empty">Your reports could not be loaded: {result.error}</div>;
    const report = open ? result.rows.find(r => r.id === open) : null;
    if (report) return <div ref={view}><Ticket report={report} onBack={() => { setOpen(''); load(); }} onChanged={load} /></div>;
    if (!result.rows.length) {
        return (
            <div className="feedback-empty">You haven’t sent any reports yet.<br />
                <button type="button" className="btn btn-secondary btn-sm" onClick={onSend}>Send one</button>
            </div>
        );
    }
    return (
        <div className="feedback-list" ref={view}>
            {result.rows.map(r => {
                const k = KINDS.find(x => x.key === r.kind) || KINDS[1];
                const fresh = hasNewReply(r);
                return (
                    <button type="button" className={`feedback-item${fresh ? ' has-new' : ''}`} key={r.id} onClick={() => setOpen(r.id)}>
                        <span className="feedback-item-head">
                            <span className={`feedback-item-kind ${r.kind}`} title={k.label}><Icon name={k.icon} /></span>
                            <strong>{r.title}</strong>
                            <span className={`feedback-status ${r.status}`}>{(STATUS as Record<string, string>)[r.status] || r.status}</span>
                        </span>
                        <span className="feedback-item-meta">
                            {fresh ? <span className="feedback-new">New reply</span> : r.last_reply_at ? (r.last_reply_staff ? 'The team replied' : 'You replied last') : 'No replies yet'}
                            <span aria-hidden="true">·</span>
                            Sent {new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** One report and its replies, with a box to reply. */
function Ticket({ report: r, onBack, onChanged }: { report: MyReport; onBack: () => void; onChanged: () => void }) {
    const [thread, setThread] = useState<{ messages: TicketMessage[]; error: string } | null>(null);
    const [reply, setReply] = useState('');
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);
    const k = KINDS.find(x => x.key === r.kind) || KINDS[1];
    const closed = ['resolved', 'wont_fix', 'duplicate'].includes(r.status);
    const load = () => loadTicket(r.id).then(setThread);
    useEffect(() => { load(); }, [r.id]);

    async function send(e: FormEvent) {
        e.preventDefault();
        if (sending) return;
        setSending(true);
        const problem = await sendTicketReply(r.id, reply);
        setSending(false);
        setError(problem);
        if (problem) return;
        setReply('');
        load();
        onChanged();
    }

    return (
        <div className="feedback-ticket">
            <button type="button" className="feedback-back" onClick={onBack}><Icon name="arrow-left" size={15} /> My reports</button>
            <div className="feedback-ticket-head">
                <span className={`feedback-item-kind ${r.kind}`} title={k.label}><Icon name={k.icon} /></span>
                <h4>{r.title}</h4>
                <span className={`feedback-status ${r.status}`}>{(STATUS as Record<string, string>)[r.status] || r.status}</span>
            </div>
            <ol className="feedback-thread">
                <li className="feedback-msg is-you">
                    <span className="feedback-msg-who">You <time dateTime={r.created_at}>{dateTime(r.created_at)}</time></span>
                    <p>{r.body}</p>
                </li>
                {!thread ? <li className="feedback-msg-loading"><SkeletonRows count={1} label="Loading the replies" /></li>
                    : thread.error ? <li className="feedback-empty">The replies could not be loaded: {thread.error}</li>
                        : thread.messages.map(m => (
                            <li key={m.id} className={`feedback-msg ${m.is_staff ? 'is-staff' : 'is-you'}`}>
                                <span className="feedback-msg-who">
                                    {m.is_staff ? <><Icon name="shield-check" size={14} />{m.author ? `${m.author} · ` : ''}Woogidex team</> : 'You'}
                                    <time dateTime={m.created_at}>{dateTime(m.created_at)}</time>
                                </span>
                                <p>{m.body}</p>
                            </li>
                        ))}
            </ol>
            <form className="feedback-reply-form" onSubmit={send}>
                <label htmlFor="feedback-reply-body" className="feedback-reply-label">
                    {closed ? 'This report is closed. A reply opens it again.' : 'Reply'}
                </label>
                <textarea id="feedback-reply-body" rows={3} maxLength={BODY_MAX} placeholder="Add details, or answer the team’s question" value={reply} onChange={e => setReply(e.target.value)} />
                {error && <p className="auth-modal-error">{error}</p>}
                <div className="feedback-actions">
                    <button type="submit" className="btn btn-primary" disabled={sending || !reply.trim()}><Icon name="send" /> Send reply</button>
                </div>
            </form>
        </div>
    );
}

registerDialog('feedback', FeedbackDialog);
