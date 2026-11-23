// Woobux, the site's currency, and the daily login streak. The server holds
// both (Woogidex-DB 20261123160000_woobux_and_login_streak.sql): this file
// only asks for the numbers and asks the server to pay. Nothing the browser
// sends sets a balance; the functions there check who you are, pay each
// reward once (a ledger key), and count days in Philippine time.
//
// Nothing pops up. While today's login reward waits, the Fun tab shows a red
// ping (funPing, Settings > Notifications can turn it off), and you collect
// it on Fun > Streak (js/app/pages/FunPage.tsx). After missed days, when you
// have enough save passes, that tab asks first: keep the streak with the
// passes, or start over.
//
// Update notes in rewarded_updates pay for "Got it" once (acknowledge_update).
// A role can multiply both rewards (badges.woobux_multiplier, the highest wins).

import { api, state } from '../core/app.ts';
import { log } from '../core/log.ts';
import { notify } from '../app/store.ts';
import { DEV_MOCK } from '../core/dev-mock.ts';

export interface Streak { current: number; held: number; best: number; last_day: string | null; claimed_today: boolean; missed: number; save_passes: number }
export interface WoobuxState { balance: number; today: string; streak: Streak; acknowledged: string[]; multiplier: number }
export interface ClaimResult extends WoobuxState { awarded: number; cycle_day?: number; passes_awarded?: number; passes_used?: number; already: boolean }

/** Days in one streak cycle, and the reward for each day (the same sums as woobux_streak_reward() in the database). */
export const CYCLE = 30;
export function dayReward(d: number): { woobux: number; passes: number } {
    const bonus: Record<number, [number, number]> = { 7: [100, 1], 14: [200, 1], 21: [300, 1], 30: [1000, 2] };
    return { woobux: 20 + 10 * d + (bonus[d]?.[0] || 0), passes: bonus[d]?.[1] || 0 };
}
/** The day of the cycle that a streak of `count` days is on (1 to 30). */
export const cycleDay = (count: number) => (count <= 0 ? 0 : ((count - 1) % CYCLE) + 1);

let current: WoobuxState | null = null;
let forUser: string | null = null;
let busy = false;

/** What the server said last, or null when signed out or not loaded. In preview mode, the local numbers, signed in or not. */
export function woobux(): WoobuxState | null {
    if (MOCK) return current;
    return state.user && forUser === state.user.id ? current : null;
}

/** Whether Woobux can show here: signed in, or the preview mode. */
export const woobuxOn = () => !!state.user || !!MOCK;

function take(data: any): WoobuxState | null {
    if (!data || typeof data !== 'object') return null;
    const s = data.streak || {};
    current = {
        multiplier: current?.multiplier || 1,
        balance: Math.max(0, Number(data.balance) || 0),
        today: String(data.today || ''),
        acknowledged: Array.isArray(data.acknowledged) ? data.acknowledged.map(String) : [],
        streak: {
            current: Number(s.current) || 0, held: Number(s.held) || 0, best: Number(s.best) || 0,
            last_day: s.last_day || null, claimed_today: !!s.claimed_today, missed: Number(s.missed) || 0,
            save_passes: Number(s.save_passes) || 0
        }
    };
    notify();
    return current;
}

// ---- the mock (dev server only) ----
// The preview mode (?mock, js/core/dev-mock.ts) runs Woobux on local
// numbers, signed in or not, and the preview panel switches the situation
// (setMockScenario). The older ?woobux=mock (today is day 7) and
// ?woobux=missed (two days behind, two save passes) still work. The numbers
// live in this tab only. import.meta.env.DEV is false in a real build, so
// none of this reaches the site.
const MOCK: '' | 'mock' | 'missed' = (() => {
    if (!import.meta.env.DEV) return '';
    const v = new URLSearchParams(location.search).get('woobux');
    return v === 'mock' || v === 'missed' ? v : DEV_MOCK ? 'mock' : '';
})();
const mockToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const daysBefore = (n: number) => new Date(Date.parse(mockToday()) - n * 86400_000).toISOString().slice(0, 10);
const mock = { balance: 1240, current: MOCK === 'missed' ? 12 : 6, best: 12, last: daysBefore(MOCK === 'missed' ? 3 : 1) as string | null, passes: MOCK === 'missed' ? 2 : 1, acks: [] as string[], mult: 1 };

/** The situations the preview panel offers. */
export const MOCK_SCENARIOS = {
    ready: 'Day 7 ready (bonus day)',
    claimed: 'Collected today',
    'missed-save': 'Missed 2 days, 2 save passes',
    'missed-lost': 'Missed 3 days, 1 save pass',
    fresh: 'No streak yet',
    day30: 'Day 30 ready (big bonus)'
} as const;
export type MockScenario = keyof typeof MOCK_SCENARIOS;

/** Preview mode: puts the streak in one situation (and the multiplier), then reloads the numbers. */
export async function setMockScenario(name: MockScenario, mult = mock.mult) {
    if (!MOCK) return;
    const set: Record<MockScenario, [number, string | null, number]> = {
        ready: [6, daysBefore(1), 1], claimed: [7, mockToday(), 2], 'missed-save': [12, daysBefore(3), 2],
        'missed-lost': [12, daysBefore(4), 1], fresh: [0, null, 0], day30: [29, daysBefore(1), 3]
    };
    [mock.current, mock.last, mock.passes] = set[name];
    mock.best = Math.max(12, mock.current);
    mock.mult = mult;
    await refreshWoobux();
}

