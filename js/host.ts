// The site on top of the Fakémon maker and the battle simulator: accounts,
// the Community Hub, events, messages, notifications, cloud backup and the
// policy pages. js/core/app.ts calls installHost() once, before boot.
// Everything here goes through the registries in js/core/extend.ts.

import { api } from './core/app.ts';
import { ext, registerNav, registerPage, registerRoute } from './core/extend.ts';
import { LANDING_PAGE } from './core/flags.ts';
import { initAvatars } from './core/avatar.ts';
import { mountIsland } from './app/island.tsx';
import { TOURS } from './features/onboarding.ts';
import { showConsoleWarning } from './core/console-warning.ts';

import * as auth from './features/auth.ts';
import * as community from './features/community.ts';
import * as notifications from './core/notifications.ts';
import * as moderation from './core/moderation.ts';
import * as events from './features/events.ts';
import * as cloudSave from './features/cloud-save.ts';
import * as legal from './features/legal.ts';
import * as accountDeletion from './features/account-deletion.ts';
import * as oauth from './features/oauth.ts';
import * as globalSearch from './features/global-search.ts';
import * as feedback from './features/feedback.ts';
import * as social from './features/social.ts';
import * as groups from './features/groups.ts';
import * as business from './features/business.ts';
import * as messaging from './features/messaging.ts';
import * as safety from './features/safety.ts';

import './app/dialogs/account.tsx';
import './app/dialogs/cloudBackup.tsx';
import './app/dialogs/auth.tsx';
import './app/dialogs/feedback.tsx';
import './app/dialogs/safety.tsx';
import './app/dialogs/whatsNew.tsx';
import { LegalPage } from './app/pages/LegalPage.tsx';
import { MovePage } from './app/pages/MovePage.tsx';
import { SearchPage } from './app/pages/SearchPage.tsx';
import { ProfilePage } from './app/pages/ProfilePage.tsx';
import { CommunityPage } from './app/pages/CommunityPage.tsx';
import { CommunityDetailPage } from './app/pages/CommunityDetailPage.tsx';
import { PostPage } from './app/pages/PostPage.tsx';
import { MessagesPage } from './app/pages/MessagesPage.tsx';
import { NotificationsPage } from './app/pages/NotificationsPage.tsx';
import { maybeShowWhatsNew, openWhatsNew } from './features/whats-new.ts';
import { resumeAddAccount } from './features/accounts.ts';
import { LandingPage } from './app/pages/LandingPage.tsx';
import { registerAccountSettings } from './app/pages/SettingsAccount.tsx';
import { registerAboutSettings } from './app/pages/SettingsAbout.tsx';
import { CookieNotice } from './app/shell/CookieNotice.tsx';
import { GlobalSearch } from './app/shell/GlobalSearch.tsx';
import { QuickSearch } from './app/shell/QuickSearch.tsx';
import {
    AccountButton, AccountMenuBottom, AccountMenuTop, FeedbackMenuItem, MessagesButton, Notifications, SignInButton
} from './app/shell/HeaderAccount.tsx';
import { MessagesDock } from './app/shell/MessagesDock.tsx';

