// The data move from dex.woogi.xyz to woogidex.com, in the browser. The
// rules (what travels, checks, merge) are in data-move-model.ts.
//
// 1. dex.woogi.xyz runs the app in "move mode": it loads the collection the
//    usual way and shows only the move page (js/app/pages/MovePage.tsx).
// 2. "Move my data" opens woogidex.com/move in a new tab. That tab says it
//    is ready, and the old site sends the data to it with postMessage.
//    Both sides accept a message only from the other's exact origin and window.
// 3. The new tab shows what came, and moves it in only when you confirm. It
//    saves, reads the saved data back to check every item, then reports done.
// The old copy stays as it was. A retry sends the same move ID, and the new
// site does not apply one ID twice.

import { api, state } from '../core/app.ts';
import { log } from '../core/log.ts';
import { notify } from '../app/store.ts';
import { isCollectionLoaded, readStoredLists } from '../core/storage.ts';
import { buildPayload, countPayload, isEmptyPayload, mergeLists, newSettings, payloadProblem, MOVE_LISTS, type MovePayload, type MoveList } from './data-move-model.ts';

// the dev server plays both sides: localhost is the old site (with
// VITE_MOVE_TEST=1) and 127.0.0.1 the new one, two origins on one port
const DEV_TEST = import.meta.env.DEV && import.meta.env.VITE_MOVE_TEST === '1';
const port = typeof location !== 'undefined' && location.port ? `:${location.port}` : '';
export const OLD_ORIGIN = DEV_TEST ? `http://localhost${port}` : 'https://dex.woogi.xyz';
export const NEW_ORIGIN = DEV_TEST ? `http://127.0.0.1${port}` : 'https://woogidex.com';

const MSG = { ready: 'woogidex-move-ready', data: 'woogidex-move-data', done: 'woogidex-move-done', error: 'woogidex-move-error' };
const ID_KEY = 'woogidex.move.id.v1';          // old site: this browser's move ID
const DONE_KEY = 'woogidex.move.done.v1';      // old site: when the move was confirmed
const APPLIED_KEY = 'woogidex.move.applied.v1'; // new site: the move IDs already moved in

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } };

/** This page is the old address, which only moves data now. */
export const isOldSite = () => typeof location !== 'undefined' && location.origin === OLD_ORIGIN;

// ==================== the old site ====================

export type OutStep = 'idle' | 'waiting' | 'done' | 'error';
export const moveOut = { step: 'idle' as OutStep, error: '', result: null as null | { added: number; same: number; copied: number } };

function moveId(): string {
    let id = read(ID_KEY);
    if (!id) { id = `move-${crypto.randomUUID()}`; write(ID_KEY, id); }
    return id;
}

function currentLists(): Record<MoveList, any[]> {
    const lists = {} as Record<MoveList, any[]>;
    for (const name of MOVE_LISTS) lists[name] = Array.isArray((state as any)[name]) ? (state as any)[name] : [];
    return lists;
}

/** What this browser holds, for the old site's page. */
export const outCounts = () => countPayload({ lists: currentLists() });

/** The same page on the new address: where old links go once there is nothing to move. */
export const newAddress = () => `${NEW_ORIGIN}${location.pathname === '/move' ? '/' : location.pathname}${location.search}`;

/**
 * Boot on the old site: send the visitor on when there is nothing to move
 * (or the move is done). Else the move page stays. Returns true when it left.
 */
export function leaveIfNothingToMove(loaded: boolean): boolean {
    if (!loaded) return false;            // a failed read is not "nothing to move"
    if (read(DONE_KEY) || isEmptyPayload({ lists: currentLists() })) {
        location.replace(newAddress());
        return true;
    }
    return false;
}

let tab: Window | null = null;
let listening = false;

export function startMoveOut() {
    tab = window.open(`${NEW_ORIGIN}/move`, 'woogidex-move');
    if (!tab) {
        Object.assign(moveOut, { step: 'error', error: 'Your browser blocked the new tab. Allow pop-ups for this page, then try again.' });
        notify();
        return;
    }
    Object.assign(moveOut, { step: 'waiting', error: '' });
    notify();
    if (listening) return;
    listening = true;
    window.addEventListener('message', event => {
        if (event.origin !== NEW_ORIGIN || event.source !== tab || !event.data || typeof event.data !== 'object') return;
        const { type } = event.data;
        if (type === MSG.ready) {
            // built now, from what this tab holds, so a retry sends the same data under the same ID
            const storage: Record<string, string> = {};
            try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; storage[k] = localStorage.getItem(k) || ''; } } catch { /* storage blocked */ }
            tab!.postMessage({ type: MSG.data, payload: buildPayload(moveId(), OLD_ORIGIN, currentLists(), storage) }, NEW_ORIGIN);
        } else if (type === MSG.done) {
            write(DONE_KEY, new Date().toISOString());
            Object.assign(moveOut, { step: 'done', error: '', result: event.data.result || null });
            notify();
        } else if (type === MSG.error) {
            Object.assign(moveOut, { step: 'error', error: String(event.data.message || 'The move did not finish.').slice(0, 300) });
            notify();
        }
    });
}

