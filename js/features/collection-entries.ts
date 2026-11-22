// One place that knows where each My Collection tab keeps its own entries.
// Fakémon, moves, abilities and items have a list each. Custom types and
// custom conditions live inside state.folders (see custom-types.ts and
// custom-conditions.ts), so they are read from there. Folders, the
// clipboard, drag and drop and regions all use this, so every tab works
// the same way.

import { state } from '../core/app.ts';
import type { CollectionTab } from '../app/types.ts';

export type EntryKind = CollectionTab;

const KIND_IN_FOLDERS: Partial<Record<EntryKind, string>> = { types: 'custom-type', conditions: 'custom-condition' };

/** True when a tab keeps its entries inside state.folders. */
export const livesInFolders = (kind: string) => !!KIND_IN_FOLDERS[kind as EntryKind];

/**
 * Your own entries of one tab. A region's version of a main-game type or
 * condition is not included: it has its own card and no folder.
 */
export function entriesOf(kind: string): any[] {
    if (kind === 'fakemon') return state.fakemonDB || [];
    if (kind === 'moves') return state.customMoves || [];
    if (kind === 'abilities') return state.customAbilities || [];
    if (kind === 'items') return state.customItems || [];
    const type = KIND_IN_FOLDERS[kind as EntryKind];
    if (!type) return [];
    return (state.folders || []).filter((f: any) => f && f.type === type && !f.vanillaOf);
}

/** The entry with this id in a tab, or null. */
export const findEntry = (kind: string, id: string) => entriesOf(kind).find(x => String(x.id) === String(id)) || null;
