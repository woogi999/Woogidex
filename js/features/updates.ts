// ==================== updates ====================
// One file per update, under public/updates/, listed newest first in
// public/updates/index.json. Adding a release means adding a markdown file
// and putting its name at the top of the index.
//
// public/updates/<slug>.md:
//
//     ---
//     version: v1.10.0
//     date: September 1, 2026
//     title: What changed
//     ---
//
//     - Something that changed.
//     - Something else, with **bold** and `code` allowed.
//
// A static host cannot list a directory, so index.json is the running order.
// The newest one opens once as "What's New" (js/features/whats-new.ts); every
// one is in the Updates dialog (js/app/dialogs/updates.tsx), from the account
// menu and /updates.
//
// Numbering: a big update bumps the middle number and resets the last
// (v1.12.0 -> v1.13.0); a small one bumps the last (v1.13.0 -> v1.13.1).

import { log } from '../core/log.ts';

export interface Update { id: string; version: string; date: string; title: string; items: string[]; }

const INDEX_URL = 'updates/index.json';

let updates: Update[] | null = null;
let loading: Promise<Update[]> | null = null;

/**
 * Splits one update file into its front matter and its bullet list.
 * @param text the file's contents
 * @param id the file name, which is also the update's identity
 */
export function parseUpdateFile(text: string, id = ''): Update {
    const source = String(text || '');
    const update: Update = { id, version: '', date: '', title: '', items: [] };
    // front matter is optional: a file without it still shows its bullets
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const body = match ? source.slice(match[0].length) : source;
    if (match) {
        for (const line of match[1].split(/\r?\n/)) {
            const at = line.indexOf(':');
            if (at === -1) continue;
            const key = line.slice(0, at).trim().toLowerCase();
            const value = line.slice(at + 1).trim();
            if (key === 'version' || key === 'date' || key === 'title') update[key] = value;
        }
    }
    for (const raw of body.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        if (/^[-*]\s+/.test(line)) update.items.push(line.replace(/^[-*]\s+/, ''));
        else if (update.items.length) update.items[update.items.length - 1] += ' ' + line; // a wrapped line goes on
    }
    return update;
}

/** Every update, newest first. Asked for once a visit; a file that cannot be read is left out. */
export function loadUpdates(): Promise<Update[]> {
    if (updates) return Promise.resolve(updates);
    if (loading) return loading;
    const ask = fetch(`${INDEX_URL}?v=${Date.now()}`, { cache: 'no-store' })
        .then(r => { if (!r.ok) throw new Error(`Could not load ${INDEX_URL} (${r.status})`); return r.json(); })
        .then(async data => {
            const names: string[] = (Array.isArray(data?.updates) ? data.updates : []).filter(Boolean).map(String);
            const files = await Promise.all(names.map(async name => {
                try {
                    const r = await fetch(`updates/${name}`, { cache: 'no-store' });
                    if (!r.ok) throw new Error(String(r.status));
                    return parseUpdateFile(await r.text(), name);
                } catch (e) {
                    log.error('UPDATES', 'Could not load an update file', { name, error: String(e) });
                    return null;
                }
            }));
            updates = files.filter((u): u is Update => !!u);
            return updates;
        })
        .finally(() => { loading = null; });
    loading = ask;
    return ask;
}

/** What is loaded so far (null before the first answer). */
export function loadedUpdates(): Update[] | null { return updates; }
