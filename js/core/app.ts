// tells the boot guard at the bottom of index.html the module graph executed,
// so it can explain an empty shell instead of leaving it unexplained
window.__woogidexBooted = true;
import { log } from './log.ts';
import './ui-scale.ts';
import { LANDING_PAGE } from './flags.ts';
import { isLowEndDevice, prefersSavingData, whenIdle } from './device.ts';
import { registerOfflineSupport } from './offline.ts';
import { SELECTABLE_TYPES, POKEMON_COLORS } from './data.ts';
import * as data from './data.ts';
import * as editor from '../editor/editor.ts';
import * as sampleSets from '../editor/sample-sets.ts';
import * as editorCore from '../editor/editor-core.ts';
import * as pokedex from '../features/pokedex.ts';
import * as storage from './storage.ts';
import * as exporter from '../export/export.ts';
import * as showdownExport from '../export/showdown-export.ts';
import * as essentialsExport from '../export/essentials-export.ts';
import * as evolution from '../features/evolution.ts';
import * as analysis from '../features/analysis.ts';
import * as abilityBlocks from '../editor/ability-blocks.ts';
import * as nameRoll from '../tools/name-roll.ts';
import * as fieldRoll from '../tools/field-roll.ts';
import * as protect from './protect.ts';
import * as router from './router.ts';
import * as recovery from '../features/recovery.ts';
import { mountPages } from '../app/mount.tsx';
import { mountDialogHost, openDialog } from '../app/dialogs.tsx';
import { notify, markViewShown } from '../app/store.ts';
import { pushToast } from '../app/shell/Toasts.tsx';
import { closeHeaderProfilePopover, toggleHeaderProfilePopover } from '../app/shell/Header.tsx';
import * as regions from '../features/regions.ts';
import * as notebook from '../features/notebook.ts';
import * as customTypes from '../features/custom-types.ts';
import * as entityArt from '../editor/entity-art.ts';
import * as moveInheritance from '../features/move-inheritance.ts';
import { maybeShowOriginNotice } from './dev-notice.ts';
import { initArtShield } from './art-shield.ts';
import { cancelSheetOut, sheetIn, sheetOut, slideIn } from './motion.ts';
import { ext } from './extend.ts';
// the site's pages, routes and settings on top of the app (js/core/extend.ts)
import { installHost } from '../host.ts';

import { state } from '../app/state.ts';
export { state };

// every module's exports, merged below; reached through here to avoid import cycles
export const api: Record<string, any> = {};

