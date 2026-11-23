// The file-manager part of My Collection's listing (the rules are
// js/features/selection.ts):
//   * mouse: drag on empty space to draw a box (Ctrl or Shift adds to the
//     selection), Ctrl or Cmd + click adds or removes a card, Shift + click
//     selects a range
//   * touch: a long press selects a card, then each tap adds or removes one
//   * keys: Ctrl + A, Escape, Delete, Ctrl + X and Ctrl + C act on the selection
//   * a right-click on a selected card opens the selection's menu
//   * the bar on top shows how many are selected, with the same actions
// Cards and rows only need data-entry-kind and data-entry-id (cards.tsx).

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { state } from '../../../core/app.ts';
import { effectiveZoom } from '../../../core/ui-scale.ts';
import {
    clearSelection, copySelection, cutSelection, deleteSelection, inTouchSelect, isSelected, moveSelectionTo, selectRange,
    selectedIds, selectionKind, selectionSize, setSelection, startTouchSelect, toggleSelected
} from '../../../features/selection.ts';
import type { EntryKind } from '../../../features/collection-entries.ts';
import { openContextMenu, type MenuItem } from '../ContextMenu.tsx';
import { Icon } from '../Icon.tsx';

const ENTRY = '[data-entry-id]';
// what a drag may start on and still draw a box: not a card, a folder, a field or a button
const NOT_EMPTY = '[data-entry-id], [data-folder-id], .collection-card, .dex-row, input, textarea, select, button, a, label, .shelf-head, .selection-bar';
const LONG_PRESS_MS = 400;

const entriesIn = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>(ENTRY));
const idOf = (el: Element) => (el as HTMLElement).dataset.entryId || '';

function selectionMenu(inFolder: boolean): MenuItem[] {
    const n = selectionSize();
    return [
        { label: 'Cut', icon: 'scissors', hint: 'Ctrl+X', run: cutSelection },
        { label: 'Copy', icon: 'document-duplicate', hint: 'Ctrl+C', run: copySelection },
        ...(inFolder ? [{ label: 'Remove from folder', icon: 'folder-output', run: () => moveSelectionTo(null) } as MenuItem] : []),
        'sep',
        { label: 'Clear selection', icon: 'x', hint: 'Esc', run: clearSelection },
        'sep',
        { label: `Delete ${n}`, icon: 'trash-2', hint: 'Del', danger: true, run: deleteSelection }
    ];
}

/**
 * Wires the selection into the listing element. `view` is the tab: a new
 * tab, folder or region starts with nothing selected.
 */
