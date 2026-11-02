// The cards My Collection's grid is made of: your Fakémon, custom moves,
// abilities and items, folders, the "Add new" tile, skeletons while storage
// loads, and the main-game entries a region brings over. The table layout
// draws the same entries as rows (CollectionTable.tsx) and shares the menus
// and art from here.

import { useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { api, state } from '../../../core/app.ts';
import { Icon } from '../Icon.tsx';
import type { CollectionTab, Fakemon, Folder, LibraryKind } from '../../types.ts';
import { ThumbImg } from '../ThumbImg.tsx';
import { artImage } from '../../../editor/art-sets.ts';
import { cardDragEnd, cardDragStart, cardDropInto } from '../../../core/motion.ts';
import { closeContextMenu, menuEvent, openContextMenu, type MenuAction, type MenuItem, type MenuSpec } from '../ContextMenu.tsx';
import { setFakemonStatus, statusOf } from '../../../features/notebook.ts';
import { canPaste, copyEntry, cutEntry, isCut, pasteInto } from '../../../features/clipboard.ts';
import { StatusBadge } from '../notes/NotesField.tsx';
import { CategoryIcon } from '../editor/lists.tsx';

// one formatter for every card: toLocaleDateString makes a new one per call,
// which cost about a millisecond a card on a big collection
const CARD_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ---- a card's actions: one menu for a click, a right-click or the keyboard ----

/**
 * Props that make a card open its menu (js/app/components/ContextMenu.tsx)
 * on a click, a right-click, Enter, Space or the menu key. `spec` gets the
 * card's element, for actions that start from it (the art's flight).
 */
export function cardMenu(spec: (card: Element) => MenuSpec, onDouble?: (card: Element) => void) {
    const show = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // the second click of a double-click is the double-click's, not a new menu
        if (e.type === 'click' && e.detail > 1 && onDouble) return;
        openContextMenu(e, spec(e.currentTarget));
    };
    return {
        tabIndex: 0,
        'aria-haspopup': 'menu' as const,
        onClick: show,
        onContextMenu: show,
        // a double-click skips the menu and does the first thing on it
        // (the menu the first click opened goes away)
        onDoubleClick: onDouble ? (e: MouseEvent) => { closeContextMenu(); onDouble(e.currentTarget); } : undefined,
        onKeyDown: (e: KeyboardEvent) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault();
                openContextMenu(e.currentTarget, spec(e.currentTarget));
            }
        }
    };
}

/**
 * The usual actions, in File Explorer's order and groups: open and edit, then
 * the clipboard (cut, copy, paste, duplicate), then the rest, then delete.
 * An action left out is not offered. The hints are the keys My Collection
 * takes for a focused card (CollectionPage.tsx).
 */
