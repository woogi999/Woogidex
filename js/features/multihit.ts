// A custom move's multi-hit setting. The move keeps it in the fields Showdown
// uses: multihit (a number, or [min, max]) and multiaccuracy. multihitStyle
// 'rising' is ours: the power changes with each hit. multihitGrowth says how:
//   linear       base power x the hit number (Triple Axel: 20, 40, 60)
//   additive     base power + a step for each hit after the first (20, 30, 40)
//   exponential  base power x a factor for each hit after the first (20, 40, 80)
// multihitStep holds the step (additive) or the factor (exponential).
// The Showdown export writes the curve as a basePowerCallback.

export const MULTIHIT_MAX = 10;

export type MultihitStyle = 'same' | 'rising';
export type MultihitGrowth = 'linear' | 'additive' | 'exponential';

export interface MultihitSetting {
    on: boolean;
    min: number;
    max: number;
    style: MultihitStyle;
    growth: MultihitGrowth;
    /** the step (additive, in power) or the factor (exponential) */
    step: number;
    /** each hit makes its own accuracy check, and the first miss ends the move */
    everyHit: boolean;
}

export const GROWTHS: Array<[MultihitGrowth, string, string]> = [
    ['linear', 'Linear', 'Base power x the hit number, like Triple Axel'],
    ['additive', 'Additive', 'Adds the same power to each hit after the first'],
    ['exponential', 'Exponential', 'Multiplies the power by a factor on each hit after the first']
];
const DEFAULT_STEP: Record<MultihitGrowth, number> = { linear: 1, additive: 10, exponential: 2 };

const clampHits = (n: unknown, fallback: number) => {
    const v = Math.trunc(Number(n));
    return Number.isFinite(v) ? Math.min(MULTIHIT_MAX, Math.max(2, v)) : fallback;
};
const growthOf = (v: unknown): MultihitGrowth => (v === 'additive' || v === 'exponential' ? v : 'linear');
/** A step that fits the growth: additive 1 to 250 power, exponential a factor of 1.1 to 4. */
export function cleanStep(growth: MultihitGrowth, raw: unknown): number {
    const n = Number(raw);
    if (growth === 'additive') return Number.isFinite(n) ? Math.min(250, Math.max(1, Math.round(n))) : DEFAULT_STEP.additive;
    if (growth === 'exponential') return Number.isFinite(n) ? Math.min(4, Math.max(1.1, Math.round(n * 100) / 100)) : DEFAULT_STEP.exponential;
    return 1;
}

/** The power of hit number `hit` (1 is the first). */
export function risingPower(basePower: number, hit: number, growth: MultihitGrowth, step: number): number {
    const bp = Math.max(0, Number(basePower) || 0), h = Math.max(1, Math.trunc(hit) || 1);
    if (growth === 'additive') return bp + step * (h - 1);
    if (growth === 'exponential') return Math.floor(bp * Math.pow(step, h - 1));
    return bp * h;
}

/** The setting a move holds. An old move with only the Multi-hit flag reads as the usual 2 to 5. */
export function readMultihit(move: any): MultihitSetting {
    const raw = move?.multihit;
    const on = Array.isArray(raw) ? true : Number(raw) > 1 || !!move?.flags?.multihit;
    const min = clampHits(Array.isArray(raw) ? raw[0] : raw, 2);
    const max = Math.max(min, clampHits(Array.isArray(raw) ? raw[1] : raw, 5));
    const growth = growthOf(move?.multihitGrowth);
    return {
        on, min, max, style: move?.multihitStyle === 'rising' ? 'rising' : 'same',
        growth, step: move?.multihitStep != null ? cleanStep(growth, move.multihitStep) : DEFAULT_STEP[growth],
        everyHit: !!move?.multiaccuracy
    };
}

/** What a move stores. Every key is always there, so a save clears what it turned off. */
export function multihitFields(setting: Partial<MultihitSetting> | null | undefined, category: string) {
    if (!setting?.on || category === 'Status') return { multihit: undefined, multihitStyle: undefined, multihitGrowth: undefined, multihitStep: undefined, multiaccuracy: undefined };
    const min = clampHits(setting.min, 2);
    const max = Math.max(min, clampHits(setting.max, min));
    const rising = setting.style === 'rising';
    const growth = growthOf(setting.growth);
    return {
        multihit: min === max ? min : [min, max],
        multihitStyle: rising ? 'rising' as const : undefined,
        // linear is the default, and needs no step
        multihitGrowth: rising && growth !== 'linear' ? growth : undefined,
        multihitStep: rising && growth !== 'linear' ? cleanStep(growth, setting.step) : undefined,
        multiaccuracy: setting.everyHit ? true : undefined
    };
}

/** The growth's default step, for when the growth changes in the editor. */
export const defaultStep = (growth: MultihitGrowth) => DEFAULT_STEP[growth];

