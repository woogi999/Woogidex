// The tier maker's game modes: other ways to rank the same items. Each mode
// is a small state machine here (no UI), and each ends in a ranked order or
// a new list that the tier maker applies (js/app/components/tier/TierModes.tsx).
//
//   blind       one item at a time, in a random order, and no take-backs
//   snake       players take turns picking (1, 2, 3, 3, 2, 1...) into their own column
//   bracket     a knockout tournament, one match at a time
//   vs          head-to-head questions ("A or B?") that sort the whole list
//   faceoff     random pairs, as many as you like; each pick moves an Elo score
//   ktc         three at a time: keep one, trade one, cut one

import { UNRANKED, convertLayout, newTierList, placeByOrder, type TierList } from './tier-lists.ts';

export type ModeKey = 'blind' | 'snake' | 'bracket' | 'vs' | 'faceoff' | 'ktc';
export const MODES: Array<[ModeKey, string, string]> = [
    ['blind', 'Blind ranking', 'One at a time, in a random order. Once it is placed, it stays.'],
    ['snake', 'Snake draft', 'Players take turns picking. The order snakes back each round.'],
    ['bracket', 'Bracket', 'A knockout tournament. Pick the winner of each match.'],
    ['vs', 'VS head-to-head', 'Answer "this or that?" and the whole list sorts itself.'],
    ['faceoff', 'Face-off', 'Random pairs, as many as you like. Every pick moves a score.'],
    ['ktc', 'Keep, Trade, Cut', 'Three at a time: keep one, trade one, cut one.']
];

export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

// ==================== bracket ====================

export interface Bracket { rounds: Array<Array<string | null>>; round: number; match: number; out: Record<string, number> }

/** A knockout bracket. Byes fill it up to a power of two; an item against a bye goes through. */
export function newBracket(ids: string[]): Bracket {
    let size = 1;
    while (size < ids.length) size *= 2;
    const seeds: Array<string | null> = [...shuffle(ids), ...Array(size - ids.length).fill(null)];
    // spread the byes: a bye meets a real item, never another bye
    const first: Array<string | null> = [];
    const real = seeds.filter(Boolean) as string[];
    const byes = size - real.length;
    for (let i = 0; i < size / 2; i++) first.push(real.shift() || null, i < byes ? null : real.shift() || null);
    return skipByes({ rounds: [first], round: 0, match: 0, out: {} });
}

const pairOf = (b: Bracket) => [b.rounds[b.round][b.match * 2], b.rounds[b.round][b.match * 2 + 1]] as const;
export const bracketDone = (b: Bracket) => b.rounds[b.round].length === 1;
export const bracketPair = (b: Bracket) => (bracketDone(b) ? null : pairOf(b));

function advance(b: Bracket, winner: string | null): Bracket {
    const rounds = b.rounds.map(r => [...r]);
    (rounds[b.round + 1] ||= []).push(winner);
    let { round, match } = b;
    match++;
    if (match * 2 >= rounds[round].length) { round++; match = 0; }
    return { ...b, rounds, round, match };
}

function skipByes(b: Bracket): Bracket {
    let next = b;
    while (!bracketDone(next)) {
        const [a, c] = pairOf(next);
        if (a && c) break;
        next = advance(next, a || c);
    }
    return next;
}

/** The pick for the current match. The loser goes out in this round. */
export function bracketPick(b: Bracket, winner: string): Bracket {
    const [a, c] = pairOf(b);
    if (winner !== a && winner !== c) return b;
    const loser = winner === a ? c : a;
    const out = loser ? { ...b.out, [loser]: b.round } : b.out;
    return skipByes(advance({ ...b, out }, winner));
}

/** Best first: the champion, then whoever went out latest. */
export function bracketOrder(b: Bracket): string[] {
    const champ = bracketDone(b) ? b.rounds[b.round][0] : null;
    const rest = Object.entries(b.out).sort((x, y) => y[1] - x[1]).map(([id]) => id);
    return [...(champ ? [champ] : []), ...rest];
}

