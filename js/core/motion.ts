// The site's motion, in one place. GSAP runs the sequences that CSS cannot
// (staggers, counts, exits before something is removed). The page scroll is
// the browser's own: a scroll run from script repainted the whole page each
// frame and made it stutter on slower devices. CSS keeps the simple state
// changes (hover, focus, press) with the tokens in css/tokens.css.
//
// The thesis: motion explains where things come from and go to. It is quick
// feedback, and nothing waits on an animation.
//
// Reduced motion (the setting or the system preference) keeps fades and
// drops movement. .low-end drops the staggers.

import { effectiveZoom } from './ui-scale.ts';
import { gsap } from 'gsap';

const EASE = 'expo.out';

// The entrances of new content (slideIn, staggerIn, sheetIn) use the
// browser's own Web Animations, not GSAP: they start inside React's commit,
// and GSAP first reads the computed transform, which forced a full style
// pass of the new content (about 180 ms on a slow phone). These need no
// read and run on the compositor. The curves match GSAP's eases.
const OUT3 = 'cubic-bezier(.215, .61, .355, 1)'; // power3.out
const OUT4 = 'cubic-bezier(.165, .84, .44, 1)'; // power4.out
const OUT_EXPO = 'cubic-bezier(.16, 1, .3, 1)'; // expo.out
const entering = new WeakMap<Element, Animation>();

/** Plays one entrance on `el`, stopping the one before it. */
function enter(el: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
    entering.get(el)?.cancel();
    const run = (el as HTMLElement).animate?.(frames, options);
    if (run) entering.set(el, run);
}

// A click that blocks the page for a moment (React drawing a new page) must
// not eat the start of the animation it began: a gap of more than 50 ms
// between frames counts as one frame. Without this, an entrance that starts
// during a 100 ms render is mostly over before its first frame shows.
gsap.ticker.lagSmoothing(50, 16);

