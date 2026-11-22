// My Collection's Conditions tab: your status conditions, weather and
// terrains, one section each. Inside a region the main-game ones are listed
// too, and editing one makes that region's own version (like the Types tab).
// The data and actions are js/features/custom-conditions.ts.

import { api } from '../../../core/app.ts';
import {
    CONDITION_ICON, CONDITION_KINDS, VANILLA_CONDITIONS, conditionOverride, conditionUserCount, conditionsTabArgs,
    deleteConditionById, duplicateCondition, editVanillaCondition, exportCondition, openCustomConditionEditor, toggleConditionPin,
    type ConditionKind
} from '../../../features/custom-conditions.ts';
import { Icon } from '../Icon.tsx';
import { FolderCard, PinMark, cardActions, cardMenu, libraryDrag } from './cards.tsx';
import { DexTable, FolderRow, IconCell, NameCell } from './CollectionTable.tsx';
import { copyEntry, cutEntry, isCut } from '../../../features/clipboard.ts';

type Card = { key: string; ownId?: string; name: string; color: string; desc: string; duration: number; tag?: string; pinned: boolean; users: number; open: () => void; menu: (card: Element) => any };

/** What makes your own condition behave like every other entry: drag into a folder, and the keys of My Collection. */
const ownProps = (c: Card) => c.ownId ? { ...libraryDrag('conditions', c.ownId), 'data-entry-kind': 'conditions', 'data-entry-id': c.ownId } : {};
const cutClass = (c: Card) => c.ownId && isCut(c.ownId) ? ' is-cut' : '';

const durationText = (kind: ConditionKind, n: number) => n ? `${n} turn${n === 1 ? '' : 's'}` : kind === 'status' ? 'Until cured' : 'Until replaced';

function Emblem({ kind, color }: { kind: ConditionKind; color: string }) {
    return <span className="library-emblem cond-emblem" style={{ background: color }}><Icon name={CONDITION_ICON[kind]} /></span>;
}

const matches = (q: string, name: string, desc = '') => !q || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);

/** Your conditions at this folder level (every folder while searching), and the folders here. */
function conditionLevel(q: string) {
    const { list } = conditionsTabArgs();
    return api.folderLevel('conditions', list.filter((c: any) => matches(q, c.name, c.desc)), q);
}

/** The cards (or rows) of one kind: yours first, then the main-game ones inside a region (outside folders). */
function cardsFor(kind: ConditionKind, q: string, level: { entries: any[]; inFolder: boolean }): Card[] {
    const { regionId, vanillaCards } = conditionsTabArgs();
    const ours = api.sortCollectionEntries('conditions', level.entries.filter((c: any) => c.kind === kind)) as any[];
    const mine: Card[] = ours.map((c: any) => ({
        key: c.id, ownId: c.id, name: c.name, color: c.color, desc: c.desc, duration: Number(c.duration) || 0, pinned: !!c.pinned, users: conditionUserCount(c),
        open: () => openCustomConditionEditor(c.id),
        menu: (card: Element) => ({
            title: c.name, subtitle: `Custom ${CONDITION_KINDS.find(k => k[0] === kind)![2]}`,
            items: cardActions(card, {
                edit: () => openCustomConditionEditor(c.id), pinned: !!c.pinned, pin: e => toggleConditionPin(c.id, e),
                cut: () => cutEntry('conditions', c.id), copy: () => copyEntry('conditions', c.id),
                duplicate: e => duplicateCondition(c.id, e),
                outOfFolder: c.folderId && !q ? e => api.moveLibraryItemOutOfFolder('conditions', c.id, e) : undefined,
                exports: [['Export', e => exportCondition(c.id, e)]],
                remove: e => deleteConditionById(c.id, e)
            }).flatMap(item => typeof item === 'object' && item.label === 'Edit'
                ? [item, { label: 'Battle code', icon: 'puzzle-piece', run: () => api.openAbilityBlockEditor?.(c.id, 'condition') }]
                : [item])
        })
    }));
    const main: Card[] = !vanillaCards || level.inFolder ? [] : VANILLA_CONDITIONS[kind].filter(v => matches(q, v.name, v.desc)).map(v => {
        const o = conditionOverride(kind, v.id, regionId);
        return {
            key: `vanilla:${v.id}`, name: v.name, color: o?.color || v.color, desc: o?.desc || v.desc, duration: Number(o?.duration ?? (kind === 'status' ? 0 : 5)),
            tag: o ? 'Edited' : 'Main games', pinned: false, users: 0,
            open: () => editVanillaCondition(kind, v.id),
            menu: (card: Element) => ({
                title: v.name, subtitle: o ? "This region's version" : 'From the main games',
                items: cardActions(card, { edit: () => editVanillaCondition(kind, v.id), editLabel: o ? 'Edit' : "Make this region's version" })
                    .concat(o ? [{ label: 'Battle code', icon: 'puzzle-piece', run: () => api.openAbilityBlockEditor?.(o.id, 'condition') }] : [])
            })
        };
    });
    return [...mine, ...main];
}

