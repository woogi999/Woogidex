// My Collection's Types tab: the add card, your custom types, the main-game
// types the view covers (a region's own versions in place of the originals),
// and a chart of all of them underneath. The data and actions are
// js/features/custom-types.ts.

import { api } from '../../../core/app.ts';
import {
    MULT_LABEL, TYPE_ICON_FILES, matchup, overrideFor, typeBackground, typeStrength, typeUserCount
} from '../../../features/custom-types.ts';
import { Icon } from '../Icon.tsx';
import { AddCard, FolderCard, PinMark, cardActions, cardMenu, libraryDrag } from './cards.tsx';
import { AddRow, FolderRow, TypeRow } from './CollectionTable.tsx';
import { copyEntry, cutEntry, isCut } from '../../../features/clipboard.ts';

/** The symbol inside a type's emblem: an uploaded icon, the main-game symbol, or its initials. */
export function TypeIcon({ name, entry }: { name: string; entry?: any }) {
    if (entry?.icon) return <img src={entry.icon} alt="" draggable={false} />;
    const key = String(name).toLowerCase();
    if (TYPE_ICON_FILES.has(key)) return <img src={`assets/types/${key}.svg`} alt="" draggable={false} />;
    if (name === 'Stellar') return <Icon name="sparkles" />;
    if (name === '???') return <span className="type-emblem-text">?</span>;
    return <span className="type-emblem-text">{String(name).slice(0, 2)}</span>;
}

type TypeActions = {
    pin: (e: any) => void; edit: () => void; duplicate: (e: any) => void; exportFn: (e: any) => void; remove: (e: any) => void; removeTitle?: string;
    cut?: () => void; copy?: () => void; outOfFolder?: (e: any) => void;
};

function TypeCard({ name, bg, onClick, tag, desc, regionId, entry, pinned, actions, table, ownId }: {
    name: string; bg: string; onClick: () => void; tag?: string; desc?: string; regionId: string | null;
    entry?: any; pinned: boolean; actions: TypeActions; table: boolean; ownId?: string;
}) {
    const menu = cardMenu(card => ({
        title: name, subtitle: tag ? `${tag} type` : 'Custom type',
        items: cardActions(card, {
            edit: actions.edit, pinned, pin: actions.pin, cut: actions.cut, copy: actions.copy, duplicate: actions.duplicate,
            outOfFolder: actions.outOfFolder, exports: [['Export', actions.exportFn]], remove: actions.remove, removeLabel: actions.removeTitle
        })
    }), onClick);
    // your own types file, cut, copy and drag like every other entry
    const own = ownId ? { ...libraryDrag('types', ownId), 'data-entry-kind': 'types', 'data-entry-id': ownId } : {};
    const cut = ownId && isCut(ownId) ? ' is-cut' : '';
    const { strong, weak } = typeStrength(name, regionId);
    const style = bg ? { background: bg } : undefined;
    const cls = `type-${name.toLowerCase()}`;
    const emblem = <span className={`library-emblem type-emblem ${cls}`} style={style}><TypeIcon name={name} entry={entry} /></span>;
    if (table) {
        return <TypeRow name={name} icon={emblem} tag={tag} desc={desc} strong={strong} weak={weak} users={typeUserCount(name)} pinned={pinned} menu={{ ...menu, ...own }} extraClass={cut} />;
    }
    return (
        <div className={`collection-card library-tile type-tile${pinned ? ' pinned' : ''}${cut}`}
            title={desc || undefined} aria-label={`${name} type`} {...menu} {...own}>
            <div className="card-art">
                {emblem}
                <span className="card-number library-tile-corner">{typeUserCount(name)} Fakémon</span>
                {tag && <span className="vanilla-card-tag">{tag}</span>}
                {pinned && <PinMark />}
            </div>
            <div className="card-body">
                <div className="card-name">{name}</div>
                <div className="card-meta-row"><span className="card-bst"><em>STRONG</em>{strong}</span><span className="card-bst"><em>WEAK</em>{weak}</span></div>
                <div className="card-types"><span className={`type-badge ${cls}`} style={style}>{name}</span></div>
            </div>
        </div>
    );
}

const byPin = (a: { pinned?: boolean }, b: { pinned?: boolean }) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);

