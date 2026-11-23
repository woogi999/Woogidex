// Tier lists: tier leaders rank Fakémon (and main-game Pokémon) into tiers,
// note why, and hand the result to a server's developers as Showdown code.
//
// Where they live:
//   * saved on this device in state.folders (type 'tier-list'), so they go
//     with every save, JSON export and cloud backup;
//   * shared in a chat or group (js/features/messaging.ts): the whole list
//     travels inside one end-to-end encrypted message. Anyone in the chat
//     opens it, changes it and sends the new version back. The version they
//     opened becomes the `baseline`, so the changelog shows what moved.
//
// A list from a chat is someone else's data: cleanTierList() checks its
// shape and caps every size before anything reads it. It is only shown and
// exported as text, never run.
//
// Export: Showdown's formats-data.ts (`FormatsData`, one `tier` per species,
// for a mod's data folder), a plain text list, and the changelog.
//
// Not only Smogon tiers (2026-11-23): `kind` 'fun' lists have free tier names
// ("Would fly the plane") and no Showdown column. A list has a `layout`:
//   tiers      rows, with optional `columns` (a mon's column is in `col`)
//   pyramid    rows that hold 1, 2, 3 ... items, best at the top
//   grid       one ranked order, drawn as numbered cells
//   alignment  3 x 3: rows Lawful / Neutral / Chaotic, columns Good / Neutral / Evil
//   quadrant   a plane with four axis labels; a mon's spot is in `pos` (0 to 1)
// `look` holds the display settings (background, widths, item size).
// A `template` is a list kept to start new rankings from. A `singleUse` list
// is never saved: it is for one picture to download. A mon with `temp` is
// one you added to someone else's list; it stays in your copy only and is
// taken out before the list goes anywhere (forSharing).

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';

export interface Tier { id: string; name: string; sd: string; color: string }
/**
 * One thing on the board. Most are Fakémon or Pokémon, but a list can also
 * rank pictures or plain words, for fun (from 'image' or 'custom'). `img` is a
 * small picture (a data URI, 96px) for picture items.
 */
export interface TierMon { id: string; name: string; types?: string[]; from: 'fakemon' | 'pokemon' | 'custom' | 'image'; note?: string; img?: string; temp?: boolean }
export type Layout = 'tiers' | 'pyramid' | 'grid' | 'alignment' | 'quadrant';
export interface Column { id: string; name: string }
export interface Look { bg?: string; bgImg?: string; width?: number; itemSize?: number; labelWidth?: number }
export interface Axes { top: string; bottom: string; left: string; right: string }
export interface TierList {
    id: string;
    title: string;
    format: string;                       // the Showdown format or mod it is for, e.g. "gen9pokeathlon"
    tiers: Tier[];
    placed: Record<string, string[]>;     // tier id -> mon ids, best first
    mons: Record<string, TierMon>;        // mon id -> mon
    baseline?: Record<string, string>;    // mon id -> tier name, from the version this one started from
    updatedAt: number;
    updatedBy?: string;
    kind?: 'fun' | 'showdown';
    layout?: Layout;
    columns?: Column[];
    col?: Record<string, string>;         // mon id -> column id (tiers and alignment layouts)
    pos?: Record<string, { x: number; y: number }>; // mon id -> spot on the plane (quadrant)
    axes?: Axes;
    look?: Look;
    template?: boolean;
    singleUse?: boolean;
}

export const LAYOUTS: Array<[Layout, string, string]> = [
    ['tiers', 'Tiers', 'Rows of tiers, with columns if you want them'],
    ['pyramid', 'Pyramid', 'One at the top, two under it, three under that...'],
    ['grid', 'Grid', 'A numbered ranking from #1 down'],
    ['alignment', 'Alignment chart', 'Lawful to Chaotic, Good to Evil'],
    ['quadrant', 'Quadrant chart', 'Place each one on two axes'],
];

