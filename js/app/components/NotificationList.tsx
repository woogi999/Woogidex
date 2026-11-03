// The notification rows: in the header's panel and on the notifications
// page (js/app/pages/NotificationsPage.tsx). A pinned "What's New" row sits on
// top (js/features/whats-new.ts). Reactions and follows on the same thing are
// one row: "Ana and 4 others reacted to Emberpup".

import { api } from '../../core/app.ts';
import type { NotificationRow } from '../../core/notifications.ts';
import { whatsNewView, openWhatsNew } from '../../features/whats-new.ts';
import { Avatar } from './Avatar.tsx';
import { EmojiGlyph } from './EmojiInput.tsx';
import { Icon } from './Icon.tsx';
import { Link } from './Link.tsx';

/** The pinned row that opens the "What's New" pop-up. */
export function WhatsNewRow({ onOpen }: { onOpen?: () => void }) {
    const v = whatsNewView();
    if (!v) return null;
    const title = (v.item.body || '').split('\n').map(l => l.replace(/[*_#>`]/g, '').trim()).find(Boolean) || 'The latest update';
    return (
        <button type="button" className={`notification-item notification-whats-new${v.unseen ? ' unread' : ''}`} onClick={() => { onOpen?.(); openWhatsNew(); }}>
            <span className="notification-avatar notification-whats-new-icon" aria-hidden="true"><Icon name="sparkles" size={18} /></span>
            <span className="notification-body">
                <span className="notification-text"><strong>What's New</strong> {title}</span>
                <span className="notification-time">Pinned · from Woogidex</span>
            </span>
            {v.unseen && <span className="notification-dot" aria-hidden="true" />}
        </button>
    );
}

export function NotificationItem({ n }: { n: NotificationRow }) {
    // a link when it leads somewhere, else a button that only marks it read
    const Row: any = n.path ? Link : 'button';
    const target = n.path ? { to: n.path } : { type: 'button' };
    const others = n.others > 0 ? ` and ${n.others} other${n.others === 1 ? '' : 's'}` : '';
    return (
        <Row className={`notification-item${n.read ? '' : ' unread'}`} {...target} onClick={() => api.onNotificationClick(n.ids)}>
            <span className="notification-avatar-wrap">
                <Avatar userId={n.actorId} url={n.actorAvatar} name={n.actorName} className="notification-avatar" />
                {n.reaction && <span className="notification-reaction" aria-hidden="true"><EmojiGlyph code={n.reaction} size={14} /></span>}
            </span>
            <span className="notification-body">
                <span className="notification-text"><strong>{n.actorName}</strong>{others} {n.text}</span>
                {n.preview && <span className="notification-preview">“{n.preview}”</span>}
                <span className="notification-time">{n.time}</span>
            </span>
            {!n.read && <span className="notification-dot" aria-hidden="true" />}
        </Row>
    );
}

/** Rows that look like the real ones while they load, so nothing jumps. */
export function NotificationSkeleton({ count = 4 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }, (_, i) => (
                <div className="notification-item skel-card" key={i}>
                    <span className="notification-avatar skel skel-circle" />
                    <span className="notification-body"><span className="notification-text skel skel-text" /><span className="notification-time skel skel-text" /></span>
                </div>
            ))}
        </>
    );
}
