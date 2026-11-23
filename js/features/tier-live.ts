// Live tier lists: the host's list goes to an audience, and everyone votes
// where each item goes (Woogidex-DB 20261123180000_tier_live_sessions.sql).
//   voting  every item is open; each viewer places them all
//   event   the host shows one item at a time; viewers vote on that one
// Viewers join at /toolbox/live/<code>. Votes and the session come through
// Realtime; without the socket the page asks every 5 seconds instead.
//
// The session's list is the host's data for every viewer: cleanTierList
// reads it before anything is drawn. The server checks every vote.

import { api, state } from '../core/app.ts';
import { log } from '../core/log.ts';
import { cleanTierList, forSharing, type TierList } from './tier-lists.ts';

export type LiveMode = 'voting' | 'event';
export interface LiveSession { id: string; host: string; code: string; mode: LiveMode; list: TierList; current_mon: string | null; status: 'open' | 'closed'; expires_at: string }
/** mon id -> tier id -> how many votes */
export type Tally = Record<string, Record<string, number>>;

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
export const liveCodeOk = (code: string) => CODE_RE.test(String(code || '').toUpperCase());
export const liveLink = (code: string) => `${location.origin}/toolbox/live/${code}`;

function session(row: any): LiveSession | null {
    const list = cleanTierList(row?.list);
    if (!row || !list) return null;
    return { id: row.id, host: row.host, code: row.code, mode: row.mode === 'event' ? 'event' : 'voting', list, current_mon: row.current_mon || null, status: row.status === 'closed' ? 'closed' : 'open', expires_at: row.expires_at };
}

const FIELDS = 'id, host, code, mode, list, current_mon, status, expires_at';

/** Opens a list to an audience. The server makes the code. */
export async function startLive(list: TierList, mode: LiveMode): Promise<LiveSession | null> {
    if (!state.user) { api.openAuthModal?.('signin'); return null; }
    const client = await api.getClient();
    // positions on a plane and display settings mean nothing to a vote
    const { pos: _p, look: _l, baseline: _b, ...shared } = forSharing(list);
    const { data, error } = await client.from('tier_live_sessions').insert({ mode, list: shared }).select(FIELDS).single();
    if (error) { api.showToast?.(error.message || 'Could not go live.', 'error'); return null; }
    return session(data);
}

export async function liveByCode(code: string): Promise<LiveSession | null> {
    if (!liveCodeOk(code)) return null;
    const client = await api.getClient();
    const { data } = await client.from('tier_live_sessions').select(FIELDS).eq('code', code.toUpperCase()).maybeSingle();
    return session(data);
}

async function update(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const client = await api.getClient();
    const { error } = await client.from('tier_live_sessions').update(patch).eq('id', id);
    if (error) { api.showToast?.(error.message || 'Could not change the live list.', 'error'); return false; }
    return true;
}
/** Event mode: the item everyone votes on now (or none). */
export const showItem = (id: string, monId: string | null) => update(id, { current_mon: monId });
export const setLiveMode = (id: string, mode: LiveMode) => update(id, { mode, current_mon: null });
export const endLive = (id: string) => update(id, { status: 'closed', current_mon: null });

/** Your vote for an item (a second vote changes it). */
export async function vote(sessionId: string, monId: string, tierId: string): Promise<boolean> {
    const client = await api.getClient();
    const { error } = await client.from('tier_live_votes')
        .upsert({ session_id: sessionId, mon_id: monId, tier_id: tierId }, { onConflict: 'session_id,user_id,mon_id' });
    if (error) { api.showToast?.(error.message || 'Your vote did not go through.', 'error'); return false; }
    return true;
}

export interface Votes { tally: Tally; mine: Record<string, string>; voters: number }

export async function loadVotes(sessionId: string): Promise<Votes> {
    const client = await api.getClient();
    const { data, error } = await client.from('tier_live_votes').select('user_id, mon_id, tier_id').eq('session_id', sessionId).limit(20000);
    if (error) { log.warn('TIER_LIVE', 'Could not read the votes', error); return { tally: {}, mine: {}, voters: 0 }; }
    const tally: Tally = {}, mine: Record<string, string> = {};
    const people = new Set<string>();
    for (const r of data || []) {
        (tally[r.mon_id] ||= {})[r.tier_id] = ((tally[r.mon_id] || {})[r.tier_id] || 0) + 1;
        people.add(r.user_id);
        if (r.user_id === state.user?.id) mine[r.mon_id] = r.tier_id;
    }
    return { tally, mine, voters: people.size };
}

/** The tier most votes chose for each item (ties go to the better tier). */
export function majority(list: TierList, tally: Tally): Record<string, string> {
    const order = new Map(list.tiers.map((t, i) => [t.id, i]));
    const out: Record<string, string> = {};
    for (const [mon, counts] of Object.entries(tally)) {
        const best = Object.entries(counts).filter(([t]) => order.has(t))
            .sort((a, b) => b[1] - a[1] || (order.get(a[0])! - order.get(b[0])!))[0];
        if (best) out[mon] = best[0];
    }
    return out;
}

/**
 * Follows a session: `onChange` runs (a moment later, once for a burst) when
 * a vote or the session changes. Returns the stop function.
 */
export function followLive(sessionId: string, onChange: () => void): () => void {
    let stopped = false, timer: any = null, poll: any = null, channel: any = null;
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => { if (!stopped) onChange(); }, 300); };
    (async () => {
        try {
            const client = await api.getClient();
            if (stopped) return;
            channel = client.channel(`tierlive:${sessionId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tier_live_votes', filter: `session_id=eq.${sessionId}` }, soon)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tier_live_sessions', filter: `id=eq.${sessionId}` }, soon)
                .subscribe((status: string) => {
                    clearInterval(poll);
                    if (status !== 'SUBSCRIBED' && !stopped) poll = setInterval(onChange, 5000);
                });
        } catch (e) {
            log.warn('TIER_LIVE', 'Live updates unavailable; asking every 5 seconds', e);
            poll = setInterval(onChange, 5000);
        }
    })();
    return () => {
        stopped = true;
        clearTimeout(timer);
        clearInterval(poll);
        if (channel) api.getClient().then((c: any) => c.removeChannel(channel)).catch(() => {});
    };
}