function mockState(extra: Record<string, unknown> = {}) {
    const today = mockToday();
    const missed = mock.last ? Math.max(0, Math.round((Date.parse(today) - Date.parse(mock.last)) / 86400_000) - 1) : 0;
    const held = mock.last ? mock.current : 0;
    return {
        balance: mock.balance, today, acknowledged: mock.acks,
        streak: { current: missed ? 0 : held, held, best: mock.best, last_day: mock.last, claimed_today: mock.last === today, missed, save_passes: mock.passes },
        ...extra
    };
}

function mockCall(fn: string, args: Record<string, unknown>): any {
    if (fn === 'my_woobux') return mockState();
    if (fn === 'my_woobux_multiplier') return mock.mult;
    if (fn === 'acknowledge_update') {
        const v = String(args.p_version);
        if (mock.acks.includes(v)) return mockState({ awarded: 0, already: true });
        mock.acks.push(v);
        mock.balance += 500;
        return mockState({ awarded: 500, already: false });
    }
    // claim_daily_login, by the same rules as the database
    const now = mockState().streak;
    if (now.claimed_today) return mockState({ awarded: 0, already: true });
    const used = now.missed && args.p_use_passes && now.missed <= mock.passes ? now.missed : 0;
    mock.current = (now.missed && !used) || !mock.last ? 1 : mock.current + 1;
    const day = cycleDay(mock.current);
    const r = dayReward(day);
    const amount = Math.round(r.woobux * mock.mult);
    const gained = Math.max(0, Math.min(r.passes, 5 - (mock.passes - used)));
    mock.passes = mock.passes - used + gained;
    mock.best = Math.max(mock.best, mock.current);
    mock.last = mockToday();
    mock.balance += amount;
    return mockState({ awarded: amount, multiplier: mock.mult, cycle_day: day, passes_awarded: gained, passes_used: used, already: false });
}

async function call(fn: string, args: Record<string, unknown> = {}): Promise<any> {
    if (MOCK) return mockCall(fn, args);
    const client = await api.getClient();
    const { data, error } = await client.rpc(fn, args);
    if (error) throw error;
    return data;
}

export async function refreshWoobux(): Promise<WoobuxState | null> {
    if (!state.user && !MOCK) return null;
    try {
        const [data, mult] = await Promise.all([
            call('my_woobux'),
            // a role's multiplier (Woogidex-DB 20261123190000); 1 before that migration
            call('my_woobux_multiplier').catch(() => 1)
        ]);
        const got = take(data);
        if (got) { got.multiplier = Math.max(1, Number(mult) || 1); notify(); }
        return got;
    } catch (e) { log.warn('WOOBUX', 'Could not load Woobux', e); return null; }
}

/** Whether the Fun tab shows its red ping: today's reward waits, and the ping is on (Settings > Notifications). */
export function funPing(): boolean {
    const w = woobux();
    return !!w && !w.streak.claimed_today && api.getFunPings?.() !== false;
}

/** The reward today's claim would pay, before a role's multiplier. */
export function nextReward(w: WoobuxState): { day: number; woobux: number; passes: number } {
    const s = w.streak;
    const count = s.claimed_today ? s.current : (s.missed > 0 ? 0 : s.current) + 1;
    const day = cycleDay(Math.max(1, count));
    return { day, ...dayReward(day) };
}

/** Claims today's reward. `usePasses`: spend save passes on the missed days to keep the streak. */
export async function claimDaily(usePasses = false): Promise<ClaimResult | null> {
    try {
        const data = await call('claim_daily_login', { p_use_passes: usePasses });
        take(data);
        return data as ClaimResult;
    } catch (e: any) {
        log.warn('WOOBUX', 'Could not claim the daily reward', e);
        api.showToast?.('Could not claim today’s Woobux. Try again later.', 'error');
        return null;
    }
}

/** "Got it" on an update that pays. @returns the Woobux paid (0 when it was paid before) */
export async function acknowledgeUpdate(version: string): Promise<number> {
    if (!state.user) { api.openAuthModal?.('signin'); return 0; }
    try {
        const data = await call('acknowledge_update', { p_version: version });
        take(data);
        // the button plays the coin burst for a payment (whatsNew.tsx), so no toast here
        return Number(data?.awarded) || 0;
    } catch (e) {
        log.warn('WOOBUX', 'Could not acknowledge the update', e);
        api.showToast?.('Could not give the Woobux right now. Try again later.', 'error');
        return 0;
    }
}

/** The update versions that pay, and how much. Public: signed out, they show what you would get. */
let rewarded: Promise<Record<string, number>> | null = null;
export function rewardedUpdates(): Promise<Record<string, number>> {
    // one request for every caller (What's New and the Updates list ask at once)
    rewarded ||= (async () => {
        if (MOCK) return { '1.20.0': 500 };
        try {
            const client = await api.getClient();
            const { data, error } = await client.from('rewarded_updates').select('version, reward');
            if (error) throw error;
            return Object.fromEntries((data || []).map((r: any) => [String(r.version), Number(r.reward) || 0]));
        } catch { return {}; }
    })();
    return rewarded;
}

/**
 * After a sign-in (and on load, signed in): reads the numbers. Nothing is
 * claimed here: the Fun tab pings, and you collect on Fun > Streak.
 */
export async function onWoobuxAuthChange() {
    const id = state.user?.id || null;
    if (id === forUser) return;
    forUser = id;
    current = null;
    notify();
    if (!id || busy) return;
    busy = true;
    try { await refreshWoobux(); } finally { busy = false; }
}

// a tab left open over midnight (Philippine time): look again when it comes back into view
let lastCheck = Date.now();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.user || Date.now() - lastCheck < 30 * 60_000) return;
    lastCheck = Date.now();
    forUser = null;
    onWoobuxAuthChange();
});

/** Fun > Streak: the balance, the streak and today's reward. */
export function openWoobux() {
    api.openPath?.('fun/streak');
}
