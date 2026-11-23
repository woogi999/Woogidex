// The update dialogs (js/features/whats-new.ts, js/features/updates.ts):
// "What's New" shows the newest update, all of it, once after a release;
// "Updates" shows every one, newest first, from the account menu, /updates
// and What's New's "Every update".

import { useEffect, useState } from 'react';
import { registerDialog, closeDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { Icon } from '../components/Icon.tsx';
import { SkeletonDoc } from '../components/Skeleton.tsx';
import { loadUpdates, type Update } from '../../features/updates.ts';
import { openUpdates } from '../../features/whats-new.ts';
import { acknowledgeUpdate, rewardedUpdates, woobux } from '../../features/woobux.ts';
import { WoobuxIcon } from './woobux.tsx';
import { useStore } from '../store.ts';
import { state } from '../../core/app.ts';

// **bold** and `code` become elements; everything else stays escaped text
function Rich({ text }: { text: string }) {
    const parts = String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
                if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
                return part;
            })}
        </>
    );
}

/** "v1.20.0" -> "1.20.0", the key the server pays by (rewarded_updates). */
const plainVersion = (v: string) => String(v || '').trim().replace(/^v/i, '');

/**
 * The Woobux for reading an update, when that update pays (from v1.20.0 on).
 * The server pays once for each account; the button only asks.
 */
function AcknowledgeButton({ version, close }: { version: string; close?: () => void }) {
    useStore();
    const [reward, setReward] = useState(0);
    const [busy, setBusy] = useState(false);
    const v = plainVersion(version);
    useEffect(() => { rewardedUpdates().then(r => setReward(r[v] || 0)); }, [v]);
    if (!reward) return null;
    const done = !!woobux()?.acknowledged.includes(v);
    if (done) return <span className="update-ack is-done"><WoobuxIcon size={16} />You got {reward} Woobux for this one</span>;
    return (
        <button type="button" className="btn btn-primary update-ack" disabled={busy}
            onClick={async () => { setBusy(true); await acknowledgeUpdate(v); setBusy(false); close?.(); }}>
            <WoobuxIcon size={18} />{state.user ? `Got it, +${reward} Woobux` : `Sign in to get ${reward} Woobux`}
        </button>
    );
}

/** One update: its version, title and date, the note, then each section of changes. */
export function UpdateEntry({ update, latest = false }: { update: Update; latest?: boolean }) {
    return (
        <article className={`update-entry${latest ? ' is-latest' : ''}`}>
            <header className="update-entry-head">
                <span className="update-entry-version">{update.version}{latest && <span className="update-entry-new">Latest</span>}</span>
                <h4>{update.title || 'Update'}</h4>
                {update.date && <time>{update.date}</time>}
            </header>
            {update.intro.map((p, i) => <p key={i} className="update-entry-intro"><Rich text={p} /></p>)}
            {update.sections.map((s, i) => (
                <section key={i} className="update-entry-section">
                    {s.title && <h5>{s.title}</h5>}
                    <ul>{s.items.map((item, j) => <li key={j}><Rich text={item} /></li>)}</ul>
                </section>
            ))}
            {update.version && <div className="update-entry-ack"><AcknowledgeButton version={update.version} /></div>}
        </article>
    );
}

function WhatsNewDialog({ item, close }: DialogProps<{ item: Update }>) {
    return (
        <Modal onClose={close} title="What's New" className="whats-new" labelledBy="whats-new-title">
            <div className="whats-new-body"><UpdateEntry update={item} /></div>
            <div className="whats-new-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { closeDialog('whats-new'); openUpdates(); }}><Icon name="newspaper" />Every update</button>
                <button type="button" className="btn btn-primary" onClick={close}>Got it</button>
            </div>
        </Modal>
    );
}

function UpdatesDialog({ close }: DialogProps) {
    const [list, setList] = useState<Update[] | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => { loadUpdates().then(setList).catch(() => setFailed(true)); }, []);
    return (
        <Modal onClose={close} title="Updates" className="updates-dialog" labelledBy="updates-dialog-title">
            <div className="updates-list">
                {failed
                    ? <p className="updates-empty">The updates could not load. Check your connection and try again.</p>
                    : !list
                        ? <><SkeletonDoc lines={6} label="Loading updates" /><SkeletonDoc lines={5} label="Loading updates" /></>
                        : list.length
                            ? list.map((u, i) => <UpdateEntry key={u.id} update={u} latest={i === 0} />)
                            : <p className="updates-empty">No updates yet.</p>}
            </div>
        </Modal>
    );
}

registerDialog('whats-new', WhatsNewDialog);
registerDialog('updates', UpdatesDialog);
