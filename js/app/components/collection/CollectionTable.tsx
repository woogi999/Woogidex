// My Collection's table layout, in the style of Pokémon Showdown's dex search:
// one dense row an entry, the art as an icon, and each number with its small
// label above it. Every tab uses it the same way, and a region's main-game
// entries sit in the same table as your own. A row opens the same menu as
// its card (cards.tsx), and rows drag into folder rows like cards do.

import type { ReactNode } from 'react';
import { api, state } from '../../../core/app.ts';
import { Icon } from '../Icon.tsx';
import { SortTh, nextSort } from '../SortHeader.tsx';
import { ThumbImg } from '../ThumbImg.tsx';
import { statusOf } from '../../../features/notebook.ts';
import { isCut } from '../../../features/clipboard.ts';
import { StatusBadge } from '../notes/NotesField.tsx';
import { CategoryIcon } from '../editor/lists.tsx';
import { CategoryBadge } from '../MoveCategory.tsx';
import {
    ADD_NEW, FakemonArt, ItemEmblem, TypeBadge, cardMenu, fakemonDrag, fakemonMenu, libraryDrag, libraryMenu,
    useFolder, vanillaLibraryParts, vanillaMenu, vanillaPokemonParts
} from './cards.tsx';
import type { CollectionTab, Fakemon, Folder, LibraryKind } from '../../types.ts';

// ---- the frame ----

/**
 * The column heads a tab's table has. `sort` is the collection sort key a head
 * sorts by. A number column (`high`) sorts high to low on its first click, as
 * Showdown's does.
 */
export type Column = { label: string; cls: string; sort?: string; high?: boolean };