export function reducedMotion(): boolean {
    return document.documentElement.classList.contains('reduce-motion')
        || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
const lowEnd = () => document.documentElement.classList.contains('low-end');

// ==================== moving between views ====================

/**
 * The parts of a view that enter one after another: under any lone wrappers,
 * each child, and the children of a child that holds a few blocks (a column
 * of panels, a header row). In page order, at most 14. Nothing is measured:
 * that would force a layout of the new content before its first frame.
 */
function entranceParts(root: Element): Element[] {
    let el = root;
    for (let depth = 0; depth < 4 && el.children.length === 1; depth++) el = el.children[0];
    const out: Element[] = [];
    for (const child of Array.from(el.children)) {
        const n = child.children.length;
        if (n > 1 && n <= 8 && out.length + n <= 14) out.push(...Array.from(child.children));
        else out.push(child);
        if (out.length >= 14) break;
    }
    return out.length ? out.slice(0, 14) : [root];
}

/**
 * A view arriving from the side it sits on: dir 1 comes in from the right
 * (the next tab, a page further right in the header, a deeper page), -1 from
 * the left, 0 rises in place. axis 'y' is for vertical lists (the regions).
 * Its parts arrive one after another, never all at once (entranceParts).
 * Reduced motion keeps only the fade; .low-end moves the view as one.
 */
export function slideIn(el: Element | null | undefined, dir: number, axis: 'x' | 'y' = 'x') {
    if (!el) return;
    if (reducedMotion()) {
        enter(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
        return;
    }
    const d = Math.sign(dir);
    // a short nudge that still says which side the view came from
    const reach = axis === 'x' ? Math.min(36, Math.max(20, window.innerWidth * 0.022)) : 16;
    const from = d === 0 ? 'translateY(10px)' : axis === 'x' ? `translateX(${d * reach}px)` : `translateY(${d * reach}px)`;
    const frames = [{ transform: from, opacity: 0 }, { transform: 'none', opacity: 1 }];
    if (lowEnd()) { enter(el, frames, { duration: 280, easing: OUT3 }); return; }
    // "backwards" holds each part at its start until its turn comes
    entranceParts(el).forEach((part, i) => enter(part, frames, { duration: 320, delay: i * 45, easing: OUT3, fill: 'backwards' }));
}

/** Where `next` sits against `prev` in an ordered list: 1 after, -1 before, 0 same or unknown. */
export function directionIn(order: readonly string[], prev: string | null | undefined, next: string | null | undefined): number {
    const a = prev == null ? -1 : order.indexOf(prev), b = next == null ? -1 : order.indexOf(next);
    return a < 0 || b < 0 ? 0 : Math.sign(b - a);
}

// ==================== the header's tabs ====================

/**
 * Puts the header's marker under the active tab. `move` slides it there: it
 * stretches across both tabs, then lets go of the old one. The new tab's icon
 * gives a small bounce. Without `move` (first paint, a resize) it just sits.
 */
export function navInk(nav: HTMLElement | null, move: boolean) {
    const ink = nav?.querySelector<HTMLElement>('.header-nav-ink');
    const btn = nav?.querySelector<HTMLElement>('.header-nav-btn.active');
    if (!nav || !ink) return;
    if (!btn) { gsap.to(ink, { opacity: 0, duration: 0.15 }); return; }
    // the bottom bar on a phone draws the marker a little narrower (css/header.css)
    const inset = parseFloat(getComputedStyle(ink).getPropertyValue('--ink-inset')) || 0;
    const left = btn.offsetLeft + btn.offsetWidth * inset, width = btn.offsetWidth * (1 - 2 * inset);
    gsap.killTweensOf(ink);
    if (!move || reducedMotion() || ink.style.opacity === '0' || !ink.style.width) {
        gsap.set(ink, { x: left, width, opacity: 1 });
        return;
    }
    const was = gsap.getProperty(ink, 'x') as number, wasW = gsap.getProperty(ink, 'width') as number;
    const right = left > was;
    gsap.timeline()
        // reach: the leading edge runs ahead to the new tab
        .to(ink, right ? { width: left + width - was, duration: 0.18, ease: 'power2.in' } : { x: left, width: was + wasW - left, duration: 0.18, ease: 'power2.in' })
        // let go: the trailing edge catches up
        .to(ink, { x: left, width, duration: 0.32, ease: 'power3.out' });
    const icon = btn.querySelector('svg');
    if (icon) gsap.fromTo(icon, { scale: 0.82, y: 2 }, { scale: 1, y: 0, duration: 0.5, ease: 'back.out(3)', clearProps: 'transform' });
}

// ==================== charts ====================

/**
 * A chart's entrance: bars grow from their baseline, dots and shapes scale
 * in, arcs draw. Returns a cleanup for React's effect.
 */
export function chartEntrance(root: Element): (() => void) | void {
    if (reducedMotion()) return;
    const q = (s: string) => Array.from(root.querySelectorAll(s));
    const tl = gsap.timeline({ defaults: { ease: EASE, duration: 0.7 } });
    const grow = q('.chart-grow'), growY = q('.chart-grow-y'), scale = q('.chart-scale'), pop = q('.chart-pop'), draw = q('.chart-draw');
    if (grow.length) tl.from(grow, { scaleX: 0, transformOrigin: '0% 50%', stagger: 0.03 }, 0);
    if (growY.length) tl.from(growY, { scaleY: 0, transformOrigin: '50% 100%', stagger: { amount: 0.25 } }, 0);
    if (scale.length) tl.from(scale, { scale: 0.2, opacity: 0, transformOrigin: '50% 50%' }, 0);
    // many small marks: one fade for the chart instead of a tween each
    if (pop.length > 80) tl.from(root, { opacity: 0, duration: 0.4 }, 0);
    else if (pop.length) tl.from(pop, { scale: 0, opacity: 0, duration: 0.45, stagger: { amount: 0.25 } }, 0.15);
    for (const el of draw as SVGPathElement[]) {
        const full = el.style.strokeDasharray;
        const len = full.split(' ')[1] || '400';
        tl.fromTo(el, { strokeDasharray: `0 ${len}` }, { strokeDasharray: full, duration: 0.9 }, 0);
    }
    return () => { tl.progress(1).kill(); };
}

/** Numbers in [data-count] count up from zero. The element holds the number only; it ends on its real text. */
export function countUp(root: Element | null) {
    if (!root || reducedMotion()) return;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-count]'))) {
        const end = Number(el.dataset.count);
        if (!Number.isFinite(end) || end === 0) continue;
        const text = el.textContent || '';
        const box = { v: 0 };
        gsap.to(box, {
            v: end, duration: 0.8, ease: 'power3.out',
            onUpdate: () => { el.textContent = Math.round(box.v).toLocaleString(); },
            onComplete: () => { el.textContent = text; }
        });
    }
}

