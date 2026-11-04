// Turns a Showdown entry (a move, ability, item or condition) into blocks.
//
// A hook's body is cut into statements. A statement becomes a named block only
// when that block compiles back to the same code, which the translator checks
// each time. Anything else stays in a "Showdown code" block at the same place,
// so a template never changes what the entry does. Data fields (a 30% burn, a
// drain) become Move effect blocks. What no block can hold (hook priorities, a
// move's lingering condition) goes back as hand-written code.
//
// Nothing here runs the code: functions are only read as text.

export type EntryKind = 'move' | 'ability' | 'item' | 'condition';

export interface HookContext { selfVar: string; foeVar: string; moveVar: string | null }

/** What ability-blocks.ts lends this module, so the check uses the real compilers. */
export interface BlockCompiler {
    action(name: string, ctx: any, params: Record<string, any>): string[];
    condition(name: string, ctx: any, params: Record<string, any>): string;
    trigger(key: string, params: Record<string, any>): (HookContext & { header: string; preamble?: string }) | null;
    /** the block value for a Showdown weather, terrain or status id, or null */
    conditionValue(kind: 'status' | 'weather' | 'terrain', sdId: string): string | null;
    isVolatile(id: string): boolean;
    isFlag(id: string): boolean;
}

export interface Translation {
    blocks: { version: number; triggers: any[]; loose: any[] };
    /** fields no block holds, ready for the Code tab */
    rawCode: string;
    /** fields the move editor holds itself */
    moveFields: { multihit?: number | number[]; multihitStyle?: 'rising'; multiaccuracy?: boolean; target?: string };
    /** named blocks, and statements kept as Showdown code */
    stats: { blocks: number; code: number };
}

// ==================== reading source text ====================

/** The index just past the string, template or comment at i, or i when there is none. */
function skipQuoted(src: string, i: number): number {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
        for (let j = i + 1; j < src.length; j++) {
            if (src[j] === '\\') { j++; continue; }
            if (src[j] === ch) return j + 1;
        }
        throw new Error('open string');
    }
    if (ch === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); return e < 0 ? src.length : e + 1; }
    if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); if (e < 0) throw new Error('open comment'); return e + 2; }
    return i;
}