function loadDarkMode() {
            const saved = localStorage.getItem('woogidex-dark-mode');
            if (saved === 'true') {
                document.documentElement.setAttribute('data-theme', 'dark');
                updateDarkModeUI(true);
            } else {
                document.documentElement.removeAttribute('data-theme');
                updateDarkModeUI(false);
            }
        }
        // where the last click or tap landed: the theme change spreads out from there
        let themeOrigin: any = null;
        document.addEventListener('pointerdown', e => { themeOrigin = { x: e.clientX, y: e.clientY }; }, true);

        function applyDarkMode(dark) {
            if (dark) document.documentElement.setAttribute('data-theme', 'dark');
            else document.documentElement.removeAttribute('data-theme');
            try { localStorage.setItem('woogidex-dark-mode', String(dark)); } catch {}
            updateDarkModeUI(dark);
        }

        // The new theme is revealed through a circle that grows from the switch
        // (View Transitions; css/tokens.css turns off the default cross-fade).
        // Without support, or with reduced motion, it just switches.
        function toggleDarkMode() {
            const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
            const reduced = document.documentElement.classList.contains('reduce-motion')
                || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (!document.startViewTransition || reduced) { applyDarkMode(dark); return; }
            const x = themeOrigin?.x ?? innerWidth / 2;
            const y = themeOrigin?.y ?? innerHeight / 2;
            const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
            const transition = document.startViewTransition(() => applyDarkMode(dark));
            transition.ready.then(() => {
                document.documentElement.animate(
                    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                    { duration: 560, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' }
                );
            }).catch(() => {});
        }
        // the switch in the header's account menu; the Settings page reads isDarkModeEnabled()
        function updateDarkModeUI(isDark) {
            notify();
        }

// ---- boolean settings ----
// each entry gets get/set/toggle<Name> generated below, so adding a setting is
// one row instead of three functions. `apply` runs on load+change (DOM state),
// `onChange` only on change (re-renders).
const BOOLEAN_SETTINGS = {
    FadeUselessMoves: {
        storageKey: 'woogidex-fade-useless-moves', defaultValue: true,
        onChange: () => api.updatePreview?.()
    },
    // flat sprites by default on a low-end device: animated 3D models are the
    // heaviest thing the collection and template picker can draw
    Use2DSprites: {
        storageKey: 'woogidex-use-2d-sprites', defaultValue: isLowEndDevice(),
        onChange: () => {
            // the template picker's sprites
            notify();
            api.updateBulkComparison?.();
        }
    },
    IncludeOwnFakemonsInBulkComparison: {
        storageKey: 'woogidex-include-own-fakemons-bulk', defaultValue: false,
        onChange: () => api.updateBulkComparison?.()
    },
    IncludeOwnFakemonsInRecommendedMoves: {
        storageKey: 'woogidex-include-own-fakemons-recommended', defaultValue: false
    },
    ShowCollectionCardDate: {
        storageKey: 'woogidex-show-card-date', defaultValue: true,
        onChange: () => api.renderCollection?.()
    },
    ReduceMotion: {
        storageKey: 'woogidex-reduce-motion', defaultValue: false,
        apply: (enabled) => document.documentElement.classList.toggle('reduce-motion', enabled)
    },
    OverlayBlur: {
        storageKey: 'woogidex-overlay-blur', defaultValue: true,
        apply: (enabled) => document.documentElement.classList.toggle('no-overlay-blur', !enabled)
    },
    ConfirmBeforeDelete: {
        storageKey: 'woogidex-confirm-before-delete', defaultValue: true
    },
    AutoplayCry: {
        storageKey: 'woogidex-autoplay-cry', defaultValue: false
    },
    AlwaysShowCardActions: {
        storageKey: 'woogidex-always-show-card-actions', defaultValue: false,
        apply: (enabled) => document.documentElement.classList.toggle('always-show-card-actions', enabled)
    },
    // the editor sheet covers the whole window under the header instead of the right side
    EditorFullscreen: {
        storageKey: 'woogidex-editor-fullscreen', defaultValue: false,
        apply: (enabled) => document.documentElement.classList.toggle('editor-fullscreen', enabled)
    },
    // the "did not load" / "looks empty" save locks in js/core/storage.ts
    CollectionSafetyChecks: {
        storageKey: 'woogidex-collection-safety-checks', defaultValue: true,
        onChange: () => api.closeCollectionWarning?.()
    },
    // the paint the cursor smears across the landing page (PaintSmudge.tsx). It
    // paints and dries two canvases every frame, so it starts off on low-end
    // devices and touch screens (where there's no cursor to follow anyway)
    LandingSmudge: {
        storageKey: 'woogidex-landing-smudge',
        defaultValue: !isLowEndDevice() && !window.matchMedia?.('(pointer: coarse)').matches
    },
    // the first-visit tips (js/features/onboarding.ts)
    ShowTips: {
        storageKey: 'woogidex-show-tips', defaultValue: true
    }
};

function readSetting(spec) {
    const stored = localStorage.getItem(spec.storageKey);
    return stored === null ? spec.defaultValue : stored === 'true';
}

const settingsApi: Record<string, any> = {};
for (const [name, spec] of Object.entries<any>(BOOLEAN_SETTINGS)) {
    settingsApi[`get${name}`] = () => readSetting(spec);
    settingsApi[`set${name}`] = (enabled) => {
        localStorage.setItem(spec.storageKey, enabled ? 'true' : 'false');
        spec.apply?.(enabled);
        updateSettingsUI();
        spec.onChange?.();
    };
    settingsApi[`toggle${name}`] = () => settingsApi[`set${name}`](!readSetting(spec));
}

function isDarkModeEnabled() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
}

