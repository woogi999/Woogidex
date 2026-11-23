// Which tabs the bars show. Two lists, each a choice for this device only,
// kept in localStorage:
//   'phone'   the floating tab bar along the bottom of a phone
//             (Settings > Appearance > Phone tab bar). "You" (the account
//             menu) is always the last tab, so it is not on the list.
//   'header'  the tabs in the middle of the header on a computer
//             (Settings > Appearance > Header bar).
// A tab you put in a bar leaves the header's icon row on the right
// (messages, notifications), so nothing shows twice.

import { notify } from '../store.ts';

export type PhoneTab = 'collection' | 'community' | 'create' | 'fun' | 'messages' | 'notifications';
export type BarKind = 'phone' | 'header';

/** Every tab you can pick: [key, name, icon], in the order the bars show them. */
export const PHONE_TAB_CHOICES: Array<[PhoneTab, string, string]> = [
    ['collection', 'My Collection', 'library'],
    ['community', 'Community', 'users'],
    ['create', 'Create', 'plus-circle'],
    ['fun', 'Fun', 'fun-box'],
    ['messages', 'Messages', 'chat-bubble-oval-left-ellipsis'],
    ['notifications', 'Notifications', 'bell']
];

const BARS: Record<BarKind, { key: string; dataset: 'phoneTabs' | 'headerTabs'; def: PhoneTab[]; min: number; max: number }> = {
    phone: { key: 'woogidex-phone-tabs', dataset: 'phoneTabs', def: ['collection', 'community', 'create', 'fun'], min: 2, max: 5 },
    header: { key: 'woogidex-header-tabs', dataset: 'headerTabs', def: ['collection', 'community', 'fun'], min: 1, max: 6 }
};
export const barLimits = (kind: BarKind) => ({ min: BARS[kind].min, max: BARS[kind].max, def: BARS[kind].def });

const ORDER = PHONE_TAB_CHOICES.map(([k]) => k);
// the old names: Battle and the Toolbox live in Fun now, and search is in the top bar again
const RENAMED: Record<string, PhoneTab> = { battle: 'fun', toolbox: 'fun' };

const cached: Partial<Record<BarKind, PhoneTab[]>> = {};

function publish(kind: BarKind, list: PhoneTab[]) {
    cached[kind] = list;
    document.documentElement.dataset[BARS[kind].dataset] = list.join(' ');
}

/** The tabs a bar shows, in bar order. */
export function barTabs(kind: BarKind): PhoneTab[] {
    const hit = cached[kind];
    if (hit) return hit;
    const { key, def, min, max } = BARS[kind];
    let list = def;
    try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (Array.isArray(saved)) {
            const names = saved.map(k => RENAMED[k] || k);
            const ok = ORDER.filter(k => names.includes(k));
            if (ok.length >= min && ok.length <= max) list = ok;
        }
    } catch { /* storage blocked: the default bar */ }
    publish(kind, list);
    return list;
}

/** Turns one tab on or off (within the limits). */
export function toggleBarTab(kind: BarKind, tab: PhoneTab, on: boolean) {
    const now = barTabs(kind);
    const next = ORDER.filter(k => (k === tab ? on : now.includes(k)));
    const { key, def, min, max } = BARS[kind];
    if (next.length < min || next.length > max) return;
    publish(kind, next);
    try {
        if (next.join() === def.join()) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(next));
    } catch { /* kept until the page reloads */ }
    notify();
}

/** Back to the tabs the bar starts with. */
export function resetBarTabs(kind: BarKind) {
    delete cached[kind];
    try { localStorage.removeItem(BARS[kind].key); } catch { /* nothing saved */ }
    barTabs(kind);
    notify();
}

/** Both bars' choices on <html>, for the CSS that hides a header icon that moved into a bar. */
export function publishBarTabs() { barTabs('phone'); barTabs('header'); }
