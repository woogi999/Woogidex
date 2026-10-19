// What the site adds to Core's header (js/app/shell/Header.tsx): the
// Community and Updates tabs, search, messages, notifications, and the
// account parts of the account menu. Registered in js/host.ts.

import { api, state } from '../../core/app.ts';
import { notificationsView } from '../../core/notifications.ts';
import { Avatar } from '../components/Avatar.tsx';
import { BadgeRow } from '../components/Badge.tsx';
import { Icon } from '../components/Icon.tsx';
import { useClickAway } from '../components/editor/fields.tsx';
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
        <button className={`notifications-bell-btn header-messages-btn${active ? ' active' : ''}`} type="button" onClick={() => api.openMessages()}
            aria-label={unread ? `Messages, ${unread} unread` : 'Messages'} title="Messages">
            <Icon name="chat-bubble-oval-left-ellipsis" size={20} />
            {unread > 0 && <span className="notifications-badge">{countLabel(unread)}</span>}
        </button>
    );
}

export function Notifications() {
    const v = notificationsView();
    const ref = useClickAway(v.open, () => api.closeNotificationsPanel());
    if (!v.signedIn) return null;
    return (
        <div className="notifications-wrap" ref={ref}>
            <button className="notifications-bell-btn" type="button" onClick={() => api.toggleNotificationsPanel()} aria-label="Notifications" title="Notifications" aria-expanded={v.open}>
                <Icon name="bell" size={20} />
                {v.unread > 0 && <span className="notifications-badge">{countLabel(v.unread)}</span>}
            </button>
            {v.open && (
                <div className="notifications-panel">
                    <div className="notifications-panel-header">
                        <span>Notifications</span>
                        <button className="notifications-mark-all-btn" type="button" onClick={() => api.markAllNotificationsRead()}>Mark all read</button>
                    </div>
                    <div className="notifications-list">
                        {v.loading
                            // mirrors .notification-item so real rows replace it without a jump
                            ? Array.from({ length: 4 }, (_, i) => (
                                <div className="notification-item skel-card" key={i}>
                                    <span className="notification-avatar skel skel-circle" />
                                    <span className="notification-body"><span className="notification-text skel skel-text" /><span className="notification-time skel skel-text" /></span>
                                </div>
                            ))
                            : !v.items.length
                                ? <div className="notifications-empty">You're all caught up - no notifications yet.</div>
                                : v.items.map(n => (
                                    <button key={n.id} className={`notification-item${n.read ? '' : ' unread'}`} type="button" onClick={() => api.openNotification(n.id)}>
                                        <Avatar userId={n.actorId} url={n.actorAvatar} name={n.actorName} className="notification-avatar" />
                                        <span className="notification-body">
                                            <span className="notification-text"><strong>{n.actorName}</strong> {n.text}</span>
                                            {n.preview && <span className="notification-preview">“{n.preview}”</span>}
                                            <span className="notification-time">{n.time}</span>
                                        </span>
                                        {!n.read && <span className="notification-dot" aria-hidden="true" />}
                                    </button>
                                ))}
                    </div>
                </div>
            )}
        </div>
    );
}

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

/** The top of the account menu: who you are, or a Sign In button. */
export function AccountMenuTop({ close }: { close: () => void }) {
    const user = state.user;
    const then = (fn: () => void) => () => { close(); fn(); };
    if (!user) {
        return (
            <div className="header-profile-popover-mobile-signin">
                <button type="button" className="btn btn-primary header-profile-popover-signin" onClick={then(() => api.openAuthModal('signin'))}>Sign In</button>
                <div className="header-profile-popover-divider" />
            </div>
        );
    }
    const name = displayName();
    return (
        <>
            <button type="button" className="header-profile-popover-identity" onClick={then(() => api.showProfileView())}>
                <span className="header-profile-popover-avatar"><Avatar userId={user.id} url={user.avatarUrl} name={name} className="header-avatar-img" /></span>
                <span className="header-profile-popover-copy">
                    <strong>{name}<BadgeRow badgeKeys={user.displayBadges || []} size={12} /></strong>
                    <small>{user.username ? '@' + user.username : 'Edit profile'}</small>
                </span>
            </button>
            <div className="header-profile-popover-divider" />
            <button type="button" className="header-profile-popover-item" onClick={then(() => api.showProfileView())}><Icon name="user" /><span>View Profile</span></button>
        </>
    );
}

/** After Settings: feedback and bug reports. */
export function FeedbackMenuItem({ close }: { close: () => void }) {
    return <button type="button" className="header-profile-popover-item" onClick={() => { close(); api.openFeedbackModal(); }}><Icon name="message-circle-warning" /><span>Feedback &amp; bug reports</span></button>;
}

/** The bottom of the account menu: sign out, and the policy links. */
export function AccountMenuBottom({ close }: { close: () => void }) {
    const then = (fn: () => void) => () => { close(); fn(); };
    return (
        <>
            {state.user && (
                <>
                    <div className="header-profile-popover-divider" />
                    <button type="button" className="header-profile-popover-item header-profile-popover-danger" onClick={then(() => api.handleSignOutClick())}><Icon name="log-out" /><span>Sign Out</span></button>
                </>
            )}
            <div className="header-profile-popover-legal">
                <button type="button" onClick={then(() => api.openTermsPage())}>Terms</button>
                <span aria-hidden="true">&middot;</span>
                <button type="button" onClick={then(() => api.openPrivacyPage())}>Privacy</button>
                <span aria-hidden="true">&middot;</span>
                <button type="button" onClick={then(() => api.openCommunityRulesModal())}>Community Rules</button>
            </div>
        </>
    );
}