// /settings/<section> opens on that section (js/app/pages/SettingsPage.tsx
// reads it from the address). /settings alone is "none in particular": the
// first section on a wide screen, the list of sections on a phone.
function openSettings(tab = '') {
    log.debug('SETTINGS', 'Opening settings page');
    const section = typeof tab === 'string' ? tab : '';
    api.activateTopLevelView?.('settings-view');
    api.setRoute?.(section ? `settings/${encodeURIComponent(section)}` : 'settings', 'Settings');
}

// the Settings page renders from the settings themselves; this just tells it to
function updateSettingsUI() {
    notify();
}

function loadSettings() {
    for (const spec of Object.values<any>(BOOLEAN_SETTINGS)) spec.apply?.(readSetting(spec));
    updateSettingsUI();
}


/** A note in the corner for three seconds (js/app/shell/Toasts.tsx). Plain text. */
function showToast(message, type = 'info') {
    log.info('TOAST', `${type}: ${message}`);
    pushToast(message, type);
}

        

// keeps the address bar/title in sync with the current view. Opening a page
// adds a history entry (router.navigateRoute), so Back and Forward walk the
// pages visited; see router.ts.
const BASE_TITLE = 'Woogidex';
function setPageTitle(subtitle) {
    document.title = subtitle ? `${subtitle} · ${BASE_TITLE}` : BASE_TITLE;
    setMeta('og:title', document.title);
    setMeta('twitter:title', document.title);
}

// The share card for whatever is on screen. Link previews on other sites come
// from worker/index.js (bots don't run this code); this keeps the live page's
// own tags in step, which the browser's share sheet and some apps read.
const DEFAULT_SHARE = (() => {
    const read = (sel: string) => document.querySelector<HTMLMetaElement>(sel)?.content || '';
    return { description: read('meta[name="description"]'), image: read('meta[property="og:image"]'), robots: read('meta[name="robots"]') };
})();

/**
 * What search engines may do with this page (the <meta name="robots"> the
 * worker also sets on the first load, worker/index.js). '' puts back the
 * page's default; every route change does that, so a "noindex" set for a
 * missing page can't stick to the next one.
 */
function setRobots(content = '') {
    let el = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!el) { el = document.createElement('meta'); el.name = 'robots'; document.head.appendChild(el); }
    el.content = content || DEFAULT_SHARE.robots || 'noai, noimageai, noimageindex';
}

/** The page's one true address, for search engines (no query, no trailing slash). */
function setCanonical(path = window.location.pathname) {
    let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el); }
    el.href = window.location.origin + (String(path).replace(/\/+$/, '') || '/');
}
function setMeta(key: string, value: string) {
    const attr = key.startsWith('og:') ? 'property' : 'name';
    const el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
    if (el && value) el.content = value;
}
function setShareMeta({ title = '', description = '', image = '' }: { title?: string; description?: string; image?: string } = {}) {
    if (title) setPageTitle(title);
    const desc = description || DEFAULT_SHARE.description;
    setMeta('description', desc);
    setMeta('og:description', desc);
    setMeta('twitter:description', desc);
    setMeta('og:image', image || DEFAULT_SHARE.image);
    setMeta('twitter:image', image || DEFAULT_SHARE.image);
    setMeta('og:url', window.location.href.split('#')[0]);
}
router.onRouteChange(() => { setMeta('og:url', window.location.href.split('#')[0]); setRobots(); setCanonical(); });

function setRoute(path, title) {
    setPageTitle(title);
    setShareMeta();
    router.navigateRoute(path);
}

// all full-page views live under #main-content; visibility is kept in one
// place so a new page can't leave a previously-open view stranded underneath it
// (and every page a host adds, js/core/extend.ts)
const CORE_VIEW_IDS = [
    'collection-view',
    'editor-view',
    'ability-block-editor-view',
    'battle-view',
    'settings-view',
    'not-found-view'
];
const topLevelViewIds = () => [...CORE_VIEW_IDS, ...ext.pages.map(p => p.view)];

