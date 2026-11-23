// My Collection's selection, as in a file manager: Ctrl or Cmd + click
// adds a card, Shift + click selects a range, a drag on empty space draws a
// box, Ctrl + A selects everything, Escape clears. On a phone, a long press
// starts selecting and each tap then adds or removes a card. Cut, Copy,
// Delete, "Out of folder" and drag into a folder act on the whole selection.
// The cards and the box are in js/app/pages/CollectionPage.tsx. A selection
// holds one tab's kind, like the clipboard (js/features/clipboard.ts).

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';
import { confirmDialog } from '../core/confirm-dialog.ts';
import { entriesOf, type EntryKind } from './collection-entries.ts';
import { copyEntries, cutEntries } from './clipboard.ts';

let kind: EntryKind | null = null;
let ids = new Set<string>();
// the card a Shift + click range starts from
let anchor: string | null = null;
// phones: after a long press, a tap adds or removes instead of opening the menu
let touchMode = false;

export const selectionKind = () => kind;
export const selectedIds = () => [...ids];
export const selectionSize = () => ids.size;
export const isSelected = (id: string) => ids.has(String(id));
export const inTouchSelect = () => touchMode && ids.size > 0;

function changed() { notify(); }

/** Replaces the selection (the box, Ctrl + A). */
export function setSelection(k: EntryKind, list: string[], add = false) {
    if (!add || kind !== k) ids = new Set();
    kind = k;
    for (const id of list) ids.add(String(id));
    if (!ids.size) kind = null;
    changed();
}

export function toggleSelected(k: EntryKind, id: string) {
    if (kind !== k) { ids = new Set(); kind = k; }
    const key = String(id);
    if (ids.has(key)) ids.delete(key); else ids.add(key);
    anchor = key;
    if (!ids.size) { kind = null; touchMode = false; }
    changed();
}

/** Shift + click: every card between the last clicked one and this one, in the order on screen. */
export function selectRange(k: EntryKind, id: string, order: string[]) {
    const from = anchor && order.includes(anchor) ? order.indexOf(anchor) : order.indexOf(String(id));
    const to = order.indexOf(String(id));
    if (to < 0) return;
    const [a, b] = from <= to ? [from, to] : [to, from];
    setSelection(k, order.slice(a, b + 1), kind === k);
}

/** A long press on a phone: select this card, and let taps go on selecting. */
export function startTouchSelect(k: EntryKind, id: string) {
    touchMode = true;
    if (!isSelected(id)) toggleSelected(k, id);
    navigator.vibrate?.(15);
}

export function clearSelection() {
    if (!ids.size && !touchMode) return;
    ids = new Set(); kind = null; anchor = null; touchMode = false;
    changed();
}

/** The selected entries that still exist (one may be gone since). */
function liveIds(): string[] {
    if (!kind) return [];
    const have = new Set(entriesOf(kind).map(x => String(x.id)));
    return [...ids].filter(id => have.has(id));
}

// ---- what the selection does ----

export function cutSelection() { if (kind) cutEntries(kind, liveIds()); }
export function copySelection() { if (kind) copyEntries(kind, liveIds()); }

/** Moves every selected entry into a folder (null: out of every folder). */
export async function moveSelectionTo(folderId: string | null) {
    if (!kind) return;
    const list = liveIds();
    const set = new Set(list);
    for (const x of entriesOf(kind)) if (set.has(String(x.id))) x.folderId = folderId;
    await api.saveToStorage?.();
    api.renderCollection?.();
    const folder = folderId ? (state.folders || []).find((f: any) => f.id === folderId) : null;
    api.showToast?.(`Moved ${list.length} ${list.length === 1 ? 'entry' : 'entries'} to ${folder ? `"${folder.name}"` : 'My Collection'}.`, 'success');
    clearSelection();
}

/** Deletes every selected entry, after one question. */
export async function deleteSelection() {
    if (!kind) return;
    const k = kind;
    const list = liveIds();
    if (!list.length) return;
    const noun = list.length === 1 ? 'this entry' : `these ${list.length} entries`;
    if (!await confirmDialog({ title: `Delete ${noun}?`, message: 'This can’t be undone. Fakémon that use a deleted move, ability or item keep their copy.', confirmLabel: 'Delete', danger: true })) return;
    const gone = new Set(list);
    if (k === 'fakemon') await api.deleteFakemonMany(list);
    else {
        if (k === 'moves') state.customMoves = (state.customMoves || []).filter((x: any) => !gone.has(String(x.id)));
        else if (k === 'abilities') state.customAbilities = (state.customAbilities || []).filter((x: any) => !gone.has(String(x.id)));
        else if (k === 'items') state.customItems = (state.customItems || []).filter((x: any) => !gone.has(String(x.id)));
        else state.folders = (state.folders || []).filter((x: any) => !gone.has(String(x.id)) || !['custom-type', 'custom-condition'].includes(x.type));
        if (k === 'types') api.syncCustomTypes?.(true);
        await api.saveToStorage?.();
        api.renderCollection?.();
    }
    api.showToast?.(`Deleted ${list.length} ${list.length === 1 ? 'entry' : 'entries'}.`, 'info');
    clearSelection();
}
