// Move modifiers: what a custom move does, picked from a list instead of
// built with blocks or code. "30% chance to freeze", "heals half the damage",
// "the user switches out", "behaves like Pursuit".
//
// The editor keeps them on the move as `modifiers` (this file's shape). A save
// also writes them as Showdown's own move fields (secondaries, drain, recoil,
// critRatio, self, selfSwitch ...): the in-app battle reads those fields
// (js/battle/engine/dex.ts normalizeCustomMove), and the Showdown export
// writes them as they are (showdownModifierLines). Blocks and hand-written
// code still run on top, so a modifier never takes a power away.
//
// "Behaves like" copies a main-game move's own code: the battle runs that
// move's Showdown handlers, and the export spreads Showdown's entry under
// the custom move's own fields.

export type StatusId = 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';
export type VolatileId = 'flinch' | 'confusion' | 'attract' | 'taunt' | 'encore' | 'torment' | 'healblock' | 'embargo' | 'leechseed' | 'yawn' | 'partiallytrapped' | 'nightmare' | 'curse';
export type StatId = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'accuracy' | 'evasion';
export type Who = 'target' | 'self';

export interface ModEffect {
    kind: 'status' | 'volatile' | 'boost';
    who: Who;
    status?: StatusId;
    volatile?: VolatileId;
    stat?: StatId;
    /** -6 to 6, never 0 */
    stages?: number;
    /** 1 to 100 */
    chance: number;
}

export type CritLevel = 'normal' | 'high' | 'veryhigh' | 'always';

export interface MoveModifiers {
    effects: ModEffect[];
    /** percent of the damage dealt the user heals (Giga Drain: 50) */
    drain: number;
    /** percent of the damage dealt the user takes (Double-Edge: 33) */
    recoil: number;
    /** a status move: percent of max HP the user heals (Recover: 50) */
    heal: number;
    crit: CritLevel;
    breaksProtect: boolean;
    ohko: boolean;
    selfSwitch: boolean;
    forceSwitch: boolean;
    ignoreDefensive: boolean;
    ignoreEvasion: boolean;
    thawsTarget: boolean;
    sleepUsable: boolean;
    selfdestruct: boolean;
    /** a Showdown move id whose own code this move runs, or '' */
    behavesLike: string;
}

export const STATUSES: Array<[StatusId, string, string]> = [
    ['brn', 'Burn', 'burn'], ['par', 'Paralysis', 'paralyze'], ['psn', 'Poison', 'poison'],
    ['tox', 'Bad poison', 'badly poison'], ['slp', 'Sleep', 'put to sleep'], ['frz', 'Freeze', 'freeze']
];
export const VOLATILES: Array<[VolatileId, string, string]> = [
    ['flinch', 'Flinch', 'make flinch'], ['confusion', 'Confusion', 'confuse'], ['attract', 'Infatuation', 'infatuate'],
    ['taunt', 'Taunt', 'taunt'], ['encore', 'Encore', 'encore'], ['torment', 'Torment', 'torment'],
    ['healblock', 'Heal Block', 'block healing on'], ['embargo', 'Embargo', 'stop item use on'], ['leechseed', 'Leech Seed', 'seed'],
    ['yawn', 'Drowsiness (Yawn)', 'make drowsy'], ['partiallytrapped', 'Trap (like Bind)', 'trap'], ['nightmare', 'Nightmare', 'give nightmares to'],
    ['curse', 'Curse (Ghost)', 'curse']
];
export const STATS: Array<[StatId, string]> = [
    ['atk', 'Attack'], ['def', 'Defense'], ['spa', 'Sp. Atk'], ['spd', 'Sp. Def'], ['spe', 'Speed'], ['accuracy', 'Accuracy'], ['evasion', 'Evasion']
];
export const CRITS: Array<[CritLevel, string]> = [['normal', 'Normal'], ['high', 'High (like Slash)'], ['veryhigh', 'Very high'], ['always', 'Always (like Wicked Blow)']];

