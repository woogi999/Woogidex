// The evolution and forme whiteboard on the editor's Stats tab. Pokémon and
// evolution methods are cards you drag around; dragging from a card's right
// handle to another's left handle connects them, a wire's scissors cut it,
// and a card dropped onto a wire joins it. The graph and its rules (stages,
// loops, stacking methods, saving onto every member) are
// js/features/evolution.ts.
//
// The board is a window onto a larger canvas: drag empty space (or two
// fingers) to pan, Ctrl + wheel or a pinch to zoom, and the buttons in the
// corner zoom, fit every card in view, or go back to 100%. Card positions
// stay in canvas pixels, so the zoom never changes what is saved.

import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { api } from '../../../core/app.ts';
import { Icon } from '../Icon.tsx';
import { effectiveZoom } from '../../../core/ui-scale.ts';

type Side = 'left' | 'right';
type Point = { x: number; y: number };
type Linking = { nodeId: string; side: Side; x: number; y: number; snap: (Point & { nodeId: string; side: Side }) | null };

const SNAP_RADIUS = 42;
const MIN_ZOOM = 0.25, MAX_ZOOM = 2;
type View = { x: number; y: number; s: number };
const clampZoom = (s: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s));
// empty space pans; cards, handles, wires and the zoom buttons keep their own drags
const PAN_SKIP = '.evo-node, .evo-handle, .evo-wire-hit, .evo-zoom';
const handleKey = (nodeId: string, side: Side) => `${nodeId}|${side}`;

