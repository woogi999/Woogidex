// What the "New move / ability / item / type / condition" prompt starts from:
// a main-game entry or one of your own. A choice becomes a seed: the fields the
// editor starts with, including the entry's code as blocks
// (js/editor/code-to-blocks.ts). Nothing is saved until the editor saves.

import { state, api } from '../core/app.ts';
import { parseRawEntry } from '../battle/engine/sd-hooks.ts';
import { readMultihit } from './multihit.ts';
import { getCustomConditions, VANILLA_CONDITIONS, type ConditionKind } from './custom-conditions.ts';
import { ALL_VANILLA_TYPES, getCustomTypes, vanillaTypeEntry } from './custom-types.ts';
import { MOVE_FLAG_OPTIONS } from '../editor/learnset-model.ts';

export type LibraryKind = 'moves' | 'abilities' | 'items' | 'types' | 'conditions';
const BLOCK_KIND = { moves: 'move', abilities: 'ability', items: 'item', conditions: 'condition' } as const;

export const LIBRARY_WORDS: Record<LibraryKind, { noun: string; plural: string; placeholder: string; blank: string; template: string }> = {
    moves: { noun: 'move', plural: 'moves', placeholder: 'e.g., Ember Fang', blank: 'An empty move. You set its numbers and what it does.', template: 'Copies its numbers and flags, and turns its code into blocks.' },
    abilities: { noun: 'ability', plural: 'abilities', placeholder: 'e.g., Solar Heart', blank: 'An empty ability. You write what it does.', template: 'Copies its description, and turns its code into blocks.' },
    items: { noun: 'item', plural: 'items', placeholder: 'e.g., Moonlit Charm', blank: 'An empty item. You add the art and what it does.', template: 'Copies its description, and turns its code into blocks.' },
    types: { noun: 'type', plural: 'types', placeholder: 'e.g., Cosmic', blank: 'A new type with neutral matchups.', template: 'Copies its colour and every matchup.' },
    conditions: { noun: 'condition', plural: 'conditions', placeholder: 'e.g., Frostbite', blank: 'An empty status, weather or terrain.', template: 'Copies its look and length, and turns its code into blocks.' }
};

export interface TemplateChoice {
    id: string;
    name: string;
    source: 'game' | 'yours';
    desc: string;
    /** the entry itself, for drawing its row and building its seed */
    data: any;
    /** for a condition: status, weather or terrain */
    conditionKind?: ConditionKind;
}

const byName = (a: TemplateChoice, b: TemplateChoice) => a.name.localeCompare(b.name);

/** Every entry the prompt can start from, the game's and yours. */
export function templateChoices(kind: LibraryKind): TemplateChoice[] {
    const own = (list: any[] | undefined): TemplateChoice[] => (list || []).filter(x => x?.name).map(x => ({ id: x.id || x.name, name: x.name, source: 'yours', desc: x.desc || '', data: x }));
    const game = (table: Record<string, any> | undefined): TemplateChoice[] => Object.entries<any>(table || {})
        .filter(([, x]) => x?.name && !x.isNonstandard?.startsWith?.('CAP'))
        .map(([id, x]) => ({ id, name: x.name, source: 'game', desc: x.shortDesc || x.desc || '', data: x }));
    if (kind === 'moves') return [...game(state.sdMoves), ...own(state.customMoves)].sort(byName);
    if (kind === 'abilities') return [...game(state.sdAbilities), ...own(state.customAbilities)].sort(byName);
    if (kind === 'items') return [...game(state.sdItems), ...own(state.customItems)].sort(byName);
    if (kind === 'types') {
        return [
            ...ALL_VANILLA_TYPES.map((name: string): TemplateChoice => ({ id: name, name, source: 'game', desc: '', data: { name } })),
            ...own(getCustomTypes())
        ].sort(byName);
    }
    const kinds = Object.keys(VANILLA_CONDITIONS) as ConditionKind[];
    return kinds.flatMap(k => [
        ...VANILLA_CONDITIONS[k].map((v): TemplateChoice => ({ id: v.sd, name: v.name, source: 'game', desc: v.desc, data: v, conditionKind: k })),
        ...own(getCustomConditions(k)).map(c => ({ ...c, conditionKind: k }))
    ]).sort(byName);
}

// ---- the simulator's own tables, read the first time a template needs one ----

async function simulatorEntry(kind: LibraryKind, choice: TemplateChoice): Promise<any | null> {
    if (kind === 'moves') {
        const { loadShowdownMoves } = await import('../battle/engine/sd-moves.ts');
        return (await loadShowdownMoves())?.[choice.id] ?? null;
    }
    if (kind === 'abilities') {
        const { loadShowdownAbilities } = await import('../battle/engine/sd-abilities.ts');
        return (await loadShowdownAbilities())?.[choice.id] ?? null;
    }
    if (kind === 'items') {
        const { loadShowdownItems } = await import('../battle/engine/sd-items.ts');
        return (await loadShowdownItems())?.[choice.id] ?? null;
    }
    const { loadShowdownTable, sdDataUrl } = await import('../battle/engine/sd-facade.ts');
    const table = await loadShowdownTable(sdDataUrl('conditions'), (e: any) => e.Conditions, 'brn');
    if (table?.[choice.id]) return table[choice.id];
    // a terrain lives on the move that starts it
    const { loadShowdownMoves } = await import('../battle/engine/sd-moves.ts');
    return (await loadShowdownMoves())?.[choice.id]?.condition ?? null;
}

