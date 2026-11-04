// My Collection (/collection): your Fakémon, custom moves, abilities, items
// and types, in folders and regions. The data and actions stay in
// js/features/pokedex.ts (tabs, folders, sorting), regions.ts and
// custom-types.ts; this draws what they hold. A region's details or analytics
// page takes the place of the tabs and grid.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cardDropInto, directionIn, fadeSwap, slideIn, staggerIn } from '../../core/motion.ts';
import { api, state } from '../../core/app.ts';
import { getRegionPage, isRegionDrawerOpen, NO_REGION, regionVanillaLibrary, regionVanillaPokemon } from '../../features/regions.ts';
import { Icon } from '../components/Icon.tsx';
import { Presence } from '../components/Presence.tsx';
import { menuEvent, openContextMenu } from '../components/ContextMenu.tsx';
import { canPaste, copyEntry, cutEntry, pasteInto, type ClipKind } from '../../features/clipboard.ts';
import {
    AddCard, FakemonCard, FolderCard, LibraryCard, SkeletonCard, VanillaLibraryCard, VanillaMoreCard, VanillaPokemonCard
} from '../components/collection/cards.tsx';
import { TypeCards, TypesAfter } from '../components/collection/TypesTab.tsx';
import { ConditionsGrid } from '../components/collection/ConditionsTab.tsx';
import { RegionDetails } from '../components/collection/RegionDetails.tsx';
import { RegionAnalytics } from '../components/collection/RegionAnalytics.tsx';
import { useStore } from '../store.ts';
import { useChunks, useSlide } from '../hooks.ts';
import type { CollectionTab, LibraryKind } from '../types.ts';
import { TagBar, UnfinishedShelf } from '../components/collection/Notebook.tsx';
import {
    AddRow, DexTable, FakemonRow, FolderRow, LibraryRow, MoreRow, VanillaLibraryRow, VanillaPokemonRow
} from '../components/collection/CollectionTable.tsx';

type Layout = 'grid' | 'table';
import '../dialogs/collection.tsx';
import '../dialogs/customType.tsx';
import '../dialogs/customCondition.tsx';
import '../dialogs/newFakemon.tsx';
import { openBulkPaste, openQuickAdd } from '../dialogs/notebook.tsx';

const TABS: Array<[CollectionTab, string]> = [['fakemon', 'Fakémon'], ['moves', 'Moves'], ['abilities', 'Abilities'], ['items', 'Items'], ['types', 'Types'], ['conditions', 'Conditions']];
const SEARCH_PLACEHOLDER: Record<CollectionTab, string> = {
    fakemon: 'Search your Fakemon...', moves: 'Search your custom moves...', abilities: 'Search your custom abilities...',
    items: 'Search your custom items...', types: 'Search your custom types...', conditions: 'Search your conditions...'
};

const PAGE_ORDER = ['grid', 'details', 'analytics'];