/** The yes/no modifiers, with what each says in the editor. */
export const TOGGLES: Array<[keyof MoveModifiers, string, string]> = [
    ['selfSwitch', 'The user switches out after', 'Like U-turn'],
    ['forceSwitch', 'Forces the target out', 'Like Dragon Tail'],
    ['breaksProtect', 'Breaks through Protect', 'Like Feint'],
    ['ignoreDefensive', 'Ignores the target\'s stat changes', 'Like Sacred Sword'],
    ['ignoreEvasion', 'Ignores the target\'s evasion', 'Like Sacred Sword'],
    ['ohko', 'Knocks out in one hit', 'Like Fissure'],
    ['selfdestruct', 'The user faints', 'Like Explosion'],
    ['thawsTarget', 'Thaws a frozen target', 'Like Scald'],
    ['sleepUsable', 'Can be used while asleep', 'Like Snore']
];

const STATUS_IDS = new Set(STATUSES.map(s => s[0]));
const VOLATILE_IDS = new Set(VOLATILES.map(v => v[0]));
const STAT_IDS = new Set(STATS.map(s => s[0]));
const CRIT_IDS = new Set(CRITS.map(c => c[0]));
const MAX_EFFECTS = 8;
const pct = (v: unknown, max = 100) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };

export function emptyModifiers(): MoveModifiers {
    return {
        effects: [], drain: 0, recoil: 0, heal: 0, crit: 'normal', breaksProtect: false, ohko: false, selfSwitch: false, forceSwitch: false,
        ignoreDefensive: false, ignoreEvasion: false, thawsTarget: false, sleepUsable: false, selfdestruct: false, behavesLike: ''
    };
}

function cleanEffect(e: any): ModEffect | null {
    if (!e || typeof e !== 'object') return null;
    const chance = Math.max(1, pct(e.chance) || 100);
    const who: Who = e.who === 'self' ? 'self' : 'target';
    if (e.kind === 'status' && STATUS_IDS.has(e.status)) return { kind: 'status', who: 'target', status: e.status, chance };
    if (e.kind === 'volatile' && VOLATILE_IDS.has(e.volatile)) return { kind: 'volatile', who: 'target', volatile: e.volatile, chance };
    if (e.kind === 'boost' && STAT_IDS.has(e.stat)) {
        const stages = Math.max(-6, Math.min(6, Math.trunc(Number(e.stages)) || 0));
        return stages ? { kind: 'boost', who, stat: e.stat, stages, chance } : null;
    }
    return null;
}

/** The modifiers a move holds, checked (a move can come from an import or a template). */
export function readModifiers(move: any): MoveModifiers {
    const raw = move?.modifiers;
    const base = emptyModifiers();
    if (!raw || typeof raw !== 'object') return base;
    const out: MoveModifiers = {
        ...base,
        effects: (Array.isArray(raw.effects) ? raw.effects : []).map(cleanEffect).filter(Boolean).slice(0, MAX_EFFECTS) as ModEffect[],
        drain: pct(raw.drain), recoil: pct(raw.recoil), heal: pct(raw.heal),
        crit: CRIT_IDS.has(raw.crit) ? raw.crit : 'normal',
        behavesLike: typeof raw.behavesLike === 'string' && /^[a-z0-9]{1,40}$/.test(raw.behavesLike) ? raw.behavesLike : ''
    };
    for (const [key] of TOGGLES) (out as any)[key] = !!raw[key];
    return out;
}

/** A fraction for drain, recoil and heal: 50 is [1, 2], 33 is [33, 100]. */
function fraction(p: number): [number, number] {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const g = gcd(p, 100);
    return [p / g, 100 / g];
}

/**
 * What a move stores: `modifiers` itself, plus Showdown's fields. Every key
 * is always there, so a save clears what was turned off.
 */
