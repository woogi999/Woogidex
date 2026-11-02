// The app's one shared, mutable state object. Storage, the editor, battle and
// analysis code read and write it in place; React components read it and
// re-render on notify() (js/app/store.ts). js/core/app.ts re-exports it, so
// older modules keep importing it from there.

import type { Fakemon, FolderEntry, CustomMove, CustomAbility, CustomItem, User, Id } from './types.ts';

function readBool(key: string): boolean {
    try { return localStorage.getItem(key) === 'true'; } catch { return false; }
}

export interface AppState {
    // Showdown data, loaded after boot
    sdMoves: Record<string, any>;
    sdAbilities: Record<string, any>;
    sdItems: Record<string, any>;
    sdPokedex: Record<string, any>;
    sdLearnsets: Record<string, any>;
    sdLearnsetsLoaded: boolean;
    pokeApiSpeciesCache: Record<string, any>;
    sdMoveUsefulness: Record<string, any>;
    sdLoaded: boolean;

    // the collection
    fakemonDB: Fakemon[];
    folders: FolderEntry[];
    customMoves: CustomMove[];
    customAbilities: CustomAbility[];
    customItems: CustomItem[];
    battleTeams: any[];
    /** flags made up for custom moves: { id, key, label, desc, color } (js/features/move-flags.ts) */
    customMoveFlags: any[];
    currentFolderId: Id | null;

    // the editor's working copy
    editingId: Id | null;
    /** which saved Fakemon the editor was actually populated from; autoSave refuses to overwrite any other */
    editorLoadedId: Id | null;
    abilities: any[];
    learnset: any[];
    /** the open Fakemon inherits its prevolutions' moves (js/features/move-inheritance.ts) */
    inheritPrevoMoves?: boolean;
    /** a community post's inherited moves, as published */
    inheritedLearnset?: any[];
    sampleSets: any[];
    artworkData: string | null;
    shinyArtworkData: string | null;
    cryData: string | null;
    artCredit: any;
    shinyArtCredit?: string | null;
    artDescription?: string | null;
    shinyArtDescription?: string | null;
    /** how the artwork scales: 'pixel' (nearest neighbour, the default) or 'smooth' (anti-aliased) */
    artScaling: 'pixel' | 'smooth';
    /** the editor's artwork sets beyond the main one (js/editor/art-sets.ts) */
    artSets: any[];
    /** the set open on the editor's Artwork tab */
    artTab?: string;
    /** the set and concept image the Pokédex board shows */
    previewArtSet?: string;
    previewArtIndex?: number;
    artworkMode: 'normal' | 'shiny' | string;
    previewArtworkMode: 'normal' | 'shiny' | string;
    collectionShinyPreview: boolean;
    autoSaveTimer: ReturnType<typeof setTimeout> | null;
    lastSavedId: Id | null;
    evolutionGraph: any;
    pendingVanillaDraft?: boolean;
    pendingVanillaId?: string | null;
    isCommunityPreview?: boolean;
    signatureMoveIds?: any;

    // account and pages
    user?: User | null;
    authReady?: boolean;
    profilePageUser: any;
    profilePageEditing: boolean;
    profilePageStatus?: 'loading' | 'ready' | 'error';
    profilePageError?: string;
    community?: any;
    notifications?: any;
    cloud?: any;

    [extra: string]: any;
}

export const state: AppState = {
    sdMoves: {},
    sdAbilities: {},
    sdItems: {},
    sdPokedex: {},
    sdLearnsets: {},
    sdLearnsetsLoaded: false,
    pokeApiSpeciesCache: {},
    sdMoveUsefulness: {},
    sdLoaded: false,
    fakemonDB: [],
    folders: [],
    customMoves: [],
    customAbilities: [],
    customItems: [],
    battleTeams: [],
    customMoveFlags: [],
    currentFolderId: null,
    editingId: null,
    editorLoadedId: null,
    // NOTE: editor draft and saved library share customMoves/customAbilities
    // names; worth splitting into a separate draft object eventually
    abilities: [],
    learnset: [],
    sampleSets: [],
    artworkData: null,
    shinyArtworkData: null,
    cryData: null,
    artCredit: null,
    shinyArtCredit: null,
    artDescription: null,
    shinyArtDescription: null,
    artScaling: 'pixel',
    artSets: [],
    artworkMode: 'normal',
    previewArtworkMode: 'normal',
    collectionShinyPreview: readBool('woogidex-collection-shiny-preview'),
    autoSaveTimer: null,
    lastSavedId: null,
    evolutionGraph: null,
    profilePageUser: null,
    profilePageEditing: false
};
