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
import { coinBurst } from '../components/coinBurst.ts';
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
 * "Got it", the one button that closes an update. When the update pays
 * Woobux (from v1.20.0 on) and you have not been paid for it, it reads
 * "Got it (+500 [coin])" and asks the server to pay as it closes; the coins
 * fly from it to your balance. The server pays once for each account.
 */
function GotItButton({ version, close }: { version?: string; close?: () => void }) {
    useStore();
    const [reward, setReward] = useState(0);
    const [busy, setBusy] = useState(false);
    const v = plainVersion(version || '');
    useEffect(() => { if (v) rewardedUpdates().then(r => setReward(r[v] || 0)); }, [v]);
    const pays = !!reward && !!state.user && !woobux()?.acknowledged.includes(v);
    return (
        <button type="button" className="btn btn-primary update-got-it" disabled={busy}
            onClick={async e => {
                if (!pays) { close?.(); return; }
                const btn = e.currentTarget;
                const before = woobux()?.balance ?? 0;
                setBusy(true);
                const paid = await acknowledgeUpdate(v);
                setBusy(false);
                // the coins fly from this button to your balance (js/app/components/coinBurst.ts)
                if (paid) coinBurst(btn, before, woobux()?.balance ?? before + paid);
                close?.();
            }}>
            Got it{pays && <span className="update-got-it-reward">(+{reward.toLocaleString()} <WoobuxIcon size={16} />)</span>}
        </button>
    );
}

/** One update: its version, title and date, the note, then each section of changes. `gotIt`: its own "Got it" at the end (the Updates list). */
export function UpdateEntry({ update, latest = false, gotIt = true }: { update: Update; latest?: boolean; gotIt?: boolean }) {
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
            {gotIt && update.version && <UpdatePayRow version={update.version} />}
        </article>
    );
}

/** In the Updates list: the same "Got it (+500)" for an update that still pays, nothing otherwise. */
function UpdatePayRow({ version }: { version: string }) {
    useStore();
    const [reward, setReward] = useState(0);
    const v = plainVersion(version);
    useEffect(() => { rewardedUpdates().then(r => setReward(r[v] || 0)); }, [v]);
    if (!reward || !state.user || woobux()?.acknowledged.includes(v)) return null;
    return <div className="update-entry-ack"><GotItButton version={version} /></div>;
}

function WhatsNewDialog({ item, close }: DialogProps<{ item: Update }>) {
    return (
        <Modal onClose={close} title="What's New" className="whats-new" labelledBy="whats-new-title">
            <div className="whats-new-body"><UpdateEntry update={item} gotIt={false} /></div>
            <div className="whats-new-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { closeDialog('whats-new'); openUpdates(); }}><Icon name="newspaper" />Every update</button>
                <GotItButton version={item.version} close={close} />
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