// Views that open as a sheet over another page rather than replacing it,
// mapped to the page they sit on. The editor slides in over My Collection.
const SHEET_VIEWS = { 'editor-view': 'collection-view' };

/**
 * Which way a page move goes: 1 to the right (a header tab further right, or
 * a page deeper under the same tab), -1 to the left, 0 when either page is
 * not in the header.
 */
function viewDirection(from: string | undefined, to: string): number {
    const at = (view?: string) => {
        const i = ext.nav.findIndex(n => n.page === view || (!!view && !!n.alsoFor?.includes(view)));
        return i < 0 ? null : { order: i, depth: ext.nav[i].page === view ? 0 : 1 };
    };
    const a = at(from), b = at(to);
    if (!a || !b) return 0;
    return Math.sign(b.order - a.order) || Math.sign(b.depth - a.depth);
}

function activateTopLevelView(viewId, options: Record<string, any> = {}) {
    const { preserveAbilityEditor = false } = options;
    // the guest view of a public event is one page only; anything else ends it
    document.body.classList.remove('event-guest');

    if (viewId !== 'ability-block-editor-view' && !preserveAbilityEditor) {
        api.onTopLevelNavigation?.(viewId);
    }

    // drop lobby presence when leaving battle so you don't linger in "online" lists
    const leavingBattle = document.getElementById('battle-view')?.style.display === 'block' && viewId !== 'battle-view';
    if (leavingBattle) api.onBattleViewLeave?.();

    // a community post's borrowed custom types only apply while it's open
    if (viewId !== 'community-detail-view') api.setVisitingTypes?.([]);

    // a library editor panel belongs to My Collection; leaving closes it
    document.querySelectorAll('.modal-overlay.as-sheet.active').forEach(el => el.classList.remove('active'));

    // a sheet keeps (or brings up) the page it belongs over
    const pageId = SHEET_VIEWS[viewId] || viewId;
    const pageWasShowing = document.getElementById(pageId)?.style.display === 'block';
    const previousPage = document.body.dataset.page;
    const targetWasShowing = document.getElementById(viewId)?.style.display === 'block';


    topLevelViewIds().forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const show = id === viewId || id === pageId;
        if (show) { cancelSheetOut(el); el.style.display = 'block'; return; }
        // the editor sheet slides away (js/core/motion.ts) rather than vanishing
        if (id === 'editor-view' && el.style.display === 'block') sheetOut(el, () => { el.style.display = 'none'; });
        else el.style.display = 'none';
    });

    // the shell reads these: the sidebar only exists on My Collection, the 404
    // hides the header, and an open sheet locks the page scroll behind it
    document.body.dataset.page = pageId;
    document.body.classList.toggle('editor-sheet-open', viewId === 'editor-view');
    // nearly every editor tool reads the Showdown data; don't make it wait for
    // the idle moment boot left it for (memoised, so a no-op once loaded)
    if (viewId === 'editor-view') api.fetchShowdownData?.();

    // the page under a sheet stays put; only what just appeared animates in,
    // from the side it sits on in the header (js/core/motion.ts)
    const target = document.getElementById(viewId);
    const page = document.getElementById(pageId);
    if (page && page !== target && !pageWasShowing) slideIn(page, viewDirection(previousPage, pageId));
    // My Collection's region sidebar sits outside the page; it moves with it
    if (pageId === 'collection-view' && previousPage !== pageId) slideIn(document.getElementById('app-sidebar'), viewDirection(previousPage, pageId));
    if (target && !targetWasShowing) {
        if (SHEET_VIEWS[viewId]) sheetIn(target);
        else slideIn(target, viewDirection(previousPage, viewId));
    }

    // a React page refetches what it shows each time it opens (useViewShown)
    markViewShown(viewId);
    return target || null;
}

log.setContext({ state, api });

