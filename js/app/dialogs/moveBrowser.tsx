// Browse Moves and Browse Abilities. The move browser serves two callers:
// the editor (every move, plus the Recommended and Universal views; you pick
// moves and add them together) and the battle teambuilder (one member's
// learnset; a click fills the slot that opened it). The filtering itself is
// js/editor/editor.ts.

import { useDeferredValue, useMemo, useState } from 'react';
import { api, state } from '../../core/app.ts';
import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { TypeDropdown, TypePill, useClickAway } from '../components/editor/fields.tsx';
import { openContextMenu } from '../components/ContextMenu.tsx';
import { SortTh } from '../components/SortHeader.tsx';
import { CategoryBadge } from '../components/MoveCategory.tsx';
import { Icon } from '../components/Icon.tsx';
import { customFlags } from '../../features/move-flags.ts';

type Filters = { name: string; type: string; category: string; priority: string; bpMin: string; accMin: string; ppMin: string; flags: string[] };
const NO_FILTERS: Filters = { name: '', type: '', category: '', priority: '', bpMin: '', accMin: '', ppMin: '', flags: [] };
type BattleTarget = { teamId: string; index: number; slot: number };


function AnyCategory({ value, onPick }: { value: string; onPick: (c: string) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useClickAway(open, () => setOpen(false));
    const pick = (c: string) => { setOpen(false); onPick(c); };
    return (
        <div className={`cat-dropdown mb-filter-cat${open ? ' open' : ''}`} ref={ref}>
            <button className="cat-dropdown-trigger" type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}>
                <span className="cat-dropdown-value">{value ? <CategoryBadge category={value} /> : 'Any category'}</span>
                <span className="type-dropdown-arrow"><Icon name="chevron-down" size={12} /></span>
            </button>
            <div className="cat-dropdown-menu">
                <div className="cat-dropdown-option" onClick={() => pick('')}><span>Any category</span></div>
                {['Physical', 'Special', 'Status'].map(c => <div key={c} className="cat-dropdown-option" onClick={() => pick(c)}><CategoryBadge category={c} /></div>)}
            </div>
        </div>
    );
}

// ---- Browse Moves ----
// Three views in one dialog (the editor only; the battle teambuilder gets All
// moves): every move, the moves similar Pokémon learn (Recommended), and the
// moves nearly every Pokémon learns (Universal). Each draws as a table or a
// grid (remembered on this device). In the editor you tick moves in any view
// and add them together; in battle a click fills the slot.

type View = 'all' | 'recommended' | 'universal';
type Layout = 'table' | 'grid';
type SortKey = 'name' | 'type' | 'category' | 'basePower' | 'accuracy' | 'pp';
type Pick = { key: string; name: string; via: View };
const LAYOUT_KEY = 'woogidex-move-browser-layout';
const VIEWS: Array<[View, string, string]> = [['all', 'All moves', 'squares-2x2'], ['recommended', 'Recommended', 'sparkles'], ['universal', 'Universal', 'globe-alt']];

function readLayout(): Layout {
    try { return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'table'; } catch { return 'table'; }
}
const accOf = (m: any) => (m.accuracy === true || m.accuracy === undefined ? 101 : m.accuracy === false ? 0 : Number(m.accuracy) || 0);
const accText = (m: any) => (m.accuracy === true || m.accuracy === undefined || m.accuracy === false ? '—' : `${m.accuracy}%`);
const CAT_ORDER: Record<string, number> = { Physical: 0, Special: 1, Status: 2 };

function sortMoves(list: any[], key: SortKey, dir: 1 | -1) {
    const val = (m: any) => key === 'name' ? String(m.name) : key === 'type' ? String(m.type || '') : key === 'category' ? CAT_ORDER[m.category] ?? 3
        : key === 'accuracy' ? accOf(m) : Number(m[key]) || 0;
    return [...list].sort((a, b) => {
        const x = val(a), y = val(b);
        const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
        return (c || String(a.name).localeCompare(b.name)) * dir;
    });
}

