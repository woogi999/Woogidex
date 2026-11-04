// ==================== custom conditions ====================
// Status conditions, weather and terrains you invent (Frostbite, Ashfall,
// Haunted Terrain, ...), and a region's own versions of the main-game ones.
// They work like custom types (js/features/custom-types.ts):
//   - "All" and "No region" list only yours. A region lists the main-game
//     ones too, and editing one there makes that region's own version
//     (an entry with `vanillaOf`), which applies only inside it.
//   - Storage: entries in state.folders with type 'custom-condition', the
//     list regions and custom types live in, so they travel with every save,
//     JSON export and cloud backup without a schema change.
//   - Each one can have battle code from the block editor (kind 'condition'
//     in js/editor/ability-blocks.ts), which compiles into a Showdown
//     conditions.ts for the mod export.
//   - The blocks that set or check a status, weather or terrain list yours
//     after the main-game ones (conditionOptions).
//   - A published Fakemon carries the ones its moves and abilities use
//     (conditionsForPublishing), so the post can show what they do.

import { state, api } from '../core/app.ts';
import { confirmDialog } from '../core/confirm-dialog.ts';
import { openDialog } from '../app/dialogs.tsx';
import { notify } from '../app/store.ts';
import { entryInRegion, entryRegionIds, getActiveRegion, getActiveRegionId, NO_REGION, setEntryRegionIds } from './regions.ts';

export const CONDITION_KIND = 'custom-condition' as const;
export type ConditionKind = 'status' | 'weather' | 'terrain';
/** [kind, the section's name, one of them] */
export const CONDITION_KINDS: Array<[ConditionKind, string, string]> = [
    ['status', 'Status conditions', 'status condition'],
    ['weather', 'Weather', 'weather'],
    ['terrain', 'Terrains', 'terrain']
];
export const CONDITION_ICON: Record<ConditionKind, string> = { status: 'beaker', weather: 'cloud', terrain: 'map' };
export const CONDITION_COLORS = ['#e07a5f', '#7c5cff', '#2bb3a8', '#e6a23c', '#3b82f6', '#c056d8', '#5aa469', '#d64f7a', '#6b7280'];

/** A main-game condition: its id in the blocks, Showdown's id, Essentials' symbol. */
export interface VanillaCondition { id: string; name: string; sd: string; es: string; color: string; desc: string }
export const VANILLA_CONDITIONS: Record<ConditionKind, VanillaCondition[]> = {
    status: [
        { id: 'brn', name: 'Burn', sd: 'brn', es: 'BURN', color: '#F08030', desc: 'Loses 1/16 of its max HP each turn, and its physical moves do half damage.' },
        { id: 'par', name: 'Paralysis', sd: 'par', es: 'PARALYSIS', color: '#D8B020', desc: 'Its Speed is halved, and a quarter of the time it cannot move.' },
        { id: 'psn', name: 'Poison', sd: 'psn', es: 'POISON', color: '#A040A0', desc: 'Loses 1/8 of its max HP each turn.' },
        { id: 'tox', name: 'Bad Poison', sd: 'tox', es: 'POISON', color: '#7B2F8C', desc: 'Loses more HP each turn: 1/16, then 2/16, and so on.' },
        { id: 'slp', name: 'Sleep', sd: 'slp', es: 'SLEEP', color: '#8C8C9E', desc: 'Cannot move for 1 to 3 turns.' },
        { id: 'frz', name: 'Freeze', sd: 'frz', es: 'FROZEN', color: '#62B8C8', desc: 'Cannot move. It thaws on 20% of turns, or when a Fire move hits it.' }
    ],
    weather: [
        { id: 'Sun', name: 'Harsh Sunlight', sd: 'sunnyday', es: 'Sun', color: '#F5A04E', desc: 'Fire moves do 1.5 times the damage, Water moves half.' },
        { id: 'Rain', name: 'Rain', sd: 'raindance', es: 'Rain', color: '#5C8FE0', desc: 'Water moves do 1.5 times the damage, Fire moves half.' },
        { id: 'Sand', name: 'Sandstorm', sd: 'sandstorm', es: 'Sandstorm', color: '#C9A75B', desc: 'Hurts every Pokémon that is not Rock, Ground or Steel. Rock types get 1.5 times Sp. Def.' },
        { id: 'Hail', name: 'Hail', sd: 'hail', es: 'Hail', color: '#7CC4DC', desc: 'Hurts every Pokémon that is not Ice type.' },
        { id: 'Snow', name: 'Snow', sd: 'snow', es: 'Snow', color: '#9DCFE6', desc: 'Ice types get 1.5 times Defense.' }
    ],
    terrain: [
        { id: 'Electric', name: 'Electric Terrain', sd: 'electricterrain', es: 'Electric', color: '#E8C020', desc: 'Grounded Pokémon cannot fall asleep, and their Electric moves do 1.3 times the damage.' },
        { id: 'Grassy', name: 'Grassy Terrain', sd: 'grassyterrain', es: 'Grassy', color: '#5DB050', desc: 'Grounded Pokémon heal 1/16 of their max HP each turn, and their Grass moves do 1.3 times the damage.' },
        { id: 'Misty', name: 'Misty Terrain', sd: 'mistyterrain', es: 'Misty', color: '#E890C0', desc: 'Grounded Pokémon cannot get a status condition, and Dragon moves do half damage to them.' },
        { id: 'Psychic', name: 'Psychic Terrain', sd: 'psychicterrain', es: 'Psychic', color: '#E8609A', desc: 'Grounded Pokémon cannot be hit by priority moves, and their Psychic moves do 1.3 times the damage.' }
    ]
};

