// ==================== move search, Showdown style ====================
// One search box that understands what Showdown's /movesearch does. A query
// is clauses separated by commas, and a move has to match all of them; a
// clause can hold alternatives split by | (any one will do), and ! in front
// turns it around:
//
//     fire, physical, bp > 80          Fire-type physical moves over 80 power
//     contact, priority > 0            priority moves that make contact
//     !contact, sound | pulse          sound or pulse moves that don't touch
//     raises atk, status               setup moves for Attack
//     burn, acc >= 90                  moves that can burn and rarely miss
//     "trap"                           "trap" anywhere in the description
//
// A bare word that isn't a keyword is part of the name (thunder, fang). A
// keyword also matches names that contain it, so "heal" finds Heal Bell as
// well as every healing move. Learnset-only keywords (learned, level, tm,
// egg, custom) ask about the Fakemon's own moves.

import { POKEMON_TYPES } from '../core/data.ts';
import { api } from '../core/app.ts';
import { allFlags } from './move-flags.ts';

export type Clause = { not: boolean; any: Atom[]; raw: string };
type Op = '>' | '<' | '>=' | '<=' | '=' | '!=';
export type Atom =
    | { kind: 'name'; text: string }
    | { kind: 'desc'; text: string }
    | { kind: 'type'; type: string; name: string }
    | { kind: 'category'; category: string; name: string }
    | { kind: 'flag'; flag: string; name: string }
    | { kind: 'num'; field: NumField; op: Op; value: number }
    | { kind: 'status'; status: string; name: string }
    | { kind: 'boost'; dir: 'raises' | 'lowers'; stat: string; name: string }
    | { kind: 'trait'; trait: Trait; name: string }
    | { kind: 'method'; method: string; name: string };
type NumField = 'basePower' | 'accuracy' | 'pp' | 'priority' | 'level';
type Trait = 'recovery' | 'recoil' | 'drain' | 'ohko' | 'spread' | 'selfswitch' | 'custom' | 'learned' | 'setup' | 'hazard' | 'weather' | 'terrain' | 'screen' | 'trapping';

const NUM_FIELDS: Record<string, NumField> = {
    bp: 'basePower', power: 'basePower', basepower: 'basePower', pow: 'basePower',
    acc: 'accuracy', accuracy: 'accuracy',
    pp: 'pp',
    prio: 'priority', priority: 'priority',
    lv: 'level', lvl: 'level', level: 'level'
};

const STATUSES: Record<string, string> = {
    burn: 'brn', brn: 'brn', burns: 'brn', paralyze: 'par', paralysis: 'par', par: 'par', paralyzes: 'par',
    poison: 'psn', psn: 'psn', poisons: 'psn', toxic: 'tox', tox: 'tox', badlypoison: 'tox',
    sleep: 'slp', slp: 'slp', freeze: 'frz', frz: 'frz', freezes: 'frz',
    confuse: 'confusion', confusion: 'confusion', confuses: 'confusion', flinch: 'flinch', flinches: 'flinch'
};

const STATS: Record<string, string> = {
    atk: 'atk', attack: 'atk', def: 'def', defense: 'def', defence: 'def',
    spa: 'spa', spatk: 'spa', 'sp.atk': 'spa', specialattack: 'spa', spd: 'spd', spdef: 'spd', 'sp.def': 'spd', specialdefense: 'spd',
    spe: 'spe', speed: 'spe', accuracy: 'accuracy', evasion: 'evasion', eva: 'evasion'
};

const TRAITS: Record<string, Trait> = {
    recovery: 'recovery', recover: 'recovery', healing: 'recovery',
    recoil: 'recoil', drain: 'drain', draining: 'drain',
    ohko: 'ohko', spread: 'spread', pivot: 'selfswitch', pivoting: 'selfswitch', selfswitch: 'selfswitch',
    custom: 'custom', learned: 'learned', learnt: 'learned', added: 'learned', known: 'learned',
    setup: 'setup', hazard: 'hazard', hazards: 'hazard', weather: 'weather', terrain: 'terrain',
    screen: 'screen', screens: 'screen', trap: 'trapping', trapping: 'trapping'
};

