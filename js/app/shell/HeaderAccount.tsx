// What the site adds to Core's header (js/app/shell/Header.tsx): the
// Community and Updates tabs, search, messages, notifications, and the
// account parts of the account menu. Registered in js/host.ts.

import { api, state } from '../../core/app.ts';
import { notificationsView } from '../../core/notifications.ts';
import { Avatar } from '../components/Avatar.tsx';
import { BadgeRow } from '../components/Badge.tsx';
import { Icon } from '../components/Icon.tsx';
import { Link, profilePath } from '../components/Link.tsx';
import { useClickAway } from '../components/editor/fields.tsx';
import { NotificationItem, NotificationSkeleton, WhatsNewRow } from '../components/NotificationList.tsx';
import { usePhone } from '../hooks.ts';
import { openUpdates, whatsNewView } from '../../features/whats-new.ts';
import { addAccount, forgetAccount, logOutOfThisAccount, savedAccounts, switchAccount } from '../../features/accounts.ts';
import { countLabel } from './Header.tsx';

/** A Sign In button beside the account menu, signed out. */
export function SignInButton() {
    if (state.user) return null;
    return <button className="header-signin-btn" type="button" onClick={() => api.openAuthModal('signin')}>Sign In</button>;
}

/** Opens your chats; the badge counts unread messages (muted chats don't count). */
export function MessagesButton() {
    if (!state.user) return null;
    const active = document.body.dataset.page === 'messages-view';
    const unread: number = api.unreadMessageTotal?.() || 0;
    return (
        <Link to="messages" className={`notifications-bell-btn header-messages-btn${active ? ' active' : ''}`}
            aria-label={unread ? `Messages, ${unread} unread` : 'Messages'} title="Messages">
            <Icon name="chat-bubble-oval-left-ellipsis" size={20} />
            {unread > 0 && <span className="notifications-badge">{countLabel(unread)}</span>}
        </Link>
    );
}

export function Notifications() {
    const v = notificationsView();
    const phone = usePhone();
    const ref = useClickAway(v.open, () => api.closeNotificationsPanel());
    if (!v.signedIn) return null;
    // the badge also counts a "What's New" you have not opened
    const unread = v.unread + (whatsNewView()?.unseen ? 1 : 0);
    const badge = unread > 0 && <span className="notifications-badge">{countLabel(unread)}</span>;
    // a phone opens the whole page, like an app's notifications tab
    if (phone) {
        const active = document.body.dataset.page === 'notifications-view';
        return (
            <Link to="notifications" className={`notifications-bell-btn header-bell-btn${active ? ' active' : ''}`} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications">
                <Icon name="bell" size={20} />{badge}
            </Link>
        );
    }
    return (
        <div className="notifications-wrap" ref={ref}>
            <button className="notifications-bell-btn header-bell-btn" type="button" onClick={() => api.toggleNotificationsPanel()} aria-label="Notifications" title="Notifications" aria-expanded={v.open}>
                <Icon name="bell" size={20} />{badge}
            </button>
            {v.open && (
                <div className="notifications-panel">
                    <div className="notifications-panel-header">
                        <span>Notifications</span>
                        <span className="notifications-panel-tools">
                            <button className="notifications-mark-all-btn" type="button" onClick={() => api.markAllNotificationsRead()}>Mark all read</button>
                            <Link to="notifications" className="notifications-mark-all-btn" onClick={() => api.closeNotificationsPanel()}>See all</Link>
                        </span>
                    </div>
                    <div className="notifications-list">
                        <WhatsNewRow onOpen={() => api.closeNotificationsPanel()} />
                        {v.loading
                            ? <NotificationSkeleton />
                            : !v.items.length
                                ? <div className="notifications-empty">You're all caught up - no notifications yet.</div>
                                : v.items.map(n => <NotificationItem key={n.id} n={n} />)}
                    </div>
                </div>
            )}
        </div>
    );
}

// your own profile: by username, or by id until you have one
const ownProfilePath = (user: { id: string; username?: string }) => user.username ? profilePath(user.username) : `profile/${user.id}`;

const displayName = () => {
    const user = state.user;
    return user ? (user.displayName || user.username || 'Profile') : '';
};

/** The account menu's button: your avatar, signed in. */
export function AccountButton() {
    const user = state.user;
    if (!user) return <Icon name="user" />;
    return <Avatar userId={user.id} url={user.avatarUrl} name={displayName()} className="header-avatar-img" />;
}

