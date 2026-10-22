// Staff tools on the normal site: the menu the shield button and right-click
// open (js/app/components/ModButton.tsx), and the reason box each action asks
// for. Loaded on demand, for staff only.
//
// Every action here calls the same admin_* database function the staff panel
// (admin.html) does. Those check the caller's permission and rank themselves
// and record the action in the moderation log; what this file shows or hides
// is a courtesy, not the control.

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { api, state } from '../core/app.ts';
import { Icon } from '../app/components/Icon.tsx';
import { Modal } from '../app/components/Modal.tsx';
import { closeDialog, openDialog, registerDialog, type DialogProps } from '../app/dialogs.tsx';
import { isActive, whenText } from '../features/moderation-model.ts';
import type { ModTarget } from '../app/components/ModButton.tsx';
import { SkeletonRows } from '../app/components/Skeleton.tsx';

type Perms = Record<string, boolean | number>;
const perms = (): Perms => (state.user?.permissions || {}) as Perms;
const toast = (m: string, kind = 'info') => api.showToast?.(m, kind);

interface Action {
    key: string; label: string; icon: string; needs: string; danger?: boolean;
    title: string; blurb: string; confirm: string; requireReason?: boolean;
    durations?: Array<[number, string]>;
    rpc: (t: ModTarget, reason: string, amount: number) => [string, object];
    /** content was removed: the page drops it */
    removes?: boolean;
}

const REMOVE: Record<string, Action> = {
    post: {
        key: 'remove', label: 'Remove this post', icon: 'trash-2', needs: 'delete_content', danger: true, removes: true,
        title: 'Remove this post', confirm: 'Remove post', blurb: 'The author is notified with your reason, and the removal goes in the mod log.',
        rpc: (t, reason) => ['admin_delete_post', { p_post: t.content!.id, p_reason: reason }]
    },
    mon: {
        key: 'remove', label: 'Remove this Fakémon', icon: 'trash-2', needs: 'delete_content', danger: true, removes: true,
        title: 'Remove this Fakémon', confirm: 'Remove Fakémon', blurb: 'It comes off the Community Hub. The author is notified with your reason, and it goes in the mod log.',
        rpc: (t, reason) => ['admin_delete_published_mon', { mon_id: t.content!.id, p_reason: reason }]
    },
    comment: {
        key: 'remove', label: 'Remove this comment', icon: 'trash-2', needs: 'delete_content', danger: true, removes: true,
        title: 'Remove this comment', confirm: 'Remove comment', blurb: 'The author is notified with your reason, and the removal goes in the mod log.',
        rpc: (t, reason) => ['admin_delete_comment', { p_comment_id: t.content!.id, p_kind: t.content!.commentKind || 'mon', p_reason: reason }]
    }
};