const METHODS: Record<string, string> = { level: 'level', levelup: 'level', tm: 'tm', egg: 'egg', eggmove: 'egg', tutor: 'tm' };

const CATEGORY: Record<string, string> = { physical: 'Physical', special: 'Special', status: 'Status', phys: 'Physical', spec: 'Special', other: 'Status' };

const squash = (s: string) => String(s || '').toLowerCase().replace(/[\s_-]+/g, '');

function parseAtom(text: string): Atom | null {
    const raw = text.trim();
    if (!raw) return null;
    const quoted = raw.match(/^"(.*)"$/);
    if (quoted) return quoted[1].trim() ? { kind: 'desc', text: quoted[1].trim().toLowerCase() } : null;
    // bp > 80, acc>=90, priority > 0, pp<10, lv <= 20
    const cmp = raw.match(/^([a-z.\s]+?)\s*(>=|<=|!=|=>|=<|>|<|=)\s*(-?\d+)%?$/i);
    if (cmp) {
        const field = NUM_FIELDS[squash(cmp[1])];
        if (field) {
            const op = ({ '=>': '>=', '=<': '<=' } as Record<string, Op>)[cmp[2]] || cmp[2] as Op;
            return { kind: 'num', field, op, value: Number(cmp[3]) };
        }
    }
    // 80+ bp, 100bp
    const bpWord = raw.match(/^(\d+)\s*(\+)?\s*bp$/i);
    if (bpWord) return { kind: 'num', field: 'basePower', op: bpWord[2] ? '>=' : '=', value: Number(bpWord[1]) };
    // raises atk, boosts spe, lowers def, +atk, -spe
    const boost = raw.match(/^(raises|boosts|ups|lowers|drops|reduces)\s+(.+)$/i) || raw.match(/^([+-])\s*([a-z.]+)$/i);
    if (boost) {
        const stat = STATS[squash(boost[2])];
        if (stat) {
            const dir = /^(raises|boosts|ups|\+)$/i.test(boost[1]) ? 'raises' : 'lowers';
            return { kind: 'boost', dir, stat, name: raw };
        }
    }
    const word = squash(raw);
    const type = [...POKEMON_TYPES, ...((api.getCustomTypes?.() || []) as any[]).map(t => String(t.name || ''))].find(t => squash(t) === word);
    if (type) return { kind: 'type', type, name: raw };
    if (CATEGORY[word]) return { kind: 'category', category: CATEGORY[word], name: raw };
    if (word === 'priority' || word === 'prio') return { kind: 'num', field: 'priority', op: '>', value: 0 };
    const flag = allFlags().find(f => squash(f.key) === word || squash(f.label) === word
        || (f.key === 'protect' && word === 'bypassprotect') || (f.key === 'bypasssub' && (word === 'authentic' || word === 'bypassessub'))
        || (f.key === 'highcrit' && (word === 'crit' || word === 'highcritratio')) || (f.key === 'thawing' && word === 'defrost'));
    if (flag) return { kind: 'flag', flag: flag.key, name: raw };
    if (STATUSES[word]) return { kind: 'status', status: STATUSES[word], name: raw };
    if (TRAITS[word]) return { kind: 'trait', trait: TRAITS[word], name: raw };
    if (METHODS[word]) return { kind: 'method', method: METHODS[word], name: raw };
    return { kind: 'name', text: raw.toLowerCase() };
}

/** The query, read. Clauses with nothing in them are dropped. */
export function parseMoveQuery(query: string): Clause[] {
    return String(query || '').split(',').map(part => {
        let raw = part.trim();
        let not = false;
        if (raw.startsWith('!')) { not = true; raw = raw.slice(1).trim(); }
        const any = raw.split('|').map(parseAtom).filter((a): a is Atom => !!a);
        return { not, any, raw };
    }).filter(c => c.any.length);
}

/** Whether the query does more than look for a name (a filter, not a lookup). */
export function isFilterQuery(clauses: Clause[]): boolean {
    return clauses.some(c => c.not || c.any.some(a => a.kind !== 'name'));
}

