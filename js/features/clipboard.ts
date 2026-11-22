// My Collection's clipboard, as in File Explorer: Cut and Copy hold Fakémon,
// custom moves, abilities, items, types or conditions, and Paste puts them in
// the folder you are looking at (or the folder you pasted on). Cut moves the
// entries. Copy makes new ones named "Name - Copy" (types and conditions get
// a free name instead, because their names must be unique). It holds one
// tab's kind at a time, and it lives only in this page: nothing goes to the
// system clipboard.

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';
import { entriesOf, livesInFolders, type EntryKind } from './collection-entries.ts';

export type ClipKind = EntryKind;
type Clip = { mode: 'cut' | 'copy'; kind: ClipKind; ids: string[] };

let clip: Clip | null = null;

const newId = (kind: ClipKind) => {
    const tail = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    if (kind === 'fakemon') return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return `${({ moves: 'cm', abilities: 'ca', items: 'ci' } as Record<string, string>)[kind] || 'cx'}_${tail}`;
};

function hold(mode: Clip['mode'], kind: ClipKind, ids: string[]) {
    clip = { mode, kind, ids };
    notify();
    const what = ids.length === 1 ? '' : ` ${ids.length} entries`;
    api.showToast?.(mode === 'cut' ? `Cut${what}. Open a folder and paste.` : `Copied${what}. Open a folder and paste.`, 'info');
}

export const cutEntry = (kind: ClipKind, id: string) => hold('cut', kind, [id]);
export const copyEntry = (kind: ClipKind, id: string) => hold('copy', kind, [id]);
/** Cut or copy several entries at once (a selection). */
export const cutEntries = (kind: ClipKind, ids: string[]) => { if (ids.length) hold('cut', kind, ids); };
export const copyEntries = (kind: ClipKind, ids: string[]) => { if (ids.length) hold('copy', kind, ids); };

/** Whether an entry waits to be moved (its card shows faded, as in File Explorer). */
export const isCut = (id: string) => clip?.mode === 'cut' && clip.ids.includes(id);

/** Whether there is something to paste in this tab. */
export const canPaste = (kind: string) => !!clip && clip.kind === kind && clip.ids.some(id => entriesOf(clip!.kind).some(x => x.id === id));

/** A copy of a type or a condition, made by its own module so the name stays unique. */
function duplicateInFolders(kind: ClipKind, id: string): any {
    return kind === 'types' ? api.duplicateCustomType?.(id) : api.duplicateCondition?.(id);
}

/** Puts the clipboard's entries in `folderId` (null: outside every folder). */
export async function pasteInto(kind: string, folderId: string | null) {
    if (!clip || !canPaste(kind)) return;
    const list = entriesOf(clip.kind);
    const entries = clip.ids.map(id => list.find(x => x.id === id)).filter(Boolean);
    const now = Date.now();
    if (clip.mode === 'cut') {
        for (const x of entries) x.folderId = folderId;
        clip = null;
    } else if (livesInFolders(clip.kind)) {
        for (const x of entries) {
            const copy = duplicateInFolders(clip.kind, x.id);
            if (copy) Object.assign(copy, { folderId, pinned: false, createdAt: now, updatedAt: now });
        }
    } else {
        for (const x of entries) {
            const copy = JSON.parse(JSON.stringify(x));
            Object.assign(copy, { id: newId(kind as ClipKind), name: `${x.name || 'Unnamed'} - Copy`, folderId, pinned: false, createdAt: now, updatedAt: now });
            list.push(copy);
        }
    }
    await api.saveToStorage();
    api.renderCollection();
    notify();
    const folder = folderId ? state.folders.find((f: any) => f.id === folderId) : null;
    api.showToast?.(`Pasted ${entries.length === 1 ? `"${entries[0].name}"` : `${entries.length} entries`} in ${folder ? `"${folder.name}"` : 'My Collection'}.`, 'success');
}
