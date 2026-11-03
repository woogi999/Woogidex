// The art viewer: a Fakémon's artwork on the whole screen, opened by a click
// on the board's art. Zoom with the wheel, a pinch, a double-click or
// double-tap, or the +/− buttons. Drag to pan. The arrows, the arrow keys or a
// swipe go through every picture of every set, and the sparkle shows the
// shiny version. The board's own draw function draws each picture, so
// community art stays a shielded canvas (js/core/art-shield.ts), never an <img>.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { Icon } from '../Icon.tsx';
import { reducedMotion } from '../../../core/motion.ts';
import type { ArtImage, ArtKind } from '../../../editor/art-sets.ts';

type Gallery = Array<{ id: string; kind: ArtKind; title: string; scaling: 'pixel' | 'smooth'; images: ArtImage[] }>;

/** One picture the viewer can show, with its shiny version when there is one. */
export interface ArtFrame { setId: string; title: string; scaling: 'pixel' | 'smooth'; image: ArtImage; shiny?: ArtImage; label: string }

const SHINY_OF: Record<string, string> = { normal: 'shiny', front: 'shinyFront', back: 'shinyBack' };
const SHINY_SLOTS = new Set(Object.values(SHINY_OF));
const SIDE_LABEL: Record<string, string> = { front: 'Front', back: 'Back', icon: 'Icon' };

/** Every picture of every set, in board order. A shiny goes with its normal one; a shiny on its own is a picture too. */
export function artFrames(gallery: Gallery): ArtFrame[] {
    const out: ArtFrame[] = [];
    for (const set of gallery) {
        const find = (slot: string) => set.images.find(i => i.slot === slot);
        const base = { setId: set.id, title: set.title, scaling: set.scaling };
        if (set.kind === 'concept') {
            set.images.forEach((image, i) => out.push({ ...base, image, label: set.images.length > 1 ? `${i + 1} of ${set.images.length}` : '' }));
            continue;
        }
        for (const image of set.images) {
            if (SHINY_SLOTS.has(image.slot)) {
                // a shiny whose normal picture is missing still gets shown
                const normal = Object.keys(SHINY_OF).find(k => SHINY_OF[k] === image.slot)!;
                if (!find(normal)) out.push({ ...base, image, label: `${SIDE_LABEL[normal] || ''} shiny`.trim() });
                continue;
            }
            out.push({ ...base, image, shiny: find(SHINY_OF[image.slot] || ''), label: SIDE_LABEL[image.slot] || '' });
        }
    }
    return out;
}

const MIN = 1, MAX = 8;
type View = { s: number; x: number; y: number };
const FIT: View = { s: 1, x: 0, y: 0 };

