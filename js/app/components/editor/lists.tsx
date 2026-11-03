// The editor's abilities and learnset: the search-as-you-type boxes that add
// to them, the rows with their inline controls, the learnset's filters and
// its breakdown chart. The data and rules are js/editor/editor.ts and
// ./learnset-model.ts; this draws state.abilities and state.learnset.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, state } from '../../../core/app.ts';
import { abilityRole, accuracyText } from '../../../editor/learnset-model.ts';
import { Icon } from '../Icon.tsx';
import { NAME_MAX } from '../../../core/data.ts';
import { CategoryBadge, CategoryIcon } from '../MoveCategory.tsx';
import { SortTh } from '../SortHeader.tsx';
import { MOVE_QUERY_EXAMPLES, describeClause } from '../../../features/move-query.ts';

// the icon used to be drawn here; it lives with the badge now
export { CategoryIcon };

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

// ---- search-as-you-type ----

/**
 * A text box with up to eight suggestions under it. Enter adds the closest
 * match (onEnter says whether it did, and the box clears when it has).
 * keepText: the text is the value itself (a set's item or move), so picking
 * one fills it in rather than clearing it.
 */
export function Autocomplete({ id, placeholder, text, setText, suggest, onPick, onEnter, showCategory, keepText, footer }: {
    id: string; placeholder: string; text: string; setText: (t: string) => void;
    suggest: (q: string) => any[]; onPick: (item: any) => void; onEnter: (text: string) => boolean; showCategory?: boolean;
    keepText?: boolean; footer?: (close: () => void) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const items = open ? suggest(text) : [];
    const done = () => { if (!keepText) setText(''); setOpen(false); };
    return (
        <>
            <input type="text" id={id} placeholder={placeholder} autoComplete="off" maxLength={NAME_MAX} value={text}
                onChange={e => { setText(e.target.value); setOpen(!!e.target.value.trim()); }}
                onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (!text.trim()) { done(); return; }
                    if (onEnter(text)) done();
                }}
                // a moment's grace, so a click on a suggestion still lands
                onBlur={() => setTimeout(() => setOpen(false), 200)} />
            <div className={`autocomplete-dropdown${open && text.trim() ? ' active' : ''}`}>
                {open && text.trim() && (items.length ? items.map(item => (
                    <div key={item.key || item.name} className="autocomplete-item" onMouseDown={e => { e.preventDefault(); onPick(item); done(); }}>
                        {item.name}
                        {showCategory && item.category && <CategoryBadge category={item.category} iconOnly />}
                    </div>
                )) : <div className="autocomplete-item">No matches</div>)}
                {open && text.trim() && footer?.(() => setOpen(false))}
            </div>
        </>
    );
}

// ---- abilities ----

/** Search the main-game abilities and add one. */
export function AbilitySearch() {
    const [text, setText] = useState('');
    return (
        <div className="autocomplete-container">
            <Autocomplete id="ability-input" placeholder="Search abilities..." text={text} setText={setText} suggest={api.abilitySuggestions}
                onPick={item => api.addAbility(item.name, 'sd')} onEnter={t => api.addAbilityByName(t)} />
        </div>
    );
}

function RoleLabel({ role }: { role: string | null }) {
    return role ? <span className={`ability-label ${role.toLowerCase()}`}>{role}</span> : null;
}

