// Quick commands in the app: builds the data the commands read (Showdown's
// dex, moves, abilities and items, plus your Fakémon and custom moves) and
// runs them. The commands themselves are in commands-model.ts.

import { state, api } from '../core/app.ts';
import { POKEMON_TYPES, TYPE_EFFECTIVENESS } from '../core/data.ts';
import { parseMoveQuery, moveMatches } from './move-query.ts';
import { parseCommand, runCommand, suggest, toId, type Dex, type DexMon, type Result } from './commands-model.ts';

export { parseCommand, suggest };

let cached: { key: string; dex: Dex } | null = null;

function buildDex(): Dex {
    // js/editor/editor.ts keeps each species' learnset map directly (move id -> sources)
    const learnsetFor = (id: string) => ({ has: (move: string) => !!state.sdLearnsets?.[id]?.[move] });
    const mons: DexMon[] = Object.entries(state.sdPokedex || {})
        // js/editor/editor.ts keeps a species' base stats as `stats`
        .filter(([, p]: [string, any]) => p?.stats && Array.isArray(p.types))
        .map(([id, p]: [string, any]) => ({
            id, name: p.name, types: p.types, stats: p.stats,
            abilities: Object.values(p.abilities || {}).map(String),
            learns: learnsetFor(id) as unknown as Set<string>
        }));
    for (const f of state.fakemonDB || []) {
        if (!f?.name || f.pendingVanilla || !f.stats) continue;
        mons.push({
            id: `own-${f.id}`, name: f.name, own: true,
            types: [f.type1, f.type2].filter(Boolean) as string[],
            stats: { hp: +f.stats.hp || 0, atk: +f.stats.atk || 0, def: +f.stats.def || 0, spa: +f.stats.spa || 0, spd: +f.stats.spd || 0, spe: +f.stats.spe || 0 },
            abilities: (f.abilities || []).map((a: any) => a?.name).filter(Boolean),
            learns: new Set((f.learnset || []).map((m: any) => toId(m?.name)))
        });
    }
    const custom = (state.customMoves || []).filter((m: any) => m?.name).map((m: any) => ({ ...m, id: toId(m.name), custom: true }));
    const moves = [...Object.entries(state.sdMoves || {}).map(([id, m]: [string, any]) => ({ ...m, id })), ...custom];
    return {
        mons, moves,
        abilities: Object.entries(state.sdAbilities || {}).map(([id, a]: [string, any]) => ({ id, name: a.name, desc: a.shortDesc || a.desc })),
        items: Object.entries(state.sdItems || {}).map(([id, i]: [string, any]) => ({ id, name: i.name, desc: i.shortDesc || i.desc })),
        types: [...POKEMON_TYPES],
        chart: TYPE_EFFECTIVENESS as any,
        learnsetsLoaded: !!state.sdLearnsetsLoaded,
        searchMoves: query => {
            const clauses = parseMoveQuery(query);
            return moves.filter(m => moveMatches(m, clauses, { isCustom: x => !!x.custom })) as any;
        }
    };
}

/** The data, rebuilt when Showdown's data, the learnsets or your collection change. */
function dex(): Dex {
    const key = `${Object.keys(state.sdPokedex || {}).length}:${state.sdLearnsetsLoaded}:${(state.fakemonDB || []).length}:${(state.customMoves || []).length}:${state.fakemonDB?.reduce?.((n: number, f: any) => n + (f.updatedAt || 0), 0)}`;
    if (!cached || cached.key !== key) cached = { key, dex: buildDex() };
    return cached.dex;
}

/** Runs what was typed. The Showdown data (and, for /ds and /learn, the learnsets) loads first. */
export async function runInput(input: string): Promise<Result | null> {
    const parsed = parseCommand(input);
    if (!parsed) return null;
    if ('unknown' in parsed) return { error: `There is no /${parsed.unknown} command. Type / to see them all.` };
    if (!state.sdLoaded) await api.fetchShowdownData?.();
    if (['ds', 'learn'].includes(parsed.cmd.name) && !state.sdLearnsetsLoaded) await api.ensureLearnsets?.();
    return runCommand(dex(), parsed.cmd, parsed.args);
}
