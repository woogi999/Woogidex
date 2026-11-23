// The tier maker's board (js/app/pages/TierMakerPage.tsx): one list drawn in
// its layout (js/features/tier-lists.ts LAYOUTS), each item with a picture.
//
// Moving an item: drag it (mouse or finger) onto a row, a cell or the plane,
// or tap it and pick where in the side panel (keyboard and screen readers
// use the panel too). A full pyramid row refuses more.

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { api, state } from '../../../core/app.ts';
import { effectiveZoom } from '../../../core/ui-scale.ts';
import { Icon } from '../Icon.tsx';
import { ShieldedArt } from '../ShieldedArt.tsx';
import { ThumbImg } from '../ThumbImg.tsx';
import { BANNER_PRESETS } from '../profile.tsx';
import {
    UNRANKED, columnOf, moveMonTo, placeAt, rowCapacity, tierOf, toID, type TierList, type TierMon
} from '../../../features/tier-lists.ts';

/** The colours a word item gets, from its name, so it stays the same everywhere. */
const WORD_COLORS = ['#7c5cff', '#e05252', '#3aa0c0', '#3ab07a', '#e0a83a', '#b05ac0', '#4a78d0', '#e07a3a'];
const hashColor = (s: string) => WORD_COLORS[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % WORD_COLORS.length];

/** An item's picture: its own, a Fakémon's art from your collection, a Pokémon's sprite, or its first letter. */
export function ItemArt({ m }: { m: TierMon }) {
    if (m.img) return <ShieldedArt src={m.img} alt={m.name} className="tm-item-img" />;
    if (m.from === 'fakemon') {
        const f = (state.fakemonDB || []).find((x: any) => toID(x?.name) === m.id);
        if (f?.artwork) return <ThumbImg src={f.artwork} alt={m.name} className="tm-item-img" draggable={false} loading="lazy" />;
    }
    if (m.from === 'pokemon') {
        const p = (state.sdPokedex || {})[m.id];
        const sprite = (p && api.getShowdownSpriteId?.(p)) || m.id;
        return (
            // Showdown sends no CORS header: the sprite shows, but "Save as image" cannot copy it
            <img className="tm-item-img" alt={m.name} draggable={false} loading="lazy"
                src={`https://play.pokemonshowdown.com/sprites/home-centered/${sprite}.png`}
                onError={e => { const img = e.currentTarget; if (!img.dataset.fallback) { img.dataset.fallback = '1'; img.src = `https://play.pokemonshowdown.com/sprites/gen5/${sprite}.png`; } }} />
        );
    }
    return <span className="tm-item-letter" style={{ background: hashColor(m.name) }} aria-hidden="true">{m.name.slice(0, 1).toUpperCase()}</span>;
}

/** One item on the board. */
function Item({ list, id, picked, onPick, onDragStart, vote }: { list: TierList; id: string; picked: boolean; onPick: () => void; onDragStart: (e: React.PointerEvent) => void; vote?: ReactNode }) {
    const m = list.mons[id];
    const before = list.baseline?.[id];
    const now = tierOf(list, id);
    const order = list.tiers.map(t => t.name);
    const rank = (n?: string) => (n ? order.indexOf(n) : order.length);
    const moved = before !== undefined && before !== now;
    const up = moved && rank(now) < rank(before);
    return (
        <button type="button" className={`tm-item${picked ? ' is-picked' : ''}${m.temp ? ' is-temp' : ''}${moved ? (up ? ' is-up' : ' is-down') : ''}`} data-mon={id}
            onClick={onPick} onPointerDown={onDragStart}
            title={[m.name, m.note, m.temp ? 'Only in your copy' : '', moved ? `Was ${before || 'Unranked'}` : ''].filter(Boolean).join(' · ')}>
            <span className="tm-item-pic"><ItemArt m={m} /></span>
            <span className="tm-item-name">{m.name}</span>
            {moved && <Icon name={up ? 'arrow-up' : 'arrow-down'} size={12} className="tm-item-move" aria-label={up ? 'Rose' : 'Dropped'} />}
            {m.note && <Icon name="chat-bubble-left" size={12} className="tm-item-note" aria-label="Has a note" />}
            {vote}
        </button>
    );
}