const hitsLabel = (s: MultihitSetting) => s.min === s.max ? `${s.min}` : `${s.min}-${s.max}`;

/** One sentence on what the setting does, for the editor. */
export function multihitSummary(setting: MultihitSetting, basePower: unknown): string {
    if (!setting.on) return '';
    const bp = Math.max(0, Number(basePower) || 0);
    const count = setting.min === setting.max ? `Hits ${setting.min} times.` : `Hits ${setting.min} to ${setting.max} times.`;
    const odds = setting.min === 2 && setting.max === 5 ? ' 2 or 3 hits are the most likely.' : '';
    const miss = setting.everyHit ? ' It stops at the first miss.' : '';
    if (setting.style !== 'rising') return `${count}${odds}${bp ? ` Each hit has ${bp} power.` : ''}${miss}`;
    if (!bp) return `${count}${odds} Set a base power to see the power of each hit.${miss}`;
    const step = cleanStep(setting.growth, setting.step);
    const steps = Array.from({ length: setting.max }, (_, i) => risingPower(bp, i + 1, setting.growth, step));
    const shown = steps.length > 4 ? `${steps.slice(0, 3).join(', ')} ... ${steps[steps.length - 1]}` : steps.join(', ');
    return `${count}${odds} Power by hit: ${shown}.${miss}`;
}

/** The hit count for a damage estimate, and how much base power it is worth in total. */
export function multihitPowerFactor(move: any): number {
    const s = readMultihit(move);
    if (!s.on || (move?.multihit == null)) return 1;
    const hits = s.min === 2 && s.max === 5 ? 3.1 : (s.min + s.max) / 2;
    if (s.style !== 'rising') return hits;
    const bp = Number(move?.basePower) || 0;
    if (!bp) return hits * (hits + 1) / 2;
    // the sum of the powers over the whole hits, and a share of the next for the fraction
    const whole = Math.floor(hits);
    let sum = 0;
    for (let i = 1; i <= whole; i++) sum += risingPower(bp, i, s.growth, s.step);
    sum += (hits - whole) * risingPower(bp, whole + 1, s.growth, s.step);
    return sum / bp;
}

const growthText = (s: MultihitSetting) => s.growth === 'additive' ? ` +${s.step}` : s.growth === 'exponential' ? ` x${s.step}` : '';

/** The extra part of a custom move's "BP | ACC | PP" text line. */
export function multihitText(move: any): string {
    if (move?.multihit == null) return '';
    const s = readMultihit(move);
    return ` | Hits ${hitsLabel(s)}${s.style === 'rising' ? ` | Rising power${growthText(s)}` : ''}${s.everyHit ? ' | Accuracy each hit' : ''}`;
}

/** Reads multihitText back out of a text line. Empty when the line has no hit count. */
export function parseMultihitText(line: string) {
    const m = /\bHits\s+(\d+)(?:\s*-\s*(\d+))?/i.exec(String(line || ''));
    if (!m) return {};
    const rise = /rising power(?:\s*([+x])\s*([\d.]+))?/i.exec(line);
    const growth: MultihitGrowth = rise?.[1] === '+' ? 'additive' : rise?.[1]?.toLowerCase() === 'x' ? 'exponential' : 'linear';
    return multihitFields({
        on: true, min: Number(m[1]), max: Number(m[2] || m[1]),
        style: rise ? 'rising' : 'same', growth, step: Number(rise?.[2]),
        everyHit: /accuracy each hit/i.test(line)
    }, 'Physical');
}

/** The basePowerCallback body for a rising move (Showdown counts hits in move.hit). */
function risingCallback(move: any, s: MultihitSetting): string {
    const bp = Number(move.basePower) || 0;
    if (s.growth === 'additive') return `return ${bp} + ${s.step} * (move.hit - 1);`;
    if (s.growth === 'exponential') return `return Math.floor(${bp} * Math.pow(${s.step}, move.hit - 1));`;
    return `return ${bp} * move.hit;`;
}

/** The Showdown fields of a custom move. It skips a field the move's own code already sets. */
export function showdownMultihitLines(move: any, written = ''): string[] {
    if (move?.multihit == null || move?.category === 'Status') return [];
    const s = readMultihit(move);
    const has = (word: string) => new RegExp(`\\b${word}\\b`).test(written);
    const lines: string[] = [];
    if (!has('multihit')) lines.push(`\t\tmultihit: ${s.min === s.max ? s.min : `[${s.min}, ${s.max}]`},`);
    if (s.everyHit && !has('multiaccuracy')) lines.push('\t\tmultiaccuracy: true,');
    if (s.style === 'rising' && !has('basePowerCallback')) {
        lines.push(`\t\tbasePowerCallback(pokemon, target, move) {\n\t\t\t${risingCallback(move, s)}\n\t\t},`);
    }
    return lines;
}