/** The index just past the bracket that closes the one at `open`. */
function closeOf(src: string, open: number): number {
    let depth = 0;
    for (let i = open; i < src.length;) {
        const past = skipQuoted(src, i);
        if (past !== i) { i = past; continue; }
        const ch = src[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') { depth--; if (!depth) return i + 1; }
        i++;
    }
    throw new Error('open bracket');
}

export interface Hook { args: string[]; body: string }

/** The arguments and body of a function's source. Null for a shape this does not read. */
export function readFunction(source: string): Hook | null {
    try {
        const text = source.trim();
        const open = text.indexOf('(');
        if (open < 0 || !/^(async\s+)?(function\s*\*?\s*)?[\w$]*\s*$/.test(text.slice(0, open))) return null;
        const closed = closeOf(text, open);
        const args = text.slice(open + 1, closed - 1).split(',').map(a => a.trim()).filter(Boolean);
        if (args.some(a => !/^[\w$]+$/.test(a))) return null;
        const start = text.indexOf('{', closed);
        if (start < 0 || text.slice(closed, start).trim()) return null;
        if (closeOf(text, start) !== text.length) return null;
        return { args, body: text.slice(start + 1, -1) };
    } catch { return null; }
}

export type Statement =
    | { kind: 'if'; test: string; then: Statement[]; else: Statement[] }
    | { kind: 'code'; text: string };

const WORD_AT = (src: string, i: number, word: string) =>
    src.startsWith(word, i) && !/[\w$]/.test(src[i + word.length] || '') && !/[\w$.]/.test(src[i - 1] || '');

function skipSpace(src: string, i: number): number {
    for (;;) {
        while (i < src.length && /\s/.test(src[i])) i++;
        if (src[i] === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipQuoted(src, i); continue; }
        return i;
    }
}

/** Reads one statement at i. Returns it and the index just past it. */
function readStatement(src: string, i: number): [Statement | null, number] {
    i = skipSpace(src, i);
    if (i >= src.length) return [null, i];
    if (src[i] === ';') return [null, i + 1];
    if (WORD_AT(src, i, 'if')) {
        const open = skipSpace(src, i + 2);
        const closed = closeOf(src, open);
        const test = src.slice(open + 1, closed - 1).trim();
        const [then, afterThen] = readBranch(src, closed);
        const next = skipSpace(src, afterThen);
        if (WORD_AT(src, next, 'else')) {
            const [other, afterElse] = readBranch(src, next + 4);
            return [{ kind: 'if', test, then, else: other }, afterElse];
        }
        return [{ kind: 'if', test, then, else: [] }, afterThen];
    }
    const start = i;
    // a statement that ends at its closing brace: for, while, switch, try and the like
    const headed = /^(for|while|switch|try|do)\b/.exec(src.slice(i, i + 8));
    for (let depthEnd = i; depthEnd < src.length;) {
        const past = skipQuoted(src, depthEnd);
        if (past !== depthEnd) { depthEnd = past; continue; }
        const ch = src[depthEnd];
        if (ch === '(' || ch === '[' || ch === '{') {
            depthEnd = closeOf(src, depthEnd);
            if (headed && ch === '{') {
                const next = skipSpace(src, depthEnd);
                if (WORD_AT(src, next, 'catch') || WORD_AT(src, next, 'finally') || WORD_AT(src, next, 'while')) { depthEnd = next; continue; }
                return [{ kind: 'code', text: src.slice(start, depthEnd).trim() }, depthEnd];
            }
            continue;
        }
        if (ch === ';') return [{ kind: 'code', text: src.slice(start, depthEnd).trim() }, depthEnd + 1];
        if (ch === '}') throw new Error('stray brace');
        depthEnd++;
    }
    return [{ kind: 'code', text: src.slice(start).trim() }, src.length];
}

function readBranch(src: string, i: number): [Statement[], number] {
    const at = skipSpace(src, i);
    if (src[at] === '{') {
        const closed = closeOf(src, at);
        return [parseStatements(src.slice(at + 1, closed - 1)), closed];
    }
    const [one, after] = readStatement(src, at);
    return [one ? [one] : [], after];
}

/** Cuts a function body into statements. Throws on text it cannot balance. */
export function parseStatements(src: string): Statement[] {
    const out: Statement[] = [];
    let i = 0;
    while (i < src.length) {
        const [statement, next] = readStatement(src, i);
        if (statement) out.push(statement);
        if (next <= i) throw new Error('no progress');
        i = next;
    }
    return out;
}

/** Splits `a && b && c` at its top level. */
export function splitAnd(test: string): string[] {
    const parts: string[] = [];
    let last = 0;
    for (let i = 0; i < test.length;) {
        const past = skipQuoted(test, i);
        if (past !== i) { i = past; continue; }
        const ch = test[i];
        if (ch === '(' || ch === '[' || ch === '{') { i = closeOf(test, i); continue; }
        // a mixed test keeps its meaning only as one piece
        if (ch === '|' && test[i + 1] === '|') return [test.trim()];
        if (ch === '?') return [test.trim()];
        if (ch === '&' && test[i + 1] === '&') { parts.push(test.slice(last, i).trim()); i += 2; last = i; continue; }
        i++;
    }
    parts.push(test.slice(last).trim());
    return parts;
}

/** Replaces whole identifiers outside strings. A property name after a dot stays. */
export function renameIdentifiers(src: string, map: Record<string, string>): string {
    let out = '';
    for (let i = 0; i < src.length;) {
        const past = skipQuoted(src, i);
        if (past !== i) { out += src.slice(i, past); i = past; continue; }
        if (/[A-Za-z_$]/.test(src[i])) {
            let j = i + 1;
            while (j < src.length && /[\w$]/.test(src[j])) j++;
            const word = src.slice(i, j);
            const isProperty = /\.\s*$/.test(src.slice(Math.max(0, i - 4), i));
            out += !isProperty && Object.hasOwn(map, word) ? map[word] : word;
            i = j;
            continue;
        }
        out += src[i++];
    }
    return out;
}

/** Two pieces of code are the same if they differ only in spacing, quote style and a final semicolon. */
export function sameCode(a: string, b: string): boolean {
    const norm = (s: string) => s.replace(/'/g, '"').replace(/\s+/g, '').replace(/;+$/g, '').replace(/,\)/g, ')');
    const bare = (s: string) => { const n = norm(s); return n.startsWith('(') && closeOf(n, 0) === n.length ? n.slice(1, -1) : n; };
    return bare(a) === bare(b);
}

const newBlockId = (() => { let n = 0; return () => `blk_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`; })();

// ==================== move data <-> Move effect blocks ====================
// Each Move effect block stands for a data field of the Showdown move. This
// table is the one place that says which, for the export and for the battle.

/** Merges a program's Move effect blocks into a move's data fields. */
export function moveDataFields(blocks: any): Record<string, any> {
    const out: Record<string, any> = {};
    const secondaries: any[] = [];
    const events = Array.isArray(blocks?.triggers) ? blocks.triggers : [];
    for (const ev of events) {
        if (ev?.trigger !== 'moveData') continue;
        for (const b of ev.body || []) {
            const p = b?.params || {};
            const n = (v: any, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
            const statPatch = { [String(p.stat || 'atk')]: n(p.stages, 1) };
            switch (b?.action) {
                case 'moveStatus': out.status = String(p.status || 'brn'); break;
                case 'moveVolatile': out.volatileStatus = String(p.volatile || ''); break;
                case 'moveBoost': out.boosts = { ...out.boosts, ...statPatch }; break;
                case 'moveSelfBoost': out.self = { ...out.self, boosts: { ...out.self?.boosts, ...statPatch } }; break;
                case 'moveDrain': out.drain = [n(p.num, 1), n(p.den, 2)]; break;
                case 'moveRecoil': out.recoil = [n(p.num, 1), n(p.den, 3)]; break;
                case 'moveHeal': out.heal = [n(p.num, 1), n(p.den, 2)]; break;
                case 'moveCritRatio': out.critRatio = n(p.ratio, 2); break;
                case 'moveWeather': out.weather = String(p.id || ''); break;
                case 'moveTerrain': out.terrain = String(p.id || ''); break;
                case 'moveSideCondition': out.sideCondition = String(p.id || ''); break;
                case 'moveSwitchUser': out.selfSwitch = true; break;
                case 'moveForceSwitch': out.forceSwitch = true; break;
                case 'moveChanceStatus': secondaries.push({ chance: n(p.chance, 10), status: String(p.status || 'brn') }); break;
                case 'moveChanceVolatile': secondaries.push({ chance: n(p.chance, 10), volatileStatus: String(p.volatile || 'flinch') }); break;
                case 'moveChanceBoost': secondaries.push(p.target === 'self'
                    ? { chance: n(p.chance, 10), self: { boosts: statPatch } }
                    : { chance: n(p.chance, 10), boosts: statPatch }); break;
                case 'moveDataRaw': {
                    if (!/^[A-Za-z_$][\w$]*$/.test(String(p.field || ''))) break;
                    try {
                        const value = JSON.parse(String(p.value ?? 'null'));
                        if (p.field === 'secondary') secondaries.push(value);
                        else if (p.field === 'secondaries' && Array.isArray(value)) secondaries.push(...value);
                        else out[p.field] = value;
                    } catch { /* a value that is not JSON is left out; the editor shows it as typed */ }
                    break;
                }
            }
        }
    }
    if (secondaries.length === 1) out.secondary = secondaries[0];
    else if (secondaries.length > 1) out.secondaries = secondaries;
    return out;
}

/** The Showdown lines for a program's Move effect blocks. */
export function moveDataLines(blocks: any): string[] {
    return Object.entries(moveDataFields(blocks)).map(([k, v]) => `\t\t${k}: ${JSON.stringify(v)},`);
}

const STAT_IDS = new Set(['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']);
const action = (name: string, params: Record<string, any>) => ({ id: newBlockId(), kind: 'action', action: name, params });

const oneBoost = (boosts: any): [string, number] | null => {
    const keys = Object.keys(boosts || {});
    return keys.length === 1 && STAT_IDS.has(keys[0]) ? [keys[0], boosts[keys[0]]] : null;
};

function secondaryBlock(s: any, statusValue: (id: string) => string | null, isVolatile: (id: string) => boolean): any | null {
    const keys = Object.keys(s).filter(k => k !== 'chance').join();
    const chance = s.chance ?? 100;
    if (keys === 'status' && statusValue(s.status)) return action('moveChanceStatus', { chance, status: statusValue(s.status) });
    if (keys === 'volatileStatus' && isVolatile(s.volatileStatus)) return action('moveChanceVolatile', { chance, volatile: s.volatileStatus });
    if (keys === 'boosts' && oneBoost(s.boosts)) { const [stat, stages] = oneBoost(s.boosts)!; return action('moveChanceBoost', { chance, stat, stages, target: 'foe' }); }
    if (keys === 'self' && Object.keys(s.self || {}).join() === 'boosts' && oneBoost(s.self.boosts)) { const [stat, stages] = oneBoost(s.self.boosts)!; return action('moveChanceBoost', { chance, stat, stages, target: 'self' }); }
    return null;
}

// Fields that say what the entry is, not what it does, or that the editor already holds.
const META = new Set([
    'num', 'name', 'desc', 'shortDesc', 'type', 'category', 'basePower', 'accuracy', 'pp', 'priority', 'flags', 'contestType',
    'zMove', 'maxMove', 'isNonstandard', 'isMax', 'isZ', 'tags', 'rating', 'spritenum', 'gen', 'itemUser', 'megaStone',
    'forcedForme', 'zMoveType', 'zMoveFrom', 'isPokeball', 'effectType', 'noCopy', 'realMove', 'id', 'fullname',
    'exists', 'kind', 'color', 'duration', 'target', 'multihit', 'multiaccuracy'
]);

const isJsonSafe = (v: any): boolean => {
    if (typeof v === 'function' || v === undefined) return false;
    if (v && typeof v === 'object') return Object.values(v).every(isJsonSafe);
    return true;
};

export const holdsFunction = (v: any): boolean => !!v && typeof v === 'object' && Object.values(v).some(x => typeof x === 'function' || holdsFunction(x));

/** A value as object-literal source. Functions keep their own text. */
export function toSource(key: string, value: any): string {
    const name = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
    if (typeof value === 'function') {
        const text = String(value);
        return text.startsWith(`${key}(`) || text.startsWith(`async ${key}(`) ? text : `${name}: ${text}`;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return `${name}: {\n${Object.entries(value).map(([k, v]) => toSource(k, v)).join(',\n')}\n}`;
    }
    return `${name}: ${JSON.stringify(value)}`;
}

// ==================== hooks -> events ====================

const STAT_HOOKS: Record<string, string> = { onModifyAtk: 'atk', onModifyDef: 'def', onModifySpA: 'spa', onModifySpD: 'spd', onModifySpe: 'spe' };
const COMMON_HOOKS: Record<string, string> = { onBasePower: 'movePower', onModifyMove: 'moveChange' };

/** The named event for a hook, or null for the plain "Showdown hook" event. */
function eventFor(hook: string, kind: EntryKind): { trigger: string; params: Record<string, any> } | null {
    if (STAT_HOOKS[hook] && kind !== 'move') return { trigger: 'statModify', params: { stat: STAT_HOOKS[hook] } };
    if (kind === 'move') {
        if (hook === 'onHit') return { trigger: 'moveHit', params: {} };
        if (hook === 'onAfterMove') return { trigger: 'moveUsed', params: {} };
    } else if (kind === 'condition') {
        const named: Record<string, string> = { onStart: 'condStart', onFieldStart: 'condStart', onEnd: 'condEnd', onFieldEnd: 'condEnd', onResidual: 'condEachTurn', onBeforeMove: 'condBeforeMove' };
        if (named[hook]) return { trigger: named[hook], params: {} };
        return null;
    } else {
        const named: Record<string, string> = { onStart: 'switchIn', onSwitchOut: 'switchOut', onResidual: 'residual', onFaint: 'onFaint', onBeforeMove: 'beforeMove', onDamagingHit: 'damagingHit', onAfterSetStatus: 'onStatus', onTryHit: 'moveIncoming', onBeforeTurn: 'turnStart', onAfterMove: 'afterMove' };
        if (named[hook]) return { trigger: named[hook], params: {} };
        if (hook === 'onModifyDamage') return { trigger: 'damageModify', params: { direction: 'dealing' } };
        if (hook === 'onSourceModifyDamage') return { trigger: 'damageModify', params: { direction: 'receiving' } };
    }
    if (COMMON_HOOKS[hook]) return { trigger: COMMON_HOOKS[hook], params: {} };
    return null;
}

const headerArgs = (header: string) => {
    const m = /^[\w$]+\(([^)]*)\)/.exec(header);
    return m ? m[1].split(',').map(a => a.trim()).filter(Boolean) : null;
};

// ==================== statements -> blocks ====================

interface Ctx extends HookContext {
    compiler: BlockCompiler;
    trigger: string;
    /** a hook where this.heal(x) with no target heals the entry's holder, the event's self */
    holderIsSelf: boolean;
}

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Takes the shared indent off the lines after the first. A function's text keeps its old position otherwise. */
function dedent(text: string): string {
    const lines = text.split('\n');
    if (lines.length < 2) return text;
    const rest = lines.slice(1).filter(l => l.trim());
    const pad = Math.min(...rest.map(l => /^[ \t]*/.exec(l)![0].length));
    // a closing brace lines up with the first line
    return [lines[0], ...lines.slice(1).map(l => l.slice(Math.min(pad, /^[ \t]*/.exec(l)![0].length)))].join('\n');
}

/** Tries one block. It only counts when the block compiles back to `expected`. */
function verified(c: Ctx, name: string, params: Record<string, any>, expected: string) {
    const lines = c.compiler.action(name, c, params);
    return lines.length && sameCode(lines.join(' '), expected) ? action(name, params) : null;
}

function who(c: Ctx, id: string | undefined): 'self' | 'foe' | null {
    if (id === c.selfVar) return 'self';
    if (id === c.foeVar) return 'foe';
    return null;
}

function recognizeAction(text: string, c: Ctx): any | null {
    const t = flat(text).replace(/;$/, '');
    const self = c.selfVar;
    let m: RegExpExecArray | null;

    // ---- stat stages
    if ((m = /^this\.boost\(\{ ?(\w+): ?(-?\d+),? ?\}(?:, ?([\w$]+))?\)$/.exec(t)) && STAT_IDS.has(m[1])) {
        const target = m[3] ? who(c, m[3]) : (c.holderIsSelf ? 'self' : null);
        if (target) return verified(c, 'boostStat', { stat: m[1], stages: Number(m[2]), target }, `this.boost({ ${m[1]}: ${m[2]} }, ${m[3] || self})`);
    }

    // ---- health, as a fraction of max HP
    if ((m = /^this\.(heal|damage)\(([\w$]+)\.baseMaxhp(?: \* (\d+))? \/ (\d+)(?:, ?([\w$]+))?(?:, ?([\w$]+))?\)$/.exec(t))) {
        const [, verb, base, num, den, to, from] = m;
        const target = who(c, base);
        const toOk = to ? to === base : c.holderIsSelf && base === self;
        const fromOk = verb === 'heal' ? !from || from === self : !from || from === self;
        if (target && toOk && fromOk) {
            const params = { num: Number(num || 1), den: Number(den), target };
            const name = verb === 'heal' ? 'healFraction' : 'damageFraction';
            const amount = `${base}.baseMaxhp${num ? ` * ${num}` : ''} / ${den}`;
            return verified(c, name, params, verb === 'heal' ? `this.heal(${amount}, ${base})` : `this.damage(${amount}, ${base}, ${self})`);
        }
    }

    // ---- status
    if ((m = /^([\w$]+)\.(?:trySetStatus|setStatus)\(["'](\w+)["'](?:, ?([\w$]+))?\)$/.exec(t))) {
        const target = who(c, m[1]);
        const value = c.compiler.conditionValue('status', m[2]);
        if (target && value && /trySetStatus/.test(t) && (!m[3] ? m[1] === self : m[3] === self)) {
            return verified(c, 'setStatus', { status: value, target }, `${m[1]}.trySetStatus("${m[2]}", ${self})`);
        }
    }
    if ((m = /^([\w$]+)\.cureStatus\(\)$/.exec(t)) && who(c, m[1])) return verified(c, 'cureStatus', { target: who(c, m[1]) }, t);

    // ---- volatile effects
    if ((m = /^([\w$]+)\.(addVolatile|removeVolatile)\(["']([\w-]+)["']\)$/.exec(t)) && who(c, m[1])) {
        if (c.compiler.isVolatile(m[3])) return verified(c, m[2], { volatile: m[3], target: who(c, m[1]) }, t);
        return verified(c, m[2] === 'addVolatile' ? 'addEffect' : 'removeEffect', { id: m[3], target: who(c, m[1]), source: 'none' }, t);
    }
    if ((m = /^([\w$]+)\.addVolatile\(["']([\w-]+)["'], ?([\w$]+)\)$/.exec(t)) && who(c, m[1]) && who(c, m[3])) {
        return verified(c, 'addEffect', { id: m[2], target: who(c, m[1]), source: who(c, m[3]) }, t);
    }

    // ---- the field
    if ((m = /^this\.field\.setWeather\(["'](\w+)["']\)$/.exec(t))) {
        const value = c.compiler.conditionValue('weather', m[1]);
        if (value) return verified(c, 'setWeather', { weather: value }, t);
    }
    if ((m = /^this\.field\.setTerrain\(["'](\w+)["']\)$/.exec(t))) {
        const value = c.compiler.conditionValue('terrain', m[1]);
        if (value) return verified(c, 'setTerrain', { terrain: value }, t);
    }

    // ---- types and the move
    if ((m = /^([\w$]+)\.setType\(["'](\w+)["']\)$/.exec(t)) && who(c, m[1])) return verified(c, 'changeType', { target: who(c, m[1]), type: m[2] }, t);
    if ((m = /^([\w$]+)\.type = ["'](\w+)["']$/.exec(t)) && m[1] === c.moveVar) return verified(c, 'setMoveType', { type: m[2] }, t);
    if ((m = /^([\w$]+)\.basePower = (\d+)$/.exec(t)) && m[1] === c.moveVar) return verified(c, 'setMovePower', { power: Number(m[2]) }, t);
    if ((m = /^([\w$]+)\.accuracy = true$/.exec(t)) && m[1] === c.moveVar) return verified(c, 'moveNeverMisses', {}, t);
    if ((m = /^([\w$]+)\.(\w+) = (-?\d+(?:\.\d+)?|true|false|["'][\w-]+["'])$/.exec(t)) && m[1] === c.moveVar) {
        return verified(c, 'setMoveField', { field: m[2], value: m[3] }, t);
    }

    // ---- the answer a hook gives
    if ((m = /^return this\.chainModify\((\d+(?:\.\d+)?)\)$/.exec(t))) return verified(c, 'chainModify', { num: Number(m[1]), den: 1, answer: 'yes' }, t);
    if ((m = /^return this\.chainModify\(\[(\d+), ?(\d+)\]\)$/.exec(t))) return verified(c, 'chainModify', { num: Number(m[1]), den: Number(m[2]), answer: 'yes' }, t);
    if ((m = /^this\.chainModify\((\d+(?:\.\d+)?)\)$/.exec(t))) return verified(c, 'chainModify', { num: Number(m[1]), den: 1, answer: 'no' }, t);
    if ((m = /^this\.chainModify\(\[(\d+), ?(\d+)\]\)$/.exec(t))) return verified(c, 'chainModify', { num: Number(m[1]), den: Number(m[2]), answer: 'no' }, t);
    if (t === 'return null' && c.trigger === 'moveIncoming') return verified(c, 'absorbMove', {}, t);
    if ((m = /^return( (null|false|true))?$/.exec(t))) return verified(c, 'stopEffect', { answer: m[2] ?? 'nothing' }, t);
    if ((m = /^return this\.NOT_FAIL$/.exec(t))) return verified(c, 'stopEffect', { answer: 'NOT_FAIL' }, t);

    // ---- messages
    if ((m = /^this\.add\((.*)\)$/.exec(t))) return verified(c, 'battleLog', { args: m[1] }, t);
    if ((m = /^this\.hint\((.*)\)$/.exec(t))) return verified(c, 'battleHint', { args: m[1] }, t);
    if ((m = /^this\.attrLastMove\((.*)\)$/.exec(t))) return verified(c, 'battleAttr', { args: m[1] }, t);

    // ---- a power answer
    if ((m = /^return ([\w$]+)\.basePower(?: \* (\d+(?:\.\d+)?))?$/.exec(t)) && m[1] === c.moveVar) return verified(c, 'answerMovePower', { factor: Number(m[2] || 1) }, t);
    if ((m = /^return (\d+) \* ([\w$]+)\.hit$/.exec(t)) && m[2] === c.moveVar) return verified(c, 'answerRisingPower', { base: Number(m[1]) }, t);
    if ((m = /^return (\d+)$/.exec(t))) return verified(c, 'answerNumber', { value: Number(m[1]) }, t);

    // ---- common Pokémon actions
    if ((m = /^([\w$]+)\.(clearBoosts|useItem|eatItem|takeItem|faint|forceSwitch)\(\)$/.exec(t)) && who(c, m[1])) {
        return verified(c, 'pokemonAct', { target: who(c, m[1]), verb: m[2] }, t);
    }
    if ((m = /^this\.effectState\.(\w+) = (true|false|-?\d+)$/.exec(t))) return verified(c, 'setEffectMemory', { field: m[1], value: m[2] }, t);
    return null;
}

function recognizeCondition(test: string, c: Ctx): { condition: string; condParams: Record<string, any> } | null {
    const t = flat(test);
    const tryIt = (condition: string, condParams: Record<string, any>) =>
        sameCode(c.compiler.condition(condition, c, condParams), t) ? { condition, condParams } : null;
    let m: RegExpExecArray | null;

    if ((m = /^([\w$]+)\.hp (<=|<|>=|>) ([\w$]+)\.maxhp \/ (\d+)$/.exec(t)) && m[1] === m[3] && who(c, m[1])) {
        return tryIt('hpFraction', { target: who(c, m[1]), op: m[2], den: Number(m[4]) });
    }
    if ((m = /^this\.randomChance\((\d+), ?(\d+)\)$/.exec(t))) {
        if (m[2] === '100') { const hit = tryIt('randomChance', { value: Number(m[1]) }); if (hit) return hit; }
        return tryIt('randomFraction', { num: Number(m[1]), den: Number(m[2]) });
    }
    if ((m = /^([\w$]+)\.type === ["'](\w+)["']$/.exec(t)) && m[1] === c.moveVar) return tryIt('moveTypeIs', { type: m[2] });
    if ((m = /^([\w$]+)\.category === ["'](\w+)["']$/.exec(t)) && m[1] === c.moveVar) return tryIt('moveCategoryIs', { category: m[2] });
    if ((m = /^([\w$]+)\.category !== ["']Status["']$/.exec(t)) && m[1] === c.moveVar) return tryIt('moveIsDamaging', {});
    if ((m = /^([\w$]+)\.flags\[["'](\w+)["']\]$/.exec(t)) && m[1] === c.moveVar && c.compiler.isFlag(m[2])) return tryIt('moveHasFlag', { flag: m[2] });
    if ((m = /^([\w$]+)\.id === ["'](\w+)["']$/.exec(t)) && m[1] === c.moveVar) return tryIt('moveNameIs', { value: m[2] });
    if ((m = /^([\w$]+)\.basePower (<=|>=) (\d+)$/.exec(t)) && m[1] === c.moveVar) return tryIt(m[2] === '<=' ? 'movePowerAtMost' : 'movePowerAtLeast', { value: Number(m[3]) });
    if ((m = /^([\w$]+)\.status === ["'](\w+)["']$/.exec(t))) {
        const value = c.compiler.conditionValue('status', m[2]);
        if (value && m[1] === c.selfVar) return tryIt('hasStatus', { status: value });
        if (value && m[1] === c.foeVar) return tryIt('targetHasStatus', { status: value });
    }
    if ((m = /^!([\w$]+)\.status$/.exec(t))) {
        if (m[1] === c.selfVar) return tryIt('hasStatus', { status: 'none' });
        if (m[1] === c.foeVar) return tryIt('targetHasStatus', { status: 'none' });
    }
    if ((m = /^this\.field\.isWeather\(["'](\w+)["']\)$/.exec(t))) {
        const value = c.compiler.conditionValue('weather', m[1]);
        if (value) return tryIt('weatherIs', { weather: value });
    }
    if ((m = /^this\.field\.isTerrain\(["'](\w+)["']\)$/.exec(t))) {
        const value = c.compiler.conditionValue('terrain', m[1]);
        if (value) return tryIt('terrainIs', { terrain: value });
    }
    if ((m = /^([\w$]+)\.hasType\(["'](\w+)["']\)$/.exec(t)) && who(c, m[1])) return tryIt('isType', { target: who(c, m[1]), type: m[2] });
    if ((m = /^([\w$]+)\.hasAbility\(["'](\w+)["']\)$/.exec(t)) && who(c, m[1])) return tryIt('hasAbility', { target: who(c, m[1]), ability: m[2] });
    if ((m = /^([\w$]+)\.hasItem\(["'](\w+)["']\)$/.exec(t)) && who(c, m[1])) return tryIt('hasItem', { target: who(c, m[1]), item: m[2] });
    if ((m = /^([\w$]+)\.volatiles\[["'](\w+)["']\]$/.exec(t)) && who(c, m[1])) return tryIt('hasVolatileEffect', { target: who(c, m[1]), id: m[2] });
    if ((m = /^!([\w$]+)\.volatiles\[["'](\w+)["']\]$/.exec(t)) && who(c, m[1])) return tryIt('lacksVolatileEffect', { target: who(c, m[1]), id: m[2] });
    if ((m = /^([\w$]+) !== ([\w$]+)$/.exec(t)) && who(c, m[1]) && who(c, m[2]) && who(c, m[1]) !== who(c, m[2])) return tryIt('targetsAnother', { left: who(c, m[1]) });
    if ((m = /^([\w$]+) === ([\w$]+)$/.exec(t)) && who(c, m[1]) && who(c, m[2]) && who(c, m[1]) !== who(c, m[2])) return tryIt('targetsItself', { left: who(c, m[1]) });
    if ((m = /^([\w$]+)\.fainted$/.exec(t)) && m[1] === c.foeVar) return tryIt('targetIsFainted', {});
    if ((m = /^([\w$]+)\.(isActive|fainted|isGrounded\(\)|hurtThisTurn|hp|status|terastallized|transformed|useItem\(\)|eatItem\(\))$/.exec(t)) && who(c, m[1])) return tryIt('pokemonIs', { target: who(c, m[1]), what: m[2] });
    if ((m = /^!([\w$]+)\.(isActive|fainted|isGrounded\(\)|hurtThisTurn|hp|status|terastallized|transformed|useItem\(\)|eatItem\(\))$/.exec(t)) && who(c, m[1])) return tryIt('pokemonIsNot', { target: who(c, m[1]), what: m[2] });
    if ((m = /^([\w$]+)\.getMoveHitData\(([\w$]+)\)\.typeMod (>|<) 0$/.exec(t)) && who(c, m[1]) && m[2] === c.moveVar) return tryIt(m[3] === '>' ? 'moveSuperEffective' : 'moveResisted', { target: who(c, m[1]) });
    if ((m = /^this\.checkMoveMakesContact\(([\w$]+), ?([\w$]+), ?([\w$]+)\)$/.exec(t)) && m[1] === c.moveVar && who(c, m[2]) && who(c, m[3])) return tryIt('moveContactCheck', { attacker: who(c, m[2]), defender: who(c, m[3]) });
    return null;
}

interface Tally { blocks: number; code: number }

function statementsToBlocks(list: Statement[], c: Ctx, tally: Tally): any[] {
    const out: any[] = [];
    const pushCode = (raw: string) => {
        const text = dedent(raw);
        tally.code++;
        const last = out[out.length - 1];
        if (last?.action === 'showdownCode') last.params.code += `\n${text}`;
        else out.push(action('showdownCode', { code: text }));
    };
    for (const s of list) {
        if (s.kind === 'code') {
            // only writes to Showdown's debug log, so nothing is lost
            if (/^this\.debug\(/.test(s.text)) continue;
            const block = recognizeAction(s.text, c);
            if (block) { out.push(block); tally.blocks++; } else pushCode(s.text.endsWith(';') || s.text.endsWith('}') ? s.text : `${s.text};`);
            continue;
        }
        // `if (a && b) x` reads better as one block inside another; an else needs the whole test
        const parts = s.else.length ? [s.test] : splitAnd(s.test);
        const thenBlocks = statementsToBlocks(s.then, c, tally);
        const elseBlocks = statementsToBlocks(s.else, c, tally);
        let inner: any[] = thenBlocks;
        for (let i = parts.length - 1; i >= 0; i--) {
            const known = recognizeCondition(parts[i], c);
            if (known) tally.blocks++; else tally.code++;
            const cond = known || { condition: 'codeCondition', condParams: { code: flat(parts[i]) } };
            inner = [{ id: newBlockId(), kind: 'if', ...cond, then: inner, else: i === parts.length - 1 && parts.length === 1 ? elseBlocks : [] }];
        }
        out.push(inner[0]);
    }
    return out;
}

// ==================== the whole entry ====================

function placeEvents(events: any[]) {
    const columns = [24, 24];
    events.forEach(ev => {
        const count = (list: any[]): number => list.reduce((n, b) => n + 1 + count(b.then || []) + count(b.else || []), 0);
        const col = columns[1] < columns[0] ? 1 : 0;
        ev.pos = { x: 24 + col * 400, y: columns[col] };
        columns[col] += 110 + 58 * count(ev.body);
    });
}

function hookEvent(hook: string, fn: Function, kind: EntryKind, compiler: BlockCompiler, tally: Tally): any | null {
    const read = readFunction(String(fn));
    if (!read) return null;
    let statements: Statement[];
    try { statements = parseStatements(read.body); } catch { return null; }

    const named = eventFor(hook, kind);
    if (named) {
        const t = compiler.trigger(named.trigger, named.params);
        const want = t && headerArgs(t.header);
        // the event must write the same hook, and nothing extra in its header
        const single = t && !t.header.includes('\n') && t.header.startsWith(`${hook}(`);
        const declares = (name: string) => new RegExp(`\\b(const|let|var)\\s+${name}\\b|\\bfor\\s*\\(\\s*(const|let)\\s+${name}\\b`).test(read.body);
        const fits = t && want && single && read.args.length <= want.length
            && !want.some((w, i) => read.args[i] !== w && declares(w))
            // a name the event defines for itself, like foe, must be free in this code
            && !(t.preamble && /\bconst foe\b/.test(t.preamble) && /\bfoe\b/.test(read.body));
        if (fits) {
            const map: Record<string, string> = {};
            read.args.forEach((a, i) => { if (a !== want![i]) map[a] = want![i]; });
            const renamed = Object.keys(map).length ? renameStatements(statements, map) : statements;
            const ctx: Ctx = { selfVar: t!.selfVar, foeVar: t!.foeVar, moveVar: t!.moveVar, compiler, trigger: named.trigger, holderIsSelf: kind !== 'move' };
            return { id: newBlockId(), kind: 'event', trigger: named.trigger, triggerParams: named.params, body: statementsToBlocks(renamed, ctx, tally) };
        }
    }
    const params = { hook, args: read.args.join(', ') };
    const t = compiler.trigger('sdHook', params);
    if (!t) return null;
    const ctx: Ctx = { selfVar: t.selfVar, foeVar: t.foeVar, moveVar: t.moveVar, compiler, trigger: 'sdHook', holderIsSelf: false };
    return { id: newBlockId(), kind: 'event', trigger: 'sdHook', triggerParams: params, body: statementsToBlocks(statements, ctx, tally) };
}

function renameStatements(list: Statement[], map: Record<string, string>): Statement[] {
    return list.map(s => s.kind === 'code'
        ? { kind: 'code', text: renameIdentifiers(s.text, map) }
        : { kind: 'if', test: renameIdentifiers(s.test, map), then: renameStatements(s.then, map), else: renameStatements(s.else, map) });
}

function moveFieldBlocks(entry: any, compiler: BlockCompiler, leftovers: string[]): { blocks: any[] } {
    const statusValue = (id: string) => compiler.conditionValue('status', id);
    const blocks: any[] = [];
    const raw = (field: string, value: any) => {
        if (isJsonSafe(value)) blocks.push(action('moveDataRaw', { field, value: JSON.stringify(value) }));
        else leftovers.push(toSource(field, value));
    };
    for (const [key, value] of Object.entries<any>(entry)) {
        if (META.has(key) || typeof value === 'function' || value == null) continue;
        switch (key) {
            case 'status': if (statusValue(value)) blocks.push(action('moveStatus', { status: statusValue(value) })); else raw(key, value); break;
            case 'volatileStatus': blocks.push(action('moveVolatile', { volatile: value })); break;
            case 'boosts':
                if (Object.keys(value).every(k => STAT_IDS.has(k))) Object.entries<any>(value).forEach(([stat, stages]) => blocks.push(action('moveBoost', { stat, stages })));
                else raw(key, value);
                break;
            case 'self':
                if (Object.keys(value).join() === 'boosts') Object.entries<any>(value.boosts).forEach(([stat, stages]) => blocks.push(action('moveSelfBoost', { stat, stages })));
                else raw(key, value);
                break;
            case 'drain': blocks.push(action('moveDrain', { num: value[0], den: value[1] })); break;
            case 'recoil': blocks.push(action('moveRecoil', { num: value[0], den: value[1] })); break;
            case 'heal': blocks.push(action('moveHeal', { num: value[0], den: value[1] })); break;
            case 'critRatio': blocks.push(action('moveCritRatio', { ratio: value })); break;
            case 'weather': blocks.push(action('moveWeather', { id: value })); break;
            case 'terrain': blocks.push(action('moveTerrain', { id: value })); break;
            case 'sideCondition': blocks.push(action('moveSideCondition', { id: value })); break;
            case 'selfSwitch': if (value === true) blocks.push(action('moveSwitchUser', {})); else raw(key, value); break;
            case 'forceSwitch': if (value === true) blocks.push(action('moveForceSwitch', {})); else raw(key, value); break;
            case 'secondary':
            case 'secondaries':
                for (const s of Array.isArray(value) ? value : [value]) {
                    const block = secondaryBlock(s, statusValue, compiler.isVolatile);
                    if (block) blocks.push(block); else raw('secondary', s);
                }
                break;
            case 'condition': leftovers.push(toSource(key, value)); break;
            default: raw(key, value);
        }
    }
    return { blocks };
}

/** Translates one entry. It never throws: what it cannot read stays as code. */
export function translateEntry(entry: any, kind: EntryKind, compiler: BlockCompiler): Translation {
    const tally: Tally = { blocks: 0, code: 0 };
    const events: any[] = [];
    const leftovers: string[] = [];

    if (kind === 'move') {
        const { blocks } = moveFieldBlocks(entry, compiler, leftovers);
        if (blocks.length) {
            tally.blocks += blocks.length;
            events.push({ id: newBlockId(), kind: 'event', trigger: 'moveData', triggerParams: {}, body: blocks });
        }
    }
    // base power x hit number is the move editor's "Like Triple Axel" setting, so that field holds it
    const rising = kind === 'move' && entry?.multihit != null && typeof entry.basePowerCallback === 'function'
        && sameCode(readFunction(String(entry.basePowerCallback))?.body || '', `return ${entry.basePower} * move.hit;`)
        && /\bmove\s*\)/.test(String(entry.basePowerCallback).split('{')[0]);
    for (const [key, value] of Object.entries<any>(entry || {})) {
        if (rising && key === 'basePowerCallback') continue;
        if (typeof value === 'function') {
            const ev = hookEvent(key, value, kind, compiler, tally);
            if (ev) events.push(ev); else leftovers.push(toSource(key, value));
        } else if (kind !== 'move' && !META.has(key) && value != null) {
            leftovers.push(toSource(key, value));
        }
    }
    placeEvents(events);

    const moveFields: Translation['moveFields'] = {};
    if (kind === 'move') {
        if (rising) moveFields.multihitStyle = 'rising';
        if (entry.multihit != null) moveFields.multihit = entry.multihit;
        if (entry.multiaccuracy) moveFields.multiaccuracy = true;
        if (entry.target) moveFields.target = entry.target;
    }
    return {
        blocks: { version: 3, triggers: events, loose: [] },
        rawCode: leftovers.join(',\n'),
        moveFields,
        stats: tally
    };
}