export function cardActions(card: Element, a: {
    open?: MenuAction; edit?: () => void; editLabel?: string; pinned?: boolean; pin?: (e: any) => void; outOfFolder?: (e: any) => void;
    cut?: () => void; copy?: () => void; paste?: () => void;
    duplicate?: (e: any) => void; backup?: (e: any) => void; publish?: () => void; exports?: Array<[string, (e: any) => void]>;
    remove?: (e: any) => void; removeLabel?: string;
}): MenuItem[] {
    const ev = () => menuEvent(card);
    const groups: MenuItem[][] = [[], [], []];
    if (a.open) groups[0].push(a.open);
    if (a.edit) groups[0].push({ label: a.editLabel || 'Edit', icon: 'pencil', run: a.edit });
    if (a.cut) groups[1].push({ label: 'Cut', icon: 'scissors', hint: 'Ctrl+X', run: a.cut });
    if (a.copy) groups[1].push({ label: 'Copy', icon: 'document-duplicate', hint: 'Ctrl+C', run: a.copy });
    if (a.paste) groups[1].push({ label: 'Paste', icon: 'clipboard-document', hint: 'Ctrl+V', run: a.paste });
    if (a.duplicate) groups[1].push({ label: 'Duplicate', icon: 'copy', run: () => a.duplicate!(ev()) });
    if (a.pin) groups[2].push({ label: a.pinned ? 'Unpin' : 'Pin to the top', icon: 'pin', run: () => a.pin!(ev()) });
    if (a.outOfFolder) groups[2].push({ label: 'Remove from folder', icon: 'folder-output', run: () => a.outOfFolder!(ev()) });
    if (a.publish) groups[2].push({ label: 'Publish to Community Hub', icon: 'upload', run: a.publish });
    if (a.backup) groups[2].push({ label: 'Back up to cloud', icon: 'cloud-upload', run: () => a.backup!(ev()) });
    if (a.exports?.length === 1) groups[2].push({ label: 'Export', icon: 'download', run: () => a.exports![0][1](ev()) });
    else if (a.exports?.length) groups[2].push({ label: 'Export', icon: 'download', items: a.exports.map(([label, run]) => ({ label: label.replace(/^Export as /, ''), run: () => run(ev()) })) });
    const items: MenuItem[] = groups.filter(g => g.length).flatMap((g, i) => i ? ['sep' as const, ...g] : g);
    if (a.remove) items.push('sep', { label: a.removeLabel || 'Delete', icon: 'trash-2', hint: 'Del', danger: true, run: () => a.remove!(ev()) });
    return items;
}

export function TypeBadge({ type, style }: { type?: string | null; style?: React.CSSProperties }) {
    if (!type) return null;
    return <span className={`type-badge type-${String(type).toLowerCase()}`} style={style}>{type}</span>;
}

// ---- Fakémon ----