/** A custom ability open for editing in place; a click outside the row closes it. */
function AbilityEditRow({ ability, index, role, desc, dragProps, dragState }: any) {
    const row = useRef<HTMLDivElement>(null);
    useEffect(() => {
        row.current?.querySelector<HTMLInputElement>('.ability-name-input')?.focus();
        const away = (e: MouseEvent) => { if (!row.current?.contains(e.target as Node)) api.finishCustomAbilityEdit(index); };
        document.addEventListener('mousedown', away);
        return () => document.removeEventListener('mousedown', away);
    }, [index]);
    return (
        <div ref={row} className={`ability-row ability-custom ability-editing ${dragState}`.trim()} data-ability-index={index} {...dragProps}>
            <span className="ability-drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</span>
            <div className="ability-body">
                <div className="ability-name-wrap">
                    {/* uncontrolled: the list redraws on each keystroke and would fight the caret */}
                    <input className="ability-name-input" type="text" maxLength={NAME_MAX} defaultValue={ability.name || ''} placeholder="Ability name"
                        onChange={e => api.updateAbility(index, 'name', e.target.value)} />
                    <RoleLabel role={role} />
                </div>
                <input className="ability-desc-input" type="text" defaultValue={desc} placeholder="Short description"
                    onChange={e => api.updateAbility(index, 'desc', e.target.value)} />
            </div>
            <button className="ability-remove" type="button" title="Remove" aria-label="Remove" onClick={e => { stop(e); api.removeAbility(index); }}>
                <Icon name="x" size={14} />
            </button>
        </div>
    );
}

function AbilityRow({ ability, index, role, desc, isCustom, isCoded, dragProps, dragState }: any) {
    // only custom abilities are editable
    const editProps = isCustom ? { onClick: (e: React.MouseEvent) => { stop(e); api.toggleCustomAbilityEdit(index); }, title: 'Click to edit' } : {};
    return (
        <div className={`ability-row${isCustom ? ' ability-custom' : ''} ${dragState}`.trim()} draggable data-ability-index={index} {...dragProps}>
            <span className="ability-drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</span>
            <div className="ability-body">
                <div className="ability-name-wrap">
                    <span className="ability-name-text" {...editProps}>{ability.name || 'Unnamed Ability'}</span>
                    <RoleLabel role={role} />
                    {isCoded && <span className="ability-code-badge" title="Has battle code from the block editor"><Icon name="puzzle" /> Coded</span>}
                </div>
                <div className="ability-desc-text" {...editProps}>{desc || 'No description available.'}</div>
            </div>
            {isCustom && ability.customId && (
                <button className="ability-code-open" type="button" title={isCoded ? 'Edit battle code' : 'Add battle code'}
                    onClick={e => { stop(e); api.openAbilityBlockEditor(ability.customId); }}>
                    <Icon name="puzzle" />
                </button>
            )}
            <button className="ability-remove" type="button" title="Remove" aria-label="Remove" onClick={e => { stop(e); api.removeAbility(index); }}>
                <Icon name="x" size={14} />
            </button>
        </div>
    );
}

/** The Fakemon's up-to-four abilities, dragged to reorder (the order decides Hidden and Event). */
export function AbilityList() {
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);
    const abilities: any[] = state.abilities || [];
    const editing = api.getEditingAbilityIndex();
    return (
        <div id="abilities-list">
            {abilities.map((ability, index) => {
                const { isCustom = false, isCoded = false, desc = '' } = api.describeAbility(ability) || {};
                const role = abilityRole(index, abilities.length);
                const dragProps = {
                    onDragStart: (e: React.DragEvent) => {
                        // avoid stealing the text selection gesture from inputs
                        if ((e.target as Element).closest('input, button')) { e.preventDefault(); return; }
                        setDragging(index);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(index));
                    },
                    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(index); },
                    onDragLeave: () => setOver(o => (o === index ? null : o)),
                    onDrop: (e: React.DragEvent) => {
                        e.preventDefault();
                        const from = dragging !== null ? dragging : Number(e.dataTransfer.getData('text/plain'));
                        setDragging(null);
                        setOver(null);
                        api.moveAbility(from, index);
                    },
                    onDragEnd: () => { setDragging(null); setOver(null); }
                };
                const dragState = [dragging === index ? 'ability-dragging' : '', over === index ? 'ability-drag-over' : ''].filter(Boolean).join(' ');
                const common = { ability, index, role, desc, dragProps, dragState };
                const key = ability.customId || ability.name || index;
                return isCustom && editing === index
                    ? <AbilityEditRow key={key} {...common} />
                    : <AbilityRow key={key} {...common} isCustom={isCustom} isCoded={isCoded} />;
            })}
        </div>
    );
}