export const TIER_TYPE = 'tier-list' as const;
export const UNRANKED = 'unranked';
const MAX_MONS = 800, MAX_TIERS = 30, MAX_NOTE = 400, MAX_NAME = 40;
/** At most this many picture items, each at most IMG_CHARS: a list must still fit a chat message or a post. */
export const MAX_IMAGES = 40;
const IMG_CHARS = 12000;
const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** Showdown's tier names, best first. A tier you add maps to one of these on export. */
export const SD_TIERS = ['AG', 'Uber', '(Uber)', 'OU', '(OU)', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', '(NU)', 'PUBL', 'PU', '(PU)', 'ZUBL', 'ZU', 'NFE', 'LC', 'Illegal', 'Unreleased'];
const COLORS = ['#e05252', '#e07a3a', '#e0a83a', '#c8c83a', '#7cc04a', '#3ab07a', '#3aa0c0', '#4a78d0', '#7a5ad0', '#b05ac0', '#8a8a8a'];
const DEFAULT_TIERS = ['Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PU', 'ZU', 'NFE', 'LC'];

export const toID = (text: string) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clip = (v: any, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/** Tier rows from names: the colours run from red at the top down the scale. */
function makeTiers(names: string[], sd = false): Tier[] {
    return names.map((name, i) => ({ id: newId('t'), name, sd: sd && SD_TIERS.includes(name) ? name : 'OU', color: COLORS[Math.round(i * (COLORS.length - 2) / Math.max(1, names.length - 1))] }));
}
const emptyPlaced = (tiers: Tier[]) => Object.fromEntries([[UNRANKED, []], ...tiers.map(t => [t.id, []])]) as Record<string, string[]>;

/** Ready-made starts for a new list. 'showdown' is the format tiers; the rest are for fun. */
export const STARTS: Array<{ key: string; label: string; hint: string; make: (title?: string) => TierList }> = [
    { key: 'classic', label: 'S to F', hint: 'The classic: S, A, B, C, D, F', make: t => blankList(t, ['S', 'A', 'B', 'C', 'D', 'F']) },
    { key: 'showdown', label: 'Showdown tiers', hint: 'Uber to LC, exports as formats-data.ts', make: t => ({ ...blankList(t, DEFAULT_TIERS, true), kind: 'showdown' }) },
    { key: 'plane', label: 'On a plane', hint: 'What would they do on a plane?', make: t => blankList(t || 'What they would do on a plane', ['Flies the plane', 'Helps the crew', 'Sleeps the whole way', 'Kicks your seat', 'Gets kicked off']) },
    { key: 'pyramid', label: 'Pyramid', hint: 'Who sits at the top?', make: t => ({ ...blankList(t, ['1', '2', '3', '4', '5']), layout: 'pyramid' }) },
    { key: 'grid', label: 'Ranking grid', hint: '#1 down to the last', make: t => ({ ...blankList(t, ['Ranked']), layout: 'grid' }) },
    { key: 'alignment', label: 'Alignment chart', hint: 'Lawful Good to Chaotic Evil', make: t => alignmentList(blankList(t)) },
    { key: 'quadrant', label: 'Quadrant chart', hint: 'Two axes, four corners', make: t => ({ ...blankList(t, []), layout: 'quadrant', axes: { top: 'Strong', bottom: 'Weak', left: 'Ugly', right: 'Cute' } }) },
];

function blankList(title = 'New tier list', names: string[] = ['S', 'A', 'B', 'C', 'D', 'F'], sd = false): TierList {
    const tiers = makeTiers(names, sd);
    return { id: newId('tl'), title: title || 'New tier list', format: '', kind: 'fun', layout: 'tiers', tiers, placed: emptyPlaced(tiers), mons: {}, updatedAt: Date.now() };
}

function alignmentList(list: TierList): TierList {
    const tiers = makeTiers(['Lawful', 'Neutral', 'Chaotic']);
    return { ...list, layout: 'alignment', tiers, columns: ['Good', 'Neutral', 'Evil'].map(name => ({ id: newId('c'), name })), placed: emptyPlaced(tiers), col: {} };
}

/** A new list. The default is the classic S to F, for fun; pass 'showdown' for format tiers. */
export function newTierList(title = 'New tier list', start = 'classic'): TierList {
    return (STARTS.find(s => s.key === start) || STARTS[0]).make(title);
}

/**
 * A tier list from anywhere (a chat, a file, old storage) in a safe shape:
 * known fields only, every string and list capped, every id checked.
 * @returns null when it is not a tier list at all
 */
export function cleanTierList(raw: any): TierList | null {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tiers)) return null;
    const idOk = (s: any) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s);
    const tiers: Tier[] = raw.tiers.slice(0, MAX_TIERS).filter((t: any) => t && idOk(t.id)).map((t: any) => ({
        id: t.id, name: clip(t.name, 24) || 'Tier', sd: SD_TIERS.includes(t.sd) ? t.sd : 'OU', color: HEX.test(t.color) ? t.color : '#8a8a8a'
    }));
    const mons: Record<string, TierMon> = {};
    let images = 0;
    for (const [id, m] of Object.entries<any>(raw.mons && typeof raw.mons === 'object' ? raw.mons : {}).slice(0, MAX_MONS)) {
        if (!/^[a-z0-9]{1,40}$/.test(id) || !m || typeof m !== 'object') continue;
        // a picture from someone else: a small data URI of a known image type, or nothing
        const img = typeof m.img === 'string' && m.img.length <= IMG_CHARS && IMG_RE.test(m.img) && images < MAX_IMAGES ? m.img : '';
        if (img) images++;
        mons[id] = {
            id, name: clip(m.name, MAX_NAME) || id,
            types: Array.isArray(m.types) ? m.types.slice(0, 2).map((t: any) => clip(t, 16)).filter(Boolean) : [],
            from: ['fakemon', 'pokemon', 'custom', 'image'].includes(m.from) ? m.from : 'custom',
            ...(m.note ? { note: clip(m.note, MAX_NOTE) } : {}),
            ...(img ? { img } : {}),
            ...(m.temp === true ? { temp: true } : {})
        };
    }
    const seen = new Set<string>();
    const placed: Record<string, string[]> = { [UNRANKED]: [] };
    for (const key of [...tiers.map(t => t.id), UNRANKED]) {
        const list = Array.isArray(raw.placed?.[key]) ? raw.placed[key] : [];
        placed[key] = list.filter((id: any) => typeof id === 'string' && mons[id] && !seen.has(id) && seen.add(id));
    }
    // a mon that is in no tier goes to Unranked
    for (const id of Object.keys(mons)) if (!seen.has(id)) placed[UNRANKED].push(id);
    const baseline: Record<string, string> = {};
    if (raw.baseline && typeof raw.baseline === 'object') {
        for (const [id, tier] of Object.entries<any>(raw.baseline).slice(0, MAX_MONS)) if (/^[a-z0-9]{1,40}$/.test(id)) baseline[id] = clip(tier, 24);
    }
    // ---- layout, columns, spots, look (2026-11-23) ----
    const layout: Layout = LAYOUTS.some(l => l[0] === raw.layout) ? raw.layout : 'tiers';
    // a list from before kinds had Showdown tiers
    const kind = raw.kind === 'fun' ? 'fun' : 'showdown';
    const columns: Column[] = (Array.isArray(raw.columns) ? raw.columns : []).slice(0, MAX_COLUMNS)
        .filter((c: any) => c && idOk(c.id)).map((c: any) => ({ id: c.id, name: clip(c.name, 24) || 'Column' }));
    const colIds = new Set(columns.map(c => c.id));
    const col: Record<string, string> = {};
    if (columns.length && raw.col && typeof raw.col === 'object') {
        for (const [id, c] of Object.entries<any>(raw.col)) if (mons[id] && colIds.has(c)) col[id] = c;
    }
    const pos: Record<string, { x: number; y: number }> = {};
    if (layout === 'quadrant' && raw.pos && typeof raw.pos === 'object') {
        const unit = (v: any) => Math.min(1, Math.max(0, Number(v) || 0));
        for (const [id, p] of Object.entries<any>(raw.pos)) if (mons[id] && p && typeof p === 'object') pos[id] = { x: unit(p.x), y: unit(p.y) };
        // a mon with a spot on the plane is placed, not unranked
        placed[UNRANKED] = placed[UNRANKED].filter(id => !pos[id]);
    }
    const axesRaw = raw.axes && typeof raw.axes === 'object' ? raw.axes : null;
    const axes = axesRaw ? { top: clip(axesRaw.top, 24), bottom: clip(axesRaw.bottom, 24), left: clip(axesRaw.left, 24), right: clip(axesRaw.right, 24) } : undefined;
    const look = cleanLook(raw.look);
    return {
        id: idOk(raw.id) ? raw.id : newId('tl'), title: clip(raw.title, 80) || 'Tier list', format: clip(raw.format, 40).replace(/[^a-z0-9]/gi, '').toLowerCase(),
        tiers, placed, mons, ...(Object.keys(baseline).length ? { baseline } : {}),
        updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
        ...(raw.updatedBy ? { updatedBy: clip(raw.updatedBy, 40) } : {}),
        kind, layout,
        ...(columns.length ? { columns, col } : {}),
        ...(layout === 'quadrant' ? { pos, axes: axes || { top: '', bottom: '', left: '', right: '' } } : {}),
        ...(look ? { look } : {}),
        ...(raw.template === true ? { template: true } : {}),
        ...(raw.singleUse === true ? { singleUse: true } : {})
    };
}

