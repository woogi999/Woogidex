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