const WARN: Action = {
    key: 'warn', label: 'Warn', icon: 'alert-triangle', needs: 'warn',
    title: 'Issue a warning', confirm: 'Send warning', blurb: 'They get a notification with your reason. Warnings count toward the automatic ladder, so a second offence lands a mute.',
    rpc: (t, reason) => ['admin_warn_user', { p_user_id: t.userId, p_reason: reason }]
};
const MUTE: Action = {
    key: 'mute', label: 'Mute', icon: 'mic-off', needs: 'mute',
    title: 'Mute this account', confirm: 'Apply mute', blurb: 'A muted account can still sign in and browse, but cannot comment, publish or update a listing.',
    durations: [[60, '1 hour'], [360, '6 hours'], [1440, '24 hours'], [10080, '7 days'], [43200, '30 days'], [0, 'Until lifted']],
    rpc: (t, reason, mins) => ['admin_mute_user', { p_user_id: t.userId, p_minutes: mins, p_reason: reason }]
};
const UNMUTE: Action = {
    key: 'unmute', label: 'Lift mute', icon: 'mic', needs: 'mute', requireReason: false,
    title: 'Lift this mute', confirm: 'Unmute', blurb: 'The account can post again right away. The mute stays in the log.',
    rpc: (t, reason) => ['admin_unmute_user', { p_user_id: t.userId, p_reason: reason }]
};
const BAN: Action = {
    key: 'ban', label: 'Suspend', icon: 'ban', needs: 'ban', danger: true,
    title: 'Suspend this account', confirm: 'Suspend', blurb: 'The account cannot sign in at all until the suspension ends.',
    durations: [[1, '1 day'], [7, '7 days'], [30, '30 days'], [90, '90 days'], [0, 'Permanent']],
    rpc: (t, reason, days) => ['admin_ban_user', { p_user_id: t.userId, p_days: days, p_reason: reason }]
};
const UNBAN: Action = {
    key: 'unban', label: 'Lift suspension', icon: 'undo-2', needs: 'ban', requireReason: false,
    title: 'Lift this suspension', confirm: 'Lift suspension', blurb: 'The account can sign in again right away.',
    rpc: (t, reason) => ['admin_unban_user', { p_user_id: t.userId, p_reason: reason }]
};
const RESET_NAME: Action = {
    key: 'reset_name', label: 'Reset display name', icon: 'pencil', needs: 'delete_content',
    title: 'Reset the display name', confirm: 'Reset name', blurb: 'Their display name is removed, so they show as @username until they pick a new one. They are told why.',
    rpc: (t, reason) => ['admin_reset_profile_text', { p_user_id: t.userId, p_field: 'display_name', p_reason: reason }]
};
const CLEAR_BIO: Action = {
    key: 'clear_bio', label: 'Clear bio', icon: 'eraser', needs: 'delete_content',
    title: 'Clear the bio', confirm: 'Clear bio', blurb: 'Their profile bio is emptied. They are told why and can write a new one.',
    rpc: (t, reason) => ['admin_reset_profile_text', { p_user_id: t.userId, p_field: 'bio', p_reason: reason }]
};

/** Opens the menu at a point on the screen. */
export function openModMenu(target: ModTarget, at: { x: number; y: number }) {
    openDialog('mod-menu', { target, at });
}

function ModMenu({ close, target, at }: DialogProps<{ target: ModTarget; at: { x: number; y: number } }>) {
    const p = perms();
    const box = useRef<HTMLDivElement>(null);
    // who this is to the site right now: standing and rank decide what's offered
    const [who, setWho] = useState<any>(null);
    const [failed, setFailed] = useState('');
    useEffect(() => {
        let live = true;
        api.getClient().then((c: any) => c.rpc('admin_user_overview', { p_user_id: target.userId })).then(({ data, error }: any) => {
            if (!live) return;
            if (error || !data) setFailed(error?.message || 'This account could not be read.'); else setWho(data);
        });
        return () => { live = false; };
    }, [target.userId]);

    // kept on screen, wherever it was opened from
    const [pos, setPos] = useState({ left: at.x, top: at.y, ready: false });
    useLayoutEffect(() => {
        const r = box.current?.getBoundingClientRect();
        if (!r) return;
        setPos({ left: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)), ready: true });
    }, [who, failed]);

    useEffect(() => {
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        const away = () => close();
        document.addEventListener('keydown', key);
        window.addEventListener('scroll', away, { passive: true, capture: true });
        window.addEventListener('resize', away);
        box.current?.querySelector<HTMLElement>('button')?.focus();
        return () => { document.removeEventListener('keydown', key); window.removeEventListener('scroll', away, true); window.removeEventListener('resize', away); };
    }, []);

    const name = who?.display_name || who?.username || target.userName || 'this account';
    // the server refuses anyone of your rank or above; don't offer what it will refuse
    const outranked = !!who && Number(who.rank) >= Number(p.rank || 0);
    const may = (a: Action) => !!p[a.needs] && !outranked;
    const banned = isActive(who?.banned_until), muted = isActive(who?.muted_until);
    const onContent = target.content ? [REMOVE[target.content.kind]].filter(may) : [];
    const onUser = who ? [WARN, muted ? UNMUTE : MUTE, banned ? UNBAN : BAN, ...(who.display_name ? [RESET_NAME] : []), ...(who.bio ? [CLEAR_BIO] : [])].filter(may) : [];
    const run = (a: Action) => { close(); openDialog('mod-ask', { action: a, target, name }); };
    const item = (a: Action) => (
        <button key={a.key} type="button" role="menuitem" className={a.danger ? 'is-danger' : ''} onClick={() => run(a)}><Icon name={a.icon} size={14} /> {a.label}</button>
    );

    return (
        <div className="mod-menu-layer" onMouseDown={e => { if (e.target === e.currentTarget) close(); }} onContextMenu={e => { e.preventDefault(); close(); }}>
            <div className="feed-menu mod-menu" role="menu" aria-label={`Staff tools for ${name}`} ref={box} style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}>
                <div className="mod-menu-head">
                    <Icon name="shield-check" size={14} />
                    <span className="mod-menu-name">{name}</span>
                    {who?.username && who.display_name && <span className="mod-menu-handle">@{who.username}</span>}
                </div>
                {!who && !failed && <SkeletonRows count={2} />}
                {failed && <p className="mod-menu-note is-problem">{failed}</p>}
                {who && (
                    <p className="mod-menu-note">
                        {banned ? `Suspended ${whenText(who.banned_until)}` : muted ? `Muted ${whenText(who.muted_until)}` : 'In good standing'}
                        {Number(who.warnings) > 0 && ` · ${who.warnings} strike${Number(who.warnings) === 1 ? '' : 's'}`}
                    </p>
                )}
                {who && outranked && <p className="mod-menu-note">Same rank as you or higher, so there is nothing you can do here.</p>}
                {onContent.length > 0 && <div className="mod-menu-group">{onContent.map(item)}</div>}
                {onUser.length > 0 && <div className="mod-menu-group">{onUser.map(item)}</div>}
                <div className="mod-menu-group">
                    <button type="button" role="menuitem" onClick={() => { close(); api.showProfileView?.(target.userId); }}><Icon name="user" size={14} /> Open profile</button>
                    <a role="menuitem" href="admin.html" target="_blank" rel="noopener"><Icon name="external-link" size={14} /> Staff panel</a>
                </div>
            </div>
        </div>
    );
}
registerDialog('mod-menu', ModMenu);

