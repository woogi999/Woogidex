// Quick commands (the "/" palette, js/app/shell/CommandPalette.tsx), with
// Pokémon Showdown's syntax where Showdown has the command:
//   /ms fire, physical, bp > 80       move search (js/features/move-query.ts)
//   /ds water, spe > 100, ability:x   dex search over Showdown's dex and your Fakémon
//   /dt garchomp                      data for a Pokémon, move, ability, item or type
//   /weakness ground/flying           what hits a type pair (or a Pokémon) hard
//   /coverage fire, water             what a set of attacking types hits
//   /learn garchomp, earthquake       whether it learns the move
//   /randpoke 3                       random Pokémon
//   /calc 252+ Atk Choice Band garchomp earthquake vs 252 HP / 4 Def toxapex   a damage range
//   /calc (2 + 3) ^ 2 in hex          or plain arithmetic, like Showdown's /calc
//   /bulk toxapex                     Scrappie's bulk numbers (HP x Def, HP x SpD)
// Everything here is pure: commands.ts hands it the data and the move search.

export interface DexMon {
    id: string; name: string; types: string[];
    stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
    abilities: string[];
    /** a Fakémon from your collection, not Showdown's */
    own?: boolean;
    /** the move ids it learns, when the learnsets are loaded */
    learns?: Set<string>;
}
export interface DexMove { id: string; name: string; type: string; category: string; basePower: number; accuracy: number | true; pp?: number; desc?: string; flags?: Record<string, any> }
export interface Dex {
    mons: DexMon[];
    moves: DexMove[];
    abilities: Array<{ id: string; name: string; desc?: string }>;
    items: Array<{ id: string; name: string; desc?: string }>;
    types: string[];
    /** attacking type -> defending type -> multiplier (missing = 1) */
    chart: Record<string, Record<string, number>>;
    learnsetsLoaded: boolean;
    /** Showdown's /ms on these moves (js/features/move-query.ts, given by commands.ts) */
    searchMoves: (query: string) => DexMove[];
}

export type Row = {
    title: string; sub?: string; kind?: 'mon' | 'move' | 'ability' | 'item' | 'type'; id?: string;
    /** what the palette draws as pills and badges (the sub is the text for the rest) */
    types?: string[]; category?: string; stats?: DexMon['stats']; basePower?: number; accuracy?: number | true;
};
/** A group of types, like "Weak ×2: Ice, Rock", drawn as type pills. */
export interface TypeGroup { label: string; types: string[]; tone?: 'weak' | 'resist' | 'immune' | 'neutral' }
/** One spread in a damage calc. */
export interface CalcRoll { label: string; lo: number; hi: number; hp: number; loPct: number; hiPct: number; ko: string }
export interface CalcOut {
    attacker: { name: string; types: string[]; label: string };
    move: { name: string; type: string; category: string; basePower: number };
    defender: { name: string; types: string[]; label: string };
    eff: number; stab: number; immune?: string;
    rolls: CalcRoll[];
}
export interface Result {
    /** a heading over the rows or lines */
    head?: string;
    rows?: Row[];
    /** plain lines (a calc, a type's matchups); the palette shows them when nothing richer is given */
    lines?: string[];
    /** the same matchups as type pills */
    typeGroups?: TypeGroup[];
    /** a damage calc, for the calc card */
    calc?: CalcOut;
    /** arithmetic: what was asked and the answer */
    math?: { expr: string; value: string };
    /** a line under everything (what the calc leaves out) */
    note?: string;
    /** why the command could not run */
    error?: string;
}

export interface CommandDef { name: string; aliases: string[]; usage: string; help: string }
export const COMMANDS: CommandDef[] = [
    { name: 'ms', aliases: ['movesearch'], usage: '/ms fire, physical, bp > 80', help: 'Search moves, like Showdown\'s /ms.' },
    { name: 'ds', aliases: ['dexsearch'], usage: '/ds water, spe > 100', help: 'Search Pokémon and your Fakémon by type, ability, move or stat.' },
    { name: 'dt', aliases: ['data'], usage: '/dt garchomp', help: 'Data for a Pokémon, move, ability, item or type.' },
    { name: 'weakness', aliases: ['weak'], usage: '/weakness ground/flying', help: 'What a type pair or a Pokémon is weak and resistant to.' },
    { name: 'coverage', aliases: ['cover'], usage: '/coverage fire, water', help: 'What a set of attacking types hits super effectively.' },
    { name: 'learn', aliases: ['learnset'], usage: '/learn garchomp, earthquake', help: 'Whether a Pokémon learns a move.' },
    { name: 'randpoke', aliases: ['randompokemon'], usage: '/randpoke 3', help: 'Random Pokémon.' },
    { name: 'calc', aliases: ['damage', 'calculate'], usage: '/calc 252+ Atk garchomp earthquake vs toxapex', help: 'A damage range, written like Showdown\'s calc (EVs and nature, then items and abilities, then the Pokémon), or plain math like /calc (2 + 3) ^ 2.' },
    { name: 'bulk', aliases: [], usage: '/bulk toxapex', help: 'Bulk numbers: HP × Def and HP × SpD, uninvested and fully invested.' }
];