function wirePath(a: Point, b: Point) {
    const dx = Math.max(30, Math.abs(b.x - a.x) * 0.45);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function Sprite({ src, name, fallback }: { src: string; name: string; fallback: string }) {
    if (!src) return <img className="no-art-placeholder" src="assets/no_art_placeholder.png" alt="" draggable={false} />;
    return (
        <img key={src} src={src} alt={name} loading="lazy" decoding="async" draggable={false}
            onError={e => (window as any).fallbackPokemonImage?.(e.currentTarget, name, fallback)} />
    );
}

export function EvolutionBoard() {
    const board = useRef<HTMLDivElement>(null);
    const [, redraw] = useReducer((x: number) => x + 1, 0);
    const [size, setSize] = useState({ w: 900, h: 520 });
    const [handles, setHandles] = useState<Record<string, Point>>({});
    const [linking, setLinking] = useState<Linking | null>(null);
    const [hoverEdge, setHoverEdge] = useState<number | null>(null);
    const canvas = useRef<HTMLDivElement>(null);
    const [view, setViewState] = useState<View>({ x: 0, y: 0, s: 1 });
    const viewRef = useRef(view);
    const setView = (v: View) => { viewRef.current = v; setViewState(v); };

    const g = api.ensureGraph();
    const me = api.addCurrentNode();
    const stages: Record<string, number> = api.calculateEvolutionStages(g);
    const { w: NODE_W, h: NODE_H } = api.getNodeSize();
    // the canvas reaches past the last card, and always covers the window
    const W = Math.max(((size.w || 900) - view.x) / view.s, NODE_W + 40, ...g.nodes.map((n: any) => (n.x || 0) + NODE_W + 40));
    const H = Math.max(((size.h || 520) - view.y) / view.s, NODE_H + 40, ...g.nodes.map((n: any) => (n.y || 0) + NODE_H + 120));

    // the board's size decides where cards are kept inside it
    useEffect(() => {
        const el = board.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // wires start and end on the handles where they actually are (a method
    // card's height differs, and cards change size at breakpoints)
    useLayoutEffect(() => {
        const el = canvas.current;
        if (!el) return;
        // the canvas rect is already moved and scaled: divide by both zooms to get canvas pixels
        const br = el.getBoundingClientRect(), z = effectiveZoom(el) * viewRef.current.s;
        const next: Record<string, Point> = {};
        el.querySelectorAll<HTMLElement>('.evo-handle[data-node-id]').forEach(h => {
            const r = h.getBoundingClientRect();
            next[handleKey(h.dataset.nodeId!, h.dataset.side as Side)] = { x: (r.left - br.left + r.width / 2) / z, y: (r.top - br.top + r.height / 2) / z };
        });
        if (JSON.stringify(next) !== JSON.stringify(handles)) setHandles(next);
    });

    const pointOf = (node: any, side: Side): Point => handles[handleKey(node.id, side)]
        || { x: (node.x || 0) + (side === 'right' ? NODE_W : 0), y: (node.y || 0) + NODE_H / 2 };
    // in the board's CSS pixels: pointer and rect numbers are window pixels (js/core/ui-scale.ts)
    /** A pointer's place in the board's own CSS pixels (before pan and zoom). */
    const framePoint = (e: { clientX: number; clientY: number }): Point => {
        const r = board.current!.getBoundingClientRect(), z = effectiveZoom(board.current);
        return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
    };
    /** A pointer's place on the canvas, where the cards are. */
    const boardPoint = (e: { clientX: number; clientY: number }): Point => {
        const p = framePoint(e), v = viewRef.current;
        return { x: (p.x - v.x) / v.s, y: (p.y - v.y) / v.s };
    };

    /** Zooms by `factor`, keeping the canvas point under (px, py) in place. */
    const zoomAt = (px: number, py: number, factor: number) => {
        const v = viewRef.current, s = clampZoom(v.s * factor);
        if (s === v.s) return;
        setView({ s, x: px - (px - v.x) * (s / v.s), y: py - (py - v.y) * (s / v.s) });
    };
    const zoomCenter = (factor: number) => zoomAt((size.w || 900) / 2, (size.h || 520) / 2, factor);
    /** Every card in view, at 100% at most. */
    const fit = () => {
        if (!g.nodes.length) { setView({ x: 0, y: 0, s: 1 }); return; }
        const xs = g.nodes.map((n: any) => n.x || 0), ys = g.nodes.map((n: any) => n.y || 0);
        const minX = Math.min(...xs), minY = Math.min(...ys);
        const w = Math.max(...xs) + NODE_W - minX, h = Math.max(...ys) + NODE_H + 60 - minY;
        const fw = size.w || 900, fh = size.h || 520, pad = 32;
        const s = clampZoom(Math.min(1, (fw - pad * 2) / w, (fh - pad * 2) / h));
        setView({ s, x: (fw - w * s) / 2 - minX * s, y: (fh - h * s) / 2 - minY * s });
    };

    // Ctrl + wheel (and a trackpad pinch, which the browser sends the same way) zooms.
    // A plain wheel still scrolls the page. The listener is not passive, so it can stop the page zoom.
    useEffect(() => {
        const el = board.current;
        if (!el) return;
        const wheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const p = framePoint(e);
            zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
        };
        el.addEventListener('wheel', wheel, { passive: false });
        return () => el.removeEventListener('wheel', wheel);
    }, []);

    // one pointer on empty space pans; two pointers pinch-zoom and pan
    const pointers = useRef(new Map<number, Point>());
    const startPan = (e: React.PointerEvent) => {
        if ((e.target as Element).closest(PAN_SKIP)) return;
        if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
        e.preventDefault();
        const el = board.current!;
        try { el.setPointerCapture(e.pointerId); } catch { /* an old browser: the pan still works inside the board */ }
        const first = pointers.current.size === 0;
        pointers.current.set(e.pointerId, framePoint(e));
        if (!first) return;
        el.classList.add('is-panning');
        let last = [...pointers.current.values()];
        const move = (ev: PointerEvent) => {
            if (!pointers.current.has(ev.pointerId)) return;
            pointers.current.set(ev.pointerId, framePoint(ev));
            const now = [...pointers.current.values()];
            const v = viewRef.current;
            if (now.length === 1 && last.length === 1) {
                setView({ ...v, x: v.x + now[0].x - last[0].x, y: v.y + now[0].y - last[0].y });
            } else if (now.length >= 2 && last.length >= 2) {
                const mid = (a: Point[]) => ({ x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 });
                const dist = (a: Point[]) => Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
                const m0 = mid(last), m1 = mid(now);
                const s = clampZoom(v.s * dist(now) / dist(last));
                const k = s / v.s;
                setView({ s, x: m1.x - (m0.x - v.x) * k, y: m1.y - (m0.y - v.y) * k });
            }
            last = now;
        };
        const up = (ev: PointerEvent) => {
            pointers.current.delete(ev.pointerId);
            last = [...pointers.current.values()];
            if (pointers.current.size) return;
            el.classList.remove('is-panning');
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    };

    /** Dragging a card around; only the dragged card and its wires move until it's let go. */
    const startNodeDrag = (e: React.PointerEvent, node: any) => {
        if ((e.target as Element).closest('.evo-handle, button')) return;
        e.preventDefault();
        const start = boardPoint(e);
        const ox = start.x - (node.x || 0), oy = start.y - (node.y || 0);
        const move = (ev: PointerEvent) => {
            const p = boardPoint(ev);
            // the canvas grows to the right and down, so only the top and left edges hold a card
            node.x = Math.max(4, p.x - ox);
            node.y = Math.max(4, p.y - oy);
            redraw();
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            api.finishNodeDrag(node.id);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    };

    /** Dragging a wire out of a handle; it snaps to a compatible handle nearby. */
    const startHandleDrag = (e: React.PointerEvent, nodeId: string, side: Side) => {
        e.stopPropagation();
        e.preventDefault();
        const nearest = (p: Point) => {
            let best: Linking['snap'] = null, bestDist = Infinity;
            for (const [key, pt] of Object.entries(handles)) {
                const [id, s] = key.split('|') as [string, Side];
                // a connection runs right to left; either end can start it
                if (id === nodeId || s === side) continue;
                const d = Math.hypot(pt.x - p.x, pt.y - p.y);
                if (d <= SNAP_RADIUS && d < bestDist) { bestDist = d; best = { ...pt, nodeId: id, side: s }; }
            }
            return best;
        };
        const p0 = boardPoint(e);
        let current: Linking = { nodeId, side, ...p0, snap: nearest(p0) };
        setLinking(current);
        const move = (ev: PointerEvent) => {
            const p = boardPoint(ev);
            current = { ...current, ...p, snap: nearest(p) };
            setLinking(current);
        };
        const up = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            setLinking(null);
            let target = current.snap ? { nodeId: current.snap.nodeId, side: current.snap.side } : null;
            if (!target && ev.type === 'pointerup') {
                const h = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.evo-handle[data-node-id]');
                if (h) target = { nodeId: h.dataset.nodeId!, side: h.dataset.side as Side };
            }
            if (target && target.nodeId !== nodeId) api.connectHandles(nodeId, side, target.nodeId, target.side);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    };

    const handle = (nodeId: string, side: Side, title: string) => {
        const snapped = linking?.snap?.nodeId === nodeId && linking.snap.side === side;
        const dragging = linking?.nodeId === nodeId && linking.side === side;
        return (
            <button className={`evo-handle evo-handle-${side}${snapped ? ' evo-snap-target' : ''}${dragging ? ' dragging' : ''}`} type="button" title={title}
                aria-label={title} data-node-id={nodeId} data-side={side} onPointerDown={e => startHandleDrag(e, nodeId, side)} />
        );
    };
    const place = (n: any) => ({
        width: NODE_W, minHeight: NODE_H,
        left: Math.max(4, n.x || 20),
        top: Math.max(4, n.y || 20)
    });
    const pct = Math.round(view.s * 100);

    return (
        <div id="evolution-board" className="evolution-board" ref={board} onPointerDown={startPan}
            style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${20 * view.s}px ${20 * view.s}px` }}>
            <div className="evo-zoom" role="group" aria-label="Zoom">
                <button type="button" className="evo-zoom-btn" onClick={() => zoomCenter(1 / 1.25)} disabled={view.s <= MIN_ZOOM} title="Zoom out (Ctrl + wheel)" aria-label="Zoom out"><Icon name="minus" size={14} /></button>
                <button type="button" className="evo-zoom-btn evo-zoom-level" onClick={() => setView({ x: 0, y: 0, s: 1 })} title="Back to 100%" aria-label={`Zoom ${pct}%. Back to 100%`}>{pct}%</button>
                <button type="button" className="evo-zoom-btn" onClick={() => zoomCenter(1.25)} disabled={view.s >= MAX_ZOOM} title="Zoom in (Ctrl + wheel)" aria-label="Zoom in"><Icon name="plus" size={14} /></button>
                <button type="button" className="evo-zoom-btn" onClick={fit} title="Fit every card in view" aria-label="Fit every card in view"><Icon name="arrows-pointing-out" size={14} /></button>
            </div>
            <div className="evo-canvas" ref={canvas} style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
            <svg className="evo-wires" aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                <defs>
                    <marker id="evo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                    </marker>
                </defs>
                {linking && (() => {
                    const source = g.nodes.find((n: any) => n.id === linking.nodeId);
                    if (!source) return null;
                    const end = linking.snap || linking;
                    return <path className="evo-wire evo-wire-preview" d={wirePath(pointOf(source, linking.side), end)} />;
                })()}
                {g.edges.map((edge: any, i: number) => {
                    const a = g.nodes.find((n: any) => n.id === edge.from), b = g.nodes.find((n: any) => n.id === edge.to);
                    if (!a || !b) return null;
                    const from = pointOf(a, 'right'), to = pointOf(b, 'left');
                    const d = wirePath(from, to);
                    return (
                        <g key={`${edge.from}->${edge.to}`} className={`evo-wire-group${hoverEdge === i ? ' hover' : ''}`}>
                            <path className="evo-wire" d={d} markerEnd="url(#evo-arrow)" pointerEvents="none" />
                            {/* a wide invisible stroke, so the thin wire is still easy to hit */}
                            <path className="evo-wire-hit" d={d} pointerEvents="stroke"
                                onPointerEnter={() => setHoverEdge(i)} onPointerLeave={() => setHoverEdge(h => (h === i ? null : h))}
                                onPointerDown={ev => { ev.stopPropagation(); setHoverEdge(null); api.removeEvolutionEdge(edge); }} />
                            <Icon name="scissors" size={18} className="evo-wire-scissors" x={(from.x + to.x) / 2 - 9} y={(from.y + to.y) / 2 - 9} pointerEvents="none" />
                        </g>
                    );
                })}
            </svg>

            {g.nodes.map((n: any) => {
                if (api.isMethodNode(n)) {
                    return (
                        <div key={n.id} className={`evo-node evo-method-node${n.mergeGroup ? ' evo-method-merged' : ''}`} data-node-id={n.id} style={place(n)}
                            onPointerDown={e => startNodeDrag(e, n)}>
                            {handle(n.id, 'left', 'Connect from previous node')}
                            <div className="evo-method-head">
                                <span><span className="evo-method-kicker">Evo method</span><strong>{api.getMethodLabel(n)}</strong></span>
                                <span className="evo-method-tools">
                                    {n.mergeGroup && <span className="evo-method-stack-mark" title="Merged method group"><Icon name="diamond" size={10} /></span>}
                                    <button className="evo-method-edit" type="button" title="Edit method" aria-label="Edit method" onClick={e => { e.stopPropagation(); api.openEvolutionMethodEditor(n.id); }}><Icon name="pencil" size={12} /></button>
                                    <button className="evo-remove" type="button" title="Remove" aria-label="Remove" onClick={e => { e.stopPropagation(); api.removeEvolutionMethod(n.id); }}><Icon name="x" size={12} /></button>
                                </span>
                            </div>
                            <div className="evo-method-summary">{api.getMethodSummary(n)}</div>
                            {handle(n.id, 'right', 'Connect to next node')}
                        </div>
                    );
                }
                const info = api.getNodeInfo(n);
                const stageLabel = n.isMega ? 'Mega Evolution' : n.isFormeChange ? 'Forme Change' : `Stage ${stages[n.id] || 1}`;
                const tags = [n.isMega ? 'Mega Evolution' : '', n.isFormeChange ? 'Forme Change' : ''].filter(Boolean);
                // a Fakémon without artwork has no sprite anywhere to fall back on
                const sprite = info.artwork || (info.kindLabel === 'Fakemon' ? '' : api.getSpriteUrl?.(info.spriteId, info.record || { id: info.spriteId, name: info.name }) || '');
                const isMe = n.id === me.id;
                return (
                    <div key={n.id} className={`evo-node${isMe ? ' current' : ''}`} data-node-id={n.id} style={place(n)} onPointerDown={e => startNodeDrag(e, n)}>
                        {handle(n.id, 'left', 'Drag from this side to connect')}
                        <div className="evo-node-head">
                            <span className="evo-stage">{stageLabel}</span>
                            <span className="evo-method-tools">
                                <span className="evo-kind">{info.kindLabel}</span>
                                {!isMe && <button className="evo-remove" type="button" title="Remove" aria-label="Remove" onClick={e => { e.stopPropagation(); api.removeEvolutionNode(n.id); }}><Icon name="x" size={12} /></button>}
                            </span>
                        </div>
                        <div className="evo-node-body">
                            <div className="evo-sprite-wrap"><Sprite src={sprite} name={info.name} fallback={String(info.record?.baseSpecies || info.refId || info.name)} /></div>
                            <div className="evo-node-name">
                                <strong>{info.name}</strong>
                                <small>{info.species || ''}</small>
                                <span className="evo-node-types">{(info.types || []).map((t: string) => <span key={t} className={`type-pill type-${String(t).toLowerCase()}`}>{t}</span>)}</span>
                                {tags.length > 0 && <em>{tags.join(' · ')}</em>}
                            </div>
                        </div>
                        {/* a Mega is the end of its line */}
                        {!n.isMega && handle(n.id, 'right', 'Drag from this side to connect')}
                    </div>
                );
            })}
            </div>
        </div>
    );
}

/** "3 Pokémon · 2 connections", above the board. */
export function EvolutionStatus() {
    const g = api.ensureGraph();
    return <div className="evolution-status">{g.nodes.length} Pokémon · {g.edges.length} connection{g.edges.length === 1 ? '' : 's'}</div>;
}