// Battle loads on first use (js/app/mount.tsx draws its page lazily too).
// Until then these stand in for the few battle functions the rest of the site
// calls; loading the module puts every real one on `api`, replacing them.
let battleModule: Promise<any> | null = null;
function loadBattle() {
    return battleModule ||= import('../battle/ui/battle-ui.ts').then(m => { Object.assign(api, m); return m; });
}
const battleStubs = {
    loadBattle,
    // ponytail: battles are switched off until the new simulator lands; restore
    // `loadBattle().then(m => m.openBattle(...args))` to bring them back
    openBattle: () => openDialog('battle-paused', {}),
    renderBattleSkeleton: (...args: any[]) => loadBattle().then(m => m.renderBattleSkeleton(...args)),
    // only ever asked once a battle is running, by which point the real one is in place
    battleMoveChoices: () => [],
    pickBattleMove: () => false,
    onBattleViewLeave: (...args: any[]) => { battleModule?.then(m => m.onBattleViewLeave?.(...args)); }
};

Object.assign(api, data, editor, sampleSets, editorCore, pokedex, storage, exporter, showdownExport, essentialsExport, evolution, analysis, battleStubs, abilityBlocks, nameRoll, fieldRoll, protect, router, recovery, regions, notebook, customTypes, entityArt, moveInheritance, settingsApi, {
    loadDarkMode, toggleDarkMode, updateDarkModeUI, openSettings, isDarkModeEnabled,
    setRoute, setPageTitle, setShareMeta, setRobots, setCanonical, showNotFound, showLanding, activateTopLevelView,
    updateSettingsUI, loadSettings, showToast, closeHeaderProfilePopover, toggleHeaderProfilePopover
});

// the host adds its pages, routes and functions (accounts, sharing, ...) on
// top; a function it adds under a name Core already has replaces Core's
installHost();

// header retracts on downward scroll, reveals on scroll up or pointer near top
let lastScrollY = 0;
let headerScrollTick = false;
let headerHoverRevealTimer: any = null;
function showDynamicHeader() {
    const header = document.querySelector('.header');
    if (!header) return;
    header.classList.remove('header-retracted');
}
function updateDynamicHeader() {
    const header = document.querySelector('.header');
    if (!header) return;
    const y = window.scrollY || 0;
    const delta = y - lastScrollY;
    if (y <= 8) showDynamicHeader();
    else if (delta > 5) header.classList.add('header-retracted');
    else if (delta < -5) showDynamicHeader();
    lastScrollY = y;
    headerScrollTick = false;
}
window.addEventListener('scroll', () => {
    if (!headerScrollTick) { headerScrollTick = true; requestAnimationFrame(updateDynamicHeader); }
}, { passive: true });
window.addEventListener('mousemove', (event) => {
    if (event.clientY <= 14) {
        clearTimeout(headerHoverRevealTimer);
        headerHoverRevealTimer = setTimeout(showDynamicHeader, 40);
    }
}, { passive: true });
window.addEventListener('touchstart', (event) => {
    if (event.touches?.[0]?.clientY <= 18) showDynamicHeader();
}, { passive: true });

