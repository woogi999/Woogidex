// The app shell's header: logo on the left, the places you can go in the
// middle (Facebook-style tabs), the account menu on the right. Tabs are
// icon-only on narrow screens; each carries its name in title/aria-label.
// A host adds tabs, buttons and menu rows (js/core/extend.ts).
//
// On a phone (css/phone.css) the tabs are a bar along the bottom, like a
// phone app: Collection, Community, Create, Search and You. Create opens a
// sheet of things to make; You is the account menu, as a sheet. Battle is
// paused, so it sits in that sheet instead of taking a tab.

import { useLayoutEffect, useRef } from 'react';
import { api } from '../../core/app.ts';
import { navInk } from '../../core/motion.ts';
import { ext, registerNav, slots } from '../../core/extend.ts';
import { Icon } from '../components/Icon.tsx';
import { Link } from '../components/Link.tsx';
import { useClickAway } from '../components/editor/fields.tsx';
import { openContextMenu, type MenuItem } from '../components/ContextMenu.tsx';
import { usePhone } from '../hooks.ts';
import { notify, useStore } from '../store.ts';

registerNav({ page: 'collection-view', label: 'Collection', title: 'My Collection', icon: 'library', order: 10, path: 'collection' });
registerNav({ page: 'battle-view', label: 'Battle', title: 'Battle', icon: 'swords', order: 30, path: 'battle' });

/** A badge's number: 9+ past nine. */
export const countLabel = (n: number) => (n > 9 ? '9+' : String(n));

// ==================== the account menu ====================
let accountMenuOpen = false;

export function isAccountMenuOpen() { return accountMenuOpen; }

export function toggleHeaderProfilePopover(event?: Event) {
    event?.stopPropagation();
    accountMenuOpen = !accountMenuOpen;
    notify();
}

export function closeHeaderProfilePopover() {
    if (!accountMenuOpen) return;
    accountMenuOpen = false;
    notify();
}

/** The Create tab's sheet: the things you can make, wherever you are. */
function openCreateSheet(e: React.MouseEvent) {
    const signedIn = !!api.isLoggedIn?.();
    const join = () => api.openAuthModal?.('signup');
    const items: MenuItem[] = [
        { label: 'New Fakémon', icon: 'plus', run: () => api.createNewFakemon() },
        { label: 'Quick add', icon: 'light-bulb', run: () => api.openQuickAdd?.() },
        'sep',
        { label: 'Publish a Fakémon', icon: 'upload', run: signedIn ? () => api.openCommunityPublishModal() : join },
        { label: 'Write a post', icon: 'pencil-square', run: signedIn ? writePost : join }
    ];
    openContextMenu(e, { title: 'Create', subtitle: signedIn ? undefined : 'Publishing and posts need an account', items });
}

/** Community Home, with the composer open. */
async function writePost() {
    await api.openPath('community');
    requestAnimationFrame(() => (document.querySelector('#community-view .post-composer-prompt') as HTMLElement | null)?.click());
}