export function ArtViewer({ name, frames, start, startShiny, draw, onClose }: {
    name: string; frames: ArtFrame[]; start: number; startShiny: boolean;
    draw: (src: string, alt: string) => ReactNode; onClose: () => void;
}) {
    const [at, setAt] = useState(Math.max(0, Math.min(start, frames.length - 1)));
    const [shiny, setShiny] = useState(startShiny);
    const [view, setView] = useState<View>(FIT);
    const root = useRef<HTMLDivElement>(null);
    const stage = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const closeBtn = useRef<HTMLButtonElement>(null);
    const frame = frames[at];
    const showShiny = shiny && !!frame.shiny;
    const image = showShiny ? frame.shiny! : frame.image;
    const many = frames.length > 1;

    // keep a zoomed picture from sliding off the screen
    const clamp = (v: View): View => {
        const st = stage.current, c = content.current;
        const s = Math.min(MAX, Math.max(MIN, v.s));
        if (!st || !c || s <= 1.001) return FIT;
        const mx = Math.max(0, (c.offsetWidth * s - st.clientWidth) / 2);
        const my = Math.max(0, (c.offsetHeight * s - st.clientHeight) / 2);
        return { s, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
    };
    /** Zooms to `s`, keeping the point (px, py) from the stage's centre where it is. */
    const zoomAt = (v: View, s: number, px = 0, py = 0): View => {
        const k = Math.min(MAX, Math.max(MIN, s)) / v.s;
        return clamp({ s: v.s * k, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    };
    const fromCentre = (clientX: number, clientY: number) => {
        const r = stage.current!.getBoundingClientRect();
        return [clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2)] as const;
    };
    const go = (step: number) => { if (many) { setAt(i => (i + step + frames.length) % frames.length); setView(FIT); } };

    // a new picture (or its shiny) fades in
    useLayoutEffect(() => {
        if (content.current && !reducedMotion()) gsap.fromTo(content.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' });
    }, [at, showShiny]);

    // open: the page holds still, focus moves in, the viewer fades up; close: focus goes back
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        document.body.classList.add('art-viewer-open');
        closeBtn.current?.focus({ preventScroll: true });
        if (root.current && !reducedMotion()) gsap.fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: 'power1.out' });
        return () => { document.body.classList.remove('art-viewer-open'); opener?.focus?.({ preventScroll: true }); };
    }, []);

    // the keys: Esc, the arrows, + and −, 0 to fit, S for shiny
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
            else if (e.key === 'ArrowRight') go(1);
            else if (e.key === 'ArrowLeft') go(-1);
            else if (e.key === '+' || e.key === '=') setView(v => zoomAt(v, v.s * 1.5));
            else if (e.key === '-') setView(v => zoomAt(v, v.s / 1.5));
            else if (e.key === '0') setView(FIT);
            else if (e.key.toLowerCase() === 's' && frame.shiny) setShiny(x => !x);
        };
        window.addEventListener('keydown', key, true);
        return () => window.removeEventListener('keydown', key, true);
    });

    // the wheel zooms toward the pointer (a listener of its own: React's is passive)
    useEffect(() => {
        const el = stage.current;
        if (!el) return;
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            const [px, py] = fromCentre(e.clientX, e.clientY);
            setView(v => zoomAt(v, v.s * Math.exp(-e.deltaY * 0.0018), px, py));
        };
        el.addEventListener('wheel', wheel, { passive: false });
        return () => el.removeEventListener('wheel', wheel);
    }, []);

    // fingers and the mouse: drag pans, two fingers pinch, a quick sideways
    // stroke at full size goes to the next picture, a double tap zooms
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<{ x: number; y: number; t: number; view: View; dist: number; mid: readonly [number, number] } | null>(null);
    const lastTap = useRef(0);
    const begin = () => {
        const pts = [...pointers.current.values()];
        const first = pts[0];
        const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
        const mid = pts.length > 1 ? fromCentre((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2) : ([0, 0] as const);
        gesture.current = { x: first.x, y: first.y, t: Date.now(), view, dist, mid };
    };
    const down = (e: React.PointerEvent) => {
        if ((e.target as Element).closest('button, a')) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        begin();
    };
    const move = (e: React.PointerEvent) => {
        if (!pointers.current.has(e.pointerId) || !gesture.current) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = gesture.current, pts = [...pointers.current.values()];
        if (pts.length > 1 && g.dist) {
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            setView(zoomAt(g.view, g.view.s * (dist / g.dist), g.mid[0], g.mid[1]));
        } else if (g.view.s > 1) {
            setView(clamp({ ...g.view, x: g.view.x + (e.clientX - g.x), y: g.view.y + (e.clientY - g.y) }));
        }
    };
    const up = (e: React.PointerEvent) => {
        const g = gesture.current;
        const was = pointers.current.size;
        pointers.current.delete(e.pointerId);
        if (pointers.current.size) { begin(); return; }
        gesture.current = null;
        if (!g || was > 1) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        const quick = Date.now() - g.t < 500;
        if (g.view.s <= 1 && quick && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { go(dx < 0 ? 1 : -1); return; }
        // a tap or a click: two in a row zoom in, or back out
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
            const now = Date.now();
            if (now - lastTap.current < 300) {
                const [px, py] = fromCentre(e.clientX, e.clientY);
                setView(v => (v.s > 1 ? FIT : zoomAt(v, 2.5, px, py)));
                lastTap.current = 0;
            } else lastTap.current = now;
        }
    };

    const credit = image.credit || frame.image.credit || '';
    const where = [frame.title, frame.label].filter(Boolean).join(' · ');
    return createPortal(
        <div ref={root} className="art-viewer" role="dialog" aria-modal="true" aria-label={`${name} artwork`} data-no-long-press="">
            <div className="art-viewer-top">
                <div className="art-viewer-title">
                    <strong>{name}{showShiny ? ' (shiny)' : ''}</strong>
                    {where && <span>{where}{many ? ` · ${at + 1} / ${frames.length}` : ''}</span>}
                </div>
                <button ref={closeBtn} type="button" className="art-viewer-btn" onClick={onClose} aria-label="Close" title="Close (Esc)"><Icon name="x" /></button>
            </div>
            <div ref={stage} className="art-viewer-stage" data-scaling={frame.scaling}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                <div ref={content} className={`art-viewer-content${view.s > 1 ? ' is-zoomed' : ''}`}
                    style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
                    {draw(image.src, `${name}${showShiny ? ' shiny' : ''}${frame.label ? ` ${frame.label.toLowerCase()}` : ''}`)}
                </div>
                {many && <button type="button" className="art-viewer-btn art-viewer-nav is-prev" onClick={() => go(-1)} aria-label="Previous picture" title="Previous (←)"><Icon name="chevron-left" /></button>}
                {many && <button type="button" className="art-viewer-btn art-viewer-nav is-next" onClick={() => go(1)} aria-label="Next picture" title="Next (→)"><Icon name="chevron-right" /></button>}
            </div>
            <div className="art-viewer-bottom">
                {credit && <p className="art-viewer-credit"><Icon name="paint-brush" size={14} /><span>{credit}</span></p>}
                {image.description && <p className="art-viewer-desc">{image.description}</p>}
                <div className="art-viewer-tools" role="group" aria-label="View">
                    {frame.shiny && (
                        <button type="button" className={`art-viewer-btn${showShiny ? ' is-on' : ''}`} aria-pressed={showShiny} onClick={() => setShiny(x => !x)}
                            title={showShiny ? 'Show normal (S)' : 'Show shiny (S)'} aria-label={showShiny ? 'Show normal' : 'Show shiny'}><Icon name="sparkles" /></button>
                    )}
                    <button type="button" className="art-viewer-btn" onClick={() => setView(v => zoomAt(v, v.s / 1.5))} disabled={view.s <= MIN} aria-label="Zoom out" title="Zoom out (−)"><Icon name="minus" /></button>
                    <button type="button" className="art-viewer-zoom" onClick={() => setView(FIT)} aria-label="Fit to screen" title="Fit to screen (0)">{Math.round(view.s * 100)}%</button>
                    <button type="button" className="art-viewer-btn" onClick={() => setView(v => zoomAt(v, v.s * 1.5))} disabled={view.s >= MAX} aria-label="Zoom in" title="Zoom in (+)"><Icon name="plus" /></button>
                </div>
            </div>
        </div>,
        document.body
    );
}