document.addEventListener('DOMContentLoaded', async () => {
    const done = log.time('BOOT', 'Application initialization');
    log.info('BOOT', 'DOMContentLoaded fired');
    // theme and settings are local: apply them before anything paints, so a
    // slow or unreachable backend never leaves the page in the wrong theme
    loadDarkMode();
    loadSettings();
    // the pages, the shell around them, and the dialog layer (js/app)
    mountPages();
    mountDialogHost();
    // rewrite old #hash links before anything reads the route
    router.migrateLegacyHash();
    const bootRoute = router.currentRoute();
    // paint a skeleton for the current route immediately so the first frame
    // has the right shape instead of sitting blank until data loads;
    // handleRoute() below does the real reveal/fetch and replaces it
    // '/' is My Collection until the landing page is switched on (js/core/flags.ts)
    // editor/ability-editor open a specific Fakemon that only exists after
    // loadFromStorage() resolves, so there's nothing to skeleton yet
    if (bootRoute.name === 'collection' || (!LANDING_PAGE && bootRoute.name === '')) api.renderCollectionSkeleton?.();
    else ext.routes.get(bootRoute.name)?.skeleton?.();
    // The collection lives on this device and does not depend on the account,
    // so reading it never waits on auth. It used to: a sign-in that threw or
    // hung (Supabase blocked, offline with an expired token, a stale chunk
    // after a deploy) meant loadFromStorage() never ran, and every save was
    // refused with "Your Collection Did Not Load" on every reload.
    // (the host's boot hooks are where signing in happens)
    const authDone = Promise.all(ext.boot.map(fn => Promise.resolve().then(fn)
        .catch(e => log.error('BOOT', 'Sign-in setup failed; carrying on signed out', e))));
    await api.loadFromStorage();
    // Supabase being down must not hold the page hostage: everything local
    // works without it. Wait briefly so a restored session is there for the
    // first route, then go on; the header catches up when auth settles.
    // Pages that live on this device don't wait at all.
    // ponytail: fixed 2.5s cap, tune if slow networks sign in late too often
    if (ext.routes.get(bootRoute.name)?.needsAccount) await Promise.race([authDone, new Promise(r => setTimeout(r, 2500))]);
    // custom types join the shared type lists before anything draws a type picker
    api.syncCustomTypes?.(true);
    // Showdown data (moves/abilities/items/pokedex, 1MB+) is only needed
    // up front by routes that look something up in it before rendering
    // (editor, community preview, battle); the collection grid draws only
    // from the Fakemon's own saved fields, so it doesn't block on this fetch.
    // Callers elsewhere show their own loading state if they beat it (see
    // state.sdLoaded checks in editor.ts/analysis.ts/pokedex.ts).
    const showdownFirst = bootRoute.name === 'editor' || bootRoute.name === 'ability-editor' || !!ext.routes.get(bootRoute.name)?.needsShowdown;
    if (showdownFirst) await api.fetchShowdownData?.();
    // Everywhere else it waits for the first quiet moment, so parsing ~1 MB of
    // JSON doesn't land on top of the first render (seconds, on a cheap phone).
    // learnsets.json (3.2 MB) warms after it; callers await api.ensureLearnsets()
    // themselves, so a low-end device or Data Saver skips the warm-up entirely.
    // On the front page they also wait for its painting, which is what a first
    // visit sees: a few seconds, then the quiet moment. (Opening the editor
    // fetches the data at once anyway; see activateTopLevelView.)
    const warm = LANDING_PAGE && bootRoute.name === '' ? (fn: () => void, timeout?: number) => { setTimeout(() => whenIdle(fn, timeout), 4000); } : whenIdle;
    if (!showdownFirst) warm(() => api.fetchShowdownData?.());
    if (!isLowEndDevice() && !prefersSavingData()) warm(() => api.ensureLearnsets?.(), 8000);
    // opening the page the address already names must not add an entry
    // not awaited: a route waiting on the network shows its skeleton while
    // the rest of boot (offline support, art shield, notices) carries on
    router.replacingHistory(() => handleRoute(bootRoute))
        .then(handled => { if (!handled) api.renderCollection(); })
        .catch(e => { log.error('BOOT', 'Could not open the first page', e); api.showCollection?.(); });
    api.initContentProtection?.();
    initArtShield();
    api.updateEditorStats();
    done({ fakemons: state.fakemonDB.length, sdLoaded: state.sdLoaded });
    log.info('BOOT', 'Application ready', { fakemons: state.fakemonDB.length, sdLoaded: state.sdLoaded });
    // empty collection on a local origin looks like data loss; see dev-notice.ts
    maybeShowOriginNotice(state.fakemonDB.length);
    // Order matters. A collection that did not load, or that came up empty on a
    // device that had Fakemon, is the only thing worth showing first: it tells
    // the user not to create anything yet, and its own buttons lead to the
    // recovery scan. Otherwise the lost-Fakemon scan runs.
    if (!api.maybeWarnAboutCollectionHealth?.()) await api.checkForLostFakemon?.();
    for (const fn of ext.ready) {
        try { await fn(); } catch (e) { log.error('BOOT', 'A ready hook failed', e); }
    }
    // keeps the site usable offline (js/core/offline.ts)
    registerOfflineSupport();
});