const KINDS = new Set<ConditionKind>(['status', 'weather', 'terrain']);
const NAME_RE = /^[A-Za-z][A-Za-z0-9 '-]{1,23}$/;
const HEX = /^#[0-9a-f]{3,8}$/i;
const MAX_DURATION = 20;
export const conditionSlug = (name: string) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const isConditionKind = (k: any): k is ConditionKind => KINDS.has(k);

// ---- reading ----
function allEntries(): any[] {
    return (state.folders || []).filter((f: any) => f && f.type === CONDITION_KIND && isConditionKind(f.kind));
}

/** The conditions you made (not a region's version of a main-game one), A to Z. */
export function getCustomConditions(kind?: ConditionKind): any[] {
    return allEntries().filter(c => !c.vanillaOf && (!kind || c.kind === kind))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** A region's own version of a main-game condition, if it has one. */
export function conditionOverride(kind: ConditionKind, vanillaId: string, regionId: string | null) {
    if (!regionId) return null;
    return allEntries().find(c => c.kind === kind && c.vanillaOf === vanillaId && String(c.regionId || '') === String(regionId)) || null;
}

/**
 * What the Conditions tab shows for the region you are looking at: your
 * conditions there, and whether the main-game ones get cards (only inside a
 * region, where they can be edited).
 */
export function conditionsTabArgs() {
    const active = getActiveRegionId();
    const region = getActiveRegion();
    const mine = getCustomConditions();
    if (region) return { list: mine.filter(c => entryInRegion(c, region.id)), regionId: region.id as string, vanillaCards: true };
    if (active === NO_REGION) return { list: mine.filter(c => entryInRegion(c, NO_REGION)), regionId: null, vanillaCards: false };
    return { list: mine, regionId: null, vanillaCards: false };
}

/** How many of your Fakemon can cause or use a condition: its name in their moves', abilities' and items' code. */
export function conditionUserCount(entry: any): number {
    const needle = entry.vanillaOf ? null : `c:${conditionSlug(entry.name)}`;
    if (!needle) return 0;
    const used = new Set<string>();
    for (const kind of ['customMoves', 'customAbilities', 'customItems'] as const) {
        for (const x of (state as any)[kind] || []) if (x?.name && JSON.stringify(x.blocks || '').includes(needle)) used.add(String(x.name).toLowerCase());
    }
    if (!used.size) return 0;
    return (state.fakemonDB || []).filter((f: any) => (f.learnset || []).some((m: any) => used.has(String(m?.name || '').toLowerCase()))
        || (f.abilities || []).some((a: any) => used.has(String(a?.name || '').toLowerCase()))).length;
}

// ---- in the block editor ----

/** The options a status / weather / terrain dropdown offers: the main-game ones, then yours ("c:<id>"). */
export function conditionOptions(kind: ConditionKind): Array<{ value: string; label: string }> {
    return [
        ...VANILLA_CONDITIONS[kind].map(v => ({ value: v.id, label: v.name })),
        ...getCustomConditions(kind).map(c => ({ value: `c:${conditionSlug(c.name)}`, label: `${c.name} (yours)` }))
    ];
}

/** Showdown's id for a dropdown value: the main-game one's, or yours (its name, lower case). */
export function conditionSdId(kind: ConditionKind, value: string): string {
    if (String(value).startsWith('c:')) return conditionSlug(String(value).slice(2));
    return VANILLA_CONDITIONS[kind].find(v => v.id === value)?.sd || VANILLA_CONDITIONS[kind][0].sd;
}

/** Essentials' symbol for a dropdown value (without the colon). */
export function conditionEsId(kind: ConditionKind, value: string): string {
    if (String(value).startsWith('c:')) return conditionSlug(String(value).slice(2)).toUpperCase();
    return VANILLA_CONDITIONS[kind].find(v => v.id === value)?.es || VANILLA_CONDITIONS[kind][0].es;
}

/** A dropdown value's name, for text a player reads. */
export function conditionLabel(kind: ConditionKind, value: string): string {
    if (String(value).startsWith('c:')) {
        const slug = String(value).slice(2);
        return getCustomConditions(kind).find(c => conditionSlug(c.name) === slug)?.name || slug;
    }
    return VANILLA_CONDITIONS[kind].find(v => v.id === value)?.name || String(value);
}

// ---- the editor ----
// The sheet is js/app/dialogs/customCondition.tsx. It edits a draft and
// hands it back to saveConditionDraft().

export interface ConditionDraft { kind: ConditionKind; name: string; color: string; desc: string; duration: number; rawCode: string; vanillaOf: string | null }

export function openCustomConditionEditor(id = '', kind: ConditionKind = 'status', entry: any = null) {
    const editing = entry || (id ? allEntries().find(c => c.id === id) || null : null);
    openDialog('custom-condition', { entry: editing, kind: editing?.kind || kind });
}

export function conditionDraft(entry: any, kind: ConditionKind): ConditionDraft {
    return {
        kind: entry?.kind || kind,
        name: String(entry?.name || ''),
        color: HEX.test(String(entry?.color || '')) ? entry.color : CONDITION_COLORS[0],
        desc: String(entry?.desc || ''),
        duration: Number.isFinite(Number(entry?.duration)) ? Number(entry.duration) : (kind === 'status' ? 0 : 5),
        rawCode: String(entry?.rawCode || ''),
        vanillaOf: entry?.vanillaOf || null
    };
}

const isSaved = (entry: any) => !!entry && allEntries().includes(entry);
export const canDeleteCondition = (entry: any) => isSaved(entry);

/** Saves a draft. Returns what is wrong with it, or '' when it saved. */
export function saveConditionDraft(entry: any, d: ConditionDraft, regionIds: string[] = []): string {
    const name = d.name.trim().replace(/\s+/g, ' ');
    const kind = isConditionKind(d.kind) ? d.kind : 'status';
    const noun = CONDITION_KINDS.find(k => k[0] === kind)![2];
    if (!d.vanillaOf) {
        if (!NAME_RE.test(name)) return `Give the ${noun} a name of 2 to 24 letters, numbers, spaces or dashes, starting with a letter.`;
        const slug = conditionSlug(name);
        if (VANILLA_CONDITIONS[kind].some(v => conditionSlug(v.name) === slug || conditionSlug(v.id) === slug || v.sd === slug)) return `The main games already have ${name}. Open it in a region to make that region's own version.`;
        if (getCustomConditions(kind).some(c => c !== entry && conditionSlug(c.name) === slug)) return `You already have a ${noun} called ${name}.`;
    }
    if (!HEX.test(d.color)) return 'Pick a colour.';
    const duration = Math.max(0, Math.min(MAX_DURATION, Math.round(Number(d.duration) || 0)));
    const target = isSaved(entry) ? entry : { id: `cond-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: CONDITION_KIND, createdAt: Date.now() };
    const oldSlug = target.name && !target.vanillaOf ? conditionSlug(target.name) : '';
    Object.assign(target, {
        kind, color: d.color, desc: d.desc.trim().slice(0, 300), duration, rawCode: api.repairRawCode?.(d.rawCode || '', 'ability') ?? d.rawCode, updatedAt: Date.now(),
        name: d.vanillaOf ? VANILLA_CONDITIONS[kind].find(v => v.id === d.vanillaOf)?.name || name : name,
        vanillaOf: d.vanillaOf || null
    });
    // a region's version belongs to the region it was made in
    if (d.vanillaOf) setEntryRegionIds(target, [entry?.regionId || getActiveRegionId()].filter(Boolean));
    else setEntryRegionIds(target, regionIds);
    if (!isSaved(target)) (state.folders ||= []).push(target);
    // a renamed condition: the blocks that named it follow
    const newSlug = !target.vanillaOf ? conditionSlug(target.name) : '';
    if (oldSlug && newSlug && oldSlug !== newSlug) renameInBlocks(`c:${oldSlug}`, `c:${newSlug}`);
    api.saveToStorage?.();
    notify();
    api.showToast?.(d.vanillaOf ? `Saved this region's ${target.name}.` : `Saved ${target.name}.`, 'success');
    return '';
}

/** Points every block that used one condition at another (after a rename). */
function renameInBlocks(from: string, to: string) {
    const swap = (v: any): any => Array.isArray(v) ? v.map(swap)
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]))
            : v === from ? to : v;
    for (const kind of ['customMoves', 'customAbilities', 'customItems'] as const) {
        for (const x of (state as any)[kind] || []) if (x?.blocks) x.blocks = swap(x.blocks);
    }
    for (const c of allEntries()) if (c.blocks) c.blocks = swap(c.blocks);
}

