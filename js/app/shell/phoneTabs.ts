// Which tabs the phone's bottom bar shows (Settings > Appearance > Phone tab
// bar). A choice for this device only, kept in localStorage. "You" (the
// account menu) is always the last tab, so it is not on the list. A tab you
// put in the bar leaves the top bar (messages, notifications).

import { notify } from '../store.ts';

export type PhoneTab = 'collection' | 'community' | 'create' | 'search' | 'messages' | 'notifications' | 'battle';

/** Every tab you can pick: [key, name, icon], in the order the bar shows them. */
export const PHONE_TAB_CHOICES: Array<[PhoneTab, string, string]> = [
    ['collection', 'My Collection', 'library'],
    ['community', 'Community', 'users'],
    ['create', 'Create', 'plus-circle'],
    ['search', 'Search', 'search'],
    ['messages', 'Messages', 'chat-bubble-oval-left-ellipsis'],
    ['notifications', 'Notifications', 'bell'],
    ['battle', 'Battle (paused)', 'swords']
];
export const PHONE_TABS_DEFAULT: PhoneTab[] = ['collection', 'community', 'create', 'search'];
export const PHONE_TABS_MIN = 2;
export const PHONE_TABS_MAX = 5;

const KEY = 'woogidex-phone-tabs';
const ORDER = PHONE_TAB_CHOICES.map(([k]) => k);

let cached: PhoneTab[] | null = null;

/** The tabs to show, in bar order. */
export function phoneTabs(): PhoneTab[] {
    if (cached) return cached;
    let list: PhoneTab[] = PHONE_TABS_DEFAULT;
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (Array.isArray(saved)) {
            const ok = ORDER.filter(k => saved.includes(k));
            if (ok.length >= PHONE_TABS_MIN && ok.length <= PHONE_TABS_MAX) list = ok;
        }
    } catch { /* storage blocked: the default bar */ }
    cached = list;
    document.documentElement.dataset.phoneTabs = list.join(' ');
    return list;
}

/** Turns one tab on or off (within the limits). */
export function togglePhoneTab(tab: PhoneTab, on: boolean) {
    const now = phoneTabs();
    const next = ORDER.filter(k => (k === tab ? on : now.includes(k)));
    if (next.length < PHONE_TABS_MIN || next.length > PHONE_TABS_MAX) return;
    cached = next;
    document.documentElement.dataset.phoneTabs = next.join(' ');
    try {
        if (next.join() === PHONE_TABS_DEFAULT.join()) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, JSON.stringify(next));
    } catch { /* kept until the page reloads */ }
    notify();
}

/** Back to the four the bar starts with. */
export function resetPhoneTabs() {
    cached = null;
    try { localStorage.removeItem(KEY); } catch { /* nothing saved */ }
    phoneTabs();
    notify();
}
