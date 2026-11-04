// Puts the React pages into the containers the page shell already has
// (#legal-view, #not-found-view, ...). The shell still decides which one is
// showing; each page renders what its route or the shared state says.

import { lazy, Suspense, type ComponentType } from 'react';
import { mountIsland } from './island.tsx';
import './dialogs/roll.tsx';
import './dialogs/confirm.tsx';
import './dialogs/newEntry.tsx';
import './dialogs/battlePaused.tsx';
import './dialogs/cropImage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { PageView, useViewShown } from './store.ts';
import { api } from '../core/app.ts';
import { ext } from '../core/extend.ts';
import { CollectionPage } from './pages/CollectionPage.tsx';
import { EditorPage } from './pages/EditorPage.tsx';
import { AbilityBlockEditorPage } from './pages/AbilityBlockEditorPage.tsx';
import { Header } from './shell/Header.tsx';
import { Sidebar } from './shell/Sidebar.tsx';
import { Toasts } from './shell/Toasts.tsx';
import { Onboarding } from './shell/Onboarding.tsx';
import { ContextMenuHost, initContextMenu, setPageMenuItems } from './components/ContextMenu.tsx';
import { openBulkPaste, openQuickAdd } from './dialogs/notebook.tsx';

// Battle (its engine, the 3D field, the netcode: a sizeable share of the
// site) only downloads the first time someone opens it. Until then the page
// renders nothing, so mounting it at boot costs nothing either.
// waits for the battle functions to be on `api` too, which the page calls
const BattlePageChunk = lazy(() => Promise.all([import('./pages/BattlePage.tsx'), api.loadBattle()]).then(([m]) => ({ default: m.BattlePage })));
function BattlePage() {
    const shown = useViewShown('battle-view');
    if (!shown) return null;
    return (
        <Suspense fallback={<div className="battle-loading" aria-busy="true"><span className="skel" style={{ display: 'block', height: 420, borderRadius: 'var(--panel-r)' }} /></div>}>
            <BattlePageChunk />
        </Suspense>
    );
}

/**
 * A page that draws nothing until the first time one of its views opens, then
 * stays. Every page is mounted at boot, hidden; without this each one rendered
 * (and fetched what it shows: the whole changelog, the collection's cards)
 * behind whichever page was actually open.
 */
export function whenFirstShown(Page: ComponentType, ...views: string[]): ComponentType {
    function FirstShown() {
        // a fixed number of hooks, so every view is asked every render
        const opened = views.map(v => useViewShown(v)).some(Boolean);
        return opened ? <Page /> : null;
    }
    FirstShown.displayName = `WhenFirstShown(${Page.displayName || Page.name})`;
    return FirstShown;
}

const PAGES: Array<[string, ComponentType]> = [
    ['not-found-view', whenFirstShown(NotFoundPage, 'not-found-view')],
    ['settings-view', whenFirstShown(SettingsPage, 'settings-view')],
    ['battle-view', BattlePage],
    // the editor opens as a sheet over My Collection, which shows the collection too
    ['collection-view', whenFirstShown(CollectionPage, 'collection-view', 'editor-view')],
    ['editor-view', EditorPage],
    ['ability-block-editor-view', AbilityBlockEditorPage],
    // not pages: the shell around them
    ['app-header', Header],
    ['app-sidebar', Sidebar],
    ['toast-container', Toasts],
    ['onboarding-root', Onboarding]
];

/** A page inside its view, so useStore() can let it rest while it is off screen. */
function inView(view: string, Page: ComponentType): ComponentType {
    function InView() { return <PageView.Provider value={view}><Page /></PageView.Provider>; }
    InView.displayName = `InView(${Page.displayName || Page.name})`;
    return InView;
}

// the shell around the pages is always on screen
const SHELL = new Set(['app-header', 'app-sidebar', 'toast-container', 'onboarding-root']);

/** Mounts every React page. Runs once at boot, before the first route opens. */
export function mountPages(): void {
    // mounted at once: the editor's boards are drawn into by other modules straight after boot
    // (the editors stay eager for that; the other pages wait to be opened, above)
    for (const [id, Page] of PAGES) mountIsland(id, SHELL.has(id) ? Page : inView(id, Page), {}, { sync: true });
    // the host's pages (js/core/extend.ts)
    for (const { view, Page, lazy } of ext.pages) mountIsland(view, inView(view, lazy ? whenFirstShown(Page, view) : Page), {}, { sync: true });
    // the right-click menu draws into a layer of its own, above everything
    mountIsland(document.body.appendChild(Object.assign(document.createElement('div'), { id: 'context-menu-root' })), ContextMenuHost);
    setPageMenuItems(() => document.body.dataset.page === 'collection-view'
        ? [{ label: 'New Fakémon', icon: 'plus', run: () => api.createNewFakemon() }, { label: 'Quick add', icon: 'light-bulb', hint: 'N', run: openQuickAdd },
            { label: 'Paste a list of names', icon: 'clipboard-document-list', run: openBulkPaste }, { label: 'New folder', icon: 'folder', run: () => api.createFolder?.() }]
        : []);
    initContextMenu();
    // quick search (a host) and other modules open these through api
    Object.assign(api, { openQuickAdd, openBulkPaste });
}