const MAX_COLUMNS = 12;
const BG_PRESET = /^preset:[a-z]{2,20}$/;
/** A background picture: a JPEG or WebP data URI, kept small. */
const BG_IMG_RE = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/;
export const BG_IMG_CHARS = 160000;
export const LOOK_LIMITS = { width: [640, 2400], itemSize: [48, 140], labelWidth: [80, 260] } as const;

function cleanLook(raw: any): Look | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const num = (v: any, [lo, hi]: readonly [number, number]) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : undefined);
    const look: Look = {};
    if (typeof raw.bg === 'string' && (HEX.test(raw.bg) || BG_PRESET.test(raw.bg))) look.bg = raw.bg;
    if (typeof raw.bgImg === 'string' && raw.bgImg.length <= BG_IMG_CHARS && BG_IMG_RE.test(raw.bgImg)) look.bgImg = raw.bgImg;
    const width = num(raw.width, LOOK_LIMITS.width), itemSize = num(raw.itemSize, LOOK_LIMITS.itemSize), labelWidth = num(raw.labelWidth, LOOK_LIMITS.labelWidth);
    if (width) look.width = width;
    if (itemSize) look.itemSize = itemSize;
    if (labelWidth) look.labelWidth = labelWidth;
    return Object.keys(look).length ? look : undefined;
}