export async function deleteCondition(entry: any): Promise<boolean> {
    if (!isSaved(entry)) return false;
    const ok = await confirmDialog({
        title: entry.vanillaOf ? `Use the original ${entry.name}?` : `Delete ${entry.name}?`,
        message: entry.vanillaOf
            ? 'This region goes back to the main-game version, and its own colour, text and battle code are gone.'
            : 'Moves, abilities and items that set or check it keep the block, but it no longer names anything.',
        confirmLabel: entry.vanillaOf ? 'Use the original' : 'Delete',
        danger: true
    });
    if (!ok) return false;
    state.folders = (state.folders || []).filter((f: any) => f !== entry);
    api.saveToStorage?.();
    notify();
    return true;
}

/** Opens a main-game condition in the active region: its saved version there, or a new one to save. */
export function editVanillaCondition(kind: ConditionKind, vanillaId: string) {
    const regionId = getActiveRegionId();
    const v = VANILLA_CONDITIONS[kind].find(x => x.id === vanillaId);
    if (!v || !getActiveRegion()) return;
    const saved = conditionOverride(kind, vanillaId, regionId);
    openCustomConditionEditor('', kind, saved || { kind, vanillaOf: v.id, name: v.name, color: v.color, desc: v.desc, duration: kind === 'status' ? 0 : 5, regionId });
}