export function CollectionPage() {
    useStore();
    const page = getRegionPage();
    const region = api.getActiveRegion();
    const regionId = api.getActiveRegionId?.() ?? null;
    // the sidebar stacks a region's grid, details and analytics, and the
    // regions, top to bottom: moving between them slides up or down
    const stage = useRef<HTMLDivElement>(null);
    const where = useRef({ page: page || 'grid', regionId });
    useLayoutEffect(() => {
        const prev = where.current;
        const next = { page: (page && (region || page === 'analytics')) ? page : 'grid', regionId };
        where.current = next;
        if (prev.page === next.page && prev.regionId === next.regionId) return;
        if (prev.regionId !== next.regionId) {
            const ids = [null, ...api.getRegions().map((r: any) => r.id), NO_REGION];
            slideIn(stage.current, Math.sign(ids.indexOf(next.regionId) - ids.indexOf(prev.regionId)), 'y');
        } else {
            slideIn(stage.current, directionIn(PAGE_ORDER, prev.page, next.page), 'y');
        }
    }, [page, regionId]);
    if (page && (region || page === 'analytics')) {
        return (
            <div className="collection-stage" ref={stage}>
                <section id="region-details" className="region-details">
                    {page === 'analytics' ? <RegionAnalytics region={region || api.analyticsScope()} /> : <RegionDetails region={region} />}
                </section>
            </div>
        );
    }
    const ui = api.collectionUI();
    const crumb = api.activeRegionBreadcrumb();
    return (
        <div className="collection-stage" ref={stage}>
            {crumb?.banner && <div className="collection-region-banner" style={{ backgroundImage: `url('${crumb.banner}')` }} />}
            <Header />
            <div className="collection-nav">
                <div className="tabs collection-tabs" role="tablist" aria-label="Collection view">
                    {TABS.map(([key, label]) => (
                        <button key={key} className={`tab${ui.view === key ? ' active' : ''}`} type="button" role="tab" aria-selected={ui.view === key}
                            onClick={() => api.setCollectionView(key)}>{label}</button>
                    ))}
                </div>
                <Toolbar view={ui.view} search={ui.search} sort={ui.sort} layout={ui.layout} />
            </div>
            {ui.view === 'fakemon' && ui.ready && <TagBar search={ui.search} />}
            <TabStage view={ui.view}>
                {!ui.ready ? <SkeletonGrid /> : ui.view === 'types' ? <TypesGrid layout={ui.layout} search={ui.search} /> : ui.view === 'conditions' ? <ConditionsGrid layout={ui.layout} search={ui.search} /> : <Grid layout={ui.layout} />}
            </TabStage>
        </div>
    );
}

/** The listing under the tabs: it slides in from the side of the tab that was picked. */
function TabStage({ view, children }: { view: CollectionTab; children: ReactNode }) {
    const box = useSlide(view, TABS.map(([k]) => k));
    // a click on the empty space takes the focus, so the keys below work there too
    return (
        <div ref={box} id="collection-listing" tabIndex={-1} onContextMenu={e => backgroundMenu(e, view)} onKeyDown={e => listingKeys(e, view)}>
            {children}
        </div>
    );
}

const CREATE: Array<[string, string, () => void]> = [
    ['Fakémon', 'sparkles', () => api.createNewFakemon()],
    ['Folder', 'folder', () => api.createFolder()],
    ['Custom move', 'bolt', () => api.openLibraryEditorSheet('moves')],
    ['Custom ability', 'sparkles', () => api.openLibraryEditorSheet('abilities')],
    ['Custom item', 'gem', () => api.openLibraryEditorSheet('items')],
    ['Custom type', 'swatch', () => api.openLibraryEditorSheet('types')],
    ['Custom condition', 'beaker', () => api.openLibraryEditorSheet('conditions')],
    ['Region', 'map', () => api.createRegion()]
];

/** A right-click on the empty space, as in File Explorer: View, Sort by, Paste and New. */
function backgroundMenu(e: React.MouseEvent, view: CollectionTab) {
    const target = e.target as Element;
    // a card, a row or a field keeps its own menu
    if (target.closest('[data-entry-id], [data-folder-id], .collection-card, .dex-row, input, textarea, select, .shelf-head')) return;
    e.preventDefault();
    const { layout, sort } = api.collectionUI();
    const listing = document.getElementById('collection-listing');
    openContextMenu(e, {
        items: [
            { label: 'View', icon: 'eye', items: [['grid', 'Grid'], ['table', 'Table']].map(([key, label]) => ({
                label, icon: layout === key ? 'check' : undefined, run: () => { if (layout !== key) fadeSwap(listing, () => api.setCollectionLayout(key)); }
            })) },
            { label: 'Sort by', icon: 'arrows-up-down', items: [
                ...sort.options.map(([key, label]: [string, string]) => ({ label, icon: sort.by === key ? 'check' : undefined, run: () => api.changeCollectionSort(key, sort.order) })),
                { label: 'Ascending', icon: sort.order === 'asc' ? 'check' : undefined, run: () => api.changeCollectionSort(sort.by, 'asc') },
                { label: 'Descending', icon: sort.order === 'desc' ? 'check' : undefined, run: () => api.changeCollectionSort(sort.by, 'desc') }
            ] },
            'sep',
            { label: 'Paste', icon: 'clipboard-document', hint: 'Ctrl+V', disabled: !canPaste(view), run: () => pasteInto(view, state.currentFolderId || null) },
            'sep',
            { label: 'New', icon: 'plus', items: [
                ...CREATE.map(([label, icon, run]) => ({ label, icon, run })),
                { label: 'Quick add', icon: 'light-bulb', hint: 'N', run: openQuickAdd }
            ] }
        ]
    });
}