/** One list of moves, as table rows or grid cards. `reason` and `onKeepOut` are Recommended's. */
function MoveList({ items, layout, picked, onToggle, battle, sort, onSort }: {
    items: Array<{ m: any; locked?: boolean; reason?: string; onKeepOut?: (e: React.MouseEvent) => void; top?: boolean }>;
    layout: Layout; picked: (m: any) => boolean; onToggle: (m: any) => void; battle: boolean;
    sort?: { key: SortKey; dir: 1 | -1 }; onSort?: (key: SortKey) => void;
}) {
    const state = (m: any, locked?: boolean) => locked ? 'is-locked' : m.added ? 'is-added' : picked(m) ? 'is-picked' : '';
    const title = (m: any, locked?: boolean) => locked ? `${m.name} is not in this Pokémon's learnset` : m.added ? (battle ? 'Already chosen' : 'Already in the learnset') : battle ? 'Pick this move' : picked(m) ? 'Click to unpick' : 'Click to pick';
    const mark = (m: any, locked?: boolean) => battle || locked ? null : m.added
        ? <span className="mb-mark is-added" title="In the learnset"><Icon name="check" size={12} /></span>
        : <span className={`mb-mark${picked(m) ? ' is-on' : ''}`} aria-hidden="true">{picked(m) && <Icon name="check" size={12} />}</span>;
    const keep = (it: { m: any; onKeepOut?: (e: React.MouseEvent) => void }) => it.onKeepOut && (
        <button type="button" className="mb-keep-out" title={`Stop recommending ${it.m.name}`} aria-label={`Stop recommending ${it.m.name}`}
            onClick={e => { e.stopPropagation(); it.onKeepOut!(e); }}><Icon name="x" size={13} /></button>
    );
    const choose = (m: any, locked?: boolean) => { if (!locked && !m.added) onToggle(m); };
    if (layout === 'grid') {
        return (
            <div className="mb-grid">
                {items.map(it => (
                    <div key={`${it.locked ? 'l' : 'm'}:${it.m.key || it.m.name}`} role="button" tabIndex={it.locked || it.m.added ? -1 : 0} aria-pressed={battle ? undefined : picked(it.m)}
                        className={`mb-card ${state(it.m, it.locked)}${it.top ? ' is-top' : ''}`} title={title(it.m, it.locked)}
                        onClick={() => choose(it.m, it.locked)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(it.m, it.locked); } }}>
                        <div className="mb-card-top">
                            <TypePill type={it.m.type || 'Normal'} />
                            <CategoryBadge category={it.m.category} />
                            <span className="mb-card-end">{it.locked ? <span className="mb-tag">Not learnable</span> : mark(it.m, it.locked)}{keep(it)}</span>
                        </div>
                        <div className="mb-card-name">{it.m.name}</div>
                        <div className="mb-card-stats">
                            <span><small>BP</small>{it.m.basePower || '—'}</span>
                            <span><small>Acc</small>{accText(it.m)}</span>
                            <span><small>PP</small>{it.m.pp || '—'}</span>
                            {!!it.m.priority && <span><small>Prio</small>{it.m.priority > 0 ? '+' : ''}{it.m.priority}</span>}
                        </div>
                        {it.reason && <div className="mb-card-why">{it.reason}</div>}
                    </div>
                ))}
            </div>
        );
    }
    // the table: the learnset's own rows (css/learnset.css), with a pick mark
    // in front and, for Recommended, why it fits and its keep-out button
    const sortState = sort ? { key: sort.key, order: sort.dir === 1 ? 'asc' as const : 'desc' as const } : null;
    const head = (key: SortKey, label: string, cls: string) => <SortTh as="div" className={`ls-c ${cls}`} label={label} sortKey={onSort ? key : undefined} sort={sortState} onSort={onSort as any} />;
    const why = items.some(it => it.reason);
    const keepCol = items.some(it => it.onKeepOut);
    const prioText = (p: any) => (Number(p) ? `${Number(p) > 0 ? '+' : ''}${Number(p)}` : '0');
    return (
        <div className={`ls-table mb-ls${battle ? ' is-battle' : ''}${why ? ' has-why' : ''}`} role="table">
            <div className="ls-row ls-head" role="row">
                {!battle && <span className="ls-c mb-col-mark" />}
                {head('name', 'Name', 'ls-name')}
                {head('type', 'Type', 'ls-type')}
                {head('category', 'Cat', 'ls-cat')}
                {head('basePower', 'BP', 'ls-num ls-bp')}
                {head('accuracy', 'Acc', 'ls-num ls-acc')}
                {head('pp', 'PP', 'ls-num ls-pp')}
                <SortTh as="div" className="ls-c ls-num ls-prio" label="Prio" sort={null} />
                {why && <SortTh as="div" className="ls-c mb-col-why" label="Why" sort={null} />}
                {keepCol && <span className="ls-c ls-x" />}
            </div>
            {items.map(it => (
                <div key={`${it.locked ? 'l' : 'm'}:${it.m.key || it.m.name}`} role="row" className={`ls-row ${state(it.m, it.locked)}${it.top ? ' is-top' : ''}`} title={title(it.m, it.locked)}
                    tabIndex={it.locked || it.m.added ? -1 : 0} aria-selected={battle ? undefined : picked(it.m)}
                    onClick={() => choose(it.m, it.locked)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(it.m, it.locked); } }}>
                    {!battle && <span className="ls-c mb-col-mark" role="cell">{mark(it.m, it.locked)}</span>}
                    <span className="ls-c ls-name" role="cell">
                        <span className="ls-name-text">{it.m.name}</span>
                        {it.m.custom && <span className="ls-custom-tag">Custom</span>}
                        {it.locked && <span className="mb-tag">Not learnable</span>}
                        {(it.m.shortDesc || it.m.desc) && <span className="ls-desc">{it.m.shortDesc || it.m.desc}</span>}
                    </span>
                    <span className="ls-c ls-type" role="cell"><TypePill type={it.m.type || 'Normal'} /></span>
                    <span className="ls-c ls-cat" role="cell"><CategoryBadge category={it.m.category} iconOnly /></span>
                    <span className="ls-c ls-num ls-bp" role="cell" data-label="BP">{Number(it.m.basePower) || '—'}</span>
                    <span className="ls-c ls-num ls-acc" role="cell" data-label="Acc">{accText(it.m)}</span>
                    <span className="ls-c ls-num ls-pp" role="cell" data-label="PP">{it.m.pp || '—'}</span>
                    <span className="ls-c ls-num ls-prio" role="cell" data-label="Prio">{prioText(it.m.priority)}</span>
                    {why && <span className="ls-c mb-col-why" role="cell">{it.reason}</span>}
                    {keepCol && <span className="ls-c ls-x" role="cell">{keep(it)}</span>}
                </div>
            ))}
        </div>
    );
}

