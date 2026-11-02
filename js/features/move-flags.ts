// ==================== move flags ====================
// The flags a move can carry: the built-in ones the battle engine knows
// (contact, sound, ...) and the ones people make up for their own custom
// moves ("Sticker", "Lunar", whatever their region needs). A custom flag is
// a name and a short line on what it means; custom moves carry it in their
// flags object under its key, the same as the built-in ones, so the learnset
// search (contact, lunar), exports and the block editor all see it.
//
// Custom flags live in state.customMoveFlags, saved with the collection
// (js/core/storage.ts).

import { state, api } from '../core/app.ts';
import { MOVE_FLAG_OPTIONS } from '../editor/learnset-model.ts';
import { notify } from '../app/store.ts';

export interface FlagDef {
    key: string;
    label: string;
    desc: string;
    /** a flag someone made, not one of the game's */
    custom?: boolean;
    id?: string;
    color?: string;
    createdAt?: number;
}

/** What each built-in flag means, in a line. */
const BUILT_IN_DESC: Record<string, string> = {
    contact: 'Makes contact: sets off Rough Skin, Static and the like.',
    punch: 'A punch: boosted by Iron Fist.',
    slicing: 'A slicing move: boosted by Sharpness.',
    sound: 'A sound move: goes through Substitute, blocked by Soundproof.',
    bite: 'A biting move: boosted by Strong Jaw.',
    bullet: 'A ball or bomb: blocked by Bulletproof.',
    pulse: 'An aura or pulse: boosted by Mega Launcher.',
    wind: 'A wind move: sets off Wind Rider and Wind Power.',
    dance: 'A dance: copied by Dancer.',
    powder: 'A powder: Grass types and Overcoat ignore it.',
    heal: 'Heals: blocked by Heal Block.',
    thawing: 'Thaws the user out when it is frozen.',
    charge: 'Takes a turn to charge up first.',
    recharge: 'The user must rest the turn after.',
    highcrit: 'A higher chance of a critical hit.',
    multihit: 'Hits more than once.',
    pivot: 'The user switches out after.',
    protect: 'Goes through Protect and Detect.',
    reflectable: 'Not bounced back by Magic Coat or Magic Bounce.',
    snatch: 'Not stolen by Snatch.',
    bypasssub: 'Goes through Substitute.'
};

export const FLAG_COLORS = ['#7c5cff', '#e0245e', '#f08030', '#2d8a3e', '#2c5aa0', '#b8860b', '#1e8592', '#8b5cf6', '#64748b'];

export function builtInFlags(): FlagDef[] {
    return (MOVE_FLAG_OPTIONS as Array<[string, string]>).map(([key, label]) => ({ key, label, desc: BUILT_IN_DESC[key] || '' }));
}

export function customFlags(): FlagDef[] {
    return (state.customMoveFlags || []).filter(f => f && f.key).map(f => ({ ...f, custom: true }));
}

/** Every flag: the game's first, then the made-up ones. */
export function allFlags(): FlagDef[] {
    return [...builtInFlags(), ...customFlags()];
}

/** A flag's key from its name: "Lunar Power" is x_lunar_power. The prefix keeps it clear of the game's own. */
export function flagKeyFor(label: string): string {
    const slug = String(label || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    return slug ? `x_${slug}` : '';
}

export function findFlag(text: string): FlagDef | null {
    const q = String(text || '').trim().toLowerCase();
    if (!q) return null;
    return allFlags().find(f => f.key === q || f.label.toLowerCase() === q || f.key === `x_${q.replace(/[^a-z0-9]+/g, '_')}`) || null;
}

/**
 * Makes a new custom flag, or returns the one with that name already.
 * @returns the flag, or null when the name is empty or a game flag's
 */
export function createCustomFlag(label: string, desc = '', color = ''): FlagDef | null {
    const name = String(label || '').trim().slice(0, 32);
    const key = flagKeyFor(name);
    if (!key) return null;
    if (builtInFlags().some(f => f.label.toLowerCase() === name.toLowerCase() || f.key === name.toLowerCase())) {
        api.showToast?.(`"${name}" is already one of the game's flags.`, 'info');
        return null;
    }
    const existing = customFlags().find(f => f.key === key);
    if (existing) return existing;
    const flag = {
        id: `mf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        key, label: name, desc: String(desc || '').trim().slice(0, 140),
        color: color || FLAG_COLORS[(state.customMoveFlags || []).length % FLAG_COLORS.length],
        createdAt: Date.now()
    };
    state.customMoveFlags = [...(state.customMoveFlags || []), flag];
    api.saveToStorage?.();
    notify();
    return { ...flag, custom: true };
}

export function updateCustomFlag(key: string, patch: { label?: string; desc?: string; color?: string }) {
    state.customMoveFlags = (state.customMoveFlags || []).map(f => f.key === key ? {
        ...f,
        ...(patch.label != null ? { label: String(patch.label).trim().slice(0, 32) || f.label } : {}),
        ...(patch.desc != null ? { desc: String(patch.desc).trim().slice(0, 140) } : {}),
        ...(patch.color ? { color: patch.color } : {})
    } : f);
    api.saveToStorage?.();
    notify();
}

/** Deletes a custom flag and takes it off every custom move that had it. */
export function deleteCustomFlag(key: string) {
    state.customMoveFlags = (state.customMoveFlags || []).filter(f => f.key !== key);
    const strip = (m: any) => { if (m?.flags && key in m.flags) { const { [key]: _, ...rest } = m.flags; m.flags = rest; } };
    (state.customMoves || []).forEach(strip);
    (state.learnset || []).forEach(strip);
    for (const f of state.fakemonDB || []) (f.learnset || []).forEach(strip);
    api.saveToStorage?.();
    notify();
}

/** How many of your custom moves carry each flag, by key. */
export function flagUsage(): Map<string, number> {
    const used = new Map<string, number>();
    for (const m of state.customMoves || []) for (const [k, on] of Object.entries(m?.flags || {})) if (on) used.set(k, (used.get(k) || 0) + 1);
    return used;
}