/** The list as it goes to a chat, a group or a post: your own temporary items left out. */
export function forSharing(list: TierList): TierList {
    const temp = Object.values(list.mons).filter(m => m.temp).map(m => m.id);
    let next = list;
    for (const id of temp) next = removeMon(next, id);
    const { singleUse: _s, ...rest } = next;
    return rest;
}

// ---- layouts ----

/** How many items a row of a layout holds (Infinity: no limit). */
export function rowCapacity(list: TierList, tierIndex: number): number {
    if (list.layout === 'pyramid') return tierIndex + 1;
    return Infinity;
}

/** Every placed mon, best first: tier by tier, then the order in each tier. */
export function rankedOrder(list: TierList): string[] {
    return list.tiers.flatMap(t => list.placed[t.id] || []).filter(id => list.mons[id]);
}

/**
 * Puts mons into the tiers in `order`, best first, split evenly over the
 * tiers (the first tiers take the extra). Mons not in `order` stay where they
 * are unranked. Used by the game modes.
 */
export function placeByOrder(list: TierList, order: string[]): TierList {
    const ids = order.filter(id => list.mons[id]);
    const placed = emptyPlaced(list.tiers);
    const n = list.tiers.length;
    if (!n) return list;
    ids.forEach((id, i) => placed[list.tiers[Math.min(n - 1, Math.floor(i * n / ids.length))].id].push(id));
    const used = new Set(ids);
    placed[UNRANKED] = Object.keys(list.mons).filter(id => !used.has(id));
    return { ...list, placed, col: {}, updatedAt: Date.now() };
}

/**
 * The same items in another layout. What can carry over does: the ranked
 * order fills a pyramid or a grid from the top; going back to
 * tiers spreads that order over S to F. An alignment chart or a quadrant
 * starts empty (it has nothing to read an order into).
 */
export function convertLayout(list: TierList, layout: Layout): TierList {
    if (list.layout === layout) return list;
    const order = rankedOrder(list);
    const base: TierList = { ...list, layout, columns: undefined, col: undefined, pos: undefined, axes: undefined, updatedAt: Date.now() };
    const fill = (names: string[], caps: (i: number) => number): TierList => {
        const tiers = makeTiers(names);
        const placed = emptyPlaced(tiers);
        let at = 0;
        tiers.forEach((t, i) => { const room = caps(i); while (at < order.length && placed[t.id].length < room) placed[t.id].push(order[at++]); });
        const used = new Set(order.slice(0, at));
        placed[UNRANKED] = Object.keys(list.mons).filter(id => !used.has(id));
        return { ...base, tiers, placed };
    };
    if (layout === 'pyramid') {
        let levels = 1;
        while (levels * (levels + 1) / 2 < Math.max(1, order.length) && levels < 10) levels++;
        return fill(Array.from({ length: Math.max(3, levels) }, (_, i) => String(i + 1)), i => i + 1);
    }
    if (layout === 'grid') return fill(['Ranked'], () => Infinity);
    if (layout === 'alignment') {
        const a = alignmentList(base);
        return { ...a, title: list.title, id: list.id, mons: list.mons, placed: { ...a.placed, [UNRANKED]: Object.keys(list.mons) } };
    }
    if (layout === 'quadrant') {
        return { ...base, tiers: [], placed: { [UNRANKED]: Object.keys(list.mons) }, pos: {}, axes: list.axes || { top: 'Strong', bottom: 'Weak', left: 'Ugly', right: 'Cute' } };
    }
    // back to tiers: the order over S to F, or the tiers a pyramid had
    const tiers = list.layout === 'pyramid' && list.tiers.length ? list.tiers : makeTiers(['S', 'A', 'B', 'C', 'D', 'F']);
    return placeByOrder({ ...base, tiers, placed: emptyPlaced(tiers) }, order);
}