export function modifierFields(mods: MoveModifiers | null | undefined, category: string) {
    const m = readModifiers({ modifiers: mods });
    const status = category === 'Status';
    const any = m.effects.length || m.drain || m.recoil || m.heal || m.crit !== 'normal' || m.behavesLike || TOGGLES.some(([k]) => m[k]);
    const fields: Record<string, any> = {
        modifiers: any ? m : undefined,
        secondaries: undefined, status: undefined, volatileStatus: undefined, boosts: undefined, self: undefined,
        drain: undefined, recoil: undefined, heal: undefined, critRatio: undefined, willCrit: undefined,
        breaksProtect: undefined, ohko: undefined, selfSwitch: undefined, forceSwitch: undefined,
        ignoreDefensive: undefined, ignoreEvasion: undefined, thawsTarget: undefined, sleepUsable: undefined,
        selfdestruct: undefined, behavesLike: undefined
    };
    if (!any) return fields;

    if (status) {
        // a status move does its effects outright: Showdown's chance is for damaging moves
        for (const e of m.effects) {
            if (e.kind === 'status' && !fields.status) fields.status = e.status;
            else if (e.kind === 'volatile' && !fields.volatileStatus) fields.volatileStatus = e.volatile;
            else if (e.kind === 'boost' && e.who === 'target') fields.boosts = { ...(fields.boosts || {}), [e.stat!]: e.stages };
            else if (e.kind === 'boost' && e.who === 'self') fields.self = { boosts: { ...(fields.self?.boosts || {}), [e.stat!]: e.stages } };
        }
        if (m.heal) fields.heal = fraction(m.heal);
    } else {
        const secondaries = m.effects.map(e => {
            if (e.kind === 'status') return { chance: e.chance, status: e.status };
            if (e.kind === 'volatile') return { chance: e.chance, volatileStatus: e.volatile };
            if (e.who === 'self') return { chance: e.chance, self: { boosts: { [e.stat!]: e.stages } } };
            return { chance: e.chance, boosts: { [e.stat!]: e.stages } };
        });
        if (secondaries.length) fields.secondaries = secondaries;
        if (m.drain) fields.drain = fraction(m.drain);
        if (m.recoil) fields.recoil = fraction(m.recoil);
        if (m.crit === 'high') fields.critRatio = 2;
        if (m.crit === 'veryhigh') fields.critRatio = 3;
        if (m.crit === 'always') fields.willCrit = true;
        if (m.ohko) fields.ohko = true;
        if (m.ignoreDefensive) fields.ignoreDefensive = true;
        if (m.ignoreEvasion) fields.ignoreEvasion = true;
        if (m.thawsTarget) fields.thawsTarget = true;
    }
    if (m.breaksProtect) fields.breaksProtect = true;
    if (m.selfSwitch) fields.selfSwitch = true;
    if (m.forceSwitch) fields.forceSwitch = true;
    if (m.sleepUsable) fields.sleepUsable = true;
    if (m.selfdestruct) fields.selfdestruct = 'always';
    if (m.behavesLike) fields.behavesLike = m.behavesLike;
    return fields;
}

/**
 * A main-game move's effects as modifiers, to start from ("Copy its effects").
 * Only the plain data Showdown's client copy carries; code is "Behaves like".
 */
export function modifiersFromShowdown(sd: any): MoveModifiers {
    const m = emptyModifiers();
    if (!sd) return m;
    const list = Array.isArray(sd.secondaries) ? sd.secondaries : sd.secondary ? [sd.secondary] : [];
    for (const s of list) {
        const chance = pct(s?.chance) || 100;
        if (s?.status) m.effects.push({ kind: 'status', who: 'target', status: s.status, chance });
        if (s?.volatileStatus) m.effects.push({ kind: 'volatile', who: 'target', volatile: s.volatileStatus, chance });
        for (const [stat, stages] of Object.entries<any>(s?.boosts || {})) m.effects.push({ kind: 'boost', who: 'target', stat: stat as StatId, stages, chance });
        for (const [stat, stages] of Object.entries<any>(s?.self?.boosts || {})) m.effects.push({ kind: 'boost', who: 'self', stat: stat as StatId, stages, chance });
    }
    if (sd.status) m.effects.push({ kind: 'status', who: 'target', status: sd.status, chance: 100 });
    if (sd.volatileStatus) m.effects.push({ kind: 'volatile', who: 'target', volatile: sd.volatileStatus, chance: 100 });
    for (const [stat, stages] of Object.entries<any>(sd.boosts || {})) m.effects.push({ kind: 'boost', who: sd.target === 'self' ? 'self' : 'target', stat: stat as StatId, stages, chance: 100 });
    for (const [stat, stages] of Object.entries<any>(sd.self?.boosts || {})) m.effects.push({ kind: 'boost', who: 'self', stat: stat as StatId, stages, chance: 100 });
    const asPct = (f: any) => (Array.isArray(f) && f[1] ? Math.round((f[0] / f[1]) * 100) : 0);
    m.drain = asPct(sd.drain); m.recoil = asPct(sd.recoil); m.heal = asPct(sd.heal);
    m.crit = sd.willCrit ? 'always' : Number(sd.critRatio) >= 3 ? 'veryhigh' : Number(sd.critRatio) === 2 ? 'high' : 'normal';
    m.breaksProtect = !!sd.breaksProtect; m.ohko = !!sd.ohko; m.selfSwitch = !!sd.selfSwitch; m.forceSwitch = !!sd.forceSwitch;
    m.ignoreDefensive = !!sd.ignoreDefensive; m.ignoreEvasion = !!sd.ignoreEvasion; m.thawsTarget = !!sd.thawsTarget;
    m.sleepUsable = !!sd.sleepUsable; m.selfdestruct = !!sd.selfdestruct;
    return readModifiers({ modifiers: m });
}

