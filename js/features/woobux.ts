// Woobux, the site's currency, and the daily login streak. The server holds
// both (Woogidex-DB 20261123160000_woobux_and_login_streak.sql): this file
// only asks for the numbers and asks the server to pay. Nothing the browser
// sends sets a balance; the functions there check who you are, pay each
// reward once (a ledger key), and count days in Philippine time.
//
// When you sign in (or open the site signed in), today's login reward is
// claimed. After missed days, when you have enough save passes, a dialog
// asks first: keep the streak with the passes, or start over.
//
// Update notes in rewarded_updates pay for "Got it" once (acknowledge_update).

import { api, state } from '../core/app.ts';
import { log } from '../core/log.ts';
import { notify } from '../app/store.ts';
import { openDialog } from '../app/dialogs.tsx';

export interface Streak { current: number; held: number; best: number; last_day: string | null; claimed_today: boolean; missed: number; save_passes: number }
export interface WoobuxState { balance: number; today: string; streak: Streak; acknowledged: string[] }
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

/** What the server said last, or null when signed out or not loaded. */
export function woobux(): WoobuxState | null {
    return state.user && forUser === state.user.id ? current : null;
}

function take(data: any): WoobuxState | null {
    if (!data || typeof data !== 'object') return null;
    const s = data.streak || {};
    current = {
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
// Open the dev server with ?woobux=mock to see the Woobux row, the daily
// reward and the calendar without the database: a 6-day streak, so today is
// day 7 (a bonus and a save pass). ?woobux=missed starts two days behind with
// two save passes, to see the "Keep your streak?" question. The numbers live
// in this tab only. import.meta.env.DEV is false in a real build, so none of
// this reaches the site.
const MOCK: '' | 'mock' | 'missed' = (() => {
    if (!import.meta.env.DEV) return '';
    const v = new URLSearchParams(location.search).get('woobux');
    return v === 'mock' || v === 'missed' ? v : '';
})();
const mockToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const daysBefore = (n: number) => new Date(Date.parse(mockToday()) - n * 86400_000).toISOString().slice(0, 10);
const mock = { balance: 1240, current: MOCK === 'missed' ? 12 : 6, best: 12, last: daysBefore(MOCK === 'missed' ? 3 : 1), passes: MOCK === 'missed' ? 2 : 1, acks: [] as string[] };

function mockState(extra: Record<string, unknown> = {}) {
    const today = mockToday();
    const missed = Math.max(0, Math.round((Date.parse(today) - Date.parse(mock.last)) / 86400_000) - 1);
    return {
        balance: mock.balance, today, acknowledged: mock.acks,
        streak: { current: missed ? 0 : mock.current, held: mock.current, best: mock.best, last_day: mock.last, claimed_today: mock.last === today, missed, save_passes: mock.passes },
        ...extra
    };
}

function mockCall(fn: string, args: Record<string, unknown>): any {
    if (fn === 'my_woobux') return mockState();
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
    mock.current = now.missed && !used ? 1 : mock.current + 1;
    const day = cycleDay(mock.current);
    const r = dayReward(day);
    const gained = Math.max(0, Math.min(r.passes, 5 - (mock.passes - used)));
    mock.passes = mock.passes - used + gained;
    mock.best = Math.max(mock.best, mock.current);
    mock.last = mockToday();
    mock.balance += r.woobux;
    return mockState({ awarded: r.woobux, cycle_day: day, passes_awarded: gained, passes_used: used, already: false });
}

async function call(fn: string, args: Record<string, unknown> = {}): Promise<any> {
    if (MOCK) return mockCall(fn, args);
    const client = await api.getClient();
    const { data, error } = await client.rpc(fn, args);
    if (error) throw error;
    return data;
}

export async function refreshWoobux(): Promise<WoobuxState | null> {
    if (!state.user) return null;
    try { return take(await call('my_woobux')); }
    catch (e) { log.warn('WOOBUX', 'Could not load Woobux', e); return null; }
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
        const paid = Number(data?.awarded) || 0;
        if (paid) api.showToast?.(`+${paid} Woobux for reading the update!`, 'success');
        return paid;
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
 * After a sign-in (and on load, signed in): reads the numbers, then claims
 * today's reward. Missed days with enough save passes ask first.
 */
export async function onWoobuxAuthChange() {
    const id = state.user?.id || null;
    if (id === forUser) return;
    forUser = id;
    current = null;
    notify();
    if (!id || busy) return;
    busy = true;
    try {
        const now = await refreshWoobux();
        if (!now || now.streak.claimed_today || forUser !== id) return;
        const { missed, held, save_passes } = now.streak;
        if (missed > 0 && held > 0 && save_passes >= missed) { openDialog('woobux-streak', { mode: 'save' }); return; }
        const result = await claimDaily(false);
        if (result && !result.already && result.awarded > 0) openDialog('woobux-streak', { mode: 'claimed', result });
    } finally { busy = false; }
}

// a tab left open over midnight (Philippine time): look again when it comes back into view
let lastCheck = Date.now();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.user || Date.now() - lastCheck < 30 * 60_000) return;
    lastCheck = Date.now();
    forUser = null;
    onWoobuxAuthChange();
});

export function openWoobux() {
    if (!state.user) { api.openAuthModal?.('signin'); return; }
    openDialog('woobux-streak', { mode: 'view' });
}