// ==================== the new site ====================

export type InStep = 'no-opener' | 'waiting' | 'confirm' | 'moving' | 'done' | 'error';
export const moveIn = { step: 'waiting' as InStep, error: '', payload: null as MovePayload | null, result: null as null | { added: number; same: number; copied: number }, already: false };

let inStarted = false;

/** /move on the new site: say "ready" to the old site's tab, then wait for its data. */
export function startMoveIn() {
    if (inStarted) return;
    inStarted = true;
    const opener = window.opener as Window | null;
    if (!opener) { moveIn.step = 'no-opener'; notify(); return; }
    window.addEventListener('message', event => {
        if (event.origin !== OLD_ORIGIN || event.source !== opener || event.data?.type !== MSG.data) return;
        if (moveIn.payload) return;       // one move for each tab
        const p = event.data.payload;
        const problem = payloadProblem(p, OLD_ORIGIN);
        if (problem) { fail(problem); return; }
        moveIn.payload = p;
        moveIn.already = appliedIds().includes(p.id);
        moveIn.step = 'confirm';
        notify();
    });
    // say it until the old tab hears it (its listener may start after this tab loads)
    let tries = 0;
    const hello = setInterval(() => {
        if (moveIn.payload || ++tries > 40 || opener.closed) { clearInterval(hello); return; }
        opener.postMessage({ type: MSG.ready }, OLD_ORIGIN);
    }, 500);
}

function appliedIds(): string[] {
    try { const v = JSON.parse(read(APPLIED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

function tell(type: string, data: Record<string, any> = {}) {
    try { (window.opener as Window | null)?.postMessage({ type, ...data }, OLD_ORIGIN); } catch { /* the old tab is gone */ }
}

function fail(message: string) {
    Object.assign(moveIn, { step: 'error', error: message });
    tell(MSG.error, { message });
    notify();
}

/** You confirmed: merge, save, read back, and tell the old site. */
export async function applyMoveIn() {
    const p = moveIn.payload;
    if (!p || moveIn.step !== 'confirm') return;
    moveIn.step = 'moving';
    notify();
    try {
        if (!isCollectionLoaded()) throw new Error('Your collection here did not load. Reload this page, then try again.');
        const result = moveIn.already ? { added: 0, same: 0, copied: 0 } : await merge(p);
        if (!moveIn.already) write(APPLIED_KEY, JSON.stringify([...appliedIds(), p.id].slice(-20)));
        Object.assign(moveIn, { step: 'done', result });
        tell(MSG.done, { result });
        notify();
        log.info('MOVE', 'Data moved in', { id: p.id, ...result });
    } catch (e: any) {
        log.error('MOVE', 'The data move failed', e);
        fail(e?.message || 'The move did not finish. Nothing here changed. Try again.');
    }
}

async function merge(p: MovePayload) {
    const here = {} as Record<MoveList, any[]>;
    for (const name of MOVE_LISTS) here[name] = Array.isArray((state as any)[name]) ? (state as any)[name] : [];
    const r = mergeLists(here, p.lists, () => `${Date.now()}-moved-${Math.random().toString(36).slice(2, 10)}`);
    const before = { ...here };
    for (const name of MOVE_LISTS) (state as any)[name] = r.lists[name];
    if (!(await api.saveToStorage())) {
        // the save was refused: memory goes back to what storage still holds
        for (const name of MOVE_LISTS) (state as any)[name] = before[name];
        throw new Error('This site could not save. Nothing here changed. Reload this page, then try again.');
    }
    // read back: every moved item must be in storage, by its ID or as a copy
    const stored = await readStoredLists();
    for (const name of MOVE_LISTS) {
        const ids = new Set((stored[name] || []).map((x: any) => String(x?.id)));
        if ((stored[name] || []).length < p.lists[name].length || p.lists[name].some(x => !ids.has(String(x.id)))) {
            throw new Error('The saved data did not match what was sent. Your old copy is safe. Try again.');
        }
    }
    for (const [k, v] of Object.entries(newSettings(p.settings, read))) write(k, v);
    api.syncCustomTypes?.(true);
    api.renderCollection?.();
    return { added: r.added, same: r.same, copied: r.copied };
}
