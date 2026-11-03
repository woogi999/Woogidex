// Switch account: more than one account in this browser, like Instagram.
// Supabase keeps one live session; every other account here is kept as its
// refresh token, in localStorage, where the live session already is (so this
// adds no new place a token can leak from). A switch saves the live account,
// makes the chosen token the live session, and reloads the page. The reload
// is on purpose: it clears every per-person thing in memory at once (feed,
// messages and their keys, notifications, cloud backup), so nothing of one
// account can show while another is signed in. Message keys on this device
// are stored by user id (js/features/messaging.ts), so they never mix.

import { api, state } from '../core/app.ts';
import { log } from '../core/log.ts';
import { getClient, forgetLocalSession } from '../core/supabase.ts';
import { notify } from '../app/store.ts';

const KEY = 'woogidex-saved-accounts';
const ADD_FLAG = 'woogidex-add-account';
const MAX_SAVED = 5;

export interface SavedAccount { id: string; username: string; name: string; avatar: string; refreshToken: string; savedAt: number }

function read(): SavedAccount[] {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(list) ? list.filter(a => a && typeof a.id === 'string' && typeof a.refreshToken === 'string') : [];
    } catch { return []; }
}
function write(list: SavedAccount[]) {
    try {
        if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
        else localStorage.removeItem(KEY);
    } catch { /* storage blocked: switching just is not offered */ }
    notify();
}

/** The other accounts you can switch to (never the one signed in). */
export function savedAccounts(): SavedAccount[] {
    const me = state.user?.id;
    return read().filter(a => a.id !== me);
}

/** Puts the live account on the list, with its current refresh token. */
async function saveCurrent(): Promise<boolean> {
    const user = state.user;
    if (!user) return false;
    const client = await getClient();
    const { data } = await client.auth.getSession();
    const token = data?.session?.refresh_token;
    if (!token || data.session.user?.id !== user.id) return false;
    const entry: SavedAccount = {
        id: user.id, username: user.username || '', name: user.displayName || user.username || 'Account',
        avatar: user.avatarUrl || '', refreshToken: token, savedAt: Date.now()
    };
    write([entry, ...read().filter(a => a.id !== user.id)]);
    return true;
}

/** Makes a saved account the live one. false when its token no longer works (it is taken off the list). */
async function becomeAccount(target: SavedAccount): Promise<boolean> {
    const client = await getClient();
    const { data, error } = await client.auth.refreshSession({ refresh_token: target.refreshToken });
    // the token is used up either way: the live session carries the new one
    write(read().filter(a => a.id !== target.id));
    if (error || !data?.session) {
        log.warn('ACCOUNTS', 'A saved account could not be resumed', error);
        return false;
    }
    return true;
}

/** Switches to another saved account. */
export async function switchAccount(id: string): Promise<void> {
    const target = read().find(a => a.id === id);
    if (!target || target.id === state.user?.id) return;
    await api.autoSave?.(true);
    await saveCurrent();
    if (await becomeAccount(target)) { location.reload(); return; }
    api.showToast?.(`@${target.username || 'that account'} needs you to sign in again.`, 'warning');
    api.openAuthModal?.('signin');
}

/** Keeps this account for later and opens the sign-in for another one. */
export async function addAccount(): Promise<void> {
    if (state.user) {
        if (read().filter(a => a.id !== state.user!.id).length >= MAX_SAVED - 1) {
            api.showToast?.(`You can keep up to ${MAX_SAVED} accounts here. Log out of one first.`, 'warning');
            return;
        }
        await api.autoSave?.(true);
        if (!(await saveCurrent())) { api.showToast?.('Could not keep this account. Please try again.', 'error'); return; }
        // the live copy goes, the server session stays (it is the saved one now)
        forgetLocalSession();
        try { sessionStorage.setItem(ADD_FLAG, '1'); } catch { /* the sign-in just does not open by itself */ }
        location.reload();
        return;
    }
    api.openAuthModal?.('signin');
}

/** Ends this account's session here, and goes on to the next saved account if there is one. */
export async function logOutOfThisAccount(): Promise<void> {
    const next = savedAccounts()[0];
    await api.handleSignOutClick?.();
    if (next && await becomeAccount(next)) location.reload();
}

/** Forgets a saved account on this browser (it is not signed in, so nothing else changes). */
export function forgetAccount(id: string) {
    write(read().filter(a => a.id !== id));
}

/** At boot, after "Add another account": open the sign-in. */
export function resumeAddAccount() {
    try {
        if (sessionStorage.getItem(ADD_FLAG) !== '1') return;
        sessionStorage.removeItem(ADD_FLAG);
    } catch { return; }
    if (!state.user) api.openAuthModal?.('signin');
}