/** File Explorer's keys for the focused card or row: Ctrl+X, Ctrl+C, Ctrl+V and Delete. */
function listingKeys(e: React.KeyboardEvent, view: CollectionTab) {
    const target = e.target as Element;
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    const entry = target.closest<HTMLElement>('[data-entry-id]');
    const kind = entry?.dataset.entryKind as ClipKind | undefined;
    const id = entry?.dataset.entryId;
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (key === 'x' || key === 'c') && kind && id) {
        e.preventDefault();
        (key === 'x' ? cutEntry : copyEntry)(kind, id);
    } else if (ctrl && key === 'v' && canPaste(view)) {
        e.preventDefault();
        // on a folder: into it; anywhere else: here
        const folder = target.closest<HTMLElement>('[data-folder-id]')?.dataset.folderId;
        pasteInto(view, folder || state.currentFolderId || null);
    } else if (e.key === 'Delete' && kind && id) {
        e.preventDefault();
        if (kind === 'fakemon') api.deleteFakemon(id, menuEvent(entry));
        else api.deleteCustomLibraryItem(kind, id, menuEvent(entry));
    }
}

// ---- header: where you are, and what you can do ----

/** A menu under a button, closed by a click anywhere else. */
function useMenu(): [boolean, (open?: boolean) => void, React.RefObject<HTMLDivElement | null>] {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('click', away);
        return () => document.removeEventListener('click', away);
    }, [open]);
    return [open, (next?: boolean) => setOpen(v => next ?? !v), ref];
}