export interface MoveCtx {
    /** whether the Fakemon already knows this move */
    learned?: (move: any) => boolean;
    /** a learned move's method and level */
    learnInfo?: (move: any) => { method?: string; level?: number | null } | null;
    /** the move's flags in the editor's own terms (custom moves keep theirs, game moves are translated) */
    flags?: (move: any) => Record<string, any>;
    isCustom?: (move: any) => boolean;
}

const accuracyOf = (m: any) => (m.accuracy === true || m.accuracy === undefined || m.accuracy === null ? 101 : m.accuracy === false ? 0 : Number(m.accuracy) || 0);

function compare(a: number, op: Op, b: number) {
    switch (op) {
        case '>': return a > b;
        case '<': return a < b;
        case '>=': return a >= b;
        case '<=': return a <= b;
        case '!=': return a !== b;
        default: return a === b;
    }
}

function inflicts(m: any, status: string): boolean {
    const effects = [m, m.secondary, ...(Array.isArray(m.secondaries) ? m.secondaries : [])].filter(Boolean);
    if (status === 'confusion' || status === 'flinch') return effects.some((e: any) => e.volatileStatus === status);
    if (effects.some((e: any) => e.status === status)) return true;
    // poison covers bad poison too, the way people search
    if (status === 'psn' && effects.some((e: any) => e.status === 'tox')) return true;
    const text = `${m.shortDesc || ''} ${m.desc || ''}`.toLowerCase();
    const words: Record<string, RegExp> = { brn: /\bburn/, par: /\bparaly/, psn: /\bpoison/, tox: /badly poison/, slp: /\bsleep|fall asleep/, frz: /\bfreez/ };
    return !!(m.custom && words[status]?.test(text));
}

function boosts(m: any, dir: 'raises' | 'lowers', stat: string): boolean {
    const sign = dir === 'raises' ? 1 : -1;
    const has = (b: any) => b && Number(b[stat]) * sign > 0;
    const selfTarget = m.target === 'self' || m.target === 'adjacentAllyOrSelf' || m.target === 'allies' || m.target === 'allySide';
    if (dir === 'raises') {
        if (selfTarget && has(m.boosts)) return true;
        if (has(m.self?.boosts)) return true;
        if ([m.secondary, ...(m.secondaries || [])].some((s: any) => has(s?.self?.boosts))) return true;
    } else {
        if (!selfTarget && has(m.boosts)) return true;
        if ([m.secondary, ...(m.secondaries || [])].some((s: any) => has(s?.boosts))) return true;
    }
    const names: Record<string, string> = { atk: 'attack', def: 'defense', spa: 'sp. atk', spd: 'sp. def', spe: 'speed', accuracy: 'accuracy', evasion: 'evasiveness' };
    const text = `${m.shortDesc || ''} ${m.desc || ''}`.toLowerCase();
    return !!(m.custom && text.includes(dir === 'raises' ? 'raises' : 'lowers') && text.includes(names[stat] || stat));
}

function hasTrait(m: any, trait: Trait, ctx: MoveCtx): boolean {
    switch (trait) {
        case 'recovery': return !!(m.heal || m.drain || m.flags?.heal);
        case 'recoil': return !!m.recoil;
        case 'drain': return !!m.drain;
        case 'ohko': return !!m.ohko;
        case 'spread': return m.target === 'allAdjacent' || m.target === 'allAdjacentFoes' || m.target === 'all';
        case 'selfswitch': return !!(m.selfSwitch || ctx.flags?.(m)?.pivot);
        case 'custom': return !!ctx.isCustom?.(m);
        case 'learned': return !!ctx.learned?.(m);
        case 'setup': return m.category === 'Status' && boostsAny(m);
        case 'hazard': return ['spikes', 'toxicspikes', 'stealthrock', 'stickyweb', 'gmaxsteelsurge'].includes(String(m.sideCondition || '').toLowerCase());
        case 'weather': return !!m.weather;
        case 'terrain': return !!m.terrain;
        case 'screen': return ['reflect', 'lightscreen', 'auroraveil'].includes(String(m.sideCondition || '').toLowerCase());
        case 'trapping': return /trap|can't (switch|escape)|cannot (switch|escape)/i.test(`${m.shortDesc || ''} ${m.desc || ''}`) || m.volatileStatus === 'partiallytrapped';
    }
}
const boostsAny = (m: any) => ['atk', 'def', 'spa', 'spd', 'spe'].some(s => boosts(m, 'raises', s));