export interface BoardProps {
    list: TierList;
    onChange: (next: TierList) => void;
    picked: string | null;
    onPick: (id: string | null) => void;
    /** live votes: what to draw on an item (the majority tier, say) */
    badge?: (id: string) => ReactNode;
    boardRef?: React.RefObject<HTMLDivElement | null>;
    hideUnranked?: boolean;
}

/** The board's own look: the background, the width and the sizes (list.look). */
export function boardStyle(list: TierList): CSSProperties {
    const look = list.look || {};
    const style: Record<string, string> = {};
    if (look.itemSize) style['--tm-item'] = `${look.itemSize}px`;
    if (look.labelWidth) style['--tm-label'] = `${look.labelWidth}px`;
    if (look.width) style['--tm-width'] = `${look.width}px`;
    if (look.bg?.startsWith('preset:')) style.background = BANNER_PRESETS[look.bg.slice(7)] || '';
    else if (look.bg) style.background = look.bg;
    if (look.bgImg) { style.backgroundImage = `url("${look.bgImg}")`; style.backgroundSize = 'cover'; style.backgroundPosition = 'center'; }
    return style as CSSProperties;
}

export function TierBoard({ list, onChange, picked, onPick, badge, boardRef, hideUnranked = false }: BoardProps) {
    const own = useRef<HTMLDivElement>(null);
    const board = boardRef || own;
    const layout = list.layout || 'tiers';

    // ---- drag an item ----
    const drag = useRef<{ id: string; x: number; y: number; ghost: HTMLElement | null; moved: boolean } | null>(null);
    useEffect(() => () => { drag.current?.ghost?.remove(); }, []);
    // the pool sits outside the board (the saved picture leaves it out), so look in both
    const clearOver = () => document.querySelectorAll('.tm-board-wrap .is-over').forEach(el => el.classList.remove('is-over'));
    const startDrag = (id: string) => (e: React.PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        drag.current = { id, x: e.clientX, y: e.clientY, ghost: null, moved: false };
        const move = (ev: PointerEvent) => {
            const d = drag.current;
            if (!d) return;
            if (!d.moved) {
                if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return;
                d.moved = true;
                const g = document.createElement('div');
                g.className = 'tm-ghost';
                g.textContent = list.mons[id]?.name || id;
                document.body.appendChild(g);
                d.ghost = g;
            }
            ev.preventDefault();
            // pointer numbers are window pixels; the transform is CSS pixels (js/core/ui-scale.ts)
            const z = effectiveZoom(document.documentElement);
            d.ghost!.style.transform = `translate(${(ev.clientX + 8) / z}px, ${(ev.clientY + 8) / z}px)`;
            clearOver();
            (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]') as HTMLElement | null)?.classList.add('is-over');
        };
        const up = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            const d = drag.current;
            drag.current = null;
            clearOver();
            if (!d?.moved) return;
            d.ghost?.remove();
            const at = document.elementFromPoint(ev.clientX, ev.clientY);
            const plane = at?.closest<HTMLElement>('[data-plane]');
            if (plane) {
                const r = plane.getBoundingClientRect();
                onChange(placeAt(list, id, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height));
            } else {
                const target = at?.closest<HTMLElement>('[data-tier]');
                if (target) drop(id, target.dataset.tier!, target.dataset.col || null, at?.closest<HTMLElement>('[data-mon]')?.dataset.mon || null);
            }
            // the click that ends a drag must not open the panel
            const stop = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
            window.addEventListener('click', stop, { capture: true, once: true });
            setTimeout(() => window.removeEventListener('click', stop, true), 0);
        };
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    };

    /** Puts an item in a row (and a column), when the row has room. */
    const drop = (id: string, tierId: string, colId: string | null, beforeId: string | null) => {
        const index = list.tiers.findIndex(t => t.id === tierId);
        if (index >= 0) {
            const room = rowCapacity(list, index);
            const inRow = (list.placed[tierId] || []).filter(x => x !== id).length;
            if (inRow >= room) { api.showToast?.('That row is full. Move one out first.', 'info'); return; }
        }
        const { [id]: _gone, ...pos } = list.pos || {};
        onChange(moveMonTo({ ...list, ...(list.pos ? { pos } : {}) }, id, tierId, colId, beforeId && beforeId !== id ? beforeId : null));
    };

    const item = (id: string) => list.mons[id] && (
        <Item key={id} list={list} id={id} picked={picked === id} onPick={() => onPick(picked === id ? null : id)} onDragStart={startDrag(id)} vote={badge?.(id)} />
    );
    const unranked = (list.placed[UNRANKED] || []).filter(id => list.mons[id]);
    const pool = !hideUnranked && (
        <div className="tm-pool" data-tier={UNRANKED} data-drop>
            <div className="tm-pool-head"><strong>Unranked</strong><small>{unranked.length}</small></div>
            <div className="tm-pool-items">
                {unranked.map(item)}
                {!unranked.length && <span className="tm-empty">{Object.keys(list.mons).length ? 'Everything is placed.' : 'Add items above. Then drag each one where it goes, or tap it and pick.'}</span>}
            </div>
        </div>
    );

    let body: ReactNode;
    if (layout === 'quadrant') {
        const axes = list.axes || { top: '', bottom: '', left: '', right: '' };
        body = (
            <div className="tm-quadrant">
                <span className="tm-axis is-top">{axes.top}</span>
                <span className="tm-axis is-bottom">{axes.bottom}</span>
                <span className="tm-axis is-left">{axes.left}</span>
                <span className="tm-axis is-right">{axes.right}</span>
                <div className="tm-plane" data-plane data-drop>
                    {Object.entries(list.pos || {}).map(([id, p]) => list.mons[id] && (
                        <div key={id} className="tm-plane-spot" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>{item(id)}</div>
                    ))}
                </div>
            </div>
        );
    } else if (layout === 'alignment' || (layout === 'tiers' && list.columns?.length)) {
        const cols = list.columns || [];
        body = (
            <div className={`tm-matrix${layout === 'alignment' ? ' is-alignment' : ''}`} style={{ ['--tm-cols' as any]: cols.length }}>
                <div className="tm-matrix-corner" />
                {cols.map(c => <div key={c.id} className="tm-matrix-colhead">{c.name}</div>)}
                {list.tiers.map(t => (
                    <div key={t.id} className="tm-matrix-row">
                        <div className="tm-label" style={{ background: t.color }}><strong>{t.name}</strong></div>
                        {cols.map(c => (
                            <div key={c.id} className="tm-cell" data-tier={t.id} data-col={c.id} data-drop
                                aria-label={layout === 'alignment' ? `${t.name} ${c.name}` : `${t.name}, ${c.name}`}>
                                {layout === 'alignment' && <span className="tm-cell-name">{t.name === c.name ? 'True Neutral' : `${t.name} ${c.name}`}</span>}
                                {(list.placed[t.id] || []).filter(id => columnOf(list, id) === c.id).map(item)}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        );
    } else if (layout === 'table') {
        // a spreadsheet for real tiering: one row for each item, grouped by tier, small icons only
        const moveTo = (id: string, tierId: string) => onChange(moveMonTo(list, id, tierId, null, null));
        const row = (t: { id: string; name: string; color: string }, id: string, i: number, n: number) => {
            const m = list.mons[id];
            if (!m) return null;
            return (
                <tr key={id} className={`tm-trow${picked === id ? ' is-picked' : ''}`} data-tier={t.id} data-mon={id} data-drop onPointerDown={startDrag(id)}>
                    {i === 0 && <th scope="rowgroup" rowSpan={n} className="tm-tcell-tier" style={{ background: t.color }}>{t.name}</th>}
                    <td className="tm-tcell-n">{i + 1}</td>
                    <td className="tm-tcell-icon"><span className="tm-ticon"><ItemArt m={m} /></span></td>
                    <td className="tm-tcell-name"><button type="button" onClick={() => onPick(picked === id ? null : id)}>{m.name}</button>{m.note && <small>{m.note}</small>}</td>
                    <td className="tm-tcell-types">{(m.types || []).map(ty => <span key={ty} className={`type-pill type-${ty.toLowerCase()}`}>{ty}</span>)}</td>
                    <td className="tm-tcell-move">
                        <select aria-label={`Move ${m.name} to`} value={t.id} onChange={e => moveTo(id, e.target.value)} onPointerDown={e => e.stopPropagation()}>
                            {list.tiers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                            <option value={UNRANKED}>Unranked</option>
                        </select>
                    </td>
                    {badge && <td className="tm-tcell-vote">{badge(id)}</td>}
                </tr>
            );
        };
        body = (
            <table className="tm-table">
                <thead><tr><th scope="col">Tier</th><th scope="col">#</th><th scope="col"><span className="sr-only">Icon</span></th><th scope="col">Name</th><th scope="col">Types</th><th scope="col">Move to</th>{badge && <th scope="col">Votes</th>}</tr></thead>
                {list.tiers.map(t => {
                    const ids = (list.placed[t.id] || []).filter(id => list.mons[id]);
                    return (
                        <tbody key={t.id}>
                            {ids.length
                                ? ids.map((id, i) => row(t, id, i, ids.length))
                                : <tr className="tm-trow is-empty" data-tier={t.id} data-drop><th scope="rowgroup" className="tm-tcell-tier" style={{ background: t.color }}>{t.name}</th><td colSpan={badge ? 6 : 5} className="tm-empty">Drop here, or pick a tier on a row</td></tr>}
                        </tbody>
                    );
                })}
            </table>
        );
    } else if (layout === 'grid') {
        const t = list.tiers[0];
        body = t && (
            <ol className="tm-grid" data-tier={t.id} data-drop>
                {(list.placed[t.id] || []).map((id, i) => list.mons[id] && <li key={id}><span className="tm-grid-n">#{i + 1}</span>{item(id)}</li>)}
                <li className="tm-grid-next" aria-hidden="true"><span className="tm-grid-n">#{(list.placed[t.id] || []).length + 1}</span><span className="tm-empty">Drop here</span></li>
            </ol>
        );
    } else if (layout === 'pyramid') {
        body = (
            <div className="tm-pyramid">
                {list.tiers.map((t, i) => {
                    const ids = list.placed[t.id] || [];
                    return (
                        <div key={t.id} className="tm-pyramid-row" data-tier={t.id} data-drop>
                            {Array.from({ length: i + 1 }, (_, s) => <div key={s} className="tm-pyramid-slot">{ids[s] ? item(ids[s]) : <span className="tm-empty">{i + 1}</span>}</div>)}
                        </div>
                    );
                })}
            </div>
        );
    } else {
        body = (
            <div className="tm-rows">
                {list.tiers.map(t => (
                    <div key={t.id} className="tm-row" data-tier={t.id} data-drop>
                        <div className="tm-label" style={{ background: t.color }}>
                            <strong>{t.name}</strong>
                            {list.kind === 'showdown' && t.sd !== t.name && <small>{t.sd}</small>}
                        </div>
                        <div className="tm-drop">
                            {(list.placed[t.id] || []).map(item)}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={`tm-board-wrap is-${layout}`}>
            {pool}
            <div className="tm-board" ref={board} style={boardStyle(list)} data-layout={layout}>
                <h2 className="tm-board-title">{list.title}</h2>
                {body}
            </div>
        </div>
    );
}
