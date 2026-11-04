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
import { PinMark, cardActions, cardMenu } from './cards.tsx';
import { DexTable, IconCell, NameCell } from './CollectionTable.tsx';

type Card = { key: string; name: string; color: string; desc: string; duration: number; tag?: string; pinned: boolean; users: number; open: () => void; menu: (card: Element) => any };

const durationText = (kind: ConditionKind, n: number) => n ? `${n} turn${n === 1 ? '' : 's'}` : kind === 'status' ? 'Until cured' : 'Until replaced';

function Emblem({ kind, color }: { kind: ConditionKind; color: string }) {
    return <span className="library-emblem cond-emblem" style={{ background: color }}><Icon name={CONDITION_ICON[kind]} /></span>;
}

/** The cards (or rows) of one kind: yours first, then the main-game ones inside a region. */
function cardsFor(kind: ConditionKind, q: string): Card[] {
    const { list, regionId, vanillaCards } = conditionsTabArgs();
    const match = (name: string, desc = '') => !q || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
    const mine: Card[] = list.filter((c: any) => c.kind === kind && match(c.name, c.desc)).map((c: any) => ({
        key: c.id, name: c.name, color: c.color, desc: c.desc, duration: Number(c.duration) || 0, pinned: !!c.pinned, users: conditionUserCount(c),
        open: () => openCustomConditionEditor(c.id),
        menu: (card: Element) => ({
            title: c.name, subtitle: `Custom ${CONDITION_KINDS.find(k => k[0] === kind)![2]}`,
            items: cardActions(card, {
                edit: () => openCustomConditionEditor(c.id), pinned: !!c.pinned, pin: e => toggleConditionPin(c.id, e),
                duplicate: e => duplicateCondition(c.id, e), exports: [['Export', e => exportCondition(c.id, e)]],
                remove: e => deleteConditionById(c.id, e)
            }).concat([{ label: 'Battle code', icon: 'puzzle-piece', run: () => api.openAbilityBlockEditor?.(c.id, 'condition') }])
        })
    }));
    const main: Card[] = !vanillaCards ? [] : VANILLA_CONDITIONS[kind].filter(v => match(v.name, v.desc)).map(v => {
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
    return [...mine.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)), ...main];
}

export function ConditionsGrid({ layout, search }: { layout: 'grid' | 'table'; search: string }) {
    const q = search.trim().toLowerCase();
    const { vanillaCards } = conditionsTabArgs();
    const sections = CONDITION_KINDS.map(([kind, label, one]) => ({ kind, label, one, cards: cardsFor(kind, q) }));
    const any = sections.some(s => s.cards.length);
    return (
        <div id="collection-grid" className="cond-sections">
            {!vanillaCards && !q && !any && (
                <p className="cond-hint">Make your own status conditions, weather and terrains here. Open a region to change its main-game ones too.</p>
            )}
            {sections.map(({ kind, label, one, cards }) => (q && !cards.length) ? null : (
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
                                <tr key={c.key} className={`dex-row${c.pinned ? ' pinned' : ''}${c.tag === 'Main games' ? ' is-vanilla' : ''}`} aria-label={c.name} {...cardMenu(c.menu, c.open)}>
                                    <IconCell><Emblem kind={kind} color={c.color} /></IconCell>
                                    <NameCell name={c.name} tag={c.tag} pinned={c.pinned} />
                                    <td className="col-stat"><em>Lasts</em>{durationText(kind, c.duration)}</td>
                                    <td className="col-stat"><em>Fakémon</em>{c.tag ? '—' : c.users}</td>
                                    <td className="col-desc"><span className={`dex-desc${c.desc ? '' : ' is-empty'}`} title={c.desc || undefined}>{c.desc || 'No description'}</span></td>
                                </tr>
                            ))}
                        </DexTable>
                    ) : (
                        <div className="collection-grid">
                            {!q && (
                                <button type="button" className="collection-card collection-add-card" onClick={() => openCustomConditionEditor('', kind)}>
                                    <span className="card-art"><span className="collection-add-icon"><Icon name="plus" /></span></span>
                                    <span className="card-body"><span className="card-name">Add new {one}</span></span>
                                </button>
                            )}
                            {cards.map(c => (
                                <div key={c.key} className={`collection-card library-tile cond-tile${c.pinned ? ' pinned' : ''}`} title={c.desc || undefined} aria-label={c.name} {...cardMenu(c.menu, c.open)}>
                                    <div className="card-art">
                                        <Emblem kind={kind} color={c.color} />
                                        {/* the corner holds the tag on a main-game one */}
                                        {!c.tag && <span className="card-number library-tile-corner">{durationText(kind, c.duration)}</span>}
                                        {c.tag && <span className="vanilla-card-tag">{c.tag}</span>}
                                        {c.pinned && <PinMark />}
                                    </div>
                                    <div className="card-body">
                                        <div className="card-name">{c.name}</div>
                                        <div className="card-meta-row"><span className={`library-tile-desc${c.desc ? '' : ' is-empty'}`}>{c.desc || 'No description'}</span></div>
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