const mergeBlocks = (a: any, b: any) => ({ version: 3, triggers: [...(a?.triggers || []), ...(b?.triggers || [])], loose: [...(a?.loose || [])] });
const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

/** Blocks for an entry of yours: its saved blocks, plus its hand-written code translated. */
function fromYours(kind: LibraryKind, data: any, conditionKind?: ConditionKind) {
    let blocks = clone(data.blocks) || null;
    let rawCode = String(data.rawCode || '');
    let stats = null as null | { blocks: number; code: number };
    if (rawCode.trim()) {
        const parsed = parseRawEntry(rawCode);
        if (parsed.ok && parsed.entry) {
            const t = api.translateToBlocks(parsed.entry, BLOCK_KIND[kind as keyof typeof BLOCK_KIND], conditionKind);
            blocks = mergeBlocks(blocks, t.blocks);
            rawCode = t.rawCode;
            stats = t.stats;
        }
    }
    return { blocks, rawCode, stats };
}

/** A name for the copy when none was typed. */
function copyName(kind: LibraryKind, source: string, typed: string) {
    if (typed.trim()) return typed.trim();
    if (kind === 'types') return `${source.replace(/[^A-Za-z0-9-]/g, '')}-Copy`.slice(0, 16);
    return `${source} Copy`.slice(0, kind === 'conditions' ? 24 : 40);
}

/** The fields an editor starts with. `translated` is false when the game's code could not load. */
export async function buildSeed(kind: LibraryKind, choice: TemplateChoice, typedName: string): Promise<any> {
    const name = copyName(kind, choice.name, typedName);
    const from = choice.name;
    const data = choice.data;

    if (kind === 'types') {
        const look = choice.source === 'game' ? vanillaTypeEntry(choice.name, null) : data;
        return {
            name, from, color: look.color, gradient: clone(look.gradient) || null, desc: look.desc || '', icon: look.icon || '',
            offense: { ...(look.matchups?.offense || {}) }, defense: { ...(look.matchups?.defense || {}) }
        };
    }

    let blocks: any = null, rawCode = '', stats: any = null, moveFields: any = {}, translated = true;
    if (choice.source === 'yours') {
        ({ blocks, rawCode, stats } = fromYours(kind, data, choice.conditionKind));
    } else {
        const entry = await simulatorEntry(kind, choice).catch(() => null);
        if (entry) {
            const t = api.translateToBlocks(entry, BLOCK_KIND[kind as keyof typeof BLOCK_KIND], choice.conditionKind);
            ({ blocks, rawCode, stats, moveFields } = t);
            if (!blocks.triggers.length) blocks = null;
        } else translated = false;
    }
    const common = { name, from, desc: data.desc || data.shortDesc || '', rawCode, blocks, stats, translated };

    if (kind === 'moves') {
        const flagKeys = new Set((MOVE_FLAG_OPTIONS as Array<[string, string]>).map(([k]) => k));
        const flags = choice.source === 'yours' ? data.flags : api.getMoveEditorFlags({ ...data, custom: false });
        const multihit = readMultihit(choice.source === 'yours' ? data : { multihit: data.multihit, ...moveFields });
        return {
            ...common,
            type: data.type || 'Normal', category: data.category || 'Status', basePower: data.basePower || 0,
            accuracy: data.accuracy === true ? 0 : (data.accuracy ?? 100), pp: data.pp || 10, priority: data.priority || 0,
            target: moveFields.target || data.target || 'normal',
            flags: Object.fromEntries(Object.entries<any>(flags || {}).filter(([k, on]) => on && (flagKeys.has(k) || k.startsWith('x_') || choice.source === 'yours')).map(([k]) => [k, true])),
            multihit
        };
    }
    if (kind === 'abilities') return common;
    if (kind === 'items') return { ...common, artwork: choice.source === 'yours' ? data.artwork || '' : '', isMegaStone: choice.source === 'yours' ? !!data.isMegaStone : !!data.megaStone };
    return { ...common, kind: choice.conditionKind, color: data.color, duration: Number(data.duration) || (choice.conditionKind === 'status' ? 0 : 5) };
}

/** One line about what a template brought in. Empty when there is nothing to say. */
export function seedSummary(seed: any): string {
    if (!seed?.from) return '';
    const parts: string[] = [`From ${seed.from}.`];
    if (seed.translated === false) parts.push('Its code did not load, so only its numbers came across.');
    else if (seed.stats) {
        const { blocks, code } = seed.stats;
        if (blocks || code) parts.push(code ? `${blocks} blocks, and ${code} ${code === 1 ? 'piece' : 'pieces'} kept as Showdown code.` : `${blocks} ${blocks === 1 ? 'block' : 'blocks'}.`);
    }
    return parts.join(' ');
}