function MoveBrowserDialog({ mode, target, view: startView = 'all', close }: DialogProps<{ mode: 'editor' | 'battle'; target?: BattleTarget; view?: View }>) {
    const battle = mode === 'battle';
    const [view, setView] = useState<View>(battle ? 'all' : startView);
    const [layout, setLayoutState] = useState<Layout>(readLayout);
    const setLayout = (l: Layout) => { setLayoutState(l); try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* the choice just is not remembered */ } };
    const [f, setF] = useState<Filters>(NO_FILTERS);
    const [more, setMore] = useState(false);
    // the whole move list redraws behind the typing, not in its way
    const deferred = useDeferredValue(f);
    const [version, bump] = useState(0);
    const redraw = () => bump(x => x + 1);
    const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
    const onSort = (key: SortKey) => setSort(s => s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' || key === 'type' || key === 'category' ? 1 : -1 });
    const [picks, setPicks] = useState<Map<string, Pick>>(() => new Map());
    const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());
    const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }));
    const matches = (m: any) => api.moveMatchesFilters(m, deferred);

    // what each view lists (the recommendations are worked out once a redraw)
    const recs = useMemo(() => (battle ? null : api.moveRecommendations()), [battle, version]);
    const { learnable, locked } = battle ? api.battleMoveChoices(target, deferred) : { learnable: view === 'all' ? api.moveBrowserResults(deferred) : [], locked: [] };
    const universal = !battle && view === 'universal' ? api.universalMoveChoices().filter(matches) : [];

    const idOf = (m: any) => String(m.name).toLowerCase();
    const picked = (m: any) => picks.has(idOf(m));
    const toggle = (m: any, via: View) => {
        if (battle) { if (api.pickBattleMove(target, m.key)) close(); return; }
        setPicks(p => { const next = new Map(p); if (next.has(idOf(m))) next.delete(idOf(m)); else next.set(idOf(m), { key: m.key, name: m.name, via }); return next; });
    };
    const addPicked = () => { if (api.addBrowserPicks([...picks.values()])) { setPicks(new Map()); redraw(); } };
    const keepOut = (name: string, scope: 'mon' | 'all') => { api.setMoveRecommendable(name, scope, false); setPicks(p => { const n = new Map(p); n.delete(name.toLowerCase()); return n; }); redraw(); };
    const letBack = (name: string, scope: 'mon' | 'all') => { api.setMoveRecommendable(name, scope, true); redraw(); };
    const askKeepOut = (e: React.MouseEvent, name: string) => openContextMenu(e, {
        title: `Stop recommending ${name}`,
        items: [
            { label: 'For this Fakémon', icon: 'x', hint: 'Saved with it', run: () => keepOut(name, 'mon') },
            { label: 'For every Fakémon', icon: 'no-symbol', hint: 'On this device', run: () => keepOut(name, 'all') }
        ]
    });
    const toggleFlag = (flag: string) => set({ flags: f.flags.includes(flag) ? f.flags.filter(x => x !== flag) : [...f.flags, flag] });
    const num = (key: 'bpMin' | 'accMin' | 'ppMin', label: string, max?: number) => (
        <label className="mb-range"><span>{label}</span><input type="number" min={0} max={max} value={f[key]} placeholder="Any" onChange={e => set({ [key]: e.target.value })} /></label>
    );
    const extra = [f.priority, f.bpMin, f.accMin, f.ppMin].filter(Boolean).length + f.flags.length;
    const anyFilter = extra > 0 || !!(f.name || f.type || f.category);

    let body: React.ReactNode;
    let count = '';
    if (view === 'all') {
        const all = [...sortMoves(learnable, sort.key, sort.dir).map((m: any) => ({ m })), ...sortMoves(locked, sort.key, sort.dir).map((m: any) => ({ m, locked: true }))];
        count = battle
            ? `${learnable.length} move${learnable.length === 1 ? '' : 's'} in the learnset${locked.length ? ` · ${locked.length} not learnable` : ''}`
            : `${learnable.length} move${learnable.length === 1 ? '' : 's'}`;
        body = all.length
            ? <MoveList items={all} layout={layout} picked={picked} onToggle={m => toggle(m, 'all')} battle={battle} sort={sort} onSort={onSort} />
            : <p className="mb-empty">No moves match those filters.</p>;
    } else if (view === 'universal') {
        const missing = universal.filter((m: any) => !m.added);
        count = `${universal.length} universal move${universal.length === 1 ? '' : 's'} · ${missing.length} not in the learnset`;
        body = (
            <>
                <div className="mb-view-note">
                    <p>Moves nearly every Pokémon can learn. They go in as TMs.</p>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!missing.length || missing.every(picked)}
                        onClick={() => setPicks(p => { const n = new Map(p); missing.forEach((m: any) => n.set(idOf(m), { key: m.key, name: m.name, via: 'universal' })); return n; })}>
                        <Icon name="check" size={14} /> {missing.length ? `Pick all ${missing.length}` : 'All in the learnset'}
                    </button>
                </div>
                {universal.length
                    ? <MoveList items={sortMoves(universal, sort.key, sort.dir).map((m: any) => ({ m }))} layout={layout} picked={picked} onToggle={m => toggle(m, 'universal')} battle={false} sort={sort} onSort={onSort} />
                    : <p className="mb-empty">No universal moves match those filters.</p>}
            </>
        );
    } else {
        const sections = (recs?.sections || []).map((sec: any) => ({ ...sec, moves: sec.moves.filter((x: any) => matches(x.move)) })).filter((sec: any) => sec.moves.length);
        const total = sections.reduce((n: number, s: any) => n + s.moves.length, 0);
        const keptOut = (recs?.here.length || 0) + (recs?.everywhere.length || 0);
        count = `${total} recommended move${total === 1 ? '' : 's'}`;
        body = (
            <>
                <div className="mb-view-note">
                    <p>Moves that real Pokémon like this one learn, best fits first. The <Icon name="x" size={12} /> stops a move showing up, here or for every Fakémon.</p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.generateLearnset()} title="Builds a whole learnset from similar Pokémon: level-up moves, egg moves and TMs. Moves you keep out stay out.">
                        <Icon name="sparkles" size={14} /> Generate Learnset
                    </button>
                </div>
                {recs?.needsType
                    ? <p className="mb-empty">Set a primary type first, then this view can suggest moves.</p>
                    : !sections.length
                        ? <p className="mb-empty">{anyFilter ? 'No recommended moves match those filters.' : 'No new suggestions. The learnset already has everything that fits.'}</p>
                        : sections.map((sec: any) => {
                            const all = openSections.has(sec.label) || anyFilter;
                            const shown = all ? sec.moves : sec.moves.slice(0, sec.top);
                            const hidden = sec.moves.length - shown.length;
                            return (
                                <section key={sec.label} className="mb-section">
                                    <div className="mb-section-head">
                                        <h3>{sec.label}</h3>
                                        <span>{sec.moves.length} {sec.moves.length === 1 ? 'move' : 'moves'}</span>
                                    </div>
                                    <MoveList layout={layout} picked={picked} onToggle={m => toggle(m, 'recommended')} battle={false}
                                        items={shown.map((x: any, i: number) => ({ m: x.move, reason: x.reason, top: i < sec.top, onKeepOut: (e: React.MouseEvent) => askKeepOut(e, x.move.name) }))} />
                                    {(hidden > 0 || (openSections.has(sec.label) && sec.moves.length > sec.top && !anyFilter)) && (
                                        <button type="button" className="link-btn mb-more-btn" onClick={() => setOpenSections(o => { const n = new Set(o); if (n.has(sec.label)) n.delete(sec.label); else n.add(sec.label); return n; })}>
                                            {hidden > 0 ? `Show ${hidden} more` : 'Show only the best picks'}
                                        </button>
                                    )}
                                </section>
                            );
                        })}
                {keptOut > 0 && (
                    <details className="mb-kept-out">
                        <summary>Kept out ({keptOut})</summary>
                        {([['mon', 'For this Fakémon', recs!.here], ['all', 'For every Fakémon', recs!.everywhere]] as const).map(([scope, title, names]) => names.length > 0 && (
                            <div key={scope} className="mb-kept-group">
                                <h4>{title}</h4>
                                <div className="mb-kept-list">
                                    {names.map((name: string) => (
                                        <button key={name} type="button" className="mb-kept-chip" title={`Recommend ${name} again`} onClick={() => letBack(name, scope)}>
                                            {name}<Icon name="arrow-uturn-left" size={12} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </details>
                )}
            </>
        );
    }

    return (
        <Modal onClose={close} title="Browse Moves" className="move-browser-modal" labelledBy="move-browser-title">
            <div className="mb-top">
                {!battle && (
                    <div className="tabs mb-views" role="tablist" aria-label="Which moves">
                        {VIEWS.map(([key, label, icon]) => (
                            <button key={key} type="button" role="tab" aria-selected={view === key} className={`tab mb-view${view === key ? ' active' : ''}`}
                                onClick={async () => { if (key !== 'all' && !state.sdLoaded) await api.fetchShowdownData?.(); setView(key); }}>
                                <Icon name={icon} size={15} />{label}
                            </button>
                        ))}
                    </div>
                )}
                <div className="segmented mb-layout" role="group" aria-label="Layout">
                    <button type="button" className={layout === 'table' ? 'active' : ''} aria-pressed={layout === 'table'} title="Table" onClick={() => setLayout('table')}><Icon name="table-cells" size={16} /></button>
                    <button type="button" className={layout === 'grid' ? 'active' : ''} aria-pressed={layout === 'grid'} title="Grid" onClick={() => setLayout('grid')}><Icon name="squares-2x2" size={16} /></button>
                </div>
            </div>
            <div className="mb-filters">
                <label className="mb-search">
                    <Icon name="magnifying-glass" size={16} />
                    <input type="search" placeholder="Search moves" autoFocus value={f.name} onChange={e => set({ name: e.target.value })} aria-label="Search moves by name" />
                </label>
                <div className="mb-filter-type"><TypeDropdown id="mb-filter-type" value={f.type} placeholder="Any type" allowNone onPick={type => set({ type })} /></div>
                <AnyCategory value={f.category} onPick={category => set({ category })} />
                <button type="button" className={`btn btn-secondary btn-sm mb-more-toggle${more ? ' is-on' : ''}`} aria-expanded={more} onClick={() => setMore(v => !v)}>
                    <Icon name="adjustments-horizontal" size={14} /> Filters{extra ? ` (${extra})` : ''}
                </button>
            </div>
            {more && (
                <div className="mb-more">
                    <div className="mb-more-row">
                        <label className="mb-range"><span>Priority</span>
                            <select value={f.priority} onChange={e => set({ priority: e.target.value })}>
                                <option value="">Any</option>
                                <option value="positive">Above 0</option>
                                <option value="zero">0</option>
                                <option value="negative">Below 0</option>
                            </select>
                        </label>
                        {num('bpMin', 'Min BP')}
                        {num('accMin', 'Min Acc %', 100)}
                        {num('ppMin', 'Min PP')}
                        <button className="link-btn mb-clear" type="button" disabled={!anyFilter} onClick={() => set(NO_FILTERS)}>Clear filters</button>
                    </div>
                    <div className="mb-flags">
                        {(api.MOVE_BROWSER_FLAGS as string[]).map(flag => (
                            <button key={flag} type="button" className={`mb-flag-chip${f.flags.includes(flag) ? ' active' : ''}`} aria-pressed={f.flags.includes(flag)} onClick={() => toggleFlag(flag)}>
                                {flag.charAt(0).toUpperCase() + flag.slice(1)}
                            </button>
                        ))}
                        {/* the flags you made up (js/features/move-flags.ts), after the game's own */}
                        {customFlags().map(flag => (
                            <button key={flag.key} type="button" className={`mb-flag-chip is-custom${f.flags.includes(flag.key) ? ' active' : ''}`} aria-pressed={f.flags.includes(flag.key)}
                                title={flag.desc || 'A flag you made'} onClick={() => toggleFlag(flag.key)}
                                style={flag.color ? { '--flag-color': flag.color } as React.CSSProperties : undefined}>
                                {flag.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className="mb-count">{count}</div>
            <div className={`mb-body is-${layout}`}>{body}</div>
            {picks.size > 0 && (
                <div className="mb-actions">
                    <span>{picks.size} picked</span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicks(new Map())}>Clear</button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={addPicked}>Add {picks.size === 1 ? 'move' : `${picks.size} moves`}</button>
                </div>
            )}
        </Modal>
    );
}

function AbilityBrowserDialog({ close }: DialogProps) {
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('');
    const [sort, setSort] = useState('default');
    const [, bump] = useState(0);
    const res = api.abilityBrowserResults({ query, group, sort });
    return (
        <Modal onClose={close} title="Browse Abilities" className="ability-browser-modal" labelledBy="ability-browser-title">
            <div className="move-browser-filters">
                <input type="text" className="ab-filter-input" placeholder="Search names and effects..." autoFocus value={query} onChange={e => setQuery(e.target.value)} aria-label="Search" />
                <select className="ab-filter-select" value={group} onChange={e => setGroup(e.target.value)} aria-label="Group">
                    <option value="">All groups</option>
                    <option value="good">Good</option>
                    <option value="normal">Normal</option>
                    <option value="situational">Situational</option>
                    <option value="unviable">Unviable</option>
                </select>
                <select className="ab-filter-select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
                    <option value="default">Sort: Default</option>
                    <option value="az">Sort: A to Z</option>
                    <option value="za">Sort: Z to A</option>
                </select>
            </div>
            <div className="ab-count">{res.count} abilit{res.count === 1 ? 'y' : 'ies'}</div>
            <div className="ability-browser-results">
                {!res.count ? <div className="move-browser-empty">No abilities match those filters.</div> : res.groups.map((g: any) => (
                    <div key={g.id} style={{ display: 'contents' }}>
                        {g.label && <div className="ab-group-header">{g.label}<span>{g.rows.length}</span></div>}
                        {g.rows.map((a: any) => (
                            <button key={a.id} type="button" className={`ability-browser-row${a.added ? ' added' : ''}`}
                                title={a.added ? 'Already added' : res.full ? 'This Fakemon already has 4 abilities' : 'Click to add'}
                                onClick={() => { api.addAbilityFromBrowser(a.id); bump(x => x + 1); }}>
                                <span className="ab-row-head">
                                    <span className="ab-row-name">{a.name}</span>
                                    <span className={`ab-group-tag ab-group-${a.group.id}`}>{a.group.label.replace(' Abilities', '')}</span>
                                    {a.added && <span className="ab-row-added">Added</span>}
                                </span>
                                <span className="ab-row-desc">{a.desc}</span>
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        </Modal>
    );
}

registerDialog('move-browser', MoveBrowserDialog);
registerDialog('ability-browser', AbilityBrowserDialog);