export function installHost(): void {
    Object.assign(api, auth, community, notifications, moderation, events, cloudSave, legal, accountDeletion, oauth, globalSearch, feedback, social, messaging, safety, groups, business);
    // avatars come from the same masked pipe artwork does; this hands Core's
    // module a client getter rather than letting it import the account layer
    initAvatars(() => api.getClient());

    // ---- pages ----
    // not out yet: only mounted when the build switches it on (js/core/flags.ts)
    if (LANDING_PAGE) registerPage({ view: 'landing-view', Page: LandingPage });
    registerPage({ view: 'legal-view', Page: LegalPage, lazy: true });
    registerPage({ view: 'search-view', Page: SearchPage, lazy: true });
    registerPage({ view: 'profile-view', Page: ProfilePage, lazy: true });
    registerPage({ view: 'community-view', Page: CommunityPage, lazy: true });
    registerPage({ view: 'community-detail-view', Page: CommunityDetailPage, lazy: true });
    registerPage({ view: 'post-view', Page: PostPage, lazy: true });
    registerPage({ view: 'messages-view', Page: MessagesPage, lazy: true });
    registerPage({ view: 'notifications-view', Page: NotificationsPage, lazy: true });

    // ---- routes ----
    // a page that shows the server's data waits (briefly) for sign-in at boot
    registerRoute('community', {
        needsAccount: true, needsShowdown: true, skeleton: () => api.renderCommunityGridSkeleton?.(),
        open: async param => await api.handleCommunityRoute?.(param) === true
    });
    registerRoute('events', {
        needsAccount: true, needsShowdown: true, skeleton: () => api.renderEventsSkeleton?.(),
        open: async param => { await api.openEvents?.(param); return true; }
    });
    registerRoute('post', { needsAccount: true, open: async param => !!param && await api.openPost?.(param, { preserveRoute: true }) === true });
    registerRoute('groups', { needsAccount: true, open: async param => { await api.openGroups?.(param); return true; } });
    registerRoute('messages', { needsAccount: true, open: async param => await api.handleMessagesRoute?.(param) === true });
    // every notification, with tabs (the bell's panel shows the newest)
    registerRoute('notifications', {
        needsAccount: true,
        open: async () => {
            // signed out, the page itself asks you to sign in
            api.closeNotificationsPanel?.();
            api.activateTopLevelView?.('notifications-view');
            api.setPageTitle?.('Notifications');
            return true;
        }
    });
    registerRoute('profile', {
        needsAccount: true, skeleton: () => api.renderProfileLoading?.(),
        open: async param => {
            if (!param) return false;
            api.activateTopLevelView?.('profile-view');
            return await api.handleProfileRoute?.(param) === true;
        }
    });
    registerRoute('privacy', { open: () => legal.openLegalPage('privacy') });
    // woogidex.com/move: takes in the data the old address sends (js/features/data-move.ts)
    registerPage({ view: 'move-view', Page: MovePage });
    registerRoute('move', { open: () => { api.activateTopLevelView?.('move-view'); api.setPageTitle?.('Move your data'); return true; } });
    registerRoute('terms', { open: () => legal.openLegalPage('terms') });
    registerRoute('search', { needsAccount: true, open: async () => { await api.openSearchPage?.(new URLSearchParams(window.location.search).get('q') || ''); return true; } });
    // the old Updates & Credits page: news is now the Woogidex account's posts, credits are in Settings > About
    registerRoute('updates', {
        needsAccount: true,
        open: async param => {
            if (param === 'credits') { api.openSettings?.('about'); return true; }
            api.activateTopLevelView?.('profile-view');
            return await api.handleProfileRoute?.('woogidex') === true;
        }
    });

    // ---- the header ----
    registerNav({ page: 'community-view', label: 'Community', title: 'Community', icon: 'users', order: 20, path: 'community', alsoFor: ['community-detail-view', 'post-view'] });
    ext.headerLeft.push(GlobalSearch);
    ext.headerActions.push(MessagesButton, Notifications, SignInButton);
    ext.accountButton = AccountButton;
    ext.accountMenuTop.push(AccountMenuTop);
    ext.accountMenuItems.push(FeedbackMenuItem);
    ext.accountMenuBottom.push(AccountMenuBottom);
    // the newest update post, in a pop-up once (js/features/whats-new.ts)
    Object.assign(api, { openWhatsNew });
    ext.ready.push(maybeShowWhatsNew);
    // "Add another account" reloads the page signed out: then open the sign-in
    ext.ready.push(resumeAddAccount);

    // ---- settings ----
    registerAccountSettings();
    registerAboutSettings();

    // ---- first-visit tips ----
    TOURS.editor.push({
        targets: ['[data-tour="editor-publish"]'],
        title: 'Show it off',
        body: 'Happy with it? Publish it to the Community Hub. That part needs a free account; making stuff never does.'
    });
    TOURS.community = [
        {
            targets: ['.hub-nav-list'],
            title: 'Welcome to the Hub',
            body: 'The feed, every published Fakémon, groups and events, all from here. Your own uploads are on your profile.'
        },
        {
            targets: ['.hub-publish'],
            title: 'Post your own',
            body: 'Publish a Fakémon from your collection, or its whole evolution family at once.'
        },
        {
            targets: ['.feed-rail'],
            title: 'Find your people',
            body: 'Follow creators you like, and join groups for the stuff you are into.'
        }
    ];
    TOURS.events = [
        {
            targets: ['.ev-list-head'],
            title: 'Contests and sign-ups',
            body: 'Everything the community is running shows up here. Open one to read what to send in and when entries close.'
        },
        {
            targets: ['.ev-tickets .ev-ticket:not(.is-skeleton)', '.ev-empty'],
            title: 'Enter, vote, find out who won',
            body: 'Entries, voting and results all happen on the event’s own page. Organizers can run one too.'
        }
    ];
    ext.tourFor.push(() => {
        const body = document.body;
        // a public event opened signed out reads as a standalone page; no tips there
        if (body.dataset.page !== 'community-view' || body.classList.contains('event-guest')) return null;
        const cs = api.communityState?.();
        if (cs?.panel === 'events') return events.events.view?.kind === 'list' ? 'events' : null;
        return cs?.panel === 'feed' || !cs?.panel ? 'community' : null;
    });

    // ---- boot ----
    ext.boot.push(() => {
        // the "STOP, don't paste anything here" warning (production only)
        showConsoleWarning();
        mountIsland('cookie-notice-root', CookieNotice);
        // the chat dock, bottom right (js/app/shell/MessagesDock.tsx)
        mountIsland(document.body.appendChild(Object.assign(document.createElement('div'), { id: 'messages-dock-root' })), MessagesDock);
        // Ctrl+K: a layer of its own, above the page and the dialogs
        mountIsland(document.body.appendChild(Object.assign(document.createElement('div'), { id: 'quick-search-root' })), QuickSearch);
        return api.initAuth();
    });
}