// ---- learnset ----
// One search box, the way Showdown's teambuilder works: it filters the moves
// this Fakémon knows, and every other move that matches shows under them,
// greyed out, to add with a click. It reads Showdown's /movesearch language
// too (js/features/move-query.ts): "fire, physical, bp > 80". The columns
// sort the list.

const METHODS: Array<[string, string]> = [['none', '—'], ['level', 'Lv'], ['tm', 'TM'], ['egg', 'Egg']];

/** How a move is learned: the method, and the level for a level-up move. */
function MethodCell({ move, index }: { move: any; index: number }) {
    const method = move.learnMethod || 'none';
    return (
        <span className="ls-method" onClick={stop}>
            <select className="ls-method-select" value={method} aria-label="How it's learned"
                onChange={e => api.updateMoveMethod(index, e.target.value)}>
                {METHODS.map(([k, l]) => <option key={k} value={k}>{k === 'none' ? '—' : k === 'level' ? 'Level' : l}</option>)}
            </select>
            {method === 'level' && (
                <input type="number" className="ls-level" placeholder="Lv" min={1} max={100} aria-label="Level" defaultValue={move.level || ''}
                    onChange={e => api.updateMoveLevel(index, e.target.value)} />
            )}
        </span>
    );
}

const prioText = (p: any) => (Number(p) ? `${Number(p) > 0 ? '+' : ''}${Number(p)}` : '0');

/** A row of the list. A move it knows has its learn method and a remove; one it doesn't is greyed and adds on a click. */
function MoveRow({ move, index, ghost, onAdd }: { move: any; index?: number; ghost?: boolean; onAdd?: () => void }) {
    const custom = api.isCustomMove(move);
    const open = () => {
        if (ghost) { onAdd?.(); return; }
        if (custom) api.openCustomMoveModal(index); else api.showMoveDetail(move.name);
    };
    const type = String(move.type || 'Normal');
    return (
        <div className={`ls-row${ghost ? ' is-ghost' : ''}${custom ? ' is-custom' : ''}`} role="row" tabIndex={0}
            onClick={open} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); }}
            title={ghost ? `Add ${move.name} to the learnset` : custom ? 'Edit this custom move' : 'See what it does'}>
            <span className="ls-c ls-name" role="cell">
                <span className="ls-name-text">{move.name}</span>
                {custom && <span className="ls-custom-tag">Custom</span>}
                <span className="ls-desc">{move.shortDesc || move.desc || ''}</span>
            </span>
            <span className="ls-c ls-type" role="cell"><span className={`type-pill type-${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{type}</span></span>
            <span className="ls-c ls-cat" role="cell"><CategoryBadge category={move.category} iconOnly /></span>
            <span className="ls-c ls-num ls-bp" role="cell" data-label="BP">{Number(move.basePower) || '—'}</span>
            <span className="ls-c ls-num ls-acc" role="cell" data-label="Acc">{accuracyText(move.accuracy)}</span>
            <span className="ls-c ls-num ls-pp" role="cell" data-label="PP">{move.pp || '—'}</span>
            <span className="ls-c ls-num ls-prio" role="cell" data-label="Prio">{prioText(move.priority)}</span>
            <span className="ls-c ls-learn" role="cell">
                {ghost
                    ? <span className="ls-add-hint"><Icon name="plus" size={13} />Add</span>
                    : <MethodCell move={move} index={index!} />}
            </span>
            <span className="ls-c ls-x" role="cell">
                {!ghost && <button className="ls-remove" type="button" aria-label={`Remove ${move.name}`} title="Remove" onClick={e => { stop(e); api.removeLearnsetMove(index); }}><Icon name="x" size={14} /></button>}
            </span>
        </div>
    );
}

/** The same move as a card, for the grid view: badges, name, numbers, then how it's learned. */
function MoveCard({ move, index, ghost, onAdd }: { move: any; index?: number; ghost?: boolean; onAdd?: () => void }) {
    const custom = api.isCustomMove(move);
    const open = () => {
        if (ghost) { onAdd?.(); return; }
        if (custom) api.openCustomMoveModal(index); else api.showMoveDetail(move.name);
    };
    const type = String(move.type || 'Normal');
    const prio = Number(move.priority) || 0;
    return (
        <div className={`ls-card${ghost ? ' is-ghost' : ''}${custom ? ' is-custom' : ''}`} role="listitem" tabIndex={0}
            onClick={open} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); }}
            title={ghost ? `Add ${move.name} to the learnset` : custom ? 'Edit this custom move' : 'See what it does'}>
            <span className="ls-card-top">
                <span className={`type-pill type-${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{type}</span>
                <CategoryBadge category={move.category} iconOnly />
                {custom && <span className="ls-custom-tag">Custom</span>}
                {!ghost && <button className="ls-remove" type="button" aria-label={`Remove ${move.name}`} title="Remove" onClick={e => { stop(e); api.removeLearnsetMove(index); }}><Icon name="x" size={14} /></button>}
            </span>
            <span className="ls-card-name">{move.name}</span>
            <span className="ls-card-nums">
                <span><small>BP</small>{Number(move.basePower) || '—'}</span>
                <span><small>Acc</small>{accuracyText(move.accuracy)}</span>
                <span><small>PP</small>{move.pp || '—'}</span>
                {prio !== 0 && <span><small>Prio</small>{prioText(prio)}</span>}
            </span>
            <span className="ls-card-learn">
                {ghost ? <span className="ls-add-hint"><Icon name="plus" size={13} />Add</span> : <MethodCell move={move} index={index!} />}
            </span>
        </div>
    );
}