/** Moves a mon to a spot on the quadrant plane (it leaves Unranked). */
export function placeAt(list: TierList, monId: string, x: number, y: number): TierList {
    const placed = Object.fromEntries(Object.entries(list.placed).map(([k, ids]) => [k, ids.filter(id => id !== monId)]));
    return { ...list, placed, pos: { ...(list.pos || {}), [monId]: { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } }, updatedAt: Date.now() };
}

/** Sends a quadrant mon back to Unranked. */
export function unplace(list: TierList, monId: string): TierList {
    const { [monId]: _gone, ...pos } = list.pos || {};
    return moveMon({ ...list, pos }, monId, UNRANKED);
}

export function addColumn(list: TierList, name = 'Column'): TierList {
    const columns = list.columns || [];
    if (columns.length >= MAX_COLUMNS) return list;
    return { ...list, columns: [...columns, { id: newId('c'), name }], col: list.col || {}, updatedAt: Date.now() };
}

/** Removes a column. Its mons stay in their tier, in the first column. */
export function removeColumn(list: TierList, colId: string): TierList {
    const columns = (list.columns || []).filter(c => c.id !== colId);
    const col = Object.fromEntries(Object.entries(list.col || {}).filter(([, c]) => c !== colId));
    return { ...list, columns: columns.length ? columns : undefined, col: columns.length ? col : undefined, updatedAt: Date.now() };
}

/** The column a placed mon is in: its own, else the first. */
export const columnOf = (list: TierList, monId: string) => list.col?.[monId] || list.columns?.[0]?.id || '';

/** Moves a mon to a tier and a column. */
export function moveMonTo(list: TierList, monId: string, tierId: string, colId: string | null, beforeId: string | null = null): TierList {
    const next = moveMon(list, monId, tierId, beforeId);
    if (!colId || !list.columns?.length) return next;
    return { ...next, col: { ...(next.col || {}), [monId]: colId } };
}

// ---- templates on this device ----

const TEMPLATE_TYPE = 'tier-template' as const;

/** Saves the list's tiers, columns, layout, look and items, with nothing placed, to start new rankings from. */
export function saveAsTemplate(list: TierList) {
    const clean = cleanTierList({ ...forSharing(list), id: newId('tpl'), template: true, baseline: undefined });
    if (!clean) return;
    const blank = { ...clean, placed: { ...emptyPlaced(clean.tiers), [UNRANKED]: Object.keys(clean.mons) }, col: clean.columns ? {} : undefined, pos: clean.layout === 'quadrant' ? {} : undefined };
    (state.folders ||= []).push({ id: `tiertpl_${blank.id}`, type: TEMPLATE_TYPE, name: blank.title, list: blank, createdAt: Date.now() });
    api.saveToStorage?.();
    notify();
}

export function savedTemplates(): TierList[] {
    return (state.folders || []).filter((f: any) => f?.type === TEMPLATE_TYPE).map((f: any) => cleanTierList(f.list)).filter(Boolean) as TierList[];
}

export function deleteTemplate(id: string) {
    state.folders = (state.folders || []).filter((f: any) => !(f?.type === TEMPLATE_TYPE && f.list?.id === id));
    api.saveToStorage?.();
    notify();
}

/** A fresh ranking from a template (a new id, so the template stays as it is). */
export function fromTemplate(tpl: TierList, singleUse = false): TierList {
    const { template: _t, ...rest } = tpl;
    return { ...rest, id: newId('tl'), ...(singleUse ? { singleUse: true } : {}), updatedAt: Date.now() };
}

