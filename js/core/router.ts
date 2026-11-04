// Path-based routing on a static host (GitHub Pages) via two pieces: 404.html
// is a copy of index.html that Pages serves for any unrecognized path, so
// /community/12 loads the app with the URL intact (npm run build writes it);
// and index.html sets <base href> from the current path so relative URLs
// resolve when served from a subpath (e.g. /<repo>/, not root). basePath()
// derives from document.baseURI so it can't disagree with that.
//
// History: moving to another page pushes an entry (navigateRoute), so the
// browser's back and forward buttons walk through the pages visited. Each
// entry remembers its scroll position, restored when you come back to it.
// Adjusting the address of the page you're already on (a profile's username
// in its canonical case, say) replaces the entry instead (replaceRoute).

import { log } from './log.ts';
import { ext } from './extend.ts';

// Route segments the app owns. Order does not matter; these are matched as the
// first path segment after the base. "/" is the landing page (My Collection
// is /collection); anything else
// is reported as NOT_FOUND so the app can show its 404 page. 'editor' and
// 'ability-editor' are only read from old links: the editors have no address.
// A host adds its own (registerRoute, js/core/extend.ts).
const CORE_ROUTES = ['collection', 'editor', 'ability-editor', 'battle', 'settings'];
const knownRoute = (name: string) => CORE_ROUTES.includes(name) || ext.routes.has(name);

export type RouteName = string;
export interface Route { name: RouteName; param: string; }

/** Route name for a path the app doesn't own; param holds the path as typed. */
export const NOT_FOUND = 'not-found';

let cachedBase: string | null = null;

/**
 * The path the app is installed at, with a trailing slash: '/' on a domain
 * root, '/woogidex/' on a GitHub Pages project site.
 */
export function basePath(): string {
    if (cachedBase === null) cachedBase = new URL(document.baseURI).pathname.replace(/[^/]*$/, '');
    return cachedBase;
}

/**
 * Parses the address bar into a route.
 * name is '' for the app root and NOT_FOUND for a path no route owns.
 */