const findEntry = (id: string) => allEntries().find(c => c.id === id) || null;

export function toggleConditionPin(id: string, event?: Event) {
    event?.stopPropagation?.();
    const c = findEntry(id);
    if (!c) return;
    c.pinned = !c.pinned;
    api.saveToStorage?.();
    notify();
}

export function duplicateCondition(id: string, event?: Event) {
    event?.stopPropagation?.();
    const c = findEntry(id);
    if (!c || c.vanillaOf) return;
    const taken = new Set(getCustomConditions(c.kind).map(x => conditionSlug(x.name)));
    let name = `${c.name} 2`.slice(0, 24);
    for (let n = 2; taken.has(conditionSlug(name)); n++) name = `${c.name.slice(0, 20)} ${n}`;
    const copy = { ...JSON.parse(JSON.stringify(c)), id: `cond-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
    state.folders.push(copy);
    api.saveToStorage?.();
    notify();
    api.showToast?.(`Made ${name}.`, 'success');
}

export function exportCondition(id: string, event?: Event) {
    event?.stopPropagation?.();
    const c = findEntry(id);
    if (!c) return;
    const { id: _id, regionId, regionIds, pinned, ...item } = c;
    const blob = new Blob([JSON.stringify({ format: 'woogidex-custom-condition', version: 1, item }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${conditionSlug(c.name) || 'condition'}.condition.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Adds one exported condition (a file from exportCondition) to the collection. */
export function importConditionEntry(item: any) {
    const clean = cleanForeignCondition(item);
    if (!clean) return null;
    const taken = new Set(getCustomConditions(clean.kind).map(x => conditionSlug(x.name)));
    if (taken.has(conditionSlug(clean.name))) clean.name = `${clean.name.slice(0, 20)} 2`;
    const entry = { ...clean, id: `cond-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: CONDITION_KIND, blocks: item?.blocks && typeof item.blocks === 'object' ? JSON.parse(JSON.stringify(item.blocks)) : undefined, createdAt: Date.now(), updatedAt: Date.now() };
    setEntryRegionIds(entry, [api.defaultRegionForNewFakemon?.()].filter(Boolean));
    state.folders.push(entry);
    return entry;
}