// ---- where each mon is ----

/** The tier a mon is in (its name), or '' when unranked. */
export function tierOf(list: TierList, monId: string): string {
    for (const t of list.tiers) if (list.placed[t.id]?.includes(monId)) return t.name;
    return '';
}

/** Where every mon is now, by tier name: the baseline of the next version. */
export function snapshot(list: TierList): Record<string, string> {
    const out: Record<string, string> = {};
    for (const id of Object.keys(list.mons)) out[id] = tierOf(list, id);
    return out;
}

/** Where every mon is now, by tier id (stable when a tier is renamed): what a member saves as an own ranking. */
export function placementOf(list: TierList): Record<string, string> {
    const out: Record<string, string> = {};
    for (const t of list.tiers) for (const id of list.placed[t.id] || []) out[id] = t.id;
    return out;
}

/** Puts mons where a saved own ranking had them (the rest stay unranked). */
export function applyPlacement(list: TierList, placed: Record<string, string>): TierList {
    const tiers = new Set(list.tiers.map(t => t.id));
    const next: Record<string, string[]> = Object.fromEntries([[UNRANKED, []], ...list.tiers.map(t => [t.id, []])]);
    for (const id of Object.keys(list.mons)) (next[tiers.has(placed?.[id]) ? placed[id] : UNRANKED] ||= []).push(id);
    return { ...list, placed: next };
}

/**
 * The group's average of everyone's own rankings: each mon goes to the tier
 * nearest the mean of its places, in order of that mean. A mon nobody ranked
 * stays unranked. The title says how many rankings it is made of.
 */
export function averageList(list: TierList, rankings: Array<{ placed: Record<string, string> }>): TierList {
    const index = new Map(list.tiers.map((t, i) => [t.id, i]));
    const scores: Array<[string, number]> = [];
    for (const id of Object.keys(list.mons)) {
        const at = rankings.map(r => index.get(r.placed?.[id])).filter((i): i is number => i !== undefined);
        if (at.length) scores.push([id, at.reduce((a, b) => a + b, 0) / at.length]);
    }
    scores.sort((a, b) => a[1] - b[1]);
    const placed: Record<string, string[]> = Object.fromEntries([[UNRANKED, []], ...list.tiers.map(t => [t.id, []])]);
    const ranked = new Set<string>();
    for (const [id, mean] of scores) { placed[list.tiers[Math.round(mean)].id].push(id); ranked.add(id); }
    placed[UNRANKED] = Object.keys(list.mons).filter(id => !ranked.has(id));
    return { ...list, placed, title: `${list.title} (group average of ${rankings.length})`, baseline: undefined };
}

/** Reads every Fakémon in a Woogidex save file (a collection export, or one Fakémon), to rank them. */
export function monsFromSaveFile(text: string): TierMon[] {
    const data = JSON.parse(text);
    const list: any[] = Array.isArray(data?.fakemonDB) ? data.fakemonDB : Array.isArray(data) ? data : data?.fakemon ? [data.fakemon] : data?.name ? [data] : [];
    return list.filter(f => f && typeof f.name === 'string' && f.name.trim()).slice(0, MAX_MONS)
        .map(f => ({ id: toID(f.name), name: String(f.name), types: [f.type1, f.type2].filter(t => typeof t === 'string' && t), from: 'fakemon' as const }));
}

/** Moves a mon to a tier (or Unranked), before `beforeId` or at the end. Returns a new list. */
export function moveMon(list: TierList, monId: string, tierId: string, beforeId: string | null = null): TierList {
    const placed: Record<string, string[]> = {};
    for (const [k, ids] of Object.entries(list.placed)) placed[k] = ids.filter(id => id !== monId);
    const row = placed[tierId] || (placed[tierId] = []);
    const at = beforeId ? row.indexOf(beforeId) : -1;
    if (at >= 0) row.splice(at, 0, monId); else row.push(monId);
    return { ...list, placed, updatedAt: Date.now() };
}