export function FakemonArt({ f, small }: { f: Fakemon; small?: boolean }) {
    // a table row is icon-sized: the Fakémon's own icon fits it better than shrunk artwork
    // a cheap lookup, not cleanArtSets: this runs for every row; only an inline image is drawn
    const icon = small && Array.isArray(f.artSets) ? artImage(f.artSets.find(set => set?.kind === 'icon'), 'icon') : undefined;
    if (icon && /^data:image\//.test(icon.src)) return <img className="card-icon-art" src={icon.src} alt={f.name} draggable={false} loading="lazy" />;
    const shiny = state.collectionShinyPreview && f.shinyArtwork;
    const src = shiny ? f.shinyArtwork : f.artwork;
    return src
        ? <ThumbImg src={src} alt={shiny ? `${f.name} shiny` : f.name} draggable={false} loading="lazy" />
        : <img className="no-art-placeholder" src="assets/no_art_placeholder.png" alt="No artwork" draggable={false} />;
}

function CloudBadge({ f }: { f: Fakemon }) {
    if (!api.isBackedUpToCloud?.(f)) return null;
    return <span className="card-cloud-badge" title="Backed up to your cloud backup"><Icon name="server" size={12} /></span>;
}

const FAKEMON_EXPORTS: Array<[string, string]> = [
    ['Export as PNG', 'exportCollectionFakemonAsPNG'],
    ['Export as Plain Text', 'exportCollectionFakemonAsPlainText'],
    ['Export as JSON', 'exportCollectionFakemonAsJSON'],
    ['Export as Showdown Mod', 'exportCollectionFakemonAsShowdown'],
    ['Export as Essentials Mod', 'exportCollectionFakemonAsEssentials']
];

export function fakemonMenu(f: Fakemon, inFolder: boolean, card: Element): MenuSpec {
    const preview = () => api.previewFakemon(f.id);
    return {
        title: f.name || 'Unnamed',
        subtitle: [f.number || '#???', [f.type1, f.type2].filter(Boolean).join(' / ')].filter(Boolean).join(' · '),
        items: cardActions(card, {
            open: { label: 'Preview', icon: 'eye', run: preview },
            edit: () => api.editFakemon(f.id),
            pinned: f.pinned, pin: e => api.toggleFakemonPin(f.id, e),
            cut: () => cutEntry('fakemon', f.id), copy: () => copyEntry('fakemon', f.id),
            duplicate: e => api.duplicateFakemon(f.id, e),
            outOfFolder: inFolder ? e => api.moveFakemonOutOfFolder(f.id, e) : undefined,
            // cloud backup comes with a host that has accounts
            backup: api.backupFakemonToCloud ? e => api.backupFakemonToCloud(f.id, e) : undefined,
            // publishing comes with a host that has the Community Hub
            publish: api.publishFakemon ? () => {
                if (api.requireAccount && !api.requireAccount('Sign in to publish to the Community Hub.', () => api.publishFakemon(f.id))) return;
                api.publishFakemon(f.id);
            } : undefined,
            exports: FAKEMON_EXPORTS.map(([label, fn]) => [label, e => api[fn](f.id, e)]),
            remove: e => api.deleteFakemon(f.id, e)
        }).flatMap(item => typeof item === 'object' && item.label === 'Edit' ? [item, statusGroup(f)] : [item])
    };
}

/** One item that flips the status between Draft and Done. */
const statusGroup = (f: Fakemon): MenuItem => statusOf(f) === 'done'
    ? { label: 'Mark as draft', icon: 'document-text', run: () => setFakemonStatus(f.id, 'draft') }
    : { label: 'Mark as done', icon: 'check-circle', run: () => setFakemonStatus(f.id, 'done') };

export function FakemonCard({ f, inFolder }: { f: Fakemon; inFolder: boolean }) {
    const className = `collection-card${f.pinned ? ' pinned' : ''}${isCut(f.id) ? ' is-cut' : ''}`;
    const bst = api.getFakemonBST(f);
    const menu = cardMenu(card => fakemonMenu(f, inFolder, card), () => api.previewFakemon(f.id));
    const types = <div className="card-types"><TypeBadge type={f.type1} /><TypeBadge type={f.type2} /></div>;
    const showDate = api.getShowCollectionCardDate?.() !== false;
    return (
        <div className={className} {...fakemonDrag(f.id)} {...menu} aria-label={f.name} data-entry-kind="fakemon" data-entry-id={f.id}>
            <div className="card-art" data-scaling={f.artScaling === 'smooth' ? 'smooth' : 'pixel'}><FakemonArt f={f} /><CloudBadge f={f} /><span className="card-number">{f.number || '#???'}</span>{f.pinned && <PinMark />}<StatusBadge status={statusOf(f)} /></div>
            <div className="card-body">
                <div className="card-name" title={f.name}>{f.name}</div>
                <div className="card-meta-row">
                    <span className="card-bst"><em>BST</em>{bst}</span>
                    {showDate && <span className="card-date">{CARD_DATE.format(new Date(f.createdAt || 0))}</span>}
                </div>
                {types}
            </div>
        </div>
    );
}

/** Lets a Fakémon card or row be dragged into a folder. */
export const fakemonDrag = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { api.handleCardDragStart(id, e); cardDragStart(e.currentTarget as HTMLElement, e.nativeEvent); },
    onDragEnd: () => { api.handleCardDragEnd(); cardDragEnd(); }
});

/** Lets a custom move, ability or item card or row be dragged into a folder. */
export const libraryDrag = (kind: LibraryKind, id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { api.handleLibraryCardDragStart(kind, id, e); cardDragStart(e.currentTarget as HTMLElement, e.nativeEvent); },
    onDragEnd: () => { api.handleCardDragEnd(); cardDragEnd(); }
});

/** A pinned card says so on its face, now that its buttons are in the menu. */
export const PinMark = () => <span className="card-pin-mark" title="Pinned"><Icon name="pin" size={12} /></span>;

// ---- custom moves, abilities and items ----

const SINGULAR: Record<LibraryKind, string> = { moves: 'move', abilities: 'ability', items: 'item' };