// restores whichever page a URL names, on load and on back/forward, so both
// paths can never diverge. returns true if the route was recognised/opened.
async function handleRoute(route) {
    const { name, param } = route;

    // the host's pages (js/core/extend.ts)
    const hosted = ext.routes.get(name);
    if (hosted) return await hosted.open(param) === true;
    if (name === 'ability-editor') {
        if (!param) return false;
        api.openAbilityBlockEditor(param);
        return true;
    }
    if (name === 'editor') {
        // a Fakemon this browser doesn't have isn't an error - the collection
        // is local, so the link just isn't for this person; fall through
        if (!param) return false;
        const fakemon = state.fakemonDB.find(f => String(f.id) === param);
        if (!fakemon) return false;
        api.editFakemon(param);
        return true;
    }
    if (name === 'battle') { api.showCollection?.(); api.openBattle?.(); return true; }
    if (name === 'settings') { api.openSettings?.(param); return true; }
    if (name === '') { await showLanding(); return true; }
    if (name === 'collection') { api.showCollection?.(); return true; }
    if (name === router.NOT_FOUND) { showNotFound(param); return true; }
    return false;
}

// The landing page (/), for everyone; My Collection is /collection. Leaving
// the editor for it saves first, the way leaving for any other page does.
async function showLanding() {
    // not out yet (js/core/flags.ts): '/' and the logo open My Collection, as before
    if (!LANDING_PAGE) { api.showCollection?.(); return; }
    if (document.getElementById('editor-view')?.style.display === 'block' && !state.isCommunityPreview) {
        await api.autoSave?.(true);
    }
    state.isCommunityPreview = false;
    api.exitCommunityRoute?.();
    api.exitProfileRoute?.();
    activateTopLevelView('landing-view');
    setRoute('', null);
}

// the address bar is left alone so the bad link stays visible and copyable;
// the page (js/app/pages/NotFoundPage.tsx) reads the path from it
function showNotFound(path) {
    activateTopLevelView('not-found-view');
    setPageTitle('Page not found');
    // a page that isn't there shouldn't end up in search results as one that is
    setRobots('noindex, nofollow');
    log.info('ROUTER', 'No route for this path', { path });
}

// the browser's back and forward buttons
router.listenForHistory(async (route) => {
    if (!(await handleRoute(route))) api.showCollection?.();
});

/**
 * Opens a route path the way a link does: one new history entry, then the
 * same opener a direct visit to that address runs, so a click and a deep
 * link can never show different pages. Like back/forward, the opener's own
 * address changes replace that entry instead of adding more.
 * @param path e.g. 'community/12', no leading slash
 */
async function openPath(path: string) {
    router.navigateRoute(path);
    const handled = await router.replacingHistory(() => handleRoute(router.currentRoute()));
    if (!handled) api.showCollection?.();
}
api.openPath = openPath;

// Links to the app's own pages are real <a href> (hover shows the address,
// Ctrl+click and middle click open a new tab). A plain click stays in the
// page: it is routed here instead of reloading the site. A link with a
// target, a download, or a destination the app does not own (another site,
// admin.html, a file) is left to the browser.
document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    if ((a.getAttribute('href') || '').startsWith('#')) return;
    const path = router.appPathOf(a.href);
    if (path === null) return;
    event.preventDefault();
    openPath(path).catch(e => log.error('ROUTER', 'Could not open that link', e));
});

// a click on the dimmed page beside the sheet lands on #editor-view itself
// (its ::before is the scrim), and closes the editor like the X does
// (library editor panels are React dialogs, which close themselves the same way)
document.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.id === 'editor-view') api.showCollection?.();
});

// Esc closes the editor sheet, unless a dialog opened from inside it is
// what the key is meant for (those close themselves first)
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!document.body.classList.contains('editor-sheet-open')) return;
    if (document.querySelector('.modal-overlay.active, .move-detail-popup')) return;
    // a menu or picker inside the sheet takes the first Esc
    if (document.activeElement?.closest?.('.global-search, .export-as-wrap, .type-dropdown.open')) return;
    api.showCollection?.();
});

export { loadDarkMode, toggleDarkMode, updateDarkModeUI, showToast };