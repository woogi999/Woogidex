// A custom move's multi-hit setting. The move keeps it in the fields Showdown
// uses: multihit (a number, or [min, max]) and multiaccuracy. multihitStyle
// 'rising' is ours: each hit has base power x its hit number, like Triple Axel.
// The Showdown export writes that as a basePowerCallback.

export const MULTIHIT_MAX = 10;

export type MultihitStyle = 'same' | 'rising';

export interface MultihitSetting {
    on: boolean;
    min: number;
    max: number;
    style: MultihitStyle;
    /** each hit makes its own accuracy check, and the first miss ends the move */
    everyHit: boolean;
}

const clampHits = (n: unknown, fallback: number) => {
    const v = Math.trunc(Number(n));
    return Number.isFinite(v) ? Math.min(MULTIHIT_MAX, Math.max(2, v)) : fallback;
};

/** The setting a move holds. An old move with only the Multi-hit flag reads as the usual 2 to 5. */
export function readMultihit(move: any): MultihitSetting {
    const raw = move?.multihit;
    const on = Array.isArray(raw) ? true : Number(raw) > 1 || !!move?.flags?.multihit;
    const min = clampHits(Array.isArray(raw) ? raw[0] : raw, 2);
    const max = Math.max(min, clampHits(Array.isArray(raw) ? raw[1] : raw, 5));
    return { on, min, max, style: move?.multihitStyle === 'rising' ? 'rising' : 'same', everyHit: !!move?.multiaccuracy };
}

/** What a move stores. Every key is always there, so a save clears what it turned off. */
export function multihitFields(setting: Partial<MultihitSetting> | null | undefined, category: string) {
    if (!setting?.on || category === 'Status') return { multihit: undefined, multihitStyle: undefined, multiaccuracy: undefined };
    const min = clampHits(setting.min, 2);
    const max = Math.max(min, clampHits(setting.max, min));
    return {
        multihit: min === max ? min : [min, max],
        multihitStyle: setting.style === 'rising' ? 'rising' as const : undefined,
        multiaccuracy: setting.everyHit ? true : undefined
    };
}

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
    const steps = Array.from({ length: setting.max }, (_, i) => bp * (i + 1));
    const shown = steps.length > 4 ? `${steps.slice(0, 3).join(', ')} ... ${steps[steps.length - 1]}` : steps.join(', ');
    return `${count}${odds} Power by hit: ${shown}.${miss}`;
}

/** The hit count for a damage estimate, and how much base power it is worth in total. */
export function multihitPowerFactor(move: any): number {
    const s = readMultihit(move);
    if (!s.on || (move?.multihit == null)) return 1;
    const hits = s.min === 2 && s.max === 5 ? 3.1 : (s.min + s.max) / 2;
    return s.style === 'rising' ? hits * (hits + 1) / 2 : hits;
}

/** The extra part of a custom move's "BP | ACC | PP" text line. */
export function multihitText(move: any): string {
    if (move?.multihit == null) return '';
    const s = readMultihit(move);
    return ` | Hits ${hitsLabel(s)}${s.style === 'rising' ? ' | Rising power' : ''}${s.everyHit ? ' | Accuracy each hit' : ''}`;
}

/** Reads multihitText back out of a text line. Empty when the line has no hit count. */
export function parseMultihitText(line: string) {
    const m = /\bHits\s+(\d+)(?:\s*-\s*(\d+))?/i.exec(String(line || ''));
    if (!m) return {};
    return multihitFields({
        on: true, min: Number(m[1]), max: Number(m[2] || m[1]),
        style: /rising power/i.test(line) ? 'rising' : 'same',
        everyHit: /accuracy each hit/i.test(line)
    }, 'Physical');
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
        lines.push(`\t\tbasePowerCallback(pokemon, target, move) {\n\t\t\treturn ${Number(move.basePower) || 0} * move.hit;\n\t\t},`);
    }
    return lines;
}