/**
 * A main-game item's emblem: its icon from Showdown's item sprite sheet, found
 * by the item's spritenum. Items without one fall back to Showdown's per-item
 * image, and then to the plain gem.
 */
export function ItemEmblem({ name, item }: { name: string; item?: any }) {
    const [failed, setFailed] = useState(false);
    const data = item || Object.values(state.sdItems || {}).find((i: any) => i.name === name) || null;
    const n = data?.spritenum;
    if (Number.isFinite(n)) {
        // the sheet is 16 icons of 24px a row
        return (
            <span className="library-emblem library-emblem-plain has-item-icon">
                <span className="item-icon-sheet" style={{ backgroundPosition: `${-(n % 16) * 24}px ${-Math.floor(n / 16) * 24}px` }} role="img" aria-label={name} />
            </span>
        );
    }
    const slug = String(name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return (
        <span className={`library-emblem library-emblem-plain${slug && !failed ? ' has-item-icon' : ''}`}>
            {slug && !failed && <img className="item-icon-sprite" src={`https://play.pokemonshowdown.com/sprites/itemicons/${slug}.png`} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />}
            <Icon name="gem" />
        </span>
    );
}

/** What a move, ability or item card shows; the frame around it is shared. */
export function libraryParts(kind: LibraryKind, item: any): { art: ReactNode; corner: string; pills: ReactNode | null; meta: ReactNode } {
    const artImg = item.artwork ? <ThumbImg src={item.artwork} alt="" draggable={false} loading="lazy" /> : null;
    if (kind === 'moves') {
        const type = String(item.type || 'Normal');
        const category = String(item.category || 'Status');
        const acc = item.accuracy === true || item.accuracy === undefined || item.accuracy === false ? '—' : `${item.accuracy}%`;
        return {
            // the move's own image if it has one; otherwise the type's colour fills
            // the emblem and the category is its icon
            art: artImg || <span className={`library-emblem type-${type.toLowerCase()}`}><CategoryIcon category={category} size="55%" /></span>,
            corner: category,
            pills: <TypeBadge type={type} />,
            meta: <>
                <span className="card-bst"><em>BP</em>{item.basePower || '—'}</span>
                <span className="card-bst"><em>ACC</em>{acc}</span>
                <span className="card-bst"><em>PP</em>{item.pp || '—'}</span>
            </>
        };
    }
    // no stats to show: the description's first line takes the meta row
    const meta = <span className={`library-tile-desc${item.desc ? '' : ' is-empty'}`}>{item.desc || 'No description'}</span>;
    if (kind === 'items') {
        return {
            // a region's copy of a main-game item keeps the item's own icon
            art: artImg || (item.vanillaId
                ? <ItemEmblem name={state.sdItems?.[item.vanillaId]?.name || item.name} item={state.sdItems?.[item.vanillaId]} />
                : <span className="library-emblem library-emblem-plain"><Icon name="gem" /></span>),
            corner: '',
            pills: <span className="library-tag">{item.isMegaStone ? 'Mega Stone' : 'Item'}</span>,
            meta
        };
    }
    // no badge row for abilities: it only ever said "Ability"
    return { art: artImg || <span className="library-emblem library-emblem-plain"><Icon name="sparkles" /></span>, corner: '', pills: null, meta };
}

/** The shared frame of a library tile (yours or a main-game one). */
function LibraryTile({ className, menu, title, pinned, art, corner, tag, name, meta, pills, drag, entry }: {
    className: string; menu: object; title?: string; pinned?: boolean; art: ReactNode; corner?: string;
    tag?: string; name: string; meta: ReactNode; pills: ReactNode | null; drag?: object; entry?: [string, string];
}) {
    return (
        <div className={`${className}${pinned ? ' pinned' : ''}`} title={title || undefined} aria-label={name} {...drag} {...menu}
            data-entry-kind={entry?.[0]} data-entry-id={entry?.[1]}>
            <div className="card-art">{art}{corner && <span className="card-number library-tile-corner">{corner}</span>}{tag && <span className="vanilla-card-tag">{tag}</span>}{pinned && <PinMark />}</div>
            <div className="card-body">
                <div className="card-name" title={name}>{name}{tag && <span className="vanilla-card-tag vanilla-card-tag-inline">{tag}</span>}</div>
                <div className="card-meta-row">{meta}</div>
                {pills === null
                    // keeps the row's height, so ability cards stay the size of the others
                    ? <div className="card-types card-types-spacer" aria-hidden="true" />
                    : <div className="card-types">{pills}</div>}
            </div>
        </div>
    );
}

export function libraryMenu(kind: LibraryKind, item: any, inFolder: boolean, card: Element): MenuSpec {
    return {
        title: item.name || 'Unnamed', subtitle: `Custom ${SINGULAR[kind]}`,
        items: cardActions(card, {
            edit: () => api.openLibraryEditorSheet(kind, item.id),
            pinned: item.pinned, pin: e => api.toggleCustomLibraryPin(kind, item.id, e),
            cut: () => cutEntry(kind, item.id), copy: () => copyEntry(kind, item.id),
            duplicate: e => api.duplicateCustomLibraryItem(kind, item.id, e),
            outOfFolder: inFolder ? e => api.moveLibraryItemOutOfFolder(kind, item.id, e) : undefined,
            exports: [['Export', () => api.exportCustomLibraryItem(SINGULAR[kind], item.id)]],
            remove: e => api.deleteCustomLibraryItem(kind, item.id, e)
        })
    };
}

export function LibraryCard({ kind, item, inFolder }: { kind: LibraryKind; item: any; inFolder: boolean }) {
    const { art, corner, pills, meta } = libraryParts(kind, item);
    const menu = cardMenu(card => libraryMenu(kind, item, inFolder, card), () => api.openLibraryEditorSheet(kind, item.id));
    return (
        <LibraryTile
            className={`collection-card library-tile${isCut(item.id) ? ' is-cut' : ''}`} menu={menu} pinned={item.pinned} entry={[kind, item.id]}
            // the full description is the tooltip; the tile keeps three lines like a Fakémon card
            title={String(item.desc || '').trim()}
            drag={libraryDrag(kind, item.id)}
            art={art} corner={corner} tag={item.vanillaId ? 'Edited' : ''} name={item.name} meta={meta} pills={pills}
        />
    );
}

// ---- folders ----

const FOLDER_NOUN: Record<string, [string, string]> = {
    fakemon: ['Fakemon', 'Fakemon'], moves: ['Move', 'Moves'], abilities: ['Ability', 'Abilities'], items: ['Item', 'Items']
};

/**
 * What a folder card and a folder row share: its count's wording, its menu,
 * and taking a dropped card. A folder is a place: a click goes in, a
 * right-click or the keyboard's menu key shows the rest.
 */
export function useFolder(folder: Folder, count: number, kind: CollectionTab) {
    const [one, many] = FOLDER_NOUN[kind] || FOLDER_NOUN.fakemon;
    const [over, setOver] = useState(false);
    const open = () => api.openFolder(folder.id);
    const menu = cardMenu(card => ({
        title: folder.name, subtitle: `${count} ${count === 1 ? one : many}`,
        items: cardActions(card, {
            open: { label: 'Open', icon: 'folder', hint: 'Enter', run: open },
            paste: canPaste(kind) ? () => pasteInto(kind, folder.id) : undefined,
            edit: () => api.renameFolder(folder.id, menuEvent(card)), editLabel: 'Rename or recolour',
            pinned: folder.pinned, pin: e => api.toggleFolderPin(folder.id, e),
            remove: e => api.deleteFolder(folder.id, e)
        })
    }));
    return {
        over,
        countLabel: `${count} ${count === 1 ? one : many}`,
        props: {
            ...menu,
            onClick: open,
            onKeyDown: (e: KeyboardEvent) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter') { e.preventDefault(); open(); } else menu.onKeyDown(e); },
            onDragOver: (e: DragEvent) => { e.preventDefault(); if (!over) setOver(true); },
            onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); },
            onDrop: (e: DragEvent) => { setOver(false); cardDropInto(e.currentTarget); api.dropOnFolder(folder.id, e); }
        }
    };
}

