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

/** One update: its version, title and date, then every change. */
export function UpdateEntry({ update, latest = false }: { update: Update; latest?: boolean }) {
    return (
        <article className={`update-entry${latest ? ' is-latest' : ''}`}>
            <header className="update-entry-head">
                <span className="update-entry-version">{update.version}{latest && <span className="update-entry-new">Latest</span>}</span>
                <h4>{update.title || 'Update'}</h4>
                {update.date && <time>{update.date}</time>}
            </header>
            {update.items.length > 0 && <ul>{update.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}</ul>}
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