export function deleteConditionById(id: string, event?: Event) {
    event?.stopPropagation?.();
    const c = findEntry(id);
    if (c) deleteCondition(c);
}

// ---- other people's conditions ----
// A published Fakemon carries the custom conditions its moves, abilities and
// items name (fakemon_data.customConditions), so its post can say what they
// do. Someone else's data is checked for shape before it is kept, and it is
// only ever shown, never run.

function cleanForeignCondition(c: any) {
    if (!c || typeof c !== 'object' || !isConditionKind(c.kind)) return null;
    const name = String(c.name || '').trim();
    if (!NAME_RE.test(name)) return null;
    return {
        kind: c.kind as ConditionKind, name,
        color: HEX.test(String(c.color || '')) ? String(c.color) : '#888888',
        desc: String(c.desc || '').slice(0, 300),
        duration: Math.max(0, Math.min(MAX_DURATION, Math.round(Number(c.duration) || 0)))
    };
}

/** The custom conditions a Fakemon (and its family) uses, to travel with it when published. */
export function conditionsForPublishing(mons: any[]) {
    const lib = (key: string) => new Map<string, any>(((state as any)[key] || []).filter((x: any) => x?.name).map((x: any) => [String(x.name).toLowerCase(), x]));
    const moves = lib('customMoves'), abilities = lib('customAbilities'), items = lib('customItems');
    const code: string[] = [];
    for (const mon of mons || []) {
        if (!mon) continue;
        for (const m of mon.learnset || []) code.push(JSON.stringify(moves.get(String(m?.name || '').toLowerCase())?.blocks || m?.blocks || ''));
        for (const a of mon.abilities || []) code.push(JSON.stringify(abilities.get(String(a?.name || '').toLowerCase())?.blocks || a?.blocks || ''));
        if (mon.item) code.push(JSON.stringify(items.get(String(mon.item).toLowerCase())?.blocks || ''));
    }
    const text = code.join('\n');
    return getCustomConditions()
        .filter(c => text.includes(`c:${conditionSlug(c.name)}`))
        .map(c => cleanForeignCondition(c)!)
        .filter(Boolean);
}

let visiting: any[] = [];
/** The open post's conditions, for its page; [] once it is closed. */
export function setVisitingConditions(list: any[]) {
    const next = (Array.isArray(list) ? list : []).map(cleanForeignCondition).filter(Boolean);
    if (!next.length && !visiting.length) return;
    visiting = next;
    notify();
}
export const visitingConditions = () => visiting;

// ---- exports ----

/**
 * The conditions an export covers: yours (in the region, when there is one)
 * and the region's own versions of main-game ones.
 */
export function conditionsForExport(regionId: string | null) {
    return allEntries().filter(c => c.vanillaOf ? !!regionId && String(c.regionId || '') === String(regionId) : (!regionId || entryRegionIds(c).includes(String(regionId)) || !entryRegionIds(c).length));
}