export function FolderCard({ folder, count, kind }: { folder: Folder; count: number; kind: CollectionTab }) {
    const { over, countLabel, props } = useFolder(folder, count, kind);
    const color = folder.color || null;
    return (
        <div className={`collection-card folder-card${over ? ' drag-over' : ''}${folder.pinned ? ' pinned' : ''}`} aria-label={folder.name} data-folder-id={folder.id}
            style={color ? { borderColor: color, background: `color-mix(in srgb, ${color} 10%, var(--bg-panel))` } : undefined}
            {...props}>
            <div className="card-art folder-card-art" style={color ? { color } : undefined}><Icon name="folder" size={48} />{folder.pinned && <PinMark />}</div>
            <div className="card-body">
                <div className="card-name">{folder.name}</div>
                <div className="card-bst">{countLabel}</div>
            </div>
        </div>
    );
}

// ---- the first tile, and the loading state ----

export const ADD_NEW: Record<CollectionTab, [string, () => void]> = {
    fakemon: ['Fakémon', () => api.createNewFakemon()],
    moves: ['move', () => api.openLibraryEditorSheet('moves')],
    abilities: ['ability', () => api.openLibraryEditorSheet('abilities')],
    items: ['item', () => api.openLibraryEditorSheet('items')],
    types: ['type', () => api.openLibraryEditorSheet('types')]
};