const STATS: Array<[string, string]> = [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']];

export const COLUMNS: Record<CollectionTab, Column[]> = {
    fakemon: [
        { label: '', cls: 'col-icon' }, { label: '#', cls: 'col-num', sort: 'number' }, { label: 'Name', cls: 'col-name', sort: 'name' },
        { label: 'Types', cls: 'col-types' }, { label: 'Abilities', cls: 'col-abilities' },
        ...STATS.map(([key, label]) => ({ label, cls: 'col-stat', sort: key, high: true })), { label: 'BST', cls: 'col-stat col-bst', sort: 'bst', high: true }
    ],
    moves: [
        { label: '', cls: 'col-icon' }, { label: 'Name', cls: 'col-name', sort: 'name' }, { label: 'Type', cls: 'col-types', sort: 'type' },
        { label: 'Cat.', cls: 'col-cat', sort: 'category' }, { label: 'Power', cls: 'col-stat', sort: 'power', high: true },
        { label: 'Acc.', cls: 'col-stat', sort: 'accuracy', high: true }, { label: 'PP', cls: 'col-stat', sort: 'pp', high: true },
        { label: 'Description', cls: 'col-desc' }
    ],
    abilities: [{ label: '', cls: 'col-icon' }, { label: 'Name', cls: 'col-name', sort: 'name' }, { label: 'Description', cls: 'col-desc' }],
    items: [
        { label: '', cls: 'col-icon' }, { label: 'Name', cls: 'col-name', sort: 'name' }, { label: 'Kind', cls: 'col-cat' },
        { label: 'Description', cls: 'col-desc' }
    ],
    types: [
        { label: '', cls: 'col-icon' }, { label: 'Name', cls: 'col-name' }, { label: 'Strong vs', cls: 'col-stat' },
        { label: 'Weak to', cls: 'col-stat' }, { label: 'Fakémon', cls: 'col-stat' }, { label: 'Description', cls: 'col-desc' }
    ],
    conditions: [
        { label: '', cls: 'col-icon' }, { label: 'Name', cls: 'col-name' }, { label: 'Lasts', cls: 'col-stat' },
        { label: 'Fakémon', cls: 'col-stat' }, { label: 'Description', cls: 'col-desc' }
    ]
};

function Head({ col, kind }: { col: Column; kind: CollectionTab }) {
    const sort = api.collectionUI().sort;
    const sortable = !!col.sort && sort.options.some(([key]: [string, string]) => key === col.sort);
    // a click sorts, a second flips, a third goes back to the tab's own order
    const onSort = (key: string) => {
        const next = nextSort({ key: sort.by, order: sort.order }, key, col.high ? 'desc' : 'asc');
        if (next) api.changeCollectionSort(next.key, next.order);
        else if (kind === 'fakemon') api.changeCollectionSort('created', 'desc');
        else api.changeCollectionSort('name', 'asc');
    };
    return <SortTh className={col.cls} label={col.label} sortKey={sortable ? col.sort : undefined}
        sort={{ key: sort.by, order: sort.order }} onSort={onSort} />;
}

/** A tab's table. Its rows come as children; id="collection-grid" (the main listing's) keeps the page's anchors working. */
export function DexTable({ kind, children, id = 'collection-grid' }: { kind: CollectionTab; children: ReactNode; id?: string }) {
    return (
        <div className="dex-table-wrap" id={id || undefined}>
            <table className={`dex-table dex-table-${kind}`}>
                <thead><tr>{COLUMNS[kind].map((col, i) => <Head key={i} col={col} kind={kind} />)}</tr></thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

// ---- the cells every row has ----

/** A number with its label above it, as Showdown draws stats. */
const Num = ({ label, value, cls = 'col-stat' }: { label: string; value: ReactNode; cls?: string }) => (
    <td className={cls}><em>{label}</em>{value}</td>
);

export function IconCell({ children, plain }: { children: ReactNode; plain?: boolean }) {
    return <td className="col-icon"><span className={`card-art dex-art${plain ? ' dex-art-plain' : ''}`}>{children}</span></td>;
}

/** The name, then what it is: its status, "Main games" or "Edited", and a pin. */
export function NameCell({ name, status, tag, pinned }: { name: string; status?: ReactNode; tag?: string; pinned?: boolean }) {
    return (
        <td className="col-name">
            <span className="dex-name">
                <span className="card-name dex-name-text" title={name}>{name || 'Unnamed'}</span>
                {status}
                {tag && <span className="vanilla-card-tag vanilla-card-tag-inline">{tag}</span>}
                {pinned && <Icon name="pin" size={12} className="dex-pin" aria-label="Pinned" />}
            </span>
        </td>
    );
}

const DescCell = ({ text }: { text?: string }) => (
    <td className="col-desc"><span className={`dex-desc${text ? '' : ' is-empty'}`} title={text || undefined}>{text || 'No description'}</span></td>
);

const rowClass = (pinned?: boolean, extra = '') => `dex-row${pinned ? ' pinned' : ''}${extra}`;

// ---- Fakémon and main-game Pokémon ----

/**
 * The abilities as Showdown lists them: one a line in one column, the hidden
 * one in italics. With 2 or 3 the last is hidden, with 4 the third (the
 * fourth is an event ability).
 */
function Abilities({ names, hiddenAt }: { names: string[]; hiddenAt?: number }) {
    const hidden = hiddenAt ?? (names.length < 2 ? -1 : names.length >= 4 ? 2 : names.length - 1);
    return (
        <td className="col-abilities">
            {names.slice(0, 3).map((n, i) => <span key={i} className={`dex-ability${i === hidden ? ' is-hidden' : ''}`} title={i === hidden ? `${n} (hidden)` : n}>{n}</span>)}
        </td>
    );
}

/**
 * A main-game Pokémon's icon from Showdown's icon sheet: 12 icons of 40 by 30
 * a row, found by its Pokédex number. A form shows its base species' icon.
 */
function ShowdownIcon({ num, name }: { num: number; name: string }) {
    if (!Number.isFinite(num) || num <= 0) return null;
    return <span className="dex-sd-icon" role="img" aria-label={name} style={{ backgroundPosition: `${-(num % 12) * 40}px ${-Math.floor(num / 12) * 30}px` }} />;
}

export function FakemonRow({ f, inFolder }: { f: Fakemon; inFolder: boolean }) {
    const menu = cardMenu(card => fakemonMenu(f, inFolder, card), () => api.previewFakemon(f.id));
    return (
        <tr className={rowClass(f.pinned, isCut(f.id) ? ' is-cut' : '')} aria-label={f.name} {...fakemonDrag(f.id)} {...menu} data-entry-kind="fakemon" data-entry-id={f.id}>
            <IconCell><FakemonArt f={f} small /></IconCell>
            <td className="col-num">{f.number || '—'}</td>
            <NameCell name={f.name} status={<StatusBadge status={statusOf(f)} />} pinned={f.pinned} />
            <td className="col-types"><span className="card-types"><TypeBadge type={f.type1} /><TypeBadge type={f.type2} /></span></td>
            <Abilities names={(f.abilities || []).map(a => a?.name).filter(Boolean) as string[]} />
            {STATS.map(([k, label]) => <Num key={k} label={label} value={(f.stats as any)?.[k] ?? '—'} />)}
            <Num label="BST" value={api.getFakemonBST(f)} cls="col-stat col-bst" />
        </tr>
    );
}

export function VanillaPokemonRow({ p }: { p: any }) {
    const pinned = api.isVanillaPinned('pokemon', p.id);
    const { number, bst } = vanillaPokemonParts(p);
    const ab = p.abilities || {};
    const open = () => api.previewVanillaPokemonInRegion(p.id);
    const menu = cardMenu(card => vanillaMenu('pokemon', p.id, p.name, card, { label: 'Preview', icon: 'eye', run: open }), open);
    return (
        <tr className={rowClass(pinned, ' is-vanilla')} aria-label={p.name} {...menu}>
            <IconCell plain><ShowdownIcon num={Number(p.num)} name={p.name} /></IconCell>
            <td className="col-num">{number}</td>
            <NameCell name={p.name} tag="Main games" pinned={pinned} />
            <td className="col-types"><span className="card-types">{(p.types || []).map((t: string) => <TypeBadge key={t} type={t} />)}</span></td>
            <Abilities names={[ab[0], ab[1], ab.H].filter(Boolean)} hiddenAt={ab.H ? [ab[0], ab[1]].filter(Boolean).length : -1} />
            {STATS.map(([k, label]) => <Num key={k} label={label} value={p.stats?.[k] ?? '—'} />)}
            <Num label="BST" value={bst} cls="col-stat col-bst" />
        </tr>
    );
}

// ---- moves, abilities and items ----

function moveCells(type: string, category: string, power: any, accuracy: any, pp: any) {
    const acc = accuracy === true || accuracy === undefined || accuracy === false ? '—' : `${accuracy}%`;
    return (
        <>
            <td className="col-types"><TypeBadge type={type} /></td>
            <td className="col-cat"><CategoryBadge category={category} size="badge" /></td>
            <Num label="Power" value={power || '—'} />
            <Num label="Acc." value={acc} />
            <Num label="PP" value={pp || '—'} />
        </>
    );
}

/** A custom move, ability or item's own icon: an item's image, or the emblem for its kind. */
function libraryIcon(kind: LibraryKind, item: any) {
    if (kind === 'items' && item.artwork) return <ThumbImg src={item.artwork} alt="" draggable={false} loading="lazy" />;
    if (kind === 'moves') return <span className={`library-emblem type-${String(item.type || 'Normal').toLowerCase()}`}><CategoryIcon category={item.category || 'Status'} size="55%" /></span>;
    if (kind === 'items' && item.vanillaId) return <ItemEmblem name={state.sdItems?.[item.vanillaId]?.name || item.name} item={state.sdItems?.[item.vanillaId]} />;
    return <span className="library-emblem library-emblem-plain"><Icon name={kind === 'items' ? 'gem' : 'sparkles'} /></span>;
}

export function LibraryRow({ kind, item, inFolder }: { kind: LibraryKind; item: any; inFolder: boolean }) {
    const menu = cardMenu(card => libraryMenu(kind, item, inFolder, card), () => api.openLibraryEditorSheet(kind, item.id));
    return (
        <tr className={rowClass(item.pinned, isCut(item.id) ? ' is-cut' : '')} aria-label={item.name} {...libraryDrag(kind, item.id)} {...menu} data-entry-kind={kind} data-entry-id={item.id}>
            <IconCell>{libraryIcon(kind, item)}</IconCell>
            <NameCell name={item.name} tag={item.vanillaId ? 'Edited' : ''} pinned={item.pinned} />
            {kind === 'moves' && moveCells(String(item.type || 'Normal'), String(item.category || 'Status'), item.basePower, item.accuracy, item.pp)}
            {kind === 'items' && <td className="col-cat"><span className="library-tag">{item.isMegaStone ? 'Mega Stone' : 'Item'}</span></td>}
            <DescCell text={String(item.desc || '').trim()} />
        </tr>
    );
}

export function VanillaLibraryRow({ kind, id, v }: { kind: LibraryKind; id: string; v: any }) {
    const pinned = api.isVanillaPinned(kind, id);
    const menu = cardMenu(card => vanillaMenu(kind, id, v.name || id, card), () => api.editVanillaInRegion(kind, id));
    return (
        <tr className={rowClass(pinned, ' is-vanilla')} aria-label={v.name || id} {...menu}>
            <IconCell>{vanillaLibraryParts(kind, id, v).art}</IconCell>
            <NameCell name={v.name || id} tag="Main games" pinned={pinned} />
            {kind === 'moves' && moveCells(String(v.type || 'Normal'), String(v.category || 'Status'), v.basePower, v.accuracy, v.pp)}
            {kind === 'items' && <td className="col-cat"><span className="library-tag">Item</span></td>}
            <DescCell text={v.shortDesc || v.desc} />
        </tr>
    );
}

// ---- types ----

export function TypeRow({ name, icon, tag, desc, strong, weak, users, pinned, menu }: {
    name: string; icon: ReactNode; tag?: string; desc?: string; strong: number; weak: number; users: number; pinned: boolean; menu: object;
}) {
    return (
        <tr className={rowClass(pinned, tag === 'Main games' ? ' is-vanilla' : '')} aria-label={`${name} type`} {...menu}>
            <IconCell>{icon}</IconCell>
            <NameCell name={name} tag={tag} pinned={pinned} />
            <Num label="Strong vs" value={strong} />
            <Num label="Weak to" value={weak} />
            <Num label="Fakémon" value={users} />
            <DescCell text={desc} />
        </tr>
    );
}

// ---- folders, "Add new" and "Show all" ----

/** Rows that are not entries: one wide cell after the icon. */
function WideRow({ kind, className, icon, children, ...rest }: { kind: CollectionTab; className: string; icon: ReactNode; children: ReactNode; [prop: string]: any }) {
    return (
        <tr className={`dex-row ${className}`} {...rest}>
            <IconCell>{icon}</IconCell>
            <td className="col-wide" colSpan={COLUMNS[kind].length - 1}>{children}</td>
        </tr>
    );
}

export function FolderRow({ folder, count, kind }: { folder: Folder; count: number; kind: CollectionTab }) {
    const { over, countLabel, props } = useFolder(folder, count, kind);
    const color = folder.color || undefined;
    return (
        <WideRow kind={kind} className={`dex-folder${over ? ' drag-over' : ''}${folder.pinned ? ' pinned' : ''}`} aria-label={folder.name} data-folder-id={folder.id}
            icon={<Icon name="folder" size={20} style={{ color }} />} {...props}>
            <span className="dex-name"><span className="card-name dex-name-text">{folder.name}</span><span className="dex-muted">{countLabel}</span>
                {folder.pinned && <Icon name="pin" size={12} className="dex-pin" aria-label="Pinned" />}</span>
        </WideRow>
    );
}

/** "Add new ...", the table's version of the Add card. */
export function AddRow({ kind }: { kind: CollectionTab }) {
    const [label, run] = ADD_NEW[kind];
    const keys = (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); run(); } };
    return (
        <WideRow kind={kind} className="dex-add" icon={<Icon name="plus" size={18} />} tabIndex={0} role="button" onClick={run} onKeyDown={keys}>
            <span className="dex-name-text">Add new {label}</span>
        </WideRow>
    );
}

/** "Show all": the main-game list starts with its first page. */
export function MoreRow({ kind, total, onClick }: { kind: CollectionTab; total: number; onClick: () => void }) {
    const keys = (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } };
    return (
        <WideRow kind={kind} className="dex-add" icon={<Icon name="chevron-down" size={18} />} tabIndex={0} role="button" onClick={onClick} onKeyDown={keys}>
            <span className="dex-name-text">Show all {total}</span><span className="dex-muted">From the main games</span>
        </WideRow>
    );
}
