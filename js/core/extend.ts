// What the host adds to the app. The Fakémon maker and the battle simulator
// work with no account and no server, and the collection lives in the
// browser. The host (js/host.ts) adds the rest through these registries
// before boot: more pages and routes, header buttons, account settings, and
// functions on `api`.
//
// js/core/app.ts imports js/host.ts and calls its installHost(). Everything here
// is read at boot and on render, so register before DOMContentLoaded (the
// installHost call in app.ts takes care of that).

import type { ComponentType, ReactNode } from 'react';

/** A full page: drawn into a #<view> container under #main-content. */
export interface PageSpec {
    view: string;
    Page: ComponentType;
    /** draw nothing until the view first opens (most pages) */
    lazy?: boolean;
}

/** A tab in the header's middle row. */
export interface NavItem {
    page: string;
    label: string;
    title: string;
    icon: string;
    open: () => void;
    /** where it sits; Core uses 10 (Collection) and 30 (Battle) */
    order: number;
    /** the small count on the tab, or 0 */
    badge?: () => number;
    /** other pages that light this tab up (a post lights up Community) */
    alsoFor?: string[];
}

/** One route name (the first path segment) and how to open it. */
export interface RouteSpec {
    /** opens the page; false means "not a page" and the caller falls back */
    open: (param: string) => boolean | Promise<boolean>;
    /** paints the page's skeleton at boot, before data loads */
    skeleton?: () => void;
    /** waits (briefly) for sign-in before opening at boot */
    needsAccount?: boolean;
    /** loads the Showdown data before opening at boot */
    needsShowdown?: boolean;
}

/** A row on the Settings page. See js/app/pages/SettingsPage.tsx. */
export interface SettingsItem {
    id: string;
    label: string;
    desc: ReactNode;
    text?: string;
    setting?: string;
    control?: () => ReactNode;
    tone?: 'danger';
}

export interface SettingsGroup {
    id: string;
    title: string;
    desc?: () => ReactNode;
    items?: SettingsItem[];
    render?: () => ReactNode;
    keywords?: string;
    when?: () => boolean;
}

export interface SettingsSection {
    key: string;
    label: string;
    blurb: string;
    groups: SettingsGroup[];
    when?: () => boolean;
    /** where it sits; Core uses 10 (Appearance), 20 (Editor) and 90 (Data) */
    order: number;
}

export const ext = {
    pages: [] as PageSpec[],
    nav: [] as NavItem[],
    routes: new Map<string, RouteSpec>(),
    /** beside the logo (a search box) */
    headerLeft: [] as ComponentType[],
    /** the right side of the header, before the account menu */
    headerActions: [] as ComponentType[],
    /** the account menu's button picture; a person icon without one */
    accountButton: null as ComponentType | null,
    /** the top of the account menu (who you are, or a sign-in button) */
    accountMenuTop: [] as ComponentType<{ close: () => void }>[],
    /** menu rows after Settings */
    accountMenuItems: [] as ComponentType<{ close: () => void }>[],
    /** the bottom of the account menu (sign out, policy links) */
    accountMenuBottom: [] as ComponentType<{ close: () => void }>[],
    /** the card at the top of Settings' navigation */
    settingsIdentity: null as ComponentType | null,
    settingsSections: [] as SettingsSection[],
    /** groups added to a section Core owns, by its key */
    settingsGroups: [] as Array<{ section: string; group: SettingsGroup; before?: string }>,
    /** runs whenever Settings opens (refetch what the server knows) */
    settingsOpened: [] as Array<() => void>,
    /** runs at boot, before the collection loads (signing in) */
    boot: [] as Array<() => unknown>,
    /** runs once the first page is open */
    ready: [] as Array<() => unknown>,
    /** the onboarding tour a section shows, by key (see js/features/onboarding.ts) */
    tourFor: [] as Array<() => string | null>
};

// Every register function replaces an entry with the same key instead of
// adding a second one. A module that runs again (a hot reload in
// development, a second copy of the app) then cannot double the header,
// the pages or Settings.
function put<T>(list: T[], item: T, same: (a: T) => boolean): void {
    const at = list.findIndex(same);
    if (at >= 0) list[at] = item; else list.push(item);
}

/**
 * The components in a slot list, one per component name (the newest wins).
 * A host pushes straight into ext.headerActions and the like, so the header
 * reads them through this.
 */
export function slots<C extends ComponentType<any>>(list: C[]): C[] {
    const byName = new Map<string, C>();
    list.forEach((c, i) => byName.set(c.displayName || c.name || `#${i}`, c));
    return [...byName.values()];
}

export function registerPage(spec: PageSpec): void {
    put(ext.pages, spec, p => p.view === spec.view);
    // a host page needs a container; Core's own are in index.html
    const make = () => {
        if (document.getElementById(spec.view)) return;
        const el = document.createElement('div');
        el.id = spec.view;
        el.style.display = 'none';
        document.getElementById('main-content')?.appendChild(el);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', make, { once: true });
    else make();
}

export function registerNav(item: NavItem): void {
    put(ext.nav, item, n => n.page === item.page);
    ext.nav.sort((a, b) => a.order - b.order);
}

export function registerRoute(name: string, spec: RouteSpec): void {
    ext.routes.set(name, spec);
}

export function registerSettingsSection(section: SettingsSection): void {
    put(ext.settingsSections, section, s => s.key === section.key);
    ext.settingsSections.sort((a, b) => a.order - b.order);
}

export function registerSettingsGroup(section: string, group: SettingsGroup, before?: string): void {
    put(ext.settingsGroups, { section, group, before }, g => g.section === section && g.group.id === group.id);
}