/** The cards for the collection grid, or the rows for its table. */
export function TypeCards({ search, table = false }: { search: string; table?: boolean }) {
    const { list, vanilla, regionId, vanillaCards } = api.typesTabArgs();
    const q = search.trim().toLowerCase();
    const match = (n: string) => !q || n.toLowerCase().includes(q);
    const found = (list as any[]).filter(t => match(t.name) || String(t.desc || '').toLowerCase().includes(q));
    // folders work here as in every other tab; main-game types stay at the top level
    const { folders, entries, inFolder } = api.folderLevel('types', found, q);
    const custom = api.sortCollectionEntries('types', entries) as any[];
    const mainGame = (vanillaCards && !inFolder ? vanilla as string[] : []).filter(match)
        .map(name => ({ name, pinned: !!api.isVanillaPinned?.('types', name) }))
        .sort(byPin);
    return (
        <>
            {!q && (table ? <AddRow kind="types" /> : <AddCard kind="types" />)}
            {folders.map(({ folder, count }: any) => table
                ? <FolderRow key={folder.id} folder={folder} count={count} kind="types" />
                : <FolderCard key={folder.id} folder={folder} count={count} kind="types" />)}
            {custom.map(t => (
                <TypeCard key={t.id} table={table} name={t.name} bg={typeBackground(t)} desc={t.desc} regionId={regionId} entry={t} pinned={!!t.pinned}
                    ownId={t.id} onClick={() => api.openCustomTypeEditor(t.id)}
                    actions={{
                        pin: e => api.toggleCustomTypePin(t.id, e), edit: () => api.openCustomTypeEditor(t.id),
                        cut: () => cutEntry('types', t.id), copy: () => copyEntry('types', t.id),
                        outOfFolder: t.folderId && !q ? e => api.moveLibraryItemOutOfFolder('types', t.id, e) : undefined,
                        duplicate: e => api.duplicateCustomType(t.id, e), exportFn: e => api.exportCustomType(t.id, e),
                        remove: e => api.deleteCustomTypeById(t.id, e)
                    }} />
            ))}
            {mainGame.map(({ name, pinned }) => {
                const o = overrideFor(name, regionId);
                return (
                    <TypeCard key={`vanilla:${name}`} table={table} name={name} bg={o ? typeBackground(o) : ''} regionId={regionId} entry={o} pinned={pinned}
                        tag={o ? 'Edited' : 'Main games'} desc={o?.desc || ''}
                        onClick={() => api.editVanillaType(name)}
                        actions={{
                            pin: e => api.toggleVanillaPin('types', name, e), edit: () => api.editVanillaType(name),
                            duplicate: e => api.duplicateVanillaType(name, e), exportFn: e => api.exportVanillaType(name, e),
                            remove: e => api.removeVanillaFromRegion('types', name, e), removeTitle: 'Remove from region'
                        }} />
                );
            })}
        </>
    );
}

/** Below the grid: "nothing matches", and the chart of every type the view covers. */
export function TypesAfter({ search }: { search: string }) {
    const { list, vanilla, regionId, vanillaCards } = api.typesTabArgs();
    const q = search.trim().toLowerCase();
    const anyCard = (list as any[]).some(t => t.name.toLowerCase().includes(q) || String(t.desc || '').toLowerCase().includes(q))
        || (vanillaCards && (vanilla as string[]).some(n => n.toLowerCase().includes(q)));
    return (
        <>
            {q && !anyCard && <p className="types-empty">No types match “{search}”.</p>}
            <TypeChart types={[...vanilla, ...(list as any[]).map(t => t.name)]} regionId={regionId} />
        </>
    );
}

const Badge = ({ t }: { t: string }) => <span className={`type-badge type-${t.toLowerCase()}`}>{t}</span>;

/** Attacker rows by defender columns, for the given types. */
export function TypeChart({ types, regionId = null }: { types: string[]; regionId?: string | null }) {
    if (!types.length) return null;
    return (
        <section className="type-chart-section">
            <header className="search-section-head">
                <h2>Type chart</h2>
                <span className="type-chart-key">
                    <span className="chart-cell mult-4">4</span> extremely <span className="chart-cell mult-2">2</span> super effective <span className="chart-cell mult-05">½</span> not very <span className="chart-cell mult-0">0</span> no effect
                </span>
            </header>
            <div className="type-chart-scroll">
                <table className="type-chart">
                    <thead>
                        <tr>
                            <th className="type-chart-corner"><span>Attacking</span><span>Defending</span></th>
                            {types.map(t => <th key={t} className="type-chart-col"><Badge t={t} /></th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {types.map(a => (
                            <tr key={a}>
                                <th className="type-chart-row"><Badge t={a} /></th>
                                {types.map(d => {
                                    const m = matchup(a, d, regionId);
                                    return <td key={d} className={`chart-cell mult-${String(m).replace('.', '')}`} title={`${a} vs ${d}: ${m}×`}>{m === 1 ? '' : (MULT_LABEL as Record<string, string>)[String(m)]}</td>;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