// ==================== VS: a sort by questions ====================

/** Binary insertion: each item finds its place among the sorted ones, a question at a time. */
export interface Versus { sorted: string[]; queue: string[]; lo: number; hi: number; asked: number }

export function newVersus(ids: string[]): Versus {
    const [first, ...rest] = shuffle(ids);
    return { sorted: first ? [first] : [], queue: rest, lo: 0, hi: first ? 1 : 0, asked: 0 };
}
export const versusDone = (v: Versus) => !v.queue.length;
/** The question now: the new item, and the sorted item to hold it against. */
export function versusPair(v: Versus): [string, string] | null {
    if (versusDone(v)) return null;
    return [v.queue[0], v.sorted[Math.floor((v.lo + v.hi) / 2)]];
}
/** `newIsBetter`: the new item beats the one it was held against. */
export function versusAnswer(v: Versus, newIsBetter: boolean): Versus {
    if (versusDone(v)) return v;
    const mid = Math.floor((v.lo + v.hi) / 2);
    let { lo, hi } = v;
    if (newIsBetter) hi = mid; else lo = mid + 1;
    if (lo < hi) return { ...v, lo, hi, asked: v.asked + 1 };
    const sorted = [...v.sorted];
    sorted.splice(lo, 0, v.queue[0]);
    const queue = v.queue.slice(1);
    return { sorted, queue, lo: 0, hi: sorted.length, asked: v.asked + 1 };
}

// ==================== face-off: Elo ====================

export interface FaceOff { rating: Record<string, number>; played: Record<string, number>; pair: [string, string] | null; rounds: number }

export function newFaceOff(ids: string[]): FaceOff {
    const rating = Object.fromEntries(ids.map(id => [id, 1000]));
    const played = Object.fromEntries(ids.map(id => [id, 0]));
    return { rating, played, pair: nextPair(ids, played), rounds: 0 };
}

/** Two items, the ones that played least first, so everything gets its turns. */
function nextPair(ids: string[], played: Record<string, number>): [string, string] | null {
    if (ids.length < 2) return null;
    const pool = shuffle(ids).sort((a, b) => played[a] - played[b]);
    return [pool[0], pool[1]];
}

export function faceOffPick(f: FaceOff, winner: string): FaceOff {
    if (!f.pair || !f.pair.includes(winner)) return f;
    const loser = f.pair[0] === winner ? f.pair[1] : f.pair[0];
    const expect = 1 / (1 + Math.pow(10, (f.rating[loser] - f.rating[winner]) / 400));
    const k = 32;
    const rating = { ...f.rating, [winner]: f.rating[winner] + k * (1 - expect), [loser]: f.rating[loser] - k * (1 - expect) };
    const played = { ...f.played, [winner]: f.played[winner] + 1, [loser]: f.played[loser] + 1 };
    return { rating, played, pair: nextPair(Object.keys(rating), played), rounds: f.rounds + 1 };
}

export const faceOffOrder = (f: FaceOff) => Object.keys(f.rating).sort((a, b) => f.rating[b] - f.rating[a]);

// ==================== keep, trade, cut ====================

export interface Ktc { groups: string[][]; at: number; keep: string[]; trade: string[]; cut: string[] }

export function newKtc(ids: string[]): Ktc {
    const s = shuffle(ids);
    const groups: string[][] = [];
    for (let i = 0; i < s.length; i += 3) groups.push(s.slice(i, i + 3));
    return { groups, at: 0, keep: [], trade: [], cut: [] };
}
export const ktcDone = (k: Ktc) => k.at >= k.groups.length;
/** One answer for the group on screen: id -> keep, trade or cut. A group of three needs one of each. */
export function ktcAnswer(k: Ktc, picks: Record<string, 'keep' | 'trade' | 'cut'>): Ktc {
    const group = k.groups[k.at] || [];
    const used = group.map(id => picks[id]);
    if (used.some(p => !p)) return k;
    if (group.length === 3 && new Set(used).size !== 3) return k;
    const pick = (p: string) => group.filter(id => picks[id] === p);
    return { ...k, at: k.at + 1, keep: [...k.keep, ...pick('keep')], trade: [...k.trade, ...pick('trade')], cut: [...k.cut, ...pick('cut')] };
}

