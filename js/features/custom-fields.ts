// Custom Pokédex colours and egg groups. The Basic Info tab lists the
// main-game ones, then yours, then "+ Custom".
//
// Storage: one entry in state.folders (type 'custom-fields'), the list
// regions, custom types and universal moves live in, so it goes with every
// save, JSON export and cloud backup. A Fakémon keeps the name only (its
// `color` or `egg1`/`egg2`), the same as a main-game value.
//
// An egg group a Fakémon already uses (from an import, say) shows in the
// list too, even when it was never added here.

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';
import { POKEMON_COLORS } from '../core/data.ts';
import { EGG_GROUPS } from '../editor/draft.ts';

export interface CustomColor { name: string; hex: string }

const ENTRY_TYPE = 'custom-fields' as const;
const ENTRY_ID = 'custom-fields';
const MAX_EACH = 60;
const NAME_MAX = 24;
const HEX = /^#[0-9a-f]{6}$/i;
const BASE_COLORS = POKEMON_COLORS as CustomColor[];

const cleanName = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function entry(): any {
    return (state.folders || []).find((f: any) => f && f.type === ENTRY_TYPE) || null;
}

/** Your own colours, checked (storage and imports are not trusted). */
export function customColors(): CustomColor[] {
    const raw = entry()?.colors;
    if (!Array.isArray(raw)) return [];
    const out: CustomColor[] = [];
    for (const c of raw.slice(0, MAX_EACH)) {
        const name = cleanName(c?.name);
        if (name && HEX.test(c?.hex) && !BASE_COLORS.some(b => same(b.name, name)) && !out.some(o => same(o.name, name))) out.push({ name, hex: c.hex });
    }
    return out;
}

/** Your own egg groups, plus any a Fakémon in the collection already uses. */
export function customEggGroups(): string[] {
    const own = Array.isArray(entry()?.eggGroups) ? entry().eggGroups : [];
    const used = (state.fakemonDB || []).flatMap((f: any) => [f?.egg1, f?.egg2]);
    const out: string[] = [];
    for (const g of [...own, ...used]) {
        const name = cleanName(g);
        if (name && !/^none$/i.test(name) && !EGG_GROUPS.some(b => same(b, name)) && !out.some(o => same(o, name))) out.push(name);
        if (out.length >= MAX_EACH) break;
    }
    return out;
}

/** A colour name's hex: a main-game colour or one of yours. */
export function colorHex(name: string): string | undefined {
    if (!name) return undefined;
    return [...BASE_COLORS, ...customColors()].find(c => same(c.name, name))?.hex;
}

function save(patch: { colors?: CustomColor[]; eggGroups?: string[] }) {
    let e = entry();
    if (!e) (state.folders ||= []).push(e = { id: ENTRY_ID, type: ENTRY_TYPE, name: 'Custom colours and egg groups' });
    Object.assign(e, patch, { updatedAt: Date.now() });
    api.saveToStorage?.();
    notify();
}

/**
 * Adds a colour (or changes the hex of one you have).
 * @returns the name it is kept under, or '' when it was not added
 */
export function addCustomColor(rawName: string, hex: string): string {
    const name = cleanName(rawName);
    if (!name || !HEX.test(hex)) return '';
    const base = BASE_COLORS.find(b => same(b.name, name));
    if (base) return base.name;
    const list = customColors().filter(c => !same(c.name, name));
    if (list.length >= MAX_EACH) { api.showToast?.(`You can keep up to ${MAX_EACH} custom colours.`, 'warning'); return ''; }
    save({ colors: [...list, { name, hex: hex.toLowerCase() }] });
    return name;
}

export function removeCustomColor(name: string) {
    save({ colors: customColors().filter(c => !same(c.name, name)) });
}

/** @returns the name it is kept under, or '' when it was not added */
export function addCustomEggGroup(rawName: string): string {
    const name = cleanName(rawName);
    if (!name || /^none$/i.test(name)) return '';
    const base = EGG_GROUPS.find(b => same(b, name));
    if (base) return base;
    const own: string[] = (Array.isArray(entry()?.eggGroups) ? entry().eggGroups : []).map(cleanName).filter(Boolean);
    const found = own.find(o => same(o, name));
    if (found) return found;
    if (own.length >= MAX_EACH) { api.showToast?.(`You can keep up to ${MAX_EACH} custom egg groups.`, 'warning'); return ''; }
    save({ eggGroups: [...own, name] });
    return name;
}

export function removeCustomEggGroup(name: string) {
    const own: string[] = Array.isArray(entry()?.eggGroups) ? entry().eggGroups : [];
    save({ eggGroups: own.filter(o => !same(cleanName(o), name)) });
}