export function currentRoute(): Route {
    const path = window.location.pathname;
    const base = basePath();
    const rest = (path.startsWith(base) ? path.slice(base.length) : path.replace(/^\//, ''))
        .replace(/^\/+|\/+$/g, '');
    if (!rest || rest === 'index.html' || rest === '404.html') return { name: '', param: '' };
    const [name, ...tail] = rest.split('/');
    if (!knownRoute(name)) return { name: NOT_FOUND, param: rest };
    return { name: name as RouteName, param: decodeURIComponent(tail.join('/')) };
}

/**
 * The href for a route, for a link inside the app: '/community/12' on a
 * domain root. Hovering it shows the address, and the browser can copy it or
 * open it in a new tab. A plain click is routed in the page (js/core/app.ts).
 * @param path e.g. 'community/12' or 'search?q=x' -- no leading slash
 */
export function routeHref(path: string): string {
    return `${basePath()}${String(path || '').replace(/^\/+/, '')}`;
}

/**
 * The route path ('community/12', 'search?q=x', '' for the root) that a link
 * points at, or null when the app does not own it: another site, a file
 * (an asset), or a path no route claims.
 */
export function appPathOf(href: string): string | null {
    let url: URL;
    try { url = new URL(href, document.baseURI); } catch { return null; }
    if (url.origin !== window.location.origin) return null;
    const base = basePath();
    if (!url.pathname.startsWith(base)) return null;
    const rest = url.pathname.slice(base.length).replace(/\/+$/, '');
    const name = rest.split('/')[0];
    if (name && !knownRoute(name)) return null;
    return `${rest}${url.search}`;
}

/**
 * Absolute URL for a route, for share links and anything that leaves the page.
 * @param path e.g. 'community/12' -- no leading slash
 */
export function routeUrl(path: string): string {
    return `${window.location.origin}${basePath()}${String(path || '').replace(/^\/+/, '')}`;
}

// ---- listeners (the React app re-renders on these) ----
type Listener = () => void;
const listeners = new Set<Listener>();

/** Calls fn after every change of address, pushed, replaced or from back/forward. */
export function onRouteChange(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

function emit() {
    listeners.forEach(fn => {
        try { fn(); } catch (err) { log.error('ROUTER', 'Route listener failed', { error: String(err) }); }
    });
}

/** The address for a route path, keeping ?q= only where the search page uses it. */
function targetUrl(path: string): string {
    const [pathPart, query = ''] = String(path || '').replace(/^\/+/, '').split('?');
    const params = new URLSearchParams(query);
    if (!query && /^search(\/|$)/.test(pathPart)) {
        // no query given: a search page keeps the one it has
        const q = new URLSearchParams(window.location.search).get('q');
        if (q && currentRoute().name === 'search') params.set('q', q);
    }
    const qs = params.toString();
    return `${basePath()}${pathPart}${qs ? `?${qs}` : ''}`;
}

function isCurrent(url: string): boolean {
    return `${window.location.pathname}${window.location.search}` === url && !window.location.hash;
}

// while back/forward is being handled, the page code runs its usual open
// functions, which navigate; those must not push new entries on top
let restoring = 0;

/**
 * Runs fn with every navigation inside it replacing the current entry rather
 * than adding one: boot (opening the page the address already names) and
 * back/forward both re-run the ordinary open functions, which navigate.
 */
export async function replacingHistory<T>(fn: () => T | Promise<T>): Promise<T> {
    restoring++;
    try { return await fn(); } finally { restoring--; }
}

function rememberScroll() {
    try {
        history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, '');
    } catch { /* file:// */ }
}

/**
 * Moves the address bar to a route, as a new history entry so Back returns to
 * the page before. Does nothing when already there.
 * @param path route path without a leading slash, '' for the root; may carry ?q=
 * @param opts.replace replace the current entry instead of adding one
 */
export function navigateRoute(path: string, opts: { replace?: boolean } = {}): void {
    const url = targetUrl(path);
    if (isCurrent(url)) return;
    try {
        if (opts.replace || restoring) {
            history.replaceState({ ...(history.state || {}) }, '', url);
        } else {
            rememberScroll();
            history.pushState({ scrollY: 0 }, '', url);
        }
    } catch (err) {
        // only reachable from file://, where history is refused
        log.warn('ROUTER', 'Could not update the address bar', { path, error: String(err) });
        return;
    }
    emit();
}

/**
 * For an opener that waits on the network before it shows its page: call
 * this first, and after the wait, stop if it returns true. Then the visitor
 * went somewhere else meanwhile (a link, Back), and that page wins.
 */
export function watchAddress(): () => boolean {
    const at = window.location.href;
    return () => window.location.href !== at;
}

/** Rewrites the current entry's address without adding a history entry. */
export function replaceRoute(path: string): void {
    navigateRoute(path, { replace: true });
}

/**
 * Wires up the browser's back and forward buttons. `open` shows the page an
 * address names (the same function boot uses), and runs with pushes turned
 * into replaces; the scroll position the entry was left at comes back after.
 */
export function listenForHistory(open: (route: Route) => Promise<unknown> | unknown): void {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.addEventListener('popstate', async (event) => {
        const scrollY = Number(event.state?.scrollY) || 0;
        try {
            await replacingHistory(() => open(currentRoute()));
        } catch (err) {
            log.error('ROUTER', 'Could not restore that page', { error: String(err) });
        }
        emit();
        // after the page has drawn, so there is something to scroll
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
    });
    // a reload keeps the scroll position the page was left at
    window.addEventListener('pagehide', rememberScroll);
}

// ---- legacy hash links -----------------------------------------------------
// #community/<id> and #profile/<name> links have been shared and will keep
// arriving. They are rewritten to the equivalent path on arrival so an old
// link opens the right page and, from then on, shows the new URL.
const LEGACY: Array<[RegExp, (m: string) => string]> = [
    [/^#community\/(.+)$/, id => `community/${id}`],
    [/^#profile\/(.+)$/, name => `profile/${name}`],
    [/^#editor\/(.+)$/, id => `editor/${id}`],
    [/^#ability-editor\/(.+)$/, id => `ability-editor/${id}`],
    [/^#(collection|editor|community|events|battle)$/, name => name]
];

// ---- Supabase email links --------------------------------------------------
// password reset / magic link / confirmation tokens (or errors) arrive in the
// URL fragment. Must be captured at module load, before the supabase client
// parses-and-wipes it, or a route change drops it.
export interface EmailLinkParams { type: string; errorCode: string; errorDescription: string; }
const EMAIL_LINK: EmailLinkParams = (() => {
    const hash = (window.location.hash || '').replace(/^#/, '');
    const query = (window.location.search || '').replace(/^\?/, '');
    const params = new URLSearchParams(`${hash}&${query}`);
    return Object.freeze({
        type: params.get('type') || '',
        errorCode: params.get('error_code') || '',
        errorDescription: params.get('error_description') || ''
    });
})();

/**
 * What the Supabase email link this page was opened from said, if any. All
 * fields are '' on an ordinary visit.
 */
export function emailLinkParams(): EmailLinkParams {
    return EMAIL_LINK;
}

/**
 * Rewrites a legacy #hash URL to its path equivalent. Call once, before the
 * first route is read.
 * @returns true if the URL was rewritten
 */
export function migrateLegacyHash(): boolean {
    const hash = window.location.hash || '';
    if (!hash) return false;
    for (const [pattern, toPath] of LEGACY) {
        const m = hash.match(pattern);
        if (!m) continue;
        const path = toPath(m[1]);
        log.info('ROUTER', 'Rewrote a legacy hash link', { from: hash, to: path });
        try {
            history.replaceState(null, '', `${basePath()}${path}${window.location.search}`);
        } catch { /* file://; the hash router below still reads it correctly */ }
        return true;
    }
    return false;
}