/** A new list with three tiers, Keep, Trade and Cut. */
export function ktcList(list: TierList, k: Ktc): TierList {
    const base = newTierList(list.title, 'classic');
    const tiers = base.tiers.slice(0, 3).map((t, i) => ({ ...t, name: ['Keep', 'Trade', 'Cut'][i], color: ['#3ab07a', '#e0a83a', '#e05252'][i] }));
    const placed: Record<string, string[]> = { [tiers[0].id]: k.keep, [tiers[1].id]: k.trade, [tiers[2].id]: k.cut };
    const used = new Set([...k.keep, ...k.trade, ...k.cut]);
    placed[UNRANKED] = Object.keys(list.mons).filter(id => !used.has(id));
    return { ...list, layout: 'tiers', columns: undefined, col: undefined, pos: undefined, tiers, placed, updatedAt: Date.now() };
}

// ==================== snake draft ====================

export interface Snake { players: string[]; picks: number; turn: number; pool: string[]; teams: string[][] }

export function newSnake(ids: string[], players: string[], picks: number): Snake {
    const names = players.map(p => p.trim()).filter(Boolean).slice(0, 8);
    return { players: names, picks: Math.max(1, Math.min(picks, Math.floor(ids.length / Math.max(1, names.length)))), turn: 0, pool: [...ids], teams: names.map(() => []) };
}
/** Whose turn it is: 0, 1, 2, then 2, 1, 0 in the next round. */
export function snakeWho(s: Snake): number {
    const n = s.players.length;
    const round = Math.floor(s.turn / n), at = s.turn % n;
    return round % 2 ? n - 1 - at : at;
}
export const snakeDone = (s: Snake) => !s.players.length || s.turn >= s.players.length * s.picks || !s.pool.length;
export function snakePick(s: Snake, id: string): Snake {
    if (snakeDone(s) || !s.pool.includes(id)) return s;
    const who = snakeWho(s);
    const teams = s.teams.map((t, i) => (i === who ? [...t, id] : t));
    return { ...s, teams, pool: s.pool.filter(x => x !== id), turn: s.turn + 1 };
}

/** The draft as a list: a column for each player, a row for each pick. */
export function snakeList(list: TierList, s: Snake): TierList {
    const base = newTierList(list.title, 'classic');
    const rows = Array.from({ length: s.picks }, (_, i) => ({ ...base.tiers[Math.min(i, base.tiers.length - 1)], id: `t_pick${i + 1}`, name: `Pick ${i + 1}` }));
    const columns = s.players.map((name, i) => ({ id: `c_p${i + 1}`, name: name.slice(0, 24) }));
    const placed: Record<string, string[]> = Object.fromEntries([[UNRANKED, [...s.pool]], ...rows.map(r => [r.id, []])]);
    const col: Record<string, string> = {};
    s.teams.forEach((team, p) => team.forEach((id, i) => { placed[rows[i].id].push(id); col[id] = columns[p].id; }));
    return { ...list, layout: 'tiers', tiers: rows, columns, col, pos: undefined, placed, updatedAt: Date.now() };
}

/**
 * A ranked order from a mode, spread over the list's own tiers (or a
 * pyramid's levels). A quadrant or an alignment chart has no ranked rows, so
 * the order goes into tiers instead.
 */
export function applyOrder(list: TierList, order: string[]): TierList {
    const base = list.layout === 'quadrant' || list.layout === 'alignment' ? convertLayout(list, 'tiers') : list;
    if (base.layout === 'pyramid' || base.layout === 'grid') {
        // these fill from the top, a row at a time
        return convertLayout(placeByOrder({ ...base, layout: 'tiers' }, order), base.layout);
    }
    return placeByOrder(base, order);
}