export function ConditionsGrid({ layout, search }: { layout: 'grid' | 'table'; search: string }) {
    const q = search.trim().toLowerCase();
    const level = conditionLevel(q);
    const sections = CONDITION_KINDS.map(([kind, label, one]) => ({ kind, label, one, cards: cardsFor(kind, q, level) }));
    const any = sections.some(s => s.cards.length);
    // inside a folder, a kind with nothing in it is left out
    const hideEmpty = !!q || level.inFolder;
    return (
        <div id="collection-grid" className="cond-sections">
            {level.folders.length > 0 && (
                layout === 'table'
                    ? <DexTable kind="conditions" id="">{level.folders.map(({ folder, count }: any) => <FolderRow key={folder.id} folder={folder} count={count} kind="conditions" />)}</DexTable>
                    : <div className="collection-grid text-tiles">{level.folders.map(({ folder, count }: any) => <FolderCard key={folder.id} folder={folder} count={count} kind="conditions" />)}</div>
            )}
            {sections.map(({ kind, label, one, cards }) => (hideEmpty && !cards.length) ? null : (
                <section key={kind} className="cond-section" aria-labelledby={`cond-${kind}`}>
                    <header className="shelf-head cond-head">
                        <h2 id={`cond-${kind}`}><Icon name={CONDITION_ICON[kind]} size={16} />{label}</h2>
                        <span className="cond-count">{cards.length}</span>
                    </header>
                    {layout === 'table' ? (
                        <DexTable kind="conditions" id="">
                            {!q && (
                                <tr className="dex-row dex-add" tabIndex={0} role="button" onClick={() => openCustomConditionEditor('', kind)}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCustomConditionEditor('', kind); } }}>
                                    <IconCell><Icon name="plus" size={18} /></IconCell>
                                    <td className="col-wide" colSpan={4}><span className="dex-name-text">Add new {one}</span></td>
                                </tr>
                            )}
                            {cards.map(c => (
                                <tr key={c.key} className={`dex-row${c.pinned ? ' pinned' : ''}${c.tag === 'Main games' ? ' is-vanilla' : ''}${cutClass(c)}`} aria-label={c.name} {...cardMenu(c.menu, c.open)} {...ownProps(c)}>
                                    <IconCell><Emblem kind={kind} color={c.color} /></IconCell>
                                    <NameCell name={c.name} tag={c.tag} pinned={c.pinned} />
                                    <td className="col-stat"><em>Lasts</em>{durationText(kind, c.duration)}</td>
                                    <td className="col-stat"><em>Fakémon</em>{c.tag ? '—' : c.users}</td>
                                    <td className="col-desc"><span className={`dex-desc${c.desc ? '' : ' is-empty'}`} title={c.desc || undefined}>{c.desc || 'No description'}</span></td>
                                </tr>
                            ))}
                        </DexTable>
                    ) : (
                        <div className="collection-grid text-tiles">
                            {!q && (
                                <button type="button" className="collection-card collection-add-card" onClick={() => openCustomConditionEditor('', kind)}>
                                    <span className="card-art"><span className="collection-add-icon"><Icon name="plus" /></span></span>
                                    <span className="card-body"><span className="card-name">Add new {one}</span></span>
                                </button>
                            )}
                            {cards.map(c => (
                                <div key={c.key} className={`collection-card library-tile text-tile cond-tile${c.pinned ? ' pinned' : ''}${cutClass(c)}`} title={c.desc || undefined} aria-label={c.name} {...cardMenu(c.menu, c.open)} {...ownProps(c)}>
                                    {c.pinned && <PinMark />}
                                    <div className="card-body">
                                        {c.tag && <span className="text-tile-tag">{c.tag}</span>}
                                        <div className="card-name">{c.name}</div>
                                        <div className="card-meta-row"><span className="card-bst"><em>Lasts</em>{durationText(kind, c.duration)}</span></div>
                                        <div className="card-types"><span className="cond-chip" style={{ background: c.color }}><Icon name={CONDITION_ICON[kind]} size={12} />{one.charAt(0).toUpperCase() + one.slice(1)}</span></div>
                                        <div className="text-tile-desc"><span className={`library-tile-desc${c.desc ? '' : ' is-empty'}`}>{c.desc || 'No description'}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            ))}
            {q && !any && <p className="types-empty">No conditions match “{search}”.</p>}
        </div>
    );
}