// ==================== lists ====================

/**
 * Changes what a box shows behind a fade: the old content fades out, `change`
 * swaps it (grid to table and back), and the new content fades in. Opacity
 * only, the same fade as a page's slide without the movement.
 */
export function fadeSwap(el: Element | null | undefined, change: () => void) {
    if (!el) { change(); return; }
    gsap.killTweensOf(el);
    gsap.timeline()
        .to(el, { opacity: 0, duration: 0.14, ease: 'power1.in' })
        .call(change)
        .to(el, { opacity: 1, duration: 0.22, ease: 'power1.out', clearProps: 'opacity' });
}

/** A grid of cards arriving: a short stagger, capped, first screen only. */
export function staggerIn(items: Element[]) {
    if (!items.length || reducedMotion() || lowEnd()) return;
    const first = items.slice(0, 24);
    // never two at once: at least 25 ms apart, the whole run under half a second
    const gap = Math.max(25, Math.min(0.45, first.length * 0.03) / Math.max(1, first.length - 1) * 1000);
    // "backwards" holds each card at its start until its turn comes
    first.forEach((el, i) => enter(el, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: 450, delay: i * gap, easing: OUT_EXPO, fill: 'backwards' }));
}

// ==================== exits ====================

/** Plays a dialog's exit, then calls done. Instant for reduced motion. */
export function dialogOut(box: Element | null, overlay: Element | null, done: () => void) {
    if (!box || reducedMotion()) { done(); return; }
    gsap.timeline({ onComplete: done })
        .to(box, { y: 6, scale: 0.985, opacity: 0, duration: 0.14, ease: 'power2.in' }, 0)
        .to(overlay, { opacity: 0, duration: 0.16, ease: 'power1.in' }, 0);
}

const leaving = new WeakMap<Element, gsap.core.Timeline>();

/**
 * The editor sheet slides in from the right edge while the page behind dims,
 * and leaves the same way. The dim is #editor-view::before: a CSS transition
 * on the .scrim-off class fades it (css/editor.css).
 */
