// Universal moves: the moves nearly every Pokémon can learn (Protect, Rest,
// Substitute...). Browse Moves offers them in its Universal view, and they go
// in a learnset as TMs.
//
// There is one global list, and each region can have its own:
//   - global:  Woogidex's own list, one generation's universal TMs, or a list you pick.
//   - region:  the global list, one generation's, or a list you pick.
// A Fakémon uses the list of the region you are looking at (when it is in
// it), else the first of its regions with its own list, else the global one.
//
// Storage: the global setting is one entry in state.folders (type
// 'universal-moves'), the list regions and custom types live in, so it goes
// with every save, JSON export and cloud backup. A region keeps its setting
// on the region entry (`universalMoves`). Moves are kept by Showdown id.

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';
import { entryRegionIds, getActiveRegion, regionById } from './regions.ts';

export type UniversalMode = 'woogidex' | 'global' | 'gen' | 'custom';
export interface UniversalSetting { mode: UniversalMode; gen?: number; moves?: string[] }

const ENTRY_TYPE = 'universal-moves' as const;
const ENTRY_ID = 'universal-moves';
export const GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const MAX_MOVES = 200;

/** Woogidex's own list: what Browse Moves offered before lists could change. */
export const WOOGIDEX_LIST = ['toxic', 'hiddenpower', 'terablast', 'protect', 'frustration', 'return', 'doubleteam', 'facade', 'rest', 'attract', 'round', 'swagger', 'sleeptalk', 'substitute'];

/** The TMs (and tutor moves) nearly every Pokémon could learn in each generation's games. */
export const UNIVERSAL_BY_GEN: Record<number, string[]> = {
    1: ['toxic', 'takedown', 'doubleedge', 'rage', 'mimic', 'doubleteam', 'bide', 'rest', 'substitute'],
    2: ['toxic', 'hiddenpower', 'protect', 'endure', 'frustration', 'return', 'doubleteam', 'swagger', 'sleeptalk', 'rest', 'attract', 'snore', 'mimic', 'curse'],
    3: ['toxic', 'hiddenpower', 'protect', 'frustration', 'return', 'doubleteam', 'facade', 'secretpower', 'rest', 'attract', 'endure', 'sleeptalk', 'snore', 'swagger', 'substitute', 'mimic'],
    4: ['toxic', 'hiddenpower', 'protect', 'frustration', 'return', 'doubleteam', 'facade', 'secretpower', 'rest', 'attract', 'endure', 'sleeptalk', 'snore', 'swagger', 'substitute', 'naturalgift', 'captivate'],
    5: ['toxic', 'hiddenpower', 'protect', 'frustration', 'return', 'doubleteam', 'facade', 'rest', 'attract', 'round', 'sleeptalk', 'snore', 'swagger', 'substitute'],
    6: ['toxic', 'hiddenpower', 'protect', 'frustration', 'return', 'doubleteam', 'facade', 'rest', 'attract', 'round', 'confide', 'sleeptalk', 'snore', 'swagger', 'substitute'],
    7: ['toxic', 'hiddenpower', 'protect', 'frustration', 'return', 'doubleteam', 'facade', 'rest', 'attract', 'round', 'confide', 'sleeptalk', 'snore', 'swagger', 'substitute'],
    8: ['protect', 'facade', 'rest', 'snore', 'sleeptalk', 'round', 'substitute', 'endure', 'attract'],
    9: ['takedown', 'protect', 'facade', 'rest', 'sleeptalk', 'substitute', 'endure', 'terablast']
};

const ID_RE = /^[a-z0-9]{1,40}$/;

/** A setting read from storage or an import, with anything odd taken out. */
function clean(s: any, region: boolean): UniversalSetting {
    const modes: UniversalMode[] = region ? ['global', 'gen', 'custom'] : ['woogidex', 'gen', 'custom'];
    const mode: UniversalMode = modes.includes(s?.mode) ? s.mode : modes[0];
    const gen = GENS.includes(Number(s?.gen)) ? Number(s.gen) : 9;
    const moves = Array.isArray(s?.moves) ? [...new Set<string>(s.moves.map(String).filter((id: string) => ID_RE.test(id)))].slice(0, MAX_MOVES) : [];
    return { mode, gen, moves };
}

function globalEntry(): any {
    return (state.folders || []).find((f: any) => f && f.type === ENTRY_TYPE) || null;
}

/** The global setting. */
export function globalUniversal(): UniversalSetting {
    return clean(globalEntry(), false);
}

/** A region's own setting ('global' when it has none). */
export function regionUniversal(regionId: string): UniversalSetting {
    return clean(regionById(regionId)?.universalMoves, true);
}

/** The move ids a setting gives. A region on 'global' gives the global list. */
export function movesOf(s: UniversalSetting): string[] {
    if (s.mode === 'woogidex') return WOOGIDEX_LIST;
    if (s.mode === 'gen') return UNIVERSAL_BY_GEN[s.gen || 9] || [];
    if (s.mode === 'custom') return s.moves || [];
    return movesOf(globalUniversal());
}

/** Saves the global setting, or a region's (regionId given). */
export function saveUniversal(regionId: string | null, setting: UniversalSetting) {
    const s = clean(setting, !!regionId);
    if (regionId) {
        const region = regionById(regionId);
        if (!region) return;
        if (s.mode === 'global') delete region.universalMoves;
        else region.universalMoves = s;
    } else {
        let entry = globalEntry();
        if (!entry) (state.folders ||= []).push(entry = { id: ENTRY_ID, type: ENTRY_TYPE, name: 'Universal moves' });
        Object.assign(entry, s, { updatedAt: Date.now() });
    }
    api.saveToStorage?.();
    notify();
    api.showToast?.(regionId ? `Saved ${regionById(regionId)?.name || 'the region'}'s universal moves.` : 'Saved the universal moves.', 'success');
}

/**
 * Whose list a Fakémon uses: the region you look at (when it is in it), else
 * the first of its regions with its own list, else the global list.
 * @returns the region's id, or null for the global list
 */
export function universalScopeFor(fakemon: any): string | null {
    const ids = fakemon ? entryRegionIds(fakemon) : [];
    const active = getActiveRegion();
    const own = (id: string) => regionUniversal(id).mode !== 'global';
    if (active && ids.includes(String(active.id)) && own(active.id)) return active.id;
    return ids.find(own) || null;
}

/** The universal move ids for the Fakémon in the editor, with whose list they are. */
export function universalForEditing(): { ids: string[]; regionId: string | null; label: string } {
    const f = (state.fakemonDB || []).find((x: any) => x.id === state.editingId);
    const regionId = universalScopeFor(f);
    const ids = movesOf(regionId ? regionUniversal(regionId) : globalUniversal());
    return { ids, regionId, label: regionId ? `${regionById(regionId)?.name || 'Region'}'s list` : 'The global list' };
}

/** A short line for a setting, as the region page and the dialog show it. */
export function universalSummary(s: UniversalSetting): string {
    if (s.mode === 'global') return `The global list (${movesOf(s).length})`;
    if (s.mode === 'woogidex') return `Woogidex's list (${WOOGIDEX_LIST.length})`;
    if (s.mode === 'gen') return `Generation ${s.gen} (${movesOf(s).length})`;
    return `${(s.moves || []).length} chosen`;
}
