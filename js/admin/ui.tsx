// Small pieces the staff panel's tabs share: a badge's picture, the reason /
// confirm dialog, the toast, and the loading / empty / error states.

import { useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../app/components/Icon.tsx';
import { Modal } from '../app/components/Modal.tsx';
import { registerDialog, type DialogProps } from '../app/dialogs.tsx';
import { useStore } from '../app/store.ts';
import { showToast, toast, type AskAnswer, type AskOptions, type Badge } from './core.ts';

const PNG_DATA_URI = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** A badge's picture: its uploaded image, else its Heroicon. The image is only ever a PNG data URI (the database's check constraint). */
export function BadgeIcon({ badge, size = 14, className = 'profile-badge', colored = true }: { badge: Badge; size?: number; className?: string; colored?: boolean }) {
    if (badge.icon_image && PNG_DATA_URI.test(badge.icon_image)) {
        return <img src={badge.icon_image} className={`${className} admin-badge-image`.trim()} alt={badge.label} style={{ width: size, height: size }} draggable={false} />;
    }
    return <Icon name={badge.icon || 'star'} className={className || undefined} size={size} style={colored ? { color: badge.color } : undefined} />;
}

/** The three states every list goes through before it has rows. */
export function ListState({ loading, error, empty, className = 'admin-empty' }: { loading?: boolean; error?: string; empty?: string | false; className?: string }) {
    if (loading) return <div className={className}>Loading…</div>;
    if (error) return <div className={`${className} admin-error`}>{error}</div>;
    if (empty) return <div className={className}>{empty}</div>;
    return null;
}

export function Toast() {
    useStore();
    if (!toast.message) return null;
    return <div key={toast.seq} className={`admin-toast admin-toast-${toast.kind}`} role="status" style={{ display: 'block' }}>{toast.message}</div>;
}

// ---- the reason / confirm dialog (ask() in core.ts) ----
function AskDialog({ close, title, blurb, confirm = 'Confirm', durations = null, danger = false, dangerText = '', requireReason = true, resolve }: DialogProps<AskOptions & { resolve: (a: AskAnswer) => void }>) {
    const [reason, setReason] = useState('');
    const [amount, setAmount] = useState(durations?.[0]?.[0] ?? 0);
    const cancel = () => { close(); resolve(null); };
    function submit(e: FormEvent) {
        e.preventDefault();
        if (requireReason && !reason.trim()) { showToast('Give a reason - the user sees it, and it goes in the log.', 'error'); return; }
        close();
        resolve({ reason: reason.trim(), amount: durations ? amount : null });
    }
    return (
        <Modal onClose={cancel} title={title} labelledBy="admin-ask-title">
            <form onSubmit={submit}>
                <p className="admin-section-sub">{blurb}</p>
                {durations && (
                    <div className="form-group">
                        <label htmlFor="admin-mod-duration">Duration</label>
                        <select id="admin-mod-duration" value={amount} onChange={e => setAmount(Number(e.target.value))}>
                            {durations.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                        </select>
                    </div>
                )}
                <div className="form-group">
                    <label htmlFor="admin-mod-reason">Reason <span>{requireReason ? '(the user sees this)' : '(optional)'}</span></label>
                    <textarea id="admin-mod-reason" rows={3} placeholder="E.g. slurs in a comment on Flarewisp" autoFocus value={reason} onChange={e => setReason(e.target.value)} />
                </div>
                {danger && (
                    <div className="admin-mod-danger">
                        <Icon name="alert-triangle" />
                        <span>{dangerText || 'This cannot be undone.'}</span>
                    </div>
                )}
                <div className="admin-modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={cancel}>Cancel</button>
                    <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}>{confirm}</button>
                </div>
            </form>
        </Modal>
    );
}
registerDialog('admin-ask', AskDialog);

/** A dialog body's header row with a close button, for dialogs that draw their own. */
export function DialogHead({ title, onClose, children }: { title: ReactNode; onClose: () => void; children?: ReactNode }) {
    return (
        <div className="modal-header">
            <h3>{title}</h3>
            {children}
            <button className="modal-close" type="button" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
    );
}

// ---- sorting ----
// Lists come back from the server in one order (usually newest first); these
// re-sort what's loaded. The choice is remembered per list in this browser.

export type SortOption<T> = [key: string, label: string, compare: (a: T, b: T) => number];

const time = (v: unknown) => (v ? new Date(String(v)).getTime() : 0) || 0;
/** Newest first (or oldest, with `asc`); missing dates go last either way. */
export const byDate = <T,>(get: (x: T) => unknown, asc = false) => (a: T, b: T) => {
    const x = time(get(a)), y = time(get(b));
    if (!x || !y) return (y ? 1 : 0) - (x ? 1 : 0);
    return asc ? x - y : y - x;
};
/** Highest first (or lowest, with `asc`). */
export const byNumber = <T,>(get: (x: T) => unknown, asc = false) => (a: T, b: T) => {
    const x = Number(get(a)) || 0, y = Number(get(b)) || 0;
    return asc ? x - y : y - x;
};
/** A to Z, ignoring case and accents; blanks last. */
export const byText = <T,>(get: (x: T) => unknown) => (a: T, b: T) => {
    const x = String(get(a) ?? '').trim(), y = String(get(b) ?? '').trim();
    if (!x || !y) return (y ? 1 : 0) - (x ? 1 : 0);
    return x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true });
};
/** Rows whose value comes earlier in `order` first. */
export const byRank = <T,>(get: (x: T) => unknown, order: unknown[]) => (a: T, b: T) => {
    const rank = (v: unknown) => { const i = order.indexOf(v); return i === -1 ? order.length : i; };
    return rank(get(a)) - rank(get(b));
};

/** The chosen sort for a list, and the list sorted by it (a stable sort, so ties keep the server's order). */
export function useSort<T>(id: string, options: SortOption<T>[]) {
    const storageKey = `woogidex.admin.sort.${id}`;
    const [key, setKey] = useState(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved && options.some(o => o[0] === saved)) return saved;
        } catch { /* storage blocked */ }
        return options[0][0];
    });
    const choose = (next: string) => {
        setKey(next);
        try { localStorage.setItem(storageKey, next); } catch { /* storage blocked */ }
    };
    const compare = (options.find(o => o[0] === key) || options[0])[2];
    const sort = (rows: T[]) => rows.slice().sort(compare);
    return { key, choose, sort, options };
}

export function SortSelect<T>({ sort, label = 'Sort' }: { sort: ReturnType<typeof useSort<T>>; label?: string }) {
    return (
        <label className="admin-sort">
            <Icon name="arrows-up-down" size={14} />
            <select value={sort.key} onChange={e => sort.choose(e.target.value)} aria-label={label}>
                {sort.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
        </label>
    );
}