function ModAsk({ close, action: a, target, name }: DialogProps<{ action: Action; target: ModTarget; name: string }>) {
    const needReason = a.requireReason !== false;
    const [reason, setReason] = useState('');
    const [amount, setAmount] = useState(a.durations?.[0]?.[0] ?? 0);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState('');
    async function submit(e: FormEvent) {
        e.preventDefault();
        if (needReason && !reason.trim()) { setProblem('Give a reason. They see it, and it goes in the log.'); return; }
        setBusy(true);
        setProblem('');
        try {
            const [fn, args] = a.rpc(target, reason.trim(), amount);
            const { error } = await (await api.getClient()).rpc(fn, args);
            if (error) throw error;
            toast(`${a.title}: done.`, 'success');
            close();
            if (a.removes) target.onRemoved?.();
        } catch (err: any) {
            // the server's own words: no permission, outranked, already gone
            setProblem(err?.message || 'That did not go through.');
            setBusy(false);
        }
    }
    return (
        <Modal onClose={close} title={a.title} className="mod-ask" labelledBy="mod-ask-title">
            <form onSubmit={submit}>
                <p className="dialog-hint"><strong>{name}</strong>{target.content?.label ? `, ${target.content.label}` : ''}. {a.blurb}</p>
                {a.durations && (
                    <div className="form-group">
                        <label htmlFor="mod-ask-duration">How long</label>
                        <select id="mod-ask-duration" value={amount} onChange={e => setAmount(Number(e.target.value))}>
                            {a.durations.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                        </select>
                    </div>
                )}
                <div className="form-group">
                    <label htmlFor="mod-ask-reason">Reason {needReason ? '(they see this)' : '(optional)'}</label>
                    <textarea id="mod-ask-reason" rows={3} maxLength={300} autoFocus value={reason} onChange={e => setReason(e.target.value)}
                        aria-invalid={!!problem} aria-describedby={problem ? 'mod-ask-problem' : undefined} />
                </div>
                {problem && <p className="mod-ask-problem" id="mod-ask-problem" role="alert">{problem}</p>}
                <div className="dialog-actions">
                    <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>Cancel</button>
                    <button type="submit" className={`btn ${a.danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>{busy ? 'Working…' : a.confirm}</button>
                </div>
            </form>
        </Modal>
    );
}
registerDialog('mod-ask', ModAsk);

export function closeModMenu() { closeDialog('mod-menu'); }