/** Adds mons to Unranked (those already in the list stay where they are). */
export function addMons(list: TierList, mons: TierMon[]): TierList {
    const next = { ...list, mons: { ...list.mons }, placed: { ...list.placed, [UNRANKED]: [...(list.placed[UNRANKED] || [])] } };
    let images = Object.values(list.mons).filter(m => m.img).length;
    for (const m of mons) {
        // a picture gets its own id: two pictures may share a name
        const id = m.from === 'image' ? `img${Math.random().toString(36).slice(2, 12)}` : toID(m.name);
        if (!id || next.mons[id] || Object.keys(next.mons).length >= MAX_MONS) continue;
        if (m.img && ++images > MAX_IMAGES) continue;
        next.mons[id] = { ...m, id, name: clip(m.name, MAX_NAME) || 'Picture' };
        next.placed[UNRANKED].push(id);
    }
    return { ...next, updatedAt: Date.now() };
}

export function removeMon(list: TierList, monId: string): TierList {
    const { [monId]: _gone, ...mons } = list.mons;
    const placed = Object.fromEntries(Object.entries(list.placed).map(([k, ids]) => [k, ids.filter(id => id !== monId)]));
    return { ...list, mons, placed, updatedAt: Date.now() };
}

export function addTier(list: TierList, name = 'New tier'): TierList {
    if (list.tiers.length >= MAX_TIERS) return list;
    const t: Tier = { id: newId('t'), name, sd: SD_TIERS.includes(name) ? name : 'OU', color: COLORS[list.tiers.length % COLORS.length] };
    return { ...list, tiers: [...list.tiers, t], placed: { ...list.placed, [t.id]: [] }, updatedAt: Date.now() };
}

/** Removes a tier. Its mons go to Unranked. */
export function removeTier(list: TierList, tierId: string): TierList {
    const moved = list.placed[tierId] || [];
    const { [tierId]: _gone, ...placed } = list.placed;
    placed[UNRANKED] = [...(placed[UNRANKED] || []), ...moved];
    return { ...list, tiers: list.tiers.filter(t => t.id !== tierId), placed, updatedAt: Date.now() };
}

export function moveTier(list: TierList, tierId: string, by: -1 | 1): TierList {
    const i = list.tiers.findIndex(t => t.id === tierId), j = i + by;
    if (i < 0 || j < 0 || j >= list.tiers.length) return list;
    const tiers = [...list.tiers];
    [tiers[i], tiers[j]] = [tiers[j], tiers[i]];
    return { ...list, tiers, updatedAt: Date.now() };
}

// ---- what can go in ----

/** Your Fakémon and the main-game Pokémon whose name has `q`, for the Add box. */
export function monChoices(q: string, limit = 30): TierMon[] {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const mine: TierMon[] = (state.fakemonDB || []).filter((f: any) => !f.pendingVanilla && String(f.name || '').toLowerCase().includes(s))
        .slice(0, limit).map((f: any) => ({ id: toID(f.name), name: f.name, types: [f.type1, f.type2].filter(Boolean), from: 'fakemon' }));
    const main: TierMon[] = Object.values<any>(state.sdPokedex || {}).filter(p => String(p.name || '').toLowerCase().includes(s))
        .slice(0, limit).map(p => ({ id: toID(p.name), name: p.name, types: p.types || [], from: 'pokemon' }));
    const seen = new Set<string>();
    return [...mine, ...main].filter(m => m.id && !seen.has(m.id) && seen.add(m.id)).slice(0, limit);
}

/** Every Fakémon in the collection (or a region of it), to add in one go. */
export function collectionMons(regionId: string | null = null): TierMon[] {
    return (state.fakemonDB || []).filter((f: any) => !f.pendingVanilla && f.name && (!regionId || api.entryInRegion?.(f, regionId)))
        .map((f: any) => ({ id: toID(f.name), name: f.name, types: [f.type1, f.type2].filter(Boolean), from: 'fakemon' as const }));
}

// ---- export ----

/** What changed since the baseline: one line for each mon that moved, was added, or left. */
export function changelog(list: TierList): string[] {
    if (!list.baseline) return [];
    const order = list.tiers.map(t => t.name);
    const rank = (name: string) => (name ? order.indexOf(name) : order.length);
    const lines: string[] = [];
    for (const [id, m] of Object.entries(list.mons)) {
        const now = tierOf(list, id), before = list.baseline[id];
        if (before === undefined) { if (now) lines.push(`${m.name}: added to ${now}`); continue; }
        if (before === now) continue;
        const dir = rank(now) < rank(before) ? 'rises' : 'drops';
        lines.push(`${m.name}: ${before || 'Unranked'} → ${now || 'Unranked'} (${dir})${m.note ? ` - ${m.note}` : ''}`);
    }
    for (const [id, before] of Object.entries(list.baseline)) if (!list.mons[id] && before) lines.push(`${id}: removed from ${before}`);
    return lines;
}

