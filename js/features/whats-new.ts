// "What's New": the newest update (public/updates/, js/features/updates.ts)
// in a pop-up once after each release, like Discord's. The notifications
// keep a pinned row that opens it again, the account menu has Updates for the
// whole history, and so does the pop-up's "Every update". The update's file
// name is the version: a new file is a new version.

import { log } from '../core/log.ts';
import { notify } from '../app/store.ts';
import { openDialog, isDialogOpen } from '../app/dialogs.tsx';
import { loadUpdates, type Update } from './updates.ts';

const SEEN_KEY = 'woogidex-whats-new-seen';

let latest: Update | null | undefined;     // undefined: not asked yet

const readSeen = (): string => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } };
const saveSeen = (id: string) => { try { localStorage.setItem(SEEN_KEY, id); } catch { /* private mode */ } };

/** Someone who used the site before (any of its own saved settings), not a first visit. */
function returningVisitor(): boolean {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i) || '';
            if ((k.startsWith('woogidex-') || k.startsWith('woogidex.')) && k !== SEEN_KEY) return true;
        }
    } catch { /* private mode */ }
    return false;
}

/** The newest update, asked for once a visit. */
export async function loadWhatsNew(): Promise<Update | null> {
    if (latest !== undefined) return latest;
    try { latest = (await loadUpdates())[0] || null; }
    catch (e) { log.warn('WHATS_NEW', 'Could not load the latest update', e); latest = null; }
    notify();
    return latest;
}

/** What the pinned row and the badges show: the update, and whether you have opened it. */
export function whatsNewView(): { item: Update; unseen: boolean } | null {
    if (latest === undefined) { loadWhatsNew(); return null; }
    return latest ? { item: latest, unseen: readSeen() !== latest.id } : null;
}

/** Opens the pop-up on the newest update (and counts it as seen). */
export async function openWhatsNew(): Promise<void> {
    const item = await loadWhatsNew();
    if (!item) { openDialog('updates'); return; }
    saveSeen(item.id);
    notify();
    if (!isDialogOpen('whats-new')) openDialog('whats-new', { item });
}

/** Opens every update, and counts the newest as seen. */
export async function openUpdates(): Promise<void> {
    const item = await loadWhatsNew();
    if (item) { saveSeen(item.id); notify(); }
    if (!isDialogOpen('updates')) openDialog('updates');
}

/**
 * At boot: shows the pop-up when there is an update this browser has not
 * seen. A first visit only remembers it (a new visitor needs no "what's new").
 */
export async function maybeShowWhatsNew(): Promise<void> {
    // the old address only moves data; the landing page has its own story
    if (document.body.dataset.page === 'move-view' || document.body.dataset.page === 'landing-view') return;
    const item = await loadWhatsNew();
    if (!item) return;
    const seen = readSeen();
    if (seen === item.id) return;
    if (!seen && !returningVisitor()) { saveSeen(item.id); return; }
    // a moment after the page settles, and never on top of another dialog
    setTimeout(() => {
        if (document.body.classList.contains('modal-open') || document.body.classList.contains('editor-sheet-open')) return;
        openWhatsNew();
    }, 1500);
}
