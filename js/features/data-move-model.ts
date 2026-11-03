// The data move from the old address (dex.woogi.xyz) to woogidex.com: the
// parts with no browser in them, so tests can run them. The page and the
// window messages are in js/features/data-move.ts.
//
// A browser keeps a site's data per address, so woogidex.com cannot read what
// dex.woogi.xyz stored. The old site sends it to a woogidex.com tab with
// postMessage. Only the collection and the settings travel. The sign-in
// session does not (you sign in again), and the message keys do not (their
// PIN backup restores them on the new site).

/** The lists that make up a collection, as js/core/storage.ts stores them. */
export const MOVE_LISTS = ['fakemonDB', 'folders', 'customMoves', 'customAbilities', 'customItems', 'battleTeams', 'customMoveFlags'] as const;
export type MoveList = typeof MOVE_LISTS[number];

export const MOVE_FORMAT = 'woogidex-move';
export const MOVE_VERSION = 1;
/** More than this is not a collection: refuse it rather than freeze the tab. */
export const MOVE_MAX_ITEMS = 50000;

export interface MovePayload {
    format: typeof MOVE_FORMAT;
    version: number;
    /** the same for every try from one browser, so a retry is not applied twice */
    id: string;
    from: string;
    createdAt: string;
    lists: Record<MoveList, any[]>;
    /** settings from localStorage, key to the stored string */
    settings: Record<string, string>;
}

/** localStorage keys that never travel: the sign-in, counters this site keeps for itself, the move's own marks. */
export function movableSetting(key: string): boolean {
    if (key.startsWith('sb-')) return false;
    if (!key.startsWith('woogidex')) return false;
    return !/^woogidex\.(sessionVisit\.|blocked$|collection\.count\.|move\.)/.test(key);
}

export function buildPayload(id: string, from: string, lists: Partial<Record<MoveList, any[]>>, storage: Record<string, string>): MovePayload {
    const settings: Record<string, string> = {};
    for (const [k, v] of Object.entries(storage)) if (movableSetting(k) && typeof v === 'string') settings[k] = v;
    const out = {} as Record<MoveList, any[]>;
    for (const name of MOVE_LISTS) out[name] = Array.isArray(lists[name]) ? lists[name]! : [];
    return { format: MOVE_FORMAT, version: MOVE_VERSION, id, from, createdAt: new Date().toISOString(), lists: out, settings };
}

/** How much a payload holds, for the screens on both sides. */
export function countPayload(p: Pick<MovePayload, 'lists'>): Record<MoveList, number> {
    const out = {} as Record<MoveList, number>;
    for (const name of MOVE_LISTS) out[name] = p.lists[name]?.length || 0;
    return out;
}

export const isEmptyPayload = (p: Pick<MovePayload, 'lists'>) => MOVE_LISTS.every(name => !p.lists[name]?.length);

/**
 * Why a payload cannot be used, or '' when it can. It came from another
 * window, so nothing about its shape is trusted.
 */
export function payloadProblem(p: any, expectedFrom: string): string {
    if (!p || typeof p !== 'object') return 'The data is not readable.';
    if (p.format !== MOVE_FORMAT) return 'The data is not a Woogidex move.';
    if (p.version !== MOVE_VERSION) return 'The data comes from another version of the move. Reload both pages, then try again.';
    if (p.from !== expectedFrom) return 'The data does not come from the old Woogidex address.';
    if (typeof p.id !== 'string' || !/^[\w-]{8,80}$/.test(p.id)) return 'The data has no valid move ID.';
    if (!p.lists || typeof p.lists !== 'object') return 'The data has no collection.';
    let total = 0;
    for (const name of MOVE_LISTS) {
        const list = p.lists[name];
        if (!Array.isArray(list)) return `The data has no "${name}" list.`;
        total += list.length;
        for (const item of list) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return `An entry in "${name}" is not readable.`;
            if (item.id == null || (typeof item.id !== 'string' && typeof item.id !== 'number')) return `An entry in "${name}" has no ID.`;
        }
    }
    if (total > MOVE_MAX_ITEMS) return 'The data is too large to be a collection.';
    if (!p.settings || typeof p.settings !== 'object') return 'The data has no settings.';
    for (const [k, v] of Object.entries(p.settings)) if (!movableSetting(k) || typeof v !== 'string') return 'The data has a setting that may not move.';
    return '';
}

export interface MergeResult {
    lists: Record<MoveList, any[]>;
    /** new here */
    added: number;
    /** already here, exactly the same: skipped */
    same: number;
    /** already here with other content: both kept, the moved one under a new ID */
    copied: number;
}

const sameContent = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Adds the moved lists to the ones here. Nothing here is overwritten or
 * removed. An item with an ID that is already here, but with other content,
 * comes in as a copy under a new ID. `newId` makes those IDs (tests pass a
 * fixed one).
 */
export function mergeLists(here: Partial<Record<MoveList, any[]>>, moved: Record<MoveList, any[]>, newId: () => string): MergeResult {
    const lists = {} as Record<MoveList, any[]>;
    let added = 0, same = 0, copied = 0;
    for (const name of MOVE_LISTS) {
        const mine = Array.isArray(here[name]) ? here[name]! : [];
        const byId = new Map(mine.map(item => [String(item?.id), item]));
        const out = [...mine];
        for (const item of moved[name] || []) {
            const existing = byId.get(String(item.id));
            if (!existing) { out.push(item); byId.set(String(item.id), item); added++; }
            else if (sameContent(existing, item)) same++;
            else { out.push({ ...item, id: newId() }); copied++; }
        }
        lists[name] = out;
    }
    return { lists, added, same, copied };
}

/** The moved settings this site does not have yet. A setting here is never replaced. */
export function newSettings(moved: Record<string, string>, here: (key: string) => string | null): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(moved)) if (movableSetting(k) && here(k) === null) out[k] = v;
    return out;
}
