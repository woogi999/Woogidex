// Safety dialogs: report something, change who can comment on your thing,
// and appeal a moderation decision. Calls: js/features/safety.ts. Wording:
// js/features/safety-model.ts. Styles: .safety-* at the end of Core's css/feedback.css.

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../core/app.ts';
import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { Icon } from '../components/Icon.tsx';
import {
    APPEAL_MAX, APPEAL_MIN, COMMENT_MODES, REPORT_DETAILS_MAX, REPORT_REASONS, SLOW_MODES, historyLabel, reportTargetLabel,
    type CommentKind, type ReportKind
} from '../../features/safety-model.ts';
import { loadCommentControl, reportContent, saveCommentControl, submitAppeal } from '../../features/safety.ts';

// ==================== report ====================

type ReportProps = DialogProps<{ kind: ReportKind; id: string; commentKind?: CommentKind | null; name?: string }>;

function ReportDialog({ close, kind, id, commentKind = null, name = '' }: ReportProps) {
    const [reason, setReason] = useState('');
    const [details, setDetails] = useState('');
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);
    const what = reportTargetLabel(kind);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (sending) return;
        if (!reason) { setError('Pick a reason.'); return; }
        setSending(true);
        const problem = await reportContent(kind, id, commentKind, reason, details);
        setSending(false);
        if (problem) { setError(problem); return; }
        close();
        api.showToast?.('Thanks. Staff will look at it. You can follow your reports in Settings > Safety.', 'success');
    }

    return (
        <Modal onClose={close} className="safety-modal" labelledBy="report-title">
            <div className="modal-header">
                <h3 id="report-title">Report this {what}{name ? <span className="safety-name"> by {name}</span> : null}</h3>
                <button className="modal-close" type="button" onClick={close} aria-label="Close"><Icon name="x" size={20} /></button>
            </div>
            <form className="modal-body" onSubmit={submit}>
                <p className="safety-lead">Reports go to the Woogidex moderators. The person you report does not see who reported them.</p>
                <fieldset className="safety-reasons">
                    <legend>What is wrong?</legend>
                    {REPORT_REASONS.map(r => (
                        <label key={r.key} className={`safety-reason${reason === r.key ? ' is-on' : ''}`}>
                            <input type="radio" name="report-reason" value={r.key} checked={reason === r.key} onChange={() => { setReason(r.key); setError(''); }} />
                            <span><strong>{r.label}</strong><small>{r.hint}</small></span>
                        </label>
                    ))}
                </fieldset>
                <div className="form-group">
                    <label htmlFor="report-details">Details (optional) <span className="feedback-count">{details.length}/{REPORT_DETAILS_MAX}</span></label>
                    <textarea id="report-details" rows={3} maxLength={REPORT_DETAILS_MAX} value={details} onChange={e => setDetails(e.target.value)}
                        placeholder="Anything that helps staff understand it." />
                </div>
                {reason === 'self_harm' && (
                    <p className="safety-note"><Icon name="heart" size={14} /> If someone is in danger right now, contact local emergency services. Staff read these reports first.</p>
                )}
                <p className="auth-modal-error" role="alert">{error}</p>
                <div className="feedback-actions">
                    <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={sending}><Icon name="flag" /> Send report</button>
                </div>
            </form>
        </Modal>
    );
}

// ==================== comment controls ====================

function CommentControlsDialog({ close, kind, id }: DialogProps<{ kind: CommentKind; id: string }>) {
    const [mode, setMode] = useState<string | null>(null);
    const [slow, setSlow] = useState(0);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => { loadCommentControl(kind, id).then(c => { setMode(c.mode); setSlow(c.slow_seconds || 0); }); }, [kind, id]);

    async function save() {
        if (mode === null || saving) return;
        setSaving(true);
        const problem = await saveCommentControl(kind, id, mode, slow);
        setSaving(false);
        if (problem) { setError(problem); return; }
        close();
        api.showToast?.('Comment setting saved.', 'success');
    }

    return (
        <Modal onClose={close} className="safety-modal" labelledBy="comment-controls-title">
            <div className="modal-header">
                <h3 id="comment-controls-title">Who can comment</h3>
                <button className="modal-close" type="button" onClick={close} aria-label="Close"><Icon name="x" size={20} /></button>
            </div>
            <div className="modal-body">
                {mode === null ? <p className="safety-lead">Loading…</p> : (
                    <>
                        <fieldset className="safety-reasons">
                            <legend>Comments</legend>
                            {COMMENT_MODES.map(m => (
                                <label key={m.key} className={`safety-reason${mode === m.key ? ' is-on' : ''}`}>
                                    <input type="radio" name="comment-mode" checked={mode === m.key} onChange={() => setMode(m.key)} />
                                    <span><strong>{m.label}</strong></span>
                                </label>
                            ))}
                        </fieldset>
                        <div className="form-group">
                            <label htmlFor="comment-slow">Slow mode: time between two comments from one person</label>
                            <select id="comment-slow" value={slow} onChange={e => setSlow(Number(e.target.value))} disabled={mode === 'off'}>
                                {SLOW_MODES.map(([s, label]) => <option key={s} value={s}>{label}</option>)}
                            </select>
                        </div>
                        <p className="safety-lead">Your own hidden words (Settings &gt; Safety) also apply here.</p>
                    </>
                )}
                <p className="auth-modal-error" role="alert">{error}</p>
                <div className="feedback-actions">
                    <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={saving || mode === null} onClick={save}>Save</button>
                </div>
            </div>
        </Modal>
    );
}

// ==================== appeal ====================

function AppealDialog({ close, entry, onSent }: DialogProps<{ entry: any; onSent?: () => void }>) {
    const [body, setBody] = useState('');
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (sending) return;
        if (body.trim().length < APPEAL_MIN) { setError(`Write at least ${APPEAL_MIN} characters.`); return; }
        setSending(true);
        const problem = await submitAppeal(entry.id, body);
        setSending(false);
        if (problem) { setError(problem); return; }
        close();
        onSent?.();
        api.showToast?.('Appeal sent. A different moderator looks at it, and you get a notification with the answer.', 'success');
    }

    return (
        <Modal onClose={close} className="safety-modal" labelledBy="appeal-title">
            <div className="modal-header">
                <h3 id="appeal-title">Appeal: {historyLabel(entry.action)}</h3>
                <button className="modal-close" type="button" onClick={close} aria-label="Close"><Icon name="x" size={20} /></button>
            </div>
            <form className="modal-body" onSubmit={submit}>
                {entry.reason && <p className="safety-lead"><strong>Reason given:</strong> {entry.reason}</p>}
                {entry.excerpt && <blockquote className="safety-excerpt">{entry.excerpt}</blockquote>}
                <div className="form-group">
                    <label htmlFor="appeal-body">Why is this wrong? <span className="feedback-count">{body.length}/{APPEAL_MAX}</span></label>
                    <textarea id="appeal-body" rows={5} maxLength={APPEAL_MAX} required value={body} onChange={e => setBody(e.target.value)}
                        placeholder="Tell staff what they missed. Calm and clear helps most." autoFocus />
                </div>
                <p className="auth-modal-error" role="alert">{error}</p>
                <div className="feedback-actions">
                    <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={sending}><Icon name="send" /> Send appeal</button>
                </div>
            </form>
        </Modal>
    );
}

registerDialog('report', ReportDialog);
registerDialog('comment-controls', CommentControlsDialog);
registerDialog('appeal', AppealDialog);