/** "Add new ...": the same action as the Create menu's matching item. */
export function AddCard({ kind }: { kind: CollectionTab }) {
    const [label, run] = ADD_NEW[kind];
    return (
        <button type="button" className="collection-card collection-add-card" onClick={run}>
            <span className="card-art"><span className="collection-add-icon"><Icon name="plus" /></span></span>
            <span className="card-body"><span className="card-name">Add new {label}</span></span>
        </button>
    );
}

/** The real card's shape, so the first paint has no layout shift once the cards arrive. */
export function SkeletonCard() {
    return (
        <div className="collection-card skel-card">
            <div className="card-art skel" />
            <div className="card-body">
                <div className="skel skel-text skel-name" />
                <div className="skel skel-text skel-bst" />
                <div className="card-types"><span className="skel skel-pill" /><span className="skel skel-pill" /></div>
            </div>
        </div>
    );
}

// ---- what a region brings over from the main games ----

export type VanillaKind = 'pokemon' | LibraryKind;
const POKEMON_EXPORTS: Array<[string, string]> = [['png', 'PNG'], ['text', 'Plain Text'], ['json', 'JSON'], ['showdown', 'Showdown Mod'], ['essentials', 'Essentials Mod']];

export function vanillaMenu(kind: VanillaKind, id: string, name: string, card: Element, open?: MenuAction): MenuSpec {
    const pokemon = kind === 'pokemon';
    return {
        title: name, subtitle: 'From the main games',
        items: cardActions(card, {
            open,
            edit: () => pokemon ? api.editVanillaPokemonInRegion(id) : api.editVanillaInRegion(kind, id),
            pinned: api.isVanillaPinned(kind, id), pin: e => api.toggleVanillaPin(kind, id, e),
            duplicate: e => pokemon ? api.duplicateVanillaPokemon(id, e) : api.duplicateVanillaEntry(kind, id, e),
            exports: pokemon
                ? POKEMON_EXPORTS.map(([format, label]) => [`Export as ${label}`, e => api.exportVanillaPokemon(id, format, e)])
                : [['Export', e => api.exportVanillaEntry(kind, id, e)]],
            remove: e => api.removeVanillaFromRegion(kind, id, e), removeLabel: 'Remove from region'
        })
    };
}