const sdString = (s: string) => JSON.stringify(s);

/** Showdown's formats-data.ts for a mod: every ranked mon's tier. */
export function exportFormatsData(list: TierList): string {
    const changes = changelog(list);
    const head = [
        `// ${list.title}${list.format ? ` (${list.format})` : ''}, made with Woogidex on ${new Date(list.updatedAt).toISOString().slice(0, 10)}.`,
        '// Put this in the mod\'s data folder as formats-data.ts, or copy the entries you need.',
        ...(changes.length ? ['// Changes:', ...changes.map(l => `//   ${l.replace(/\*\//g, '* /')}`)] : [])
    ];
    const rows: string[] = [];
    for (const t of list.tiers) {
        for (const id of list.placed[t.id] || []) {
            const m = list.mons[id];
            if (!m) continue;
            rows.push(`\t${id}: {\n\t\ttier: ${sdString(t.sd)},\n\t},`);
        }
    }
    return `${head.join('\n')}\nexport const FormatsData: import('../../../sim/dex-species').ModdedSpeciesFormatsDataTable = {\n${rows.join('\n')}\n};\n`;
}

/** A plain list: each tier and its mons, with the notes. */
export function exportText(list: TierList): string {
    const out = [`${list.title}${list.format ? ` (${list.format})` : ''}`, ''];
    for (const t of list.tiers) {
        const ids = list.placed[t.id] || [];
        if (!ids.length) continue;
        out.push(`${t.name}${t.sd !== t.name ? ` [${t.sd}]` : ''}:`);
        for (const id of ids) { const m = list.mons[id]; if (m) out.push(`- ${m.name}${m.note ? ` (${m.note})` : ''}`); }
        out.push('');
    }
    const changes = changelog(list);
    if (changes.length) out.push('Changes:', ...changes.map(l => `- ${l}`));
    return out.join('\n').trim() + '\n';
}

/** Reads a tier list from Showdown-style text: "OU:" lines, then one name a line. */
export function importText(list: TierList, text: string): TierList {
    let next = list;
    let tier: Tier | undefined;
    for (const line of String(text || '').split(/\r?\n/).slice(0, 2000)) {
        const head = line.match(/^\s*([^-:•*][^:]{0,23}):\s*$/);
        if (head) {
            const name = head[1].trim();
            tier = next.tiers.find(t => t.name.toLowerCase() === name.toLowerCase());
            if (!tier) { next = addTier(next, name); tier = next.tiers[next.tiers.length - 1]; }
            continue;
        }
        const name = line.replace(/^\s*[-•*]\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim();
        if (!name || !tier) continue;
        next = addMons(next, [{ id: toID(name), name, from: 'custom' }]);
        next = moveMon(next, toID(name), tier.id);
    }
    return next;
}

// ---- saved on this device ----

export function savedTierLists(): TierList[] {
    return (state.folders || []).filter((f: any) => f?.type === TIER_TYPE).map((f: any) => cleanTierList(f.list)).filter(Boolean) as TierList[];
}

export function saveTierList(list: TierList) {
    const clean = cleanTierList(list);
    if (!clean) return;
    const at = (state.folders || []).find((f: any) => f?.type === TIER_TYPE && f.list?.id === clean.id);
    if (at) Object.assign(at, { name: clean.title, list: clean, updatedAt: Date.now() });
    else (state.folders ||= []).push({ id: `tierlist_${clean.id}`, type: TIER_TYPE, name: clean.title, list: clean, createdAt: Date.now() });
    api.saveToStorage?.();
    notify();
}

export function deleteTierList(id: string) {
    state.folders = (state.folders || []).filter((f: any) => !(f?.type === TIER_TYPE && f.list?.id === id));
    api.saveToStorage?.();
    notify();
}

/** Sends the list to a chat as a new version: what it holds now becomes the next one's baseline. */
export async function sendTierList(conversationId: string, list: TierList, text = ''): Promise<boolean> {
    const clean = cleanTierList({ ...forSharing(list), updatedBy: state.user?.username || '' });
    if (!clean) return false;
    if (JSON.stringify(clean).length > 70000) { api.showToast?.('This tier list is too big to send in a chat. Export it instead.', 'warning'); return false; }
    return !!(await api.sendMessage?.(conversationId, text, [], null, { tierList: clean }));
}