const statName = (id?: StatId) => STATS.find(s => s[0] === id)?.[1] || id || '';

/** One line for each modifier, for the editor and the move's description. */
export function modifierSummary(mods: MoveModifiers, category: string, behavesLikeName = ''): string[] {
    const m = readModifiers({ modifiers: mods });
    const status = category === 'Status';
    const chance = (c: number) => (status || c >= 100 ? '' : `${c}% chance to `);
    const lines = m.effects.map(e => {
        if (e.kind === 'status') return `${chance(e.chance) || 'Will '}${STATUSES.find(s => s[0] === e.status)?.[2]} the target.`.replace(/^./, c => c.toUpperCase());
        if (e.kind === 'volatile') return `${chance(e.chance) || 'Will '}${VOLATILES.find(v => v[0] === e.volatile)?.[2]} the target.`.replace(/^./, c => c.toUpperCase());
        const who = e.who === 'self' ? 'the user\'s' : 'the target\'s';
        const verb = (e.stages || 0) > 0 ? 'raise' : 'lower';
        return `${chance(e.chance) || 'Will '}${verb} ${who} ${statName(e.stat)} by ${Math.abs(e.stages || 0)}.`.replace(/^./, c => c.toUpperCase());
    });
    if (!status && m.drain) lines.push(`The user heals ${m.drain}% of the damage dealt.`);
    if (!status && m.recoil) lines.push(`The user takes ${m.recoil}% of the damage dealt as recoil.`);
    if (status && m.heal) lines.push(`The user heals ${m.heal}% of its max HP.`);
    if (!status && m.crit !== 'normal') lines.push(m.crit === 'always' ? 'Always lands a critical hit.' : `A ${m.crit === 'high' ? 'high' : 'very high'} critical hit ratio.`);
    for (const [key, label] of TOGGLES) if (m[key]) lines.push(`${label}.`);
    if (m.behavesLike) lines.push(`Behaves like ${behavesLikeName || m.behavesLike}.`);
    return lines;
}

const SKIP_WHEN_WRITTEN = ['secondaries', 'status', 'volatileStatus', 'boosts', 'self', 'drain', 'recoil', 'heal', 'critRatio', 'willCrit',
    'breaksProtect', 'ohko', 'selfSwitch', 'forceSwitch', 'ignoreDefensive', 'ignoreEvasion', 'thawsTarget', 'sleepUsable', 'selfdestruct'];

/** The Showdown fields for a custom move's modifiers. It skips a field the move's own code already sets. */
export function showdownModifierLines(move: any, written = ''): string[] {
    const fields = modifierFields(readModifiers(move), move?.category || 'Status');
    const has = (word: string) => new RegExp(`\\b${word}\\b`).test(written);
    const lines: string[] = [];
    for (const key of SKIP_WHEN_WRITTEN) {
        if (fields[key] === undefined || has(key)) continue;
        lines.push(`\t\t${key}: ${JSON.stringify(fields[key])},`);
    }
    return lines;
}

/** The Showdown move a custom move copies its code from, or ''. */
export const behavesLikeOf = (move: any) => readModifiers(move).behavesLike;

/** True when the modifiers give the export something to write. */
export const hasModifiers = (move: any) => modifierFields(readModifiers(move), move?.category || 'Status').modifiers !== undefined;