/** A main-game Pokémon's sprite, number and base stat total, for its card and its table row. */
export function vanillaPokemonParts(p: any) {
    const sprite = api.getPokemonTemplateSprite?.(p) || '';
    return {
        art: sprite ? <img src={sprite} alt={p.name} loading="lazy" decoding="async" /> : null,
        number: `#${String(p.num).padStart(3, '0')}`,
        bst: Object.values(p.stats || {}).reduce((a: number, b: any) => a + Number(b || 0), 0)
    };
}

export function VanillaPokemonCard({ p }: { p: any }) {
    const pinned = api.isVanillaPinned('pokemon', p.id);
    const { art, number, bst } = vanillaPokemonParts(p);
    const types = <div className="card-types">{(p.types || []).map((t: string) => <TypeBadge key={t} type={t} />)}</div>;
    const open = () => api.previewVanillaPokemonInRegion(p.id);
    const menu = cardMenu(card => vanillaMenu('pokemon', p.id, p.name, card, { label: 'Preview', icon: 'eye', run: open }), open);
    return (
        <div className={`collection-card vanilla-card${pinned ? ' pinned' : ''}`} title={p.name} aria-label={p.name} {...menu}>
            <div className="card-art">{art}<span className="card-number">{number}</span><span className="vanilla-card-tag">Main games</span>{pinned && <PinMark />}</div>
            <div className="card-body"><div className="card-name">{p.name}</div><div className="card-meta-row"><span className="card-bst"><em>BST</em>{bst}</span></div>{types}</div>
        </div>
    );
}

/** What a main-game move, ability or item shows, like libraryParts for your own. */
export function vanillaLibraryParts(kind: LibraryKind, id: string, v: any): { art: ReactNode; corner: string; meta: ReactNode; pills: ReactNode | null } {
    if (kind === 'moves') {
        const type = String(v.type || 'Normal');
        const acc = v.accuracy === true ? '—' : `${v.accuracy}%`;
        return {
            art: <span className={`library-emblem type-${type.toLowerCase()}`}><CategoryIcon category={v.category || 'Status'} size="55%" /></span>,
            corner: v.category || '',
            meta: <><span className="card-bst"><em>BP</em>{v.basePower || '—'}</span><span className="card-bst"><em>ACC</em>{acc}</span><span className="card-bst"><em>PP</em>{v.pp || '—'}</span></>,
            pills: <TypeBadge type={type} />
        };
    }
    return {
        art: kind === 'items' ? <ItemEmblem name={v.name || id} item={v} /> : <span className="library-emblem library-emblem-plain"><Icon name="sparkles" /></span>,
        corner: '',
        meta: <span className="library-tile-desc">{v.desc || 'No description'}</span>,
        pills: kind === 'items' ? <span className="library-tag">Item</span> : null
    };
}

export function VanillaLibraryCard({ kind, id, v }: { kind: LibraryKind; id: string; v: any }) {
    const { art, corner, meta, pills } = vanillaLibraryParts(kind, id, v);
    return (
        <LibraryTile className="collection-card library-tile vanilla-card" pinned={api.isVanillaPinned(kind, id)} title={v.desc || v.name || id}
            menu={cardMenu(card => vanillaMenu(kind, id, v.name || id, card), () => api.editVanillaInRegion(kind, id))}
            art={art} corner={corner} tag="Main games" name={v.name || id} meta={meta} pills={pills} />
    );
}

/** "Show all": the main-game list starts with its first page. */
export function VanillaMoreCard({ total, onClick }: { total: number; onClick: () => void }) {
    return (
        <button type="button" className="collection-card vanilla-more-card" onClick={onClick}>
            <span className="card-art"><span className="collection-add-icon"><Icon name="chevron-down" /></span></span>
            <span className="card-body"><span className="card-name">Show all {total}</span><span className="library-tile-desc">From the main games</span></span>
        </button>
    );
}
