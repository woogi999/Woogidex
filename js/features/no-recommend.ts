// ==================== moves Recommend Moves leaves out ====================
// Two lists, both by move name:
// - for every Fakémon: kept in this browser (localStorage), like other preferences
// - for the open Fakémon: state.noRecommendMoves, saved with it (js/core/storage.ts)
//   and never published (withoutNotebook in js/features/community.ts)
// The Recommended Moves dialog (js/app/dialogs/editorTools.tsx) fills them with
// its [x] button, and Generate Learnset skips them too (js/editor/editor.ts).

import { state } from '../core/app.ts';

export type NoRecommendScope = 'mon' | 'all';

const KEY = 'woogidex-no-recommend-moves';
const MAX = 500;

const clean = (list: unknown): string[] => Array.isArray(list)
    ? [...new Set(list.filter((n): n is string => typeof n === 'string' && !!n.trim()).map(n => n.trim().slice(0, 80)))].slice(0, MAX)
    : [];

/** The moves left out for every Fakémon. */
export function noRecommendEverywhere(): string[] {
    try { return clean(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return []; }
}

function saveEverywhere(list: string[]) {
    try {
        if (list.length) localStorage.setItem(KEY, JSON.stringify(clean(list)));
        else localStorage.removeItem(KEY);
    } catch { /* private mode: the list lasts for this visit only */ }
}

/** The moves left out for the open Fakémon. */
export function noRecommendHere(): string[] {
    return clean(state.noRecommendMoves);
}

/** Every move that Recommend Moves leaves out right now, both lists together. */
export function noRecommendSet(): Set<string> {
    return new Set([...noRecommendEverywhere(), ...noRecommendHere()]);
}

/** Leaves a move out of the recommendations, for this Fakémon or for all of them. */
export function addNoRecommend(name: string, scope: NoRecommendScope) {
    if (scope === 'all') saveEverywhere([...noRecommendEverywhere(), name]);
    else state.noRecommendMoves = clean([...noRecommendHere(), name]);
}

/** Lets a move be recommended again. */
export function removeNoRecommend(name: string, scope: NoRecommendScope) {
    if (scope === 'all') saveEverywhere(noRecommendEverywhere().filter(n => n !== name));
    else state.noRecommendMoves = noRecommendHere().filter(n => n !== name);
}