// the table or the grid: a choice for this browser only, the table by default
const VIEW_KEY = 'woogidex-learnset-view';
type LearnsetView = 'table' | 'grid';
const readView = (): LearnsetView => { try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'table'; } catch { return 'table'; } };
const saveView = (v: LearnsetView) => { try { if (v === 'table') localStorage.removeItem(VIEW_KEY); else localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

const COLUMNS: Array<[string, string, string?]> = [
    ['name', 'Name'], ['type', 'Type'], ['category', 'Cat'], ['power', 'BP'], ['accuracy', 'Acc'], ['pp', 'PP'], ['priority', 'Prio'], ['method', 'Learned']
];
const COL_CLASS: Record<string, string> = { name: 'ls-name', type: 'ls-type', category: 'ls-cat', power: 'ls-num ls-bp', accuracy: 'ls-num ls-acc', pp: 'ls-num ls-pp', priority: 'ls-num ls-prio', method: 'ls-learn' };

function HeaderRow() {
    const f = api.getLearnsetFilters();
    const sort = f.sort === 'default' ? null : { key: f.sort, order: f.order };
    return (
        <div className="ls-row ls-head" role="row">
            {COLUMNS.map(([key, label]) => (
                <SortTh key={key} as="div" className={`ls-c ${COL_CLASS[key]}`} label={label} sortKey={key} sort={sort} onSort={k => api.cycleLearnsetSort(k)} />
            ))}
            <span className="ls-c ls-x" />
        </div>
    );
}

/** The grid view's sort: the same column names, as one row of buttons. */
function SortStrip() {
    const f = api.getLearnsetFilters();
    const sort = f.sort === 'default' ? null : { key: f.sort, order: f.order };
    return (
        <div className="ls-sortbar" role="group" aria-label="Sort the learnset">
            <span className="ls-sortbar-label">Sort</span>
            {COLUMNS.map(([key, label]) => (
                <SortTh key={key} as="div" className="ls-sortbar-item" label={label} sortKey={key} sort={sort} onSort={k => api.cycleLearnsetSort(k)} />
            ))}
        </div>
    );
}

/** The search box's help: what you can type. */
function QueryHelp({ onPick }: { onPick: (q: string) => void }) {
    return (
        <div className="ls-help" role="dialog" aria-label="Search tips">
            <p>Search names, or filter like Showdown's <code>/ms</code>: separate filters with commas, use <code>|</code> for "or" and <code>!</code> for "not".</p>
            <div className="ls-help-grid">
                {MOVE_QUERY_EXAMPLES.map(([q, what]) => (
                    <button key={q} type="button" className="ls-help-ex" onClick={() => onPick(q)}><code>{q}</code><span>{what}</span></button>
                ))}
            </div>
            <p className="ls-help-foot">Types, Physical / Special / Status, flags (contact, sound, your own), <code>bp</code> <code>acc</code> <code>pp</code> <code>prio</code> with &gt; &lt; =, statuses (burn, sleep), <code>raises atk</code>, <code>lowers spe</code>, recovery, recoil, pivot, hazard, and for its own moves: learned, level, tm, egg, <code>lv &lt;= 20</code>.</p>
        </div>
    );
}

/** The search, the "add as" choice, the column headers and the list. */
export function LearnsetEditor() {
    const f = api.getLearnsetFilters();
    const [limit, setLimit] = useState(60);
    const [help, setHelp] = useState(false);
    const [view, setView] = useState<LearnsetView>(readView);
    const pickView = (v: LearnsetView) => { setView(v); saveView(v); };
    const grid = view === 'grid';
    const input = useRef<HTMLInputElement>(null);
    const { method, level } = api.getNewMoveMethod();
    const res = api.learnsetSearch(limit);
    const learned: Array<{ m: any; i: number }> = res.learned;
    const others: any[] = res.others;
    const query: string = f.query || '';
    useEffect(() => { setLimit(60); }, [query]);
    const setQuery = (q: string) => api.setLearnsetFilters({ query: q });
    const addFirst = () => { if (others[0]) api.addMoveFromSearch(others[0].key); };
    const total = state.learnset.length;
    return (
        <div className="ls">
            <div className="ls-bar">
                <label className="ls-search">
                    <Icon name="search" size={16} />
                    <input ref={input} id="learnset-search" type="text" autoComplete="off" spellCheck={false} value={query}
                        placeholder="Search learnset or add moves · try fire, physical, bp > 80"
                        aria-label="Search the learnset, or find moves to add"
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); addFirst(); }
                            else if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); }
                        }} />
                    {query && <button type="button" className="ls-clear" aria-label="Clear the search" onClick={() => { setQuery(''); input.current?.focus(); }}><Icon name="x" size={14} /></button>}
                    <button type="button" className={`ls-help-btn${help ? ' is-on' : ''}`} aria-expanded={help} aria-label="Search tips" title="Search tips" onClick={() => setHelp(v => !v)}><Icon name="question-mark-circle" size={16} /></button>
                </label>
                <div className="ls-addas" role="group" aria-label="New moves are learned by">
                    <span className="ls-addas-label">Add as</span>
                    <div className="segmented">
                        {METHODS.map(([k, l]) => (
                            <button key={k} type="button" className={method === k ? 'active' : ''} aria-pressed={method === k}
                                onClick={() => api.setNewMoveMethod({ method: k, ...(k !== 'level' ? { level: '' } : {}) })}>{l}</button>
                        ))}
                    </div>
                    {method === 'level' && (
                        <input className="ls-addas-level" type="number" min={1} max={100} placeholder="Lv" aria-label="Level for new moves" value={level}
                            onChange={e => api.setNewMoveMethod({ level: e.target.value })} />
                    )}
                </div>
                <div className="segmented ls-view" role="group" aria-label="Show the learnset as">
                    <button type="button" className={grid ? '' : 'active'} aria-pressed={!grid} title="Table" aria-label="Table" onClick={() => pickView('table')}><Icon name="table-cells" /></button>
                    <button type="button" className={grid ? 'active' : ''} aria-pressed={grid} title="Grid" aria-label="Grid" onClick={() => pickView('grid')}><Icon name="squares-2x2" /></button>
                </div>
            </div>
            {help && <QueryHelp onPick={q => { setQuery(q); setHelp(false); input.current?.focus(); }} />}
            {res.clauses.length > 0 && (res.clauses.length > 1 || res.clauses[0].not || res.clauses[0].any.some((a: any) => a.kind !== 'name')) && (
                <div className="ls-chips" aria-label="Filters">
                    {res.clauses.map((c: any, i: number) => <span key={i} className="ls-chip">{describeClause(c)}</span>)}
                </div>
            )}
            <div className={grid ? 'ls-table is-grid' : 'ls-table'} role={grid ? 'region' : 'table'} aria-label="Learnset">
                {grid ? <SortStrip /> : <HeaderRow />}
                {grid
                    ? learned.length > 0 && <div className="ls-grid" role="list">{learned.map(({ m, i }) => <MoveCard key={`k:${m.name}-${i}`} move={m} index={i} />)}</div>
                    : learned.map(({ m, i }) => <MoveRow key={`k:${m.name}-${i}`} move={m} index={i} />)}
                {!learned.length && (
                    total
                        ? <p className="ls-empty">{query ? 'It doesn’t know any moves like that.' : 'No moves.'}</p>
                        : !query && <p className="ls-empty">No moves yet. Search above to add some, or try Recommend Moves.</p>
                )}
                {others.length > 0 && (
                    <div className="ls-divider" role="presentation">
                        <span>Not in the learnset</span>
                        <small>Click one to add it{method !== 'none' ? ` as ${method === 'level' ? `Lv ${level || '?'}` : method === 'tm' ? 'TM' : 'Egg'}` : ''} · Enter adds the first</small>
                    </div>
                )}
                {grid
                    ? others.length > 0 && <div className="ls-grid" role="list">{others.map(m => <MoveCard key={`o:${m.key}`} move={m} ghost onAdd={() => api.addMoveFromSearch(m.key)} />)}</div>
                    : others.map(m => <MoveRow key={`o:${m.key}`} move={m} ghost onAdd={() => api.addMoveFromSearch(m.key)} />)}
                {res.more > 0 && <button type="button" className="ls-more" onClick={() => setLimit(n => n + 100)}>Show {Math.min(100, res.more)} more of {res.more}</button>}
                {query && !others.length && !learned.length && <p className="ls-empty">No moves match “{query}”.</p>}
            </div>
        </div>
    );
}

const selectStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-sans)', fontSize: 13 };

/** A donut of the whole learnset by type, category or learn method. */
export function LearnsetChart() {
    const group = api.getLearnsetChartGroup();
    const total = state.learnset.length;
    const segments: Array<{ label: string; value: number; color: string }> = total ? api.learnsetChartSegments(group) : [];
    const size = 140, radius = 54, stroke = 22, circumference = 2 * Math.PI * radius;
    let offset = 0;
    return (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <select aria-label="Group the chart" style={{ ...selectStyle, width: 150, padding: '6px 10px' }} value={group} onChange={e => api.setLearnsetChartGroup(e.target.value)}>
                    <option value="type">By Type</option>
                    <option value="category">By Category</option>
                    <option value="method">By Learn Method</option>
                </select>
            </div>
            <div className="learnset-chart-wrap">
                {!total ? <p className="learnset-chart-empty">Add moves to see a breakdown.</p> : (
                    <div className="learnset-chart">
                        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${total} moves`}>
                            {segments.map(seg => {
                                const dash = (seg.value / total) * circumference;
                                const circle = (
                                    <circle key={seg.label} r={radius} cx={size / 2} cy={size / 2} fill="transparent" stroke={seg.color} strokeWidth={stroke}
                                        strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
                                );
                                offset += dash;
                                return circle;
                            })}
                            <text x={size / 2} y={size / 2 - 3} textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--text-primary)">{total}</text>
                            <text x={size / 2} y={size / 2 + 15} textAnchor="middle" fontSize="10" fill="var(--text-muted)">move{total === 1 ? '' : 's'}</text>
                        </svg>
                        <div className="learnset-chart-legend">
                            {segments.map(s => (
                                <div key={s.label} className="learnset-chart-row">
                                    <span className="learnset-chart-swatch" style={{ background: s.color }} />
                                    <span className="learnset-chart-label">{s.label}</span>
                                    <span className="learnset-chart-count">{s.value} · {Math.round((s.value / total) * 100)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