export function sheetIn(view: HTMLElement) {
    const sheet = view.querySelector('.editor-sheet');
    cancelSheetOut(view);
    if (!sheet) return;
    // start dark-free, then let the transition fade the dim in: two frames,
    // so the browser draws the start before the class goes
    view.classList.add('scrim-off');
    requestAnimationFrame(() => requestAnimationFrame(() => view.classList.remove('scrim-off')));
    if (reducedMotion()) {
        enter(sheet, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
        return;
    }
    enter(sheet, [{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 500, easing: OUT4 });
}

/**
 * The editor sheet grows to full screen or shrinks back to a side panel:
 * `change` flips the layout, and the sheet's width moves from the old size
 * to the new one, held at the right edge.
 */
export function sheetResize(view: HTMLElement | null, change: () => void) {
    // a width tween runs layout every frame: a low-end device just switches
    if (!view || reducedMotion() || lowEnd()) { change(); return; }
    const from = view.getBoundingClientRect().width;
    change();
    const to = view.getBoundingClientRect().width;
    if (Math.abs(to - from) < 1) return;
    gsap.killTweensOf(view);
    gsap.fromTo(view, { left: 'auto', width: from }, { width: to, duration: 0.42, ease: 'power3.inOut', clearProps: 'left,width' });
}

/** Slides the editor sheet back out to the right, then hides it. */
export function sheetOut(view: HTMLElement, hide: () => void) {
    const sheet = view.querySelector('.editor-sheet');
    if (!sheet || reducedMotion()) { hide(); return; }
    entering.get(sheet)?.cancel();
    leaving.get(view)?.kill();
    const tl = gsap.timeline({
        onComplete: () => { hide(); gsap.set(sheet, { clearProps: 'transform' }); view.classList.remove('scrim-off'); leaving.delete(view); }
    })
        .to(sheet, { xPercent: 100, duration: 0.34, ease: 'power3.in' }, 0);
    view.classList.add('scrim-off');
    leaving.set(view, tl);
}

/** Stops a sheet exit that a new open interrupts. */
export function cancelSheetOut(view: HTMLElement | null) {
    if (!view) return;
    const t = leaving.get(view);
    if (!t) return;
    t.kill();
    leaving.delete(view);
    const sheet = view.querySelector('.editor-sheet');
    if (sheet) gsap.set(sheet, { clearProps: 'transform' });
    view.classList.remove('scrim-off');
}

// ==================== dragging a card ====================

let dragSource: HTMLElement | null = null;
let dropped = false;

/**
 * A card picked up: a small chip of its art and name follows the pointer
 * (instead of the browser's see-through copy of the whole card), the card
 * left behind sinks back, and the places it can go light up (body.card-dragging).
 */
export function cardDragStart(card: HTMLElement, e: DragEvent) {
    dragSource = card;
    dropped = false;
    const chip = document.createElement('div');
    chip.className = 'drag-chip';
    const art = card.querySelector('.card-art img, .card-art .library-emblem');
    const frame = document.createElement('span');
    frame.className = 'drag-chip-art';
    if (art) frame.appendChild(art.cloneNode(true));
    const name = document.createElement('span');
    name.className = 'drag-chip-name';
    name.textContent = card.querySelector('.card-name')?.textContent || '';
    chip.append(frame, name);
    document.body.appendChild(chip);
    try { e.dataTransfer?.setDragImage(chip, 26, 26); } catch { /* an old browser keeps its own picture */ }
    // the browser takes its snapshot during dragstart; the chip can go after that
    setTimeout(() => chip.remove(), 0);
    document.body.classList.add('card-dragging');
    // after the snapshot, so the picture is not the faded card
    requestAnimationFrame(() => {
        if (dragSource !== card) return;
        card.classList.add('is-drag-source');
        if (reducedMotion()) gsap.set(card, { opacity: 0.45 });
        else gsap.to(card, { scale: 0.94, opacity: 0.45, duration: 0.22, ease: 'power2.out' });
    });
}

/** The drag is over: a card that found no home springs back into its place. */
export function cardDragEnd() {
    document.body.classList.remove('card-dragging');
    const card = dragSource;
    dragSource = null;
    if (!card) return;
    card.classList.remove('is-drag-source');
    if (dropped || reducedMotion()) { gsap.set(card, { clearProps: 'transform,opacity' }); return; }
    gsap.to(card, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.2)', clearProps: 'transform,opacity' });
}

/** The card went into `target` (a folder): its art shrinks into it, and the folder takes it in. */
export function cardDropInto(target: Element) {
    dropped = true;
    const card = dragSource;
    if (reducedMotion()) return;
    gsap.fromTo(target, { scale: 1.07 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.45)', clearProps: 'transform' });
    const art = card?.querySelector('.card-art');
    if (!art) return;
    const from = art.getBoundingClientRect(), to = target.getBoundingClientRect();
    const ghost = art.cloneNode(true) as HTMLElement;
    ghost.classList.add('drop-ghost');
    const z = effectiveZoom();
    Object.assign(ghost.style, { left: `${from.left / z}px`, top: `${from.top / z}px`, width: `${from.width / z}px`, height: `${from.height / z}px` });
    document.body.appendChild(ghost);
    gsap.to(ghost, {
        x: (to.left + to.width / 2 - (from.left + from.width / 2)) / z,
        y: (to.top + to.height / 2 - (from.top + from.height / 2)) / z,
        scale: 0.15, opacity: 0, rotation: -8, duration: 0.5, ease: 'power3.in',
        onComplete: () => ghost.remove()
    });
}
