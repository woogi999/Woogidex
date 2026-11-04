// The notifications page (/notifications): every notification, with tabs
// like the Messages page has. The header's bell shows the same rows in a
// panel on wide screens; on a phone the bell opens this page.

import { useEffect, useState } from 'react';
import { api } from '../../core/app.ts';
import { notificationsView, type NotificationTab } from '../../core/notifications.ts';
import { NotificationItem, NotificationSkeleton, WhatsNewRow } from '../components/NotificationList.tsx';
import { useSlide, useSwipeTabs } from '../hooks.ts';
import { useStore } from '../store.ts';

const TABS: Array<[NotificationTab, string]> = [['all', 'All'], ['mentions', 'Mentions'], ['likes', 'Likes'], ['follows', 'Follows'], ['updates', 'Updates']];
const ORDER = TABS.map(([k]) => k);
const EMPTY: Record<NotificationTab, string> = {
    all: 'You are all caught up. Nothing new yet.',
    mentions: 'No mentions or replies yet.',
    likes: 'No reactions yet. Publish a Fakémon or write a post!',
    follows: 'No new followers yet.',
    updates: 'No news about your account.'
};

export function NotificationsPage() {
    useStore();
    const v = notificationsView();
    const [tab, setTab] = useState<NotificationTab>('all');
    const pane = useSlide(tab, ORDER);
    const swipe = useSwipeTabs(ORDER, tab, setTab);
    // the page shows the full rows (the bell polls only the count)
    useEffect(() => { api.fetchNotifications?.().then(() => api.renderNotificationsPanel?.()); }, []);
    const rows = tab === 'all' ? v.items : v.items.filter(n => n.tab === tab);
    if (!v.signedIn) {
        return (
            <div className="notif-page">
                <h1 className="page-title">Notifications</h1>
                <div className="notif-signin">
                    <p>Sign in to see who reacted, replied, followed or mentioned you.</p>
                    <button type="button" className="btn btn-primary" onClick={() => api.openAuthModal?.('signin')}>Sign In</button>
                </div>
            </div>
        );
    }
    const unreadIn = (t: NotificationTab) => v.items.filter(n => !n.read && (t === 'all' || n.tab === t)).length;
    return (
        <div ref={swipe} className="notif-page">
            <div className="notif-page-head">
                <h1 className="page-title">Notifications</h1>
                {v.unread > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.markAllNotificationsRead()}>Mark all read</button>}
            </div>
            <div className="tabs notif-tabs" role="tablist" aria-label="Kinds of notifications">
                {TABS.map(([key, label]) => {
                    const n = unreadIn(key);
                    return (
                        <button key={key} type="button" role="tab" aria-selected={tab === key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
                            {label}{n > 0 && <span className="notif-tab-count">{n > 9 ? '9+' : n}</span>}
                        </button>
                    );
                })}
            </div>
            <div ref={pane} className="notif-page-list" role="tabpanel">
                {(tab === 'all' || tab === 'updates') && <WhatsNewRow />}
                {v.loading
                    ? <NotificationSkeleton count={6} />
                    : rows.length
                        ? rows.map(n => <NotificationItem key={n.id} n={n} />)
                        : <p className="notifications-empty">{EMPTY[tab]}</p>}
            </div>
        </div>
    );
}