function MenuButton({ className, icon, label, items }: { className: string; icon: string; label: string; items: Array<[string, () => void]> }) {
    const [open, toggle, ref] = useMenu();
    return (
        <div className="export-as-wrap" ref={ref}>
            <button className={`btn ${className}`} type="button" onClick={() => toggle()} aria-expanded={open}><Icon name={icon} /><span>{label}</span></button>
            {open && (
                <div className="export-as-menu" style={{ display: 'block' }}>
                    {items.map(([text, run]) => (
                        <button key={text} className="export-as-menu-item" type="button" onClick={() => { toggle(false); run(); }}>{text}</button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * A part of the address you can click, and drop cards on as in File
 * Explorer: `dropOut` takes a dragged card out of its folder (to the level
 * this part names).
 */
function Crumb({ onClick, dropOut, children }: { onClick: () => void; dropOut?: boolean; children: ReactNode }) {
    const [over, setOver] = useState(false);
    const dragging = () => !!(api.getDraggedFakemonId?.() || api.getDraggedLibraryItem?.());
    const drop = dropOut ? {
        onDragOver: (e: React.DragEvent) => { if (!dragging()) return; e.preventDefault(); if (!over) setOver(true); },
        onDragLeave: () => setOver(false),
        onDrop: (e: React.DragEvent) => { setOver(false); cardDropInto(e.currentTarget); api.dropOnFolder(null, e); }
    } : {};
    return (
        <span className={`breadcrumb-root${dropOut ? ' breadcrumb-drop' : ''}${over ? ' drag-over' : ''}`} onClick={onClick} style={{ cursor: 'pointer' }} {...drop}>
            {children}
        </span>
    );
}

function Breadcrumb() {
    const region = api.activeRegionBreadcrumb();
    const folder = state.currentFolderId ? state.folders.find(f => f.id === state.currentFolderId) : null;
    const inFolder = !!state.currentFolderId;
    const sep = <span className="breadcrumb-sep" style={{ color: 'var(--text-muted)' }}> / </span>;
    if (region) {
        const label = <>{region.color && <span className="region-dot region-dot-lg" style={{ '--region-color': region.color } as React.CSSProperties} />}{region.name}</>;
        return (
            <>
                <Crumb onClick={() => api.selectRegion(null)}>My Collection</Crumb>
                {sep}
                {folder
                    ? <><Crumb onClick={() => api.openFolder(null)} dropOut>{label}</Crumb>{sep}<span className="breadcrumb-current">{folder.name}</span></>
                    : <span className="breadcrumb-current">{label}</span>}
            </>
        );
    }
    if (!inFolder) return <Crumb onClick={() => api.openFolder(null)}>My Collection</Crumb>;
    return <><Crumb onClick={() => api.openFolder(null)} dropOut>My Collection</Crumb>{sep}<span className="breadcrumb-current">{folder ? folder.name : 'Folder'}</span></>;
}

function Header() {
    const activeRegion = api.getActiveRegion();
    const activeId = api.getActiveRegionId();
    return (
        <div className="page-header" id="collection-header-row">
            <div className="page-heading">
                <h1 className="page-title collection-heading" id="collection-heading"><Breadcrumb /></h1>
            </div>
            <div className="page-actions collection-header-actions">
                {/* phones: the regions sidebar is a drawer, opened from here */}
                <button className="btn btn-secondary collection-regions-btn" id="collection-regions-btn" type="button" onClick={() => api.toggleRegionDrawer()}
                    aria-expanded={isRegionDrawerOpen()} aria-controls="app-sidebar">
                    <Icon name="map" /><span>{activeRegion?.name || (activeId === NO_REGION ? 'No region' : 'All')}</span><Icon name="chevron-down" className="collection-regions-chev" />
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => api.openImportModal()}><Icon name="upload" /><span>Import</span></button>
                <MenuButton className="btn-secondary" icon="download" label={activeRegion ? `Export ${activeRegion.name}` : 'Export'} items={[
                    ['Export as JSON', () => api.exportCollection()],
                    ['Export as Showdown Mod', () => api.exportCollectionAsShowdownMod()],
                    ['Export as Essentials Mod', () => api.exportCollectionAsEssentialsMod()],
                    ['Export as Plain Text (.zip)', () => api.exportCollectionAsPlainTextZip()]
                ]} />
                <button className="btn btn-secondary collection-quick-add" type="button" onClick={openQuickAdd} title="Quick add (N)">
                    <Icon name="light-bulb" /><span>Quick add</span>
                </button>
                <MenuButton className="btn-primary" icon="plus" label="Create" items={[
                    ['New Fakémon', () => api.createNewFakemon()],
                    ['Quick add (N)', openQuickAdd],
                    ['Paste a list of names', openBulkPaste],
                    ['New Folder', () => api.createFolder()],
                    ['New Custom Move', () => api.openLibraryEditorSheet('moves')],
                    ['New Custom Ability', () => api.openLibraryEditorSheet('abilities')],
                    ['New Custom Item', () => api.openLibraryEditorSheet('items')],
                    ['New Custom Type', () => api.openLibraryEditorSheet('types')],
                    ['New Region', () => api.createRegion()]
                ]} />
            </div>
        </div>
    );
}

// ---- search and sort ----

function Toolbar({ view, search, sort, layout }: { view: CollectionTab; search: string; sort: { by: string; order: string; options: Array<[string, string]> }; layout: Layout }) {
    // the field keeps what's typed itself; the grid follows a moment later
    const [text, setText] = useState(search);
    useEffect(() => { setText(search); }, [search]);
    const asc = sort.order === 'asc';
    const shiny = !!state.collectionShinyPreview;
    return (
        <div className="search-bar collection-toolbar">
            <label className="collection-search">
                <Icon name="search" size={15} />
                <input type="search" id="search-input" placeholder={SEARCH_PLACEHOLDER[view]} value={text} aria-label={SEARCH_PLACEHOLDER[view].replace('...', '')}
                    onChange={e => { setText(e.target.value); api.setCollectionSearch(e.target.value); }} />
            </label>
            <div className="collection-sort">
                <select id="collection-sort-by" aria-label="Sort by" value={sort.by} onChange={e => api.changeCollectionSort(e.target.value, sort.order)}>
                    {sort.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button className="btn btn-secondary btn-icon" id="collection-sort-order" type="button" onClick={() => api.changeCollectionSort(sort.by, asc ? 'desc' : 'asc')}
                    aria-label={asc ? 'Ascending. Switch to descending' : 'Descending. Switch to ascending'} title={asc ? 'Ascending' : 'Descending'}>
                    <Icon name={asc ? 'arrow-up' : 'arrow-down'} />
                </button>
            </div>
            <div className="segmented collection-layout" role="group" aria-label="Layout">
                {([['grid', 'layout-grid', 'Grid'], ['table', 'table-cells', 'Table']] as const).map(([key, icon, label]) => (
                    <button key={key} type="button" className={layout === key ? 'active' : ''} aria-pressed={layout === key} aria-label={label} title={label}
                        // the listing fades out, changes layout, and fades back in
                        onClick={() => { if (layout !== key) fadeSwap(document.getElementById('collection-listing'), () => api.setCollectionLayout(key)); }}>
                        <Icon name={icon} />
                    </button>
                ))}
            </div>
            <Presence show={view === 'fakemon'} inline>
                <button className={`btn btn-secondary collection-shiny-toggle${shiny ? ' active' : ''}`} id="collection-shiny-toggle" type="button"
                    onClick={() => api.toggleCollectionShinyPreview()} aria-pressed={shiny}
                    title={shiny ? 'Show normal artwork' : 'Show shiny artwork'}>
                    <Icon name="sparkles" /><span>Shiny</span>
                </button>
            </Presence>
        </div>
    );
}

// ---- the grid ----

function SkeletonGrid() {
    return <div id="collection-grid" className="collection-grid">{Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}</div>;
}

function TypesGrid({ layout, search }: { layout: Layout; search: string }) {
    return (
        <>
            {layout === 'table'
                ? <DexTable kind="types"><TypeCards search={search} table /></DexTable>
                : <div id="collection-grid" className="collection-grid"><TypeCards search={search} /></div>}
            <div id="collection-extra"><TypesAfter search={search} /></div>
        </>
    );
}

const EMPTY: Record<string, [string, string, () => void]> = {
    fakemon: ['No Fakemon Found', 'Create Fakemon', () => api.createNewFakemon()],
    moves: ['No custom moves found', 'Create Custom Move', () => api.openLibraryEditorSheet('moves')],
    abilities: ['No custom abilities found', 'Create Custom Ability', () => api.openLibraryEditorSheet('abilities')],
    items: ['No custom items found', 'Create Custom Item', () => api.openLibraryEditorSheet('items')]
};

function ShowAllVanilla({ kind, total }: { kind: string; total: number }) {
    return <VanillaMoreCard total={total} onClick={() => api.showAllRegionVanilla(kind)} />;
}

function Grid({ layout }: { layout: Layout }) {
    const { kind, search, folders, entries } = api.collectionListing();
    const inFolder = (x: { folderId?: string | null }) => !!x.folderId && !search;
    const vanillaPokemon: any[] = kind === 'fakemon' ? regionVanillaPokemon(search) : [];
    const vanillaLibrary = kind !== 'fakemon' ? regionVanillaLibrary(kind, search) : null;
    const nothing = !entries.length && !folders.length && !vanillaPokemon.length && !vanillaLibrary;
    // cards arrive when the listing itself changes (folder, a search), not on every edit;
    // a tab or region change slides the whole listing instead (CollectionPage, TabStage),
    // and a layout change fades it (Toolbar)
    const grid = useRef<HTMLDivElement>(null);
    const listing = `${state.currentFolderId}|${search ? 's' : ''}`;
    // a big listing draws its first screen, then the rest while the page is idle
    const shown = useChunks(entries.length, `${kind}|${layout}|${listing}|${search}`);
    const own = entries.slice(0, shown);
    const allShown = shown >= entries.length;
    useLayoutEffect(() => {
        const items = grid.current?.querySelector('#collection-grid tbody') || grid.current?.querySelector('#collection-grid');
        if (items) staggerIn(Array.from(items.children));
    }, [listing]);
    // the "Add new" card leads every listing outside a search; the message is for a search that found nothing
    if (search && nothing) {
        const [title, button, run] = EMPTY[kind];
        return (
            <div id="empty-collection" className="empty-state">
                <div className="icon"><Icon name="sparkles" /></div>
                <h3>{title}</h3>
                <p>Try a different search.</p>
                <button className="btn btn-primary" type="button" onClick={run}><Icon name="plus" />{button}</button>
            </div>
        );
    }
    // the shelf of ideas and drafts sits on top of the Fakémon, outside folders and searches
    const shelf = kind === 'fakemon' && !search && !state.currentFolderId ? <UnfinishedShelf table={layout === 'table'} /> : null;
    const more = vanillaLibrary && vanillaLibrary.shown.length < vanillaLibrary.total;
    if (layout === 'table') {
        return (
            <div ref={grid}>
                {shelf}
                <DexTable kind={kind}>
                    {!search && <AddRow kind={kind} />}
                    {folders.map(({ folder, count }: any) => <FolderRow key={folder.id} folder={folder} count={count} kind={kind} />)}
                    {kind === 'fakemon'
                        ? own.map((f: any) => <FakemonRow key={f.id} f={f} inFolder={inFolder(f)} />)
                        : own.map((item: any) => <LibraryRow key={item.id} kind={kind as LibraryKind} item={item} inFolder={inFolder(item)} />)}
                    {/* the main-game entries a region brings over, after its own */}
                    {allShown && vanillaPokemon.map(p => <VanillaPokemonRow key={p.id} p={p} />)}
                    {allShown && vanillaLibrary && vanillaLibrary.shown.map(([id, v]: [string, any]) => <VanillaLibraryRow key={id} kind={kind as LibraryKind} id={id} v={v} />)}
                    {allShown && more && <MoreRow kind={kind} total={vanillaLibrary.total} onClick={() => api.showAllRegionVanilla(kind)} />}
                </DexTable>
            </div>
        );
    }
    return (
        <div ref={grid}>
            {shelf}
            <div id="collection-grid" className={`collection-grid${kind === 'moves' || kind === 'abilities' ? ' text-tiles' : ''}`}>
                {!search && <AddCard kind={kind} />}
                {folders.map(({ folder, count }: any) => <FolderCard key={folder.id} folder={folder} count={count} kind={kind} />)}
                {kind === 'fakemon'
                    ? own.map((f: any) => <FakemonCard key={f.id} f={f} inFolder={inFolder(f)} />)
                    : own.map((item: any) => <LibraryCard key={item.id} kind={kind as LibraryKind} item={item} inFolder={inFolder(item)} />)}
                {/* the main-game entries a region brings over, after its own */}
                {allShown && vanillaPokemon.map(p => <VanillaPokemonCard key={p.id} p={p} />)}
                {allShown && vanillaLibrary && vanillaLibrary.shown.map(([id, v]: [string, any]) => <VanillaLibraryCard key={id} kind={kind as LibraryKind} id={id} v={v} />)}
                {allShown && more && <ShowAllVanilla kind={kind} total={vanillaLibrary.total} />}
            </div>
        </div>
    );
}
