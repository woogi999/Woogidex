// Opening the tier maker. Since 2026-11-23 it is its own page,
// /toolbox/tier-maker (js/app/pages/TierMakerPage.tsx), not a window: this
// file keeps the way in (openTierMaker, used by the Toolbox, groups, chats
// and posts) and the saved lists dialog.

import { api } from '../../core/app.ts';
import { registerDialog, openDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { Icon } from '../components/Icon.tsx';
import { useStore } from '../store.ts';
import { cleanTierList, deleteTierList, savedTierLists, snapshot, type TierList } from '../../features/tier-lists.ts';

/**
 * A tier list opened from a group's Toolbox (js/features/groups.ts). In
 * "everyone" mode each member also saves an own ranking, and anyone can see
 * the group's average.
 */
export interface GroupContext { id: string; name: string; rowId: string | null; canEdit: boolean; mode?: 'curated' | 'everyone' }

/** What the page opens with: the list, where it came from, and whose it is. `seq` counts the opens. */
export interface TierMakerStart { seq: number; list: TierList | null; conversationId: string | null; group: GroupContext | null; shared: boolean }
let latest: TierMakerStart | null = null;

/**
 * The last start openTierMaker made (null before the first). Reading it does
 * not use it up: React may run the page's first render twice, and coming
 * back to /toolbox/tier-maker shows the list you had open. The page compares
 * `seq` to know a start is new.
 */
export function currentTierMakerStart(): TierMakerStart | null {
    return latest;
}

/**
 * Opens the tier maker page. A list from a chat, a group or a post opens as
 * a copy whose baseline is what it holds now, so the Changes panel shows what
 * you move, and anything you add to it stays yours.
 */
export async function openTierMaker(list?: TierList | null, conversationId: string | null = null, fromChat = false, group: GroupContext | null = null) {
    // the main-game Pokémon in the Add box load lazily (Showdown's data)
    api.fetchShowdownData?.();
    const start = list ? cleanTierList(list) : null;
    const shared = fromChat || !!group;
    latest = { seq: (latest?.seq || 0) + 1, list: start && shared ? { ...start, baseline: snapshot(start) } : start, conversationId, group, shared };
    await api.openPath?.('toolbox/tier-maker');
    // the page is already open: tell it to take the new start
    window.dispatchEvent(new CustomEvent('woogidex:tier-maker-start'));
}

/** The saved tier lists, to open or delete, and a new one. */
function TierListsDialog({ close }: DialogProps) {
    useStore();
    const lists = savedTierLists();
    return (
        <Modal onClose={close} title="Tier lists" className="tier-lists-modal" labelledBy="tier-lists-title">
            <p className="region-details-help">Rank anything into tiers, for a format or for fun. Send a list in a chat or a group so others can change it.</p>
            <div className="tm-saved">
                {lists.map(l => (
                    <div key={l.id} className="tm-saved-row">
                        <button type="button" className="tm-saved-open" onClick={() => { close(); openTierMaker(l); }}>
                            <strong>{l.title}</strong><small>{Object.keys(l.mons).length} in the list · {new Date(l.updatedAt).toLocaleDateString()}</small>
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" aria-label={`Delete ${l.title}`} onClick={() => deleteTierList(l.id)}><Icon name="trash-2" size={14} /></button>
                    </div>
                ))}
                {!lists.length && <p className="region-picker-empty">No tier lists on this device yet.</p>}
            </div>
            <div className="region-modal-actions">
                <span className="region-modal-spacer" />
                <button type="button" className="btn btn-primary" onClick={() => { close(); openTierMaker(); }}><Icon name="plus" size={14} /> New tier list</button>
            </div>
        </Modal>
    );
}

registerDialog('tier-lists', TierListsDialog);

export function openTierLists() { openDialog('tier-lists', {}); }