function atomMatches(m: any, a: Atom, ctx: MoveCtx): boolean {
    const name = String(m.name || '').toLowerCase();
    switch (a.kind) {
        case 'name': return name.includes(a.text) || squash(name).includes(squash(a.text));
        case 'desc': return `${m.shortDesc || ''} ${m.desc || ''}`.toLowerCase().includes(a.text);
        case 'type': return m.type === a.type || name.includes(a.type.toLowerCase());
        case 'category': return (m.category || 'Status') === a.category;
        case 'flag': {
            const flags = ctx.flags ? ctx.flags(m) : (m.flags || {});
            return !!flags[a.flag] || (a.flag === 'multihit' && !!m.multihit) || (a.flag === 'highcrit' && Number(m.critRatio) > 1);
        }
        case 'num': {
            if (a.field === 'level') {
                const info = ctx.learnInfo?.(m);
                return info?.method === 'level' && info.level != null && compare(Number(info.level), a.op, a.value);
            }
            const v = a.field === 'accuracy' ? accuracyOf(m) : Number(m[a.field]) || 0;
            return compare(v, a.op, a.value);
        }
        case 'status': return inflicts(m, a.status);
        case 'boost': return boosts(m, a.dir, a.stat);
        case 'trait': return hasTrait(m, a.trait, ctx) || (a.trait !== 'learned' && a.trait !== 'custom' && name.includes(a.name.toLowerCase()));
        case 'method': return ctx.learnInfo?.(m)?.method === a.method;
    }
}

/** Whether a move matches every clause of the query. */
export function moveMatches(m: any, clauses: Clause[], ctx: MoveCtx = {}): boolean {
    for (const c of clauses) {
        const hit = c.any.some(a => atomMatches(m, a, ctx));
        if (hit === c.not) return false;
    }
    return true;
}

/** How a clause reads back, for the chips under the search box. */
export function describeClause(c: Clause): string {
    const parts = c.any.map(a => {
        switch (a.kind) {
            case 'name': return `name has “${a.text}”`;
            case 'desc': return `says “${a.text}”`;
            case 'type': return `${a.type} type`;
            case 'category': return a.category;
            case 'flag': return (allFlags().find(f => f.key === a.flag)?.label) || a.flag;
            case 'num': return `${({ basePower: 'BP', accuracy: 'Acc', pp: 'PP', priority: 'Priority', level: 'Level' } as Record<string, string>)[a.field]} ${a.op} ${a.value}`;
            case 'status': return `inflicts ${a.name}`;
            case 'boost': return `${a.dir} ${a.stat}`;
            case 'trait': return a.name;
            case 'method': return `learned by ${a.method === 'tm' ? 'TM' : a.method}`;
        }
    });
    return `${c.not ? 'not ' : ''}${parts.join(' or ')}`;
}

/** The keywords a search box can suggest, for its help. */
export const MOVE_QUERY_EXAMPLES: Array<[string, string]> = [
    ['fire, physical', 'Fire-type physical moves'],
    ['bp > 80, contact', 'strong moves that make contact'],
    ['priority > 0', 'priority moves'],
    ['raises atk, status', 'setup moves for Attack'],
    ['burn | paralyze', 'moves that can burn or paralyze'],
    ['sound, !status', 'sound moves that do damage'],
    ['recovery', 'moves that heal the user'],
    ['acc < 100', 'moves that can miss'],
    ['"trap"', 'search the descriptions'],
    ['learned, level, lv <= 20', 'moves it learns by level 20']
];