export const toId = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** "/ms fire" -> ['ms', 'fire'], or null for text that is not a command. */
export function parseCommand(input: string): { cmd: CommandDef; args: string } | { unknown: string } | null {
    const m = String(input || '').trim().match(/^\/(\w+)\s*([\s\S]*)$/);
    if (!m) return null;
    const name = m[1].toLowerCase();
    const cmd = COMMANDS.find(c => c.name === name || c.aliases.includes(name));
    return cmd ? { cmd, args: m[2].trim() } : { unknown: name };
}

/** The commands that start with what was typed, for the list under the box. */
export function suggest(input: string): CommandDef[] {
    const m = String(input || '').trim().match(/^\/(\w*)$/);
    if (!m) return [];
    const q = m[1].toLowerCase();
    return COMMANDS.filter(c => c.name.startsWith(q) || c.aliases.some(a => a.startsWith(q)));
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const typeName = (dex: Dex, s: string) => dex.types.find(t => toId(t) === toId(s));

export function findMon(dex: Dex, s: string): DexMon | undefined {
    const id = toId(s);
    return dex.mons.find(m => m.own && toId(m.name) === id) || dex.mons.find(m => m.id === id || toId(m.name) === id);
}
export const findMove = (dex: Dex, s: string) => { const id = toId(s); return dex.moves.find(m => m.id === id || toId(m.name) === id); };

/** How much `attack` hurts a Pokémon of these types. */
export function effectiveness(dex: Dex, attack: string, defend: string[]): number {
    return defend.reduce((x, d) => x * (dex.chart[attack]?.[d] ?? 1), 1);
}

const monLine = (m: DexMon) => `${m.types.join('/')} · ${m.stats.hp}/${m.stats.atk}/${m.stats.def}/${m.stats.spa}/${m.stats.spd}/${m.stats.spe} · BST ${bst(m)}`;
const bst = (m: DexMon) => m.stats.hp + m.stats.atk + m.stats.def + m.stats.spa + m.stats.spd + m.stats.spe;

const moveRow = (m: DexMove): Row => ({
    title: m.name, sub: `${m.type} · ${m.category} · ${m.basePower || '—'} BP · ${m.accuracy === true ? '—' : `${m.accuracy}%`}`, kind: 'move', id: m.id,
    types: [m.type], category: m.category, basePower: m.basePower, accuracy: m.accuracy
});
const monRow = (m: DexMon): Row => ({ title: m.name + (m.own ? ' (yours)' : ''), sub: monLine(m), kind: 'mon', id: m.id, types: m.types, stats: m.stats });

// ---- /ms ----
function moveSearch(dex: Dex, args: string): Result {
    if (!args) return { error: 'Type what to look for, like /ms fire, physical.' };
    const hits = dex.searchMoves(args);
    return { head: `${hits.length} move${hits.length === 1 ? '' : 's'}`, rows: hits.slice(0, 200).map(moveRow) };
}

// ---- /ds ----
const STAT_ALIASES: Record<string, keyof DexMon['stats'] | 'bst'> = { hp: 'hp', atk: 'atk', attack: 'atk', def: 'def', defense: 'def', spa: 'spa', spatk: 'spa', spd: 'spd', spdef: 'spd', spe: 'spe', speed: 'spe', bst: 'bst' };

function dexSearch(dex: Dex, args: string): Result {
    if (!args) return { error: 'Type what to look for, like /ds water, spe > 100.' };
    const tests: Array<(m: DexMon) => boolean> = [];
    for (const raw of args.split(',').map(s => s.trim()).filter(Boolean)) {
        const not = raw.startsWith('!');
        const term = not ? raw.slice(1).trim() : raw;
        let test: ((m: DexMon) => boolean) | null = null;
        const stat = term.match(/^([a-z ]+?)\s*(>=|<=|>|<|=)\s*(\d+)$/i);
        const type = typeName(dex, term);
        if (stat && STAT_ALIASES[toId(stat[1])]) {
            const key = STAT_ALIASES[toId(stat[1])], n = Number(stat[3]), op = stat[2];
            const val = (m: DexMon) => key === 'bst' ? bst(m) : m.stats[key];
            test = m => op === '>' ? val(m) > n : op === '<' ? val(m) < n : op === '>=' ? val(m) >= n : op === '<=' ? val(m) <= n : val(m) === n;
        } else if (type) {
            test = m => m.types.includes(type);
        } else if (/^ability:/i.test(term) || dex.abilities.some(a => a.id === toId(term))) {
            const id = toId(term.replace(/^ability:/i, ''));
            test = m => m.abilities.some(a => toId(a) === id);
        } else if (/^own$|^fakemon$/i.test(term)) {
            test = m => !!m.own;
        } else if (findMove(dex, term.replace(/^move:/i, ''))) {
            if (!dex.learnsetsLoaded) return { error: 'The learnsets are still loading. Try again in a moment.' };
            const id = findMove(dex, term.replace(/^move:/i, ''))!.id;
            test = m => !!m.learns?.has(id);
        } else {
            return { error: `"${term}" is not a type, ability, move or stat (like spe > 100).` };
        }
        tests.push(not ? m => !test!(m) : test);
    }
    const hits = dex.mons.filter(m => tests.every(t => t(m)));
    return { head: `${hits.length} result${hits.length === 1 ? '' : 's'}`, rows: hits.slice(0, 200).map(monRow) };
}

// ---- /weakness ----
function typesOf(dex: Dex, args: string): { types: string[]; label: string } | null {
    const mon = findMon(dex, args);
    if (mon) return { types: mon.types, label: `${mon.name} (${mon.types.join('/')})` };
    const parts = args.split(/[\/,\s]+/).filter(Boolean).map(s => typeName(dex, s));
    if (!parts.length || parts.some(t => !t)) return null;
    return { types: parts as string[], label: parts.join('/') };
}

function weakness(dex: Dex, args: string): Result {
    const t = typesOf(dex, args);
    if (!t) return { error: 'Name a Pokémon or one or two types, like /weakness ground/flying.' };
    const by = new Map<number, string[]>();
    for (const a of dex.types) { const x = effectiveness(dex, a, t.types); by.set(x, [...(by.get(x) || []), a]); }
    const groups: TypeGroup[] = ([[4, 'Weak ×4', 'weak'], [2, 'Weak ×2', 'weak'], [0.5, 'Resists ×½', 'resist'], [0.25, 'Resists ×¼', 'resist'], [0, 'Immune', 'immune']] as const)
        .filter(([x]) => by.get(x)?.length).map(([x, label, tone]) => ({ label, types: by.get(x)!, tone }));
    return { head: t.label, lines: groups.map(g => `${g.label}: ${g.types.join(', ')}`), typeGroups: groups };
}

// ---- /coverage ----
function coverage(dex: Dex, args: string): Result {
    // commas or slashes between them; a space can be inside a move's name (ice beam)
    const attacks = args.split(/[\/,]+/).map(s => s.trim()).filter(Boolean).flatMap(s => {
        const one = findMove(dex, s)?.type || typeName(dex, s);
        return one ? [one] : s.split(/\s+/).map(w => findMove(dex, w)?.type || typeName(dex, w));
    });
    if (!attacks.length || attacks.some(a => !a)) return { error: 'Name attacking types or moves, like /coverage fire, water.' };
    const best = (d: string) => Math.max(...(attacks as string[]).map(a => effectiveness(dex, a, [d])));
    const group = (test: (x: number) => boolean) => dex.types.filter(d => test(best(d)));
    const se = group(x => x > 1), neutral = group(x => x === 1), resisted = group(x => x > 0 && x < 1), immune = group(x => x === 0);
    const typeGroups: TypeGroup[] = [
        { label: `Super effective on ${se.length}`, types: se, tone: 'weak' },
        { label: `Neutral on ${neutral.length}`, types: neutral, tone: 'neutral' },
        { label: `Resisted by ${resisted.length}`, types: resisted, tone: 'resist' },
        ...(immune.length ? [{ label: 'No effect on', types: immune, tone: 'immune' as const }] : [])
    ];
    return { head: `Coverage of ${[...new Set(attacks as string[])].join(', ')}`, typeGroups, lines: [
        `Super effective on ${se.length}: ${se.join(', ') || 'none'}`,
        `Neutral on ${neutral.length}: ${neutral.join(', ') || 'none'}`,
        `Resisted by ${resisted.length}: ${resisted.join(', ') || 'none'}`,
        ...(immune.length ? [`No effect on: ${immune.join(', ')}`] : [])
    ] };
}

// ---- /learn ----
function learn(dex: Dex, args: string): Result {
    const [monName, ...moveNames] = args.split(',').map(s => s.trim()).filter(Boolean);
    const mon = monName && findMon(dex, monName);
    if (!mon || !moveNames.length) return { error: 'Name a Pokémon and a move, like /learn garchomp, earthquake.' };
    if (!dex.learnsetsLoaded && !mon.own) return { error: 'The learnsets are still loading. Try again in a moment.' };
    const lines = moveNames.map(n => {
        const move = findMove(dex, n);
        if (!move) return `${n}: no such move`;
        return `${move.name}: ${mon.learns?.has(move.id) ? 'yes' : 'no'}`;
    });
    return { head: `${mon.name} learns`, lines };
}

// ---- /randpoke ----
function randpoke(dex: Dex, args: string, random: () => number): Result {
    const n = Math.min(Math.max(Number(args) || 1, 1), 24);
    // the first n of a shuffle: never the same one twice, and always done in n steps
    const pool = dex.mons.filter(m => !m.own);
    const count = Math.min(n, pool.length);
    for (let i = 0; i < count; i++) {
        const j = i + Math.floor(random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = pool.slice(0, count);
    return { head: `${picked.length} random Pokémon`, rows: picked.map(monRow) };
}

// ---- stats, /calc and /bulk ----
/** A stat at level 100 with 31 IVs, as the games and Showdown work it out. */
export function statAt(base: number, ev: number, nature: number, hp = false): number {
    if (hp) return base === 1 ? 1 : Math.floor(((2 * base + 31 + Math.floor(ev / 4)) * 100) / 100) + 110;
    return Math.floor((Math.floor(((2 * base + 31 + Math.floor(ev / 4)) * 100) / 100) + 5) * nature);
}

/** The damage formula's core at level 100, before the random roll: min (85%) and max (100%). */
export function damageRange(basePower: number, attack: number, defense: number, mod: number): [number, number] {
    const base = Math.floor(Math.floor(Math.floor((2 * 100) / 5 + 2) * basePower * attack / defense) / 50) + 2;
    return [Math.floor(Math.floor(base * 85 / 100) * mod), Math.floor(base * mod)];
}

// The items and abilities /calc knows: the ones that change damage. The
// numbers follow Showdown's calc; its 4096-based rounding can make a result
// differ from Showdown's by a point or so.
interface CalcCtx { move: DexMove; physical: boolean; contact: boolean; eff: number; stab: number; bp: number; atk: number; def: number; final: number; immune: string }
type Mod = { name: string; side: 'attacker' | 'defender'; apply: (c: CalcCtx) => void };
const immuneTo = (type: string, name: string): Mod['apply'] => c => { if (c.move.type === type) c.immune = name; };
const CALC_MODS: Record<string, Mod> = {
    choiceband: { name: 'Choice Band', side: 'attacker', apply: c => { if (c.physical) c.atk *= 1.5; } },
    choicespecs: { name: 'Choice Specs', side: 'attacker', apply: c => { if (!c.physical) c.atk *= 1.5; } },
    lifeorb: { name: 'Life Orb', side: 'attacker', apply: c => { c.final *= 5324 / 4096; } },
    expertbelt: { name: 'Expert Belt', side: 'attacker', apply: c => { if (c.eff > 1) c.final *= 4915 / 4096; } },
    muscleband: { name: 'Muscle Band', side: 'attacker', apply: c => { if (c.physical) c.bp *= 1.1; } },
    wiseglasses: { name: 'Wise Glasses', side: 'attacker', apply: c => { if (!c.physical) c.bp *= 1.1; } },
    hugepower: { name: 'Huge Power', side: 'attacker', apply: c => { if (c.physical) c.atk *= 2; } },
    purepower: { name: 'Pure Power', side: 'attacker', apply: c => { if (c.physical) c.atk *= 2; } },
    hustle: { name: 'Hustle', side: 'attacker', apply: c => { if (c.physical) c.atk *= 1.5; } },
    adaptability: { name: 'Adaptability', side: 'attacker', apply: c => { if (c.stab > 1) c.stab = 2; } },
    technician: { name: 'Technician', side: 'attacker', apply: c => { if (c.bp <= 60) c.bp *= 1.5; } },
    toughclaws: { name: 'Tough Claws', side: 'attacker', apply: c => { if (c.contact) c.bp *= 1.3; } },
    tintedlens: { name: 'Tinted Lens', side: 'attacker', apply: c => { if (c.eff > 0 && c.eff < 1) c.final *= 2; } },
    assaultvest: { name: 'Assault Vest', side: 'defender', apply: c => { if (!c.physical) c.def *= 1.5; } },
    eviolite: { name: 'Eviolite', side: 'defender', apply: c => { c.def *= 1.5; } },
    furcoat: { name: 'Fur Coat', side: 'defender', apply: c => { if (c.physical) c.def *= 2; } },
    multiscale: { name: 'Multiscale', side: 'defender', apply: c => { c.final *= 0.5; } },
    shadowshield: { name: 'Shadow Shield', side: 'defender', apply: c => { c.final *= 0.5; } },
    icescales: { name: 'Ice Scales', side: 'defender', apply: c => { if (!c.physical) c.final *= 0.5; } },
    thickfat: { name: 'Thick Fat', side: 'defender', apply: c => { if (c.move.type === 'Fire' || c.move.type === 'Ice') c.atk *= 0.5; } },
    filter: { name: 'Filter', side: 'defender', apply: c => { if (c.eff > 1) c.final *= 0.75; } },
    solidrock: { name: 'Solid Rock', side: 'defender', apply: c => { if (c.eff > 1) c.final *= 0.75; } },
    prismarmor: { name: 'Prism Armor', side: 'defender', apply: c => { if (c.eff > 1) c.final *= 0.75; } },
    fluffy: { name: 'Fluffy', side: 'defender', apply: c => { if (c.contact) c.final *= 0.5; if (c.move.type === 'Fire') c.final *= 2; } },
    levitate: { name: 'Levitate', side: 'defender', apply: immuneTo('Ground', 'Levitate') },
    eartheater: { name: 'Earth Eater', side: 'defender', apply: immuneTo('Ground', 'Earth Eater') },
    waterabsorb: { name: 'Water Absorb', side: 'defender', apply: immuneTo('Water', 'Water Absorb') },
    stormdrain: { name: 'Storm Drain', side: 'defender', apply: immuneTo('Water', 'Storm Drain') },
    dryskin: { name: 'Dry Skin', side: 'defender', apply: immuneTo('Water', 'Dry Skin') },
    voltabsorb: { name: 'Volt Absorb', side: 'defender', apply: immuneTo('Electric', 'Volt Absorb') },
    lightningrod: { name: 'Lightning Rod', side: 'defender', apply: immuneTo('Electric', 'Lightning Rod') },
    motordrive: { name: 'Motor Drive', side: 'defender', apply: immuneTo('Electric', 'Motor Drive') },
    flashfire: { name: 'Flash Fire', side: 'defender', apply: immuneTo('Fire', 'Flash Fire') },
    sapsipper: { name: 'Sap Sipper', side: 'defender', apply: immuneTo('Grass', 'Sap Sipper') }
};

interface CalcSide { hpEv: number | null; ev: number | null; nature: number; evText: string; mods: Mod[]; rest: string }
/**
 * Reads one side of a calc, Showdown's way: EVs and nature first ("252+ Atk",
 * "252 HP / 4 Def"), then items and abilities, then the Pokémon (and, for the
 * attacker, the move).
 */
function parseCalcSide(text: string, side: Mod['side']): CalcSide {
    const out: CalcSide = { hpEv: null, ev: null, nature: 1, evText: '', mods: [], rest: text.trim() };
    const evParts: string[] = [];
    for (let m: RegExpMatchArray | null; (m = out.rest.match(/^(\d{1,3})\s*([+-]?)\s*(hp|atk|spa|def|spd)\b\s*\/?\s*/i));) {
        const ev = Math.min(252, Number(m[1]));
        if (m[3].toLowerCase() === 'hp') out.hpEv = ev;
        else { out.ev = ev; out.nature = m[2] === '+' ? 1.1 : m[2] === '-' ? 0.9 : 1; }
        evParts.push(`${ev}${m[2]} ${m[3].length === 2 ? 'HP' : m[3][0].toUpperCase() + m[3].slice(1).toLowerCase()}`);
        out.rest = out.rest.slice(m[0].length);
    }
    out.evText = evParts.join(' / ');
    // the longest run of words (up to three) that names a known item or ability
    for (let found = true; found;) {
        found = false;
        const words = out.rest.split(/\s+/);
        for (let n = Math.min(3, words.length - 1); n > 0; n--) {
            const mod = CALC_MODS[toId(words.slice(0, n).join(''))];
            if (mod && mod.side === side) { out.mods.push(mod); out.rest = words.slice(n).join(' '); found = true; break; }
        }
    }
    return out;
}

/** How many hits a damage range needs, in Showdown's words. */
function koText(lo: number, hi: number, hp: number): string {
    if (lo >= hp) return 'guaranteed OHKO';
    if (hi >= hp) return 'possible OHKO';
    const most = Math.ceil(hp / lo), least = Math.ceil(hp / hi);
    if (least > 9) return 'more than 9 hits to KO';
    return most === least ? `guaranteed ${least}HKO` : `possible ${least}HKO`;
}

function calc(dex: Dex, args: string): Result {
    const m = args.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    if (!m) {
        // no "vs": arithmetic, like Showdown's /calc
        if (!args) return { error: 'Type a sum, like /calc 2 + 2, or a damage calc, like /calc garchomp earthquake vs toxapex.' };
        const r = arithmetic(args);
        if ('error' in r) return { error: `${r.error} For a damage calc, use /calc <attacker> <move> vs <defender>.` };
        return { head: 'Calculator', math: r, lines: [`${r.expr} = ${r.value}`] };
    }
    const a = parseCalcSide(m[1], 'attacker'), d = parseCalcSide(m[2], 'defender');
    const words = a.rest.split(/\s+/);
    // the longest name that is a Pokémon, the rest is the move
    let attacker: DexMon | undefined, moveName = '';
    for (let i = words.length - 1; i > 0 && !attacker; i--) {
        attacker = findMon(dex, words.slice(0, i).join(' '));
        moveName = words.slice(i).join(' ');
    }
    const defender = findMon(dex, d.rest);
    const move = findMove(dex, moveName);
    if (!attacker || !defender || !move) return { error: `I could not find ${!attacker ? 'the attacker' : !move ? 'the move' : 'the defender'}.` };
    if (move.category === 'Status' || !move.basePower) return { error: `${move.name} does no direct damage.` };
    const physical = move.category === 'Physical';
    const statName = physical ? 'Atk' : 'SpA', defName = physical ? 'Def' : 'SpD';
    // no EVs named: 252 with a helpful nature, as before
    const atkEv = a.ev ?? 252, atkNature = a.ev == null ? 1.1 : a.nature;
    const run = (hpEv: number, defEv: number, nature: number) => {
        const c: CalcCtx = {
            move, physical, contact: !!move.flags?.contact, eff: effectiveness(dex, move.type, defender.types),
            stab: attacker.types.includes(move.type) ? 1.5 : 1, bp: move.basePower,
            atk: statAt(physical ? attacker.stats.atk : attacker.stats.spa, atkEv, atkNature),
            def: statAt(physical ? defender.stats.def : defender.stats.spd, defEv, nature), final: 1, immune: ''
        };
        for (const mod of [...a.mods, ...d.mods]) mod.apply(c);
        const hp = statAt(defender.stats.hp, hpEv, 1, true);
        if (c.eff === 0 || c.immune) return { c, text: '', lo: 0, hi: 0, hp };
        const [lo, hi] = damageRange(Math.floor(c.bp), Math.floor(c.atk), Math.floor(c.def), c.stab * c.eff * c.final);
        return { c, text: `${fmt(lo / hp * 100)}% to ${fmt(hi / hp * 100)}% (${lo}-${hi} of ${hp} HP)`, lo, hi, hp };
    };
    const atkLabel = [a.evText || `252+ ${statName}`, ...a.mods.map(x => x.name), attacker.name, move.name].join(' ');
    const defMods = d.mods.map(x => x.name).join(' ');
    const lines: string[] = [];
    // the defender's EVs named: that one spread; none: no and full bulk
    const spreads: Array<[string, number, number, number]> = d.evText
        ? [[d.evText, d.hpEv ?? 0, d.ev ?? 0, d.nature]]
        : [[`0 HP / 0 ${defName}`, 0, 0, 1], [`252 HP / 252+ ${defName}`, 252, 252, 1.1]];
    const first = run(spreads[0][1], spreads[0][2], spreads[0][3]).c;
    const rolls: CalcRoll[] = [];
    const immune = first.immune ? `${defender.name}'s ${first.immune}` : first.eff === 0 ? `${defender.name} is immune` : '';
    if (immune) lines.push(`No effect: ${immune}.`);
    else {
        lines.push(`Type: ×${first.eff}${first.stab > 1 ? `, STAB ×${first.stab}` : ''}`);
        for (const [label, hpEv, defEv, nature] of spreads) {
            const r = run(hpEv, defEv, nature);
            const full = `${label}${defMods ? ` ${defMods}` : ''}`;
            lines.push(`${full}: ${r.text}`);
            rolls.push({ label: full, lo: r.lo, hi: r.hi, hp: r.hp, loPct: r.lo / r.hp * 100, hiPct: r.hi / r.hp * 100, ko: koText(r.lo, r.hi, r.hp) });
        }
    }
    const note = 'Level 100, 31 IVs, no weather, terrain or stat boosts.';
    lines.push(note);
    return {
        head: `${atkLabel} vs ${defender.name}`, lines, note,
        calc: {
            attacker: { name: attacker.name, types: attacker.types, label: [a.evText || `252+ ${statName}`, ...a.mods.map(x => x.name)].join(' ') },
            move: { name: move.name, type: move.type, category: move.category, basePower: move.basePower },
            defender: { name: defender.name, types: defender.types, label: defMods },
            eff: first.eff, stab: first.stab, immune: immune || undefined, rolls
        }
    };
}

// ---- /calc as a calculator ----
// A small parser, not eval: numbers (12, 1.5, 2e3, 0x1f, 0b101, 0o17), pi
// and e, + - * / % ^ (or **) and brackets, in the usual order. "in hex",
// "in binary" or "in octal" at the end changes how the answer is written.
const MATH_TOKEN = /\s*(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|pi|π|e|\*\*|[-+*/%^()×÷])/iy;

export function arithmetic(input: string): { expr: string; value: string } | { error: string } {
    let text = input.trim(), base = 10;
    const want = text.match(/\s+in\s+(hex|hexadecimal|bin|binary|oct|octal|dec|decimal)$/i);
    if (want) { base = /^h/i.test(want[1]) ? 16 : /^b/i.test(want[1]) ? 2 : /^o/i.test(want[1]) ? 8 : 10; text = text.slice(0, want.index).trim(); }
    const tokens: string[] = [];
    MATH_TOKEN.lastIndex = 0;
    while (MATH_TOKEN.lastIndex < text.length) {
        const at = MATH_TOKEN.lastIndex;
        const m = MATH_TOKEN.exec(text);
        if (!m) {
            const rest = text.slice(at).trim();
            if (!rest) break;
            return { error: `"${rest.slice(0, 12)}" is not a number or a sign I know.` };
        }
        tokens.push(m[1].toLowerCase());
    }
    if (!tokens.length) return { error: 'There is no sum to work out.' };
    let i = 0;
    const peek = () => tokens[i];
    const fail = (why: string): never => { throw new Error(why); };
    // sum := term (+|- term)*, term := unary (*|/|% unary)*, unary := (+|-) unary | power, power := atom (^ unary)?
    const sum = (): number => { let v = term(); while (peek() === '+' || peek() === '-') v = tokens[i++] === '+' ? v + term() : v - term(); return v; };
    const term = (): number => {
        let v = unary();
        while (['*', '/', '%', '×', '÷'].includes(peek())) {
            const op = tokens[i++], r = unary();
            v = op === '*' || op === '×' ? v * r : op === '%' ? v % r : v / r;
        }
        return v;
    };
    const unary = (): number => peek() === '-' ? (i++, -unary()) : peek() === '+' ? (i++, unary()) : power();
    const power = (): number => { const b = atom(); if (peek() === '^' || peek() === '**') { i++; return b ** unary(); } return b; };
    const atom = (): number => {
        const tok = tokens[i++];
        if (tok === undefined) return fail('The sum ends too early.');
        if (tok === '(') { const v = sum(); if (tokens[i++] !== ')') fail('A bracket is not closed.'); return v; }
        if (tok === 'pi' || tok === 'π') return Math.PI;
        if (tok === 'e') return Math.E;
        if (/^0[xbo]/.test(tok)) return parseInt(tok.slice(2), tok[1] === 'x' ? 16 : tok[1] === 'b' ? 2 : 8);
        if (/^[\d.]/.test(tok)) return Number(tok);
        return fail(`"${tok}" is in the wrong place.`);
    };
    let value: number;
    try {
        value = sum();
        if (i < tokens.length) fail(`"${tokens[i]}" is in the wrong place.`);
    } catch (err) { return { error: (err as Error).message }; }
    if (!Number.isFinite(value)) return { error: Number.isNaN(value) ? 'That sum has no answer.' : 'The answer is too big (or you divided by zero).' };
    const shown = base === 10
        ? String(Number.isInteger(value) ? value : Number(value.toPrecision(12)))
        : Number.isInteger(value) ? (value < 0 ? '-' : '') + (base === 16 ? '0x' : base === 2 ? '0b' : '0o') + Math.abs(value).toString(base) : '';
    if (!shown) return { error: 'Only whole numbers can be written in hex, binary or octal.' };
    return { expr: tokens.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')'), value: shown };
}

function bulkCmd(dex: Dex, args: string): Result {
    const mon = findMon(dex, args);
    if (!mon) return { error: 'Name a Pokémon or a Fakémon, like /bulk toxapex.' };
    const row = (label: string, hpEv: number, defEv: number, nature: number) => {
        const hp = statAt(mon.stats.hp, hpEv, 1, true);
        const def = statAt(mon.stats.def, defEv, nature), spd = statAt(mon.stats.spd, defEv, nature);
        return `${label}: physical ${(hp * def).toLocaleString('en')} (${hp} × ${def}), special ${(hp * spd).toLocaleString('en')} (${hp} × ${spd})`;
    };
    return { head: `${mon.name} bulk (level 100)`, lines: [row('No investment', 0, 0, 1), row('252 HP / 252+', 252, 252, 1.1)] };
}

// ---- /dt ----
function data(dex: Dex, args: string): Result {
    if (!args) return { error: 'Name something, like /dt garchomp.' };
    const mon = findMon(dex, args);
    if (mon) return { head: mon.name + (mon.own ? ' (yours)' : ''), lines: [`Abilities: ${mon.abilities.join(', ') || '—'}`], rows: [monRow(mon), { title: `Weaknesses of ${mon.name}`, kind: 'mon', id: mon.id }] };
    const move = findMove(dex, args);
    if (move) return { head: move.name, rows: [moveRow(move)], lines: move.desc ? [move.desc] : undefined };
    const ability = dex.abilities.find(a => a.id === toId(args));
    if (ability) return { head: ability.name, rows: [{ title: ability.name, sub: ability.desc, kind: 'ability', id: ability.id }] };
    const item = dex.items.find(i => i.id === toId(args));
    if (item) return { head: item.name, lines: [item.desc || 'No description.'] };
    const type = typeName(dex, args);
    if (type) {
        const r = weakness(dex, type);
        const hits = dex.types.filter(d => effectiveness(dex, type, [d]) > 1);
        return { head: `${type} type`, lines: [`Super effective on: ${hits.join(', ') || 'none'}`, ...(r.lines || [])],
            typeGroups: [{ label: 'Super effective on', types: hits, tone: 'neutral' }, ...(r.typeGroups || [])] };
    }
    return { error: `Nothing is called "${args}".` };
}

/** Runs a command. `random` is Math.random (tests pass a fixed one). */
export function runCommand(dex: Dex, cmd: CommandDef, args: string, random: () => number = Math.random): Result {
    switch (cmd.name) {
        case 'ms': return moveSearch(dex, args);
        case 'ds': return dexSearch(dex, args);
        case 'dt': return data(dex, args);
        case 'weakness': return weakness(dex, args);
        case 'coverage': return coverage(dex, args);
        case 'learn': return learn(dex, args);
        case 'randpoke': return randpoke(dex, args, random);
        case 'calc': return calc(dex, args);
        case 'bulk': return bulkCmd(dex, args);
    }
    return { error: 'Unknown command.' };
}
