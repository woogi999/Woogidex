// "What's New": the newest #update post by the Woogidex account, in a
// pop-up once after each update (like Discord's). The notifications keep a
// pinned row that opens it again, and the whole history is on the account's
// profile (/updates). The post's id is the version: a new update post is a
// new version.

import { api } from '../core/app.ts';
import { log } from '../core/log.ts';
import { dbCall } from '../core/net.ts';
import { notify } from '../app/store.ts';
import { openDialog, isDialogOpen } from '../app/dialogs.tsx';
import type { FeedItem } from './feed-algorithm.ts';

const SEEN_KEY = 'woogidex-whats-new-seen';
const OFFICIAL = 'woogidex';

let latest: FeedItem | null | undefined;     // undefined: not asked yet
let asking: Promise<FeedItem | null> | null = null;

const readSeen = (): string => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } };
const saveSeen = (id: string) => { try { localStorage.setItem(SEEN_KEY, id); } catch { /* private mode */ } };

/** Someone who used the site before (any of its own saved settings), not a first visit. */
function returningVisitor(): boolean {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i) || '';
            if (k.startsWith('woogidex-') && k !== SEEN_KEY) return true;
        }
    } catch { /* private mode */ }
    return false;
}

/** The newest update post, asked for once a visit. */
export function loadWhatsNew(): Promise<FeedItem | null> {
    if (latest !== undefined) return Promise.resolve(latest);
    // guest_feed for everyone: it names each post's author, and update posts are public
    const ask = asking || api.getClient()
        .then((client: any) => dbCall<any[]>(signal => client.rpc('guest_feed', { p_before: null, p_limit: 20, p_tag: 'update' }).abortSignal(signal)))
        .then(rows => ((rows || []) as FeedItem[])
            .filter(r => r.kind === 'post' && String(r.author_username || '').toLowerCase() === OFFICIAL)
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null)
        .catch(e => { log.warn('WHATS_NEW', 'Could not load the latest update', e); return null; })
        .then(item => { latest = item; asking = null; notify(); return item; });
    asking = ask;
    return ask;
}

/** What the notifications' pinned row shows: the update, and whether you have opened it. */
export function whatsNewView(): { item: FeedItem; unseen: boolean } | null {
    if (latest === undefined) { loadWhatsNew(); return null; }
    return latest ? { item: latest, unseen: readSeen() !== latest.id } : null;
}

/** Opens the pop-up on the newest update (and counts it as seen). */
export async function openWhatsNew(): Promise<void> {
    const item = await loadWhatsNew();
    if (!item) { api.openPath?.('updates'); return; }
    saveSeen(item.id);
    notify();
    if (!isDialogOpen('whats-new')) openDialog('whats-new', { item });
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