/** The other accounts in this browser, to switch to (js/features/accounts.ts). */
function SavedAccountRows({ close }: { close: () => void }) {
    const others = savedAccounts();
    if (!others.length) return null;
    return (
        <div className="header-accounts" role="group" aria-label="Switch account">
            {others.map(a => (
                <div key={a.id} className="header-account-row">
                    <button type="button" className="header-profile-popover-item header-account-switch" onClick={() => { close(); switchAccount(a.id); }}
                        title={`Switch to @${a.username}`}>
                        <span className="header-account-avatar"><Avatar userId={a.id} url={a.avatar} name={a.name} className="header-avatar-img" /></span>
                        <span className="header-profile-popover-copy"><strong>{a.name}</strong><small>@{a.username} · Switch</small></span>
                    </button>
                    <button type="button" className="header-account-forget" onClick={() => forgetAccount(a.id)} aria-label={`Forget @${a.username} on this device`} title="Forget on this device">
                        <Icon name="x" size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}

/** The top of the account menu: who you are, or a Sign In button. */
export function AccountMenuTop({ close }: { close: () => void }) {
    const user = state.user;
    const then = (fn: () => void) => () => { close(); fn(); };
    if (!user) {
        return (
            <>
                <SavedAccountRows close={close} />
                <div className="header-profile-popover-mobile-signin">
                    <button type="button" className="btn btn-primary header-profile-popover-signin" onClick={then(() => api.openAuthModal('signin'))}>Sign In</button>
                    <div className="header-profile-popover-divider" />
                </div>
            </>
        );
    }
    const name = displayName();
    return (
        <>
            <Link to={ownProfilePath(user)} className="header-profile-popover-identity" onClick={close}>
                <span className="header-profile-popover-avatar"><Avatar userId={user.id} url={user.avatarUrl} name={name} className="header-avatar-img" /></span>
                <span className="header-profile-popover-copy">
                    <strong>{name}<BadgeRow badgeKeys={user.displayBadges || []} size={12} /></strong>
                    <small>{user.username ? '@' + user.username : 'Edit profile'}</small>
                </span>
            </Link>
            <SavedAccountRows close={close} />
            <button type="button" className="header-profile-popover-item" onClick={then(() => addAccount())}><Icon name="user-plus" /><span>Add another account</span></button>
            <div className="header-profile-popover-divider" />
            <Link to={ownProfilePath(user)} className="header-profile-popover-item" onClick={close}><Icon name="user" /><span>View Profile</span></Link>
        </>
    );
}

/** After Settings: feedback and bug reports. */
export function FeedbackMenuItem({ close }: { close: () => void }) {
    return <button type="button" className="header-profile-popover-item" onClick={() => { close(); api.openFeedbackModal(); }}><Icon name="message-circle-warning" /><span>Feedback &amp; bug reports</span></button>;
}

/** After Feedback: every update, with a dot while the newest is unread. */
export function UpdatesMenuItem({ close }: { close: () => void }) {
    const unseen = !!whatsNewView()?.unseen;
    return (
        <button type="button" className="header-profile-popover-item" onClick={() => { close(); openUpdates(); }}>
            <Icon name="newspaper" /><span>Updates</span>{unseen && <span className="header-menu-dot" aria-label="New" />}
        </button>
    );
}

/** The bottom of the account menu: sign out, and the policy links. */
export function AccountMenuBottom({ close }: { close: () => void }) {
    const then = (fn: () => void) => () => { close(); fn(); };
    return (
        <>
            {state.user && (
                <>
                    <div className="header-profile-popover-divider" />
                    {/* with other accounts saved here, signing out moves on to the next one */}
                    {savedAccounts().length
                        ? <button type="button" className="header-profile-popover-item header-profile-popover-danger" onClick={then(() => logOutOfThisAccount())}><Icon name="log-out" /><span>Log out of @{state.user.username || 'this account'}</span></button>
                        : <button type="button" className="header-profile-popover-item header-profile-popover-danger" onClick={then(() => api.handleSignOutClick())}><Icon name="log-out" /><span>Sign Out</span></button>}
                </>
            )}
            <div className="header-profile-popover-legal">
                <Link to="terms" onClick={close}>Terms</Link>
                <span aria-hidden="true">&middot;</span>
                <Link to="privacy" onClick={close}>Privacy</Link>
                <span aria-hidden="true">&middot;</span>
                <button type="button" onClick={then(() => api.openCommunityRulesModal())}>Community Rules</button>
            </div>
        </>
    );
}
