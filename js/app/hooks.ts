// Hooks shared by the React pages.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { currentRoute, onRouteChange, type Route } from '../core/router.ts';
import { directionIn, slideIn } from '../core/motion.ts';

/** The phone layout (css/phone.css): a bottom tab bar, sheets instead of popovers. */
export const PHONE = '(max-width: 760px)';
const phoneQuery = () => window.matchMedia(PHONE);
export const isPhone = () => phoneQuery().matches;

/** Whether the phone layout is on, kept current. */
export function usePhone(): boolean {
    return useSyncExternalStore(fn => { const mq = phoneQuery(); mq.addEventListener('change', fn); return () => mq.removeEventListener('change', fn); }, isPhone);
}

let lastHref = '';
let lastRoute: Route = { name: '', param: '' };

// useSyncExternalStore needs the same object back until something changes
function routeSnapshot(): Route {
    const href = window.location.href;
    if (href !== lastHref) {
        lastHref = href;
        lastRoute = currentRoute();
    }
    return lastRoute;
}

/** The route the address bar names; re-renders on navigation and back/forward. */
export function useRoute(): Route {
    return useSyncExternalStore(onRouteChange, routeSnapshot);
}

/** The ?name= value from the address bar, kept in step like useRoute(). */
export function useQueryParam(name: string): string {
    useRoute();
    return new URLSearchParams(window.location.search).get(name) || '';
}

/**
 * The swipe every tab set uses: when `current` changes, the element on the
 * returned ref slides in from the side of the new tab in `order` (a later tab
 * from the right). Put the ref on the tab's content, not on the tab bar.
 */
export function useSlide<T extends string | number>(current: T, order: readonly T[], axis: 'x' | 'y' = 'x') {
    const ref = useRef<HTMLDivElement>(null);
    const last = useRef(current);
    useLayoutEffect(() => {
        if (last.current === current) return;
        slideIn(ref.current, directionIn(order.map(String), String(last.current), String(current)), axis);
        last.current = current;
    }, [current]);
    return ref;
}

/**
 * Whether a swipe that starts on `target` belongs to something else: a
 * slider, a text area, a drag surface or a sideways scroller. A one-line field
 * does not count: a quick swipe across one does nothing in it, and on a
 * form-heavy tab nearly every stroke starts on one.
 */
function swipeTaken(target: Element, root: Element): boolean {
    // drag surfaces: sliders (stat bars too), the notes' drawing canvases, evolution nodes
    if (target.closest('input[type="range"], [role="slider"], textarea, [contenteditable="true"], [contenteditable=""], .doodle-canvas, .notes-ink, [data-node-id], [data-no-swipe], .ctx-menu')) return true;
    if (target instanceof HTMLInputElement && document.activeElement === target) return true;
    for (let n: Element | null = target; n && n !== root.parentElement; n = n.parentElement) {
        if (n.scrollWidth > n.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
    }
    return false;
}

/**
 * Swipe left or right on a phone to go to the next or previous tab in
 * `order`, like Instagram and Facebook. Put the ref on the area that holds the
 * tabs and their content. The page's own slide (useSlide) plays the move.
 * The left screen edge is left to the phone's own "back" swipe.
 */
export function useSwipeTabs<T extends string>(order: readonly T[], current: T, go: (next: T) => void, enabled = true) {
    // a callback ref: the area can appear after the first render (a profile that loads)
    const [el, setEl] = useState<HTMLElement | null>(null);
    const latest = useRef({ order, current, go, enabled });
    latest.current = { order, current, go, enabled };
    useEffect(() => {
        if (!el) return;
        let start: { x: number; y: number; t: number } | null = null;
        const down = (e: TouchEvent) => {
            start = null;
            if (!latest.current.enabled || e.touches.length !== 1 || !isPhone() || document.body.classList.contains('modal-open')) return;
            const t = e.touches[0];
            if (t.clientX < 24 || swipeTaken(e.target as Element, el)) return;
            start = { x: t.clientX, y: t.clientY, t: Date.now() };
        };
        const up = (e: TouchEvent) => {
            const s = start;
            start = null;
            const t = e.changedTouches[0];
            if (!s || !t) return;
            const dx = t.clientX - s.x, dy = t.clientY - s.y;
            // a quick, mostly sideways stroke; a long press (the menu) or a scroll is not one
            if (Date.now() - s.t > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
            if (window.getSelection()?.toString()) return;
            const { order, current, go } = latest.current;
            const i = order.indexOf(current);
            const next = order[i + (dx < 0 ? 1 : -1)];
            if (i < 0 || next === undefined) return;
            go(next);
            // the new tab stays in view in a strip that scrolls sideways
            requestAnimationFrame(() => el.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
        };
        const cancel = () => { start = null; };
        el.addEventListener('touchstart', down, { passive: true });
        el.addEventListener('touchend', up, { passive: true });
        el.addEventListener('touchcancel', cancel, { passive: true });
        return () => {
            el.removeEventListener('touchstart', down);
            el.removeEventListener('touchend', up);
            el.removeEventListener('touchcancel', cancel);
        };
    }, [el]);
    return setEl;
}

/**
 * How many of `total` entries to draw now. A new `key` (another tab, folder,
 * layout or search) starts at `first`, enough to fill a screen. Then each idle
 * moment adds `step` more until all are drawn. A big collection then paints
 * its first screen at once, not after every card is made.
 */
export function useChunks(total: number, key: string, first = 24, step = 48): number {
    const [at, setAt] = useState({ key, n: first });
    const n = at.key === key ? at.n : first;
    useEffect(() => {
        if (n >= total) return;
        const next = () => setAt({ key, n: n + step });
        const idle = (window as any).requestIdleCallback;
        if (idle) { const id = idle(next, { timeout: 200 }); return () => (window as any).cancelIdleCallback(id); }
        const id = setTimeout(next, 30);
        return () => clearTimeout(id);
    }, [n, total, key]);
    return Math.min(n, total);
}