export function Header() {
    useStore();
    const phone = usePhone();
    const page = document.body.dataset.page || '';
    // a page can light up another page's tab (a post is still "in" Community)
    const section = ext.nav.find(n => n.alsoFor?.includes(page))?.page || page;
    // one marker slides from the old tab to the new one (js/core/motion.ts)
    const nav = useRef<HTMLElement>(null);
    const shown = useRef<string | null>(null);
    useLayoutEffect(() => {
        const from = shown.current;
        shown.current = section;
        navInk(nav.current, from !== null && from !== section);
    }, [section]);
    useLayoutEffect(() => {
        const keep = () => navInk(nav.current, false);
        window.addEventListener('resize', keep);
        return () => window.removeEventListener('resize', keep);
    }, []);
    return (
        <>
            <div className="header-left">
                <Link to="" className="logo logo-button" aria-label="Woogidex home" title="Woogidex">
                    <img src="assets/woogidex_logo.png" alt="Woogidex" width="95" height="32" />
                </Link>
                {slots(ext.headerLeft).map((Slot, i) => <Slot key={i} />)}
            </div>
            <nav className="header-nav" aria-label="Main navigation" ref={nav}>
                <span className="header-nav-ink" aria-hidden="true" />
                {ext.nav.filter(n => !(phone && n.page === 'battle-view')).map(n => {
                    const badge = n.badge?.() || 0;
                    return (
                        <Link key={n.page} to={n.path} className={`header-nav-btn${section === n.page ? ' active' : ''}`}
                            title={n.title} aria-label={n.title} aria-current={section === n.page ? 'page' : undefined}>
                            <Icon name={n.icon} /><span className="header-nav-label">{n.label}</span>
                            {badge > 0 && <span className="header-nav-badge">{countLabel(badge)}</span>}
                        </Link>
                    );
                })}
                {phone && (
                    <>
                        <button type="button" className="header-nav-btn header-nav-create" onClick={openCreateSheet} aria-haspopup="menu" title="Create" aria-label="Create">
                            <Icon name="plus" /><span className="header-nav-label">Create</span>
                        </button>
                        <Link to="search" className={`header-nav-btn${section === 'search-view' ? ' active' : ''}`} title="Search" aria-label="Search"
                            aria-current={section === 'search-view' ? 'page' : undefined}>
                            <Icon name="search" /><span className="header-nav-label">Search</span>
                        </Link>
                        <AccountMenu tab />
                    </>
                )}
            </nav>
            <div className="header-actions">
                {slots(ext.headerActions).map((Slot, i) => <Slot key={i} />)}
                {!phone && <AccountMenu />}
            </div>
        </>
    );
}

/**
 * The theme switch and Settings, plus whatever the host puts in it (who you
 * are, sign-out, policy links).
 */
function AccountMenu({ tab = false }: { tab?: boolean }) {
    const open = accountMenuOpen;
    const ref = useClickAway(open, closeHeaderProfilePopover);
    const close = closeHeaderProfilePopover;
    const Button = ext.accountButton;
    const signedIn = !!api.isLoggedIn?.();
    return (
        <div className={`header-profile-wrap${signedIn ? '' : ' is-signed-out'}${tab ? ' is-tab' : ''}`} ref={ref}>
            <button className={`header-profile-btn${tab ? ' header-nav-btn' : ''}`} type="button" onClick={() => toggleHeaderProfilePopover()} aria-haspopup="true" aria-expanded={open} aria-label="Account menu" title="Account menu">
                <span className="header-profile-avatar">{Button ? <Button /> : <Icon name="user" />}</span>
                {tab && <span className="header-nav-label">You</span>}
            </button>
            {open && tab && <div className="header-profile-backdrop" onClick={close} aria-hidden="true" />}
            {open && (
                <div className="header-profile-popover">
                    {tab && <span className="ctx-grip" aria-hidden="true" />}
                    {slots(ext.accountMenuTop).map((Slot, i) => <Slot key={i} close={close} />)}
                    <Link to="settings" className="header-profile-popover-item" onClick={close}><Icon name="settings" /><span>Settings</span></Link>
                    {tab && <Link to="battle" className="header-profile-popover-item" onClick={close}><Icon name="swords" /><span>Battle</span><span className="header-profile-popover-note">Paused</span></Link>}
                    {slots(ext.accountMenuItems).map((Slot, i) => <Slot key={i} close={close} />)}
                    {/* a switch, not a one-shot button, so it reads as a setting and shows which theme is on */}
                    <label className="header-profile-popover-item header-theme-row">
                        <Icon name="moon" /><span>Dark mode</span>
                        <input className="header-theme-input" type="checkbox" role="switch" checked={!!api.isDarkModeEnabled()} onChange={() => api.toggleDarkMode()} />
                        <span className="header-theme-switch" aria-hidden="true" />
                    </label>
                    {slots(ext.accountMenuBottom).map((Slot, i) => <Slot key={i} close={close} />)}
                </div>
            )}
        </div>
    );
}
