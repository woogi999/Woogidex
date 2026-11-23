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

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';

export interface Tier { id: string; name: string; sd: string; color: string }
export interface TierMon { id: string; name: string; types?: string[]; from: 'fakemon' | 'pokemon' | 'custom'; note?: string }
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
}

export const TIER_TYPE = 'tier-list' as const;
export const UNRANKED = 'unranked';
const MAX_MONS = 800, MAX_TIERS = 30, MAX_NOTE = 400, MAX_NAME = 40;
const HEX = /^#[0-9a-f]{6}$/i;

/** Showdown's tier names, best first. A tier you add maps to one of these on export. */
export const SD_TIERS = ['AG', 'Uber', '(Uber)', 'OU', '(OU)', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', '(NU)', 'PUBL', 'PU', '(PU)', 'ZUBL', 'ZU', 'NFE', 'LC', 'Illegal', 'Unreleased'];
const COLORS = ['#e05252', '#e07a3a', '#e0a83a', '#c8c83a', '#7cc04a', '#3ab07a', '#3aa0c0', '#4a78d0', '#7a5ad0', '#b05ac0', '#8a8a8a'];
const DEFAULT_TIERS = ['Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PU', 'ZU', 'NFE', 'LC'];

export const toID = (text: string) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clip = (v: any, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export function newTierList(title = 'New tier list'): TierList {
    const tiers = DEFAULT_TIERS.map((name, i) => ({ id: newId('t'), name, sd: name, color: COLORS[Math.min(i, COLORS.length - 1)] }));
    return { id: newId('tl'), title, format: '', tiers, placed: Object.fromEntries([[UNRANKED, []], ...tiers.map(t => [t.id, []])]), mons: {}, updatedAt: Date.now() };
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
    for (const [id, m] of Object.entries<any>(raw.mons && typeof raw.mons === 'object' ? raw.mons : {}).slice(0, MAX_MONS)) {
        if (!/^[a-z0-9]{1,40}$/.test(id) || !m || typeof m !== 'object') continue;
        mons[id] = {
            id, name: clip(m.name, MAX_NAME) || id,
            types: Array.isArray(m.types) ? m.types.slice(0, 2).map((t: any) => clip(t, 16)).filter(Boolean) : [],
            from: ['fakemon', 'pokemon', 'custom'].includes(m.from) ? m.from : 'custom',
            ...(m.note ? { note: clip(m.note, MAX_NOTE) } : {})
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
    return {
        id: idOk(raw.id) ? raw.id : newId('tl'), title: clip(raw.title, 80) || 'Tier list', format: clip(raw.format, 40).replace(/[^a-z0-9]/gi, '').toLowerCase(),
        tiers, placed, mons, ...(Object.keys(baseline).length ? { baseline } : {}),
        updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
        ...(raw.updatedBy ? { updatedBy: clip(raw.updatedBy, 40) } : {})
    };
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
    for (const m of mons) {
        const id = toID(m.name);
        if (!id || next.mons[id] || Object.keys(next.mons).length >= MAX_MONS) continue;
        next.mons[id] = { ...m, id, name: clip(m.name, MAX_NAME) };
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
    const clean = cleanTierList({ ...list, updatedBy: state.user?.username || '' });
    if (!clean) return false;
    if (JSON.stringify(clean).length > 70000) { api.showToast?.('This tier list is too big to send in a chat. Export it instead.', 'warning'); return false; }
    return !!(await api.sendMessage?.(conversationId, text, [], null, { tierList: clean }));
}