export function useSelection(listing: RefObject<HTMLElement | null>, view: EntryKind) {
    const press = useRef<{ timer: any; x: number; y: number; fired: boolean } | null>(null);
    const swallowClick = useRef(false);

    // a new place starts empty
    const where = `${view}|${state.currentFolderId || ''}`;
    useEffect(() => { clearSelection(); }, [where]);

    // the selected look: kept on the elements, so cards need no prop for it
    useLayoutEffect(() => {
        const root = listing.current;
        if (!root) return;
        const on = selectionKind() === view;
        for (const el of entriesIn(root)) el.classList.toggle('is-selected', on && isSelected(idOf(el)));
        root.classList.toggle('is-selecting', on && selectionSize() > 0);
    });

    useEffect(() => {
        const root = listing.current;
        if (!root) return;

        // ---- clicks: Ctrl, Shift, and taps while selecting on a phone ----
        const onClick = (e: MouseEvent) => {
            const card = (e.target as Element).closest<HTMLElement>(ENTRY);
            if (swallowClick.current) { swallowClick.current = false; e.preventDefault(); e.stopPropagation(); return; }
            if (!card) {
                if (!(e.target as Element).closest(NOT_EMPTY)) clearSelection();
                return;
            }
            const id = idOf(card);
            if (e.ctrlKey || e.metaKey || inTouchSelect()) {
                e.preventDefault(); e.stopPropagation();
                toggleSelected(view, id);
            } else if (e.shiftKey) {
                e.preventDefault(); e.stopPropagation();
                selectRange(view, id, entriesIn(root).map(idOf));
            } else if (selectionSize()) {
                // a plain click is a single card again, as in a file manager
                clearSelection();
            }
        };

        // ---- right-click on a selected card: the selection's menu ----
        const onMenu = (e: MouseEvent) => {
            if (press.current?.fired) { e.preventDefault(); e.stopPropagation(); return; }
            const card = (e.target as Element).closest<HTMLElement>(ENTRY);
            if (card && selectionSize() > 1 && isSelected(idOf(card))) {
                e.preventDefault(); e.stopPropagation();
                openContextMenu(e as any, { title: `${selectionSize()} selected`, items: selectionMenu(!!state.currentFolderId) });
            }
        };

        // ---- a drag on empty space: the box ----
        // In the table, rows fill the space. As in a file manager's detail
        // view, a drag that starts on a row's other cells draws a box; the
        // name and the icon still drag the row into a folder.
        const fromRowCell = (target: Element) => {
            const cell = target.closest('.dex-row[data-entry-id] > td');
            return !!cell && !cell.matches('.col-name, .col-icon') && !target.closest('button, a, input, select, textarea');
        };
        let boxPending = false;
        const onDragStart = (e: DragEvent) => { if (boxPending) e.preventDefault(); };
        // A selected card carries the whole selection, as in a file manager:
        // the drag picture says how many, and the others look picked up too.
        // A card outside the selection drags alone, and the selection clears.
        const onCardDrag = (e: DragEvent) => {
            const card = (e.target as Element).closest<HTMLElement>(ENTRY);
            if (!card) return;
            if (!isSelected(idOf(card))) { if (selectionSize()) clearSelection(); return; }
            const n = selectionSize();
            if (n < 2) return;
            root.classList.add('is-dragging-selection');
            const tag = document.createElement('div');
            tag.className = 'selection-drag-tag';
            tag.textContent = `${n} selected`;
            document.body.appendChild(tag);
            try { e.dataTransfer?.setDragImage(tag, 12, 12); } catch { /* the browser's own picture */ }
            setTimeout(() => tag.remove(), 0);
        };
        const onDragEnd = () => root.classList.remove('is-dragging-selection');
        const onDown = (e: PointerEvent) => {
            if (e.pointerType === 'touch') { startPress(e); return; }
            const target = e.target as Element;
            const fromRow = fromRowCell(target);
            if (e.button !== 0 || (!fromRow && target.closest(NOT_EMPTY))) return;
            // a row drag (HTML drag and drop) and text selection must not start
            if (fromRow) { e.preventDefault(); boxPending = true; }
            const add = e.ctrlKey || e.metaKey || e.shiftKey;
            const start = { x: e.clientX, y: e.clientY };
            const before = add && selectionKind() === view ? selectedIds() : [];
            const z = effectiveZoom(document.documentElement);
            let box: HTMLDivElement | null = null;
            const cards = entriesIn(root).map(el => ({ id: idOf(el), r: el.getBoundingClientRect() }));
            const move = (ev: PointerEvent) => {
                const x1 = Math.min(start.x, ev.clientX), y1 = Math.min(start.y, ev.clientY);
                const x2 = Math.max(start.x, ev.clientX), y2 = Math.max(start.y, ev.clientY);
                if (!box) {
                    if (x2 - x1 < 5 && y2 - y1 < 5) return;
                    box = document.createElement('div');
                    box.className = 'selection-box';
                    document.body.appendChild(box);
                    document.body.classList.add('is-box-selecting');
                }
                // pointer numbers are window pixels; left/top are CSS pixels (js/core/ui-scale.ts)
                Object.assign(box.style, { left: `${x1 / z}px`, top: `${y1 / z}px`, width: `${(x2 - x1) / z}px`, height: `${(y2 - y1) / z}px` });
                const hit = cards.filter(c => c.r.left < x2 && c.r.right > x1 && c.r.top < y2 && c.r.bottom > y1).map(c => c.id);
                setSelection(view, [...before, ...hit]);
            };
            const up = () => {
                boxPending = false;
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
                if (box) {
                    box.remove();
                    document.body.classList.remove('is-box-selecting');
                    // the click that ends a box must not clear what it selected
                    swallowClick.current = true;
                    setTimeout(() => { swallowClick.current = false; }, 0);
                }
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        };

        // ---- a long press on a phone ----
        const startPress = (e: PointerEvent) => {
            const card = (e.target as Element).closest<HTMLElement>(ENTRY);
            if (!card) return;
            const p = { timer: 0 as any, x: e.clientX, y: e.clientY, fired: false };
            press.current = p;
            p.timer = setTimeout(() => {
                p.fired = true;
                swallowClick.current = true;
                startTouchSelect(view, idOf(card));
            }, LONG_PRESS_MS);
        };
        const pressMove = (e: PointerEvent) => {
            const p = press.current;
            if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { clearTimeout(p.timer); press.current = null; }
        };
        const pressEnd = () => {
            const p = press.current;
            if (!p) return;
            clearTimeout(p.timer);
            // keep `fired` a moment, for the contextmenu and click that follow a long press
            setTimeout(() => { if (press.current === p) press.current = null; }, 400);
        };

        root.addEventListener('click', onClick, true);
        root.addEventListener('contextmenu', onMenu, true);
        root.addEventListener('pointerdown', onDown);
        root.addEventListener('dragstart', onDragStart, true);
        root.addEventListener('dragstart', onCardDrag);
        root.addEventListener('dragend', onDragEnd);
        root.addEventListener('pointermove', pressMove);
        root.addEventListener('pointerup', pressEnd);
        root.addEventListener('pointercancel', pressEnd);
        return () => {
            root.removeEventListener('click', onClick, true);
            root.removeEventListener('contextmenu', onMenu, true);
            root.removeEventListener('pointerdown', onDown);
            root.removeEventListener('dragstart', onDragStart, true);
            root.removeEventListener('dragstart', onCardDrag);
            root.removeEventListener('dragend', onDragEnd);
            root.removeEventListener('pointermove', pressMove);
            root.removeEventListener('pointerup', pressEnd);
            root.removeEventListener('pointercancel', pressEnd);
        };
    }, [view]);
}

/**
 * The selection's keys. Returns true when it took the key.
 * Called first by the listing's own key handler (CollectionPage.tsx).
 */
export function selectionKeys(e: React.KeyboardEvent, view: EntryKind, listing: HTMLElement | null): boolean {
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && key === 'a' && listing) {
        e.preventDefault();
        setSelection(view, entriesIn(listing).map(idOf));
        return true;
    }
    if (!selectionSize() || selectionKind() !== view) return false;
    if (e.key === 'Escape') { e.preventDefault(); clearSelection(); return true; }
    if (e.key === 'Delete') { e.preventDefault(); deleteSelection(); return true; }
    if (ctrl && key === 'x') { e.preventDefault(); cutSelection(); return true; }
    if (ctrl && key === 'c') { e.preventDefault(); copySelection(); return true; }
    return false;
}

/** "3 selected" and what you can do with them, above the listing. */
export function SelectionBar({ view }: { view: EntryKind }) {
    const n = selectionKind() === view ? selectionSize() : 0;
    if (!n) return null;
    return (
        <div className="selection-bar" role="toolbar" aria-label={`${n} selected`}>
            <button type="button" className="selection-bar-clear" onClick={clearSelection} aria-label="Clear selection" title="Clear selection (Esc)"><Icon name="x" size={16} /></button>
            <strong className="selection-bar-count" aria-live="polite">{n} selected</strong>
            <span className="selection-bar-spacer" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={cutSelection}><Icon name="scissors" size={14} /><span>Cut</span></button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={copySelection}><Icon name="document-duplicate" size={14} /><span>Copy</span></button>
            {state.currentFolderId && <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveSelectionTo(null)}><Icon name="folder-output" size={14} /><span>Out of folder</span></button>}
            <button type="button" className="btn btn-secondary btn-sm selection-bar-delete" onClick={deleteSelection}><Icon name="trash-2" size={14} /><span>Delete</span></button>
        </div>
    );
}
