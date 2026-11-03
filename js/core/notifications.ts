import { log } from './log.ts';
import { dbCall } from './net.ts';
import { state, api } from './app.ts';
import { notify } from '../app/store.ts';

// bell icon + unread-count badge; notifies on comments to a user's published
// Fakemon or profile. Requires a `notifications` table (see schema/migrations).

const POLL_INTERVAL_MS = 30000;

function ensureNotificationState() {
    if (!state.notifications) {
        state.notifications = { items: [] as any[], unreadCount: 0, loading: false, open: false, pollTimer: null as any };
    }
    return state.notifications;
}

// no-ops silently if the notifications table isn't set up, so it never blocks a comment
async function createNotification({ userId, type, actorId, actorName, actorAvatarUrl, targetId, targetName, preview }: { userId?: any; type?: any; actorId?: any; actorName?: any; actorAvatarUrl?: any; targetId?: any; targetName?: any; preview?: any }) {
    if (!userId || !actorId || userId === actorId) return; // never notify yourself
    try {
        const client = await api.getClient();
        const { error } = await client.from('notifications').insert({
            user_id: userId,
            actor_id: actorId,
            actor_name: actorName || 'Someone',
            actor_avatar_url: actorAvatarUrl || null,
            type,
            target_id: targetId != null ? String(targetId) : null,
            target_name: targetName || null,
            preview: (preview || '').slice(0, 140)
        });
        if (error) log.error('NOTIFICATIONS', 'Failed to create notification', error);
    } catch (e: any) {
        log.error('NOTIFICATIONS', 'Failed to create notification', e);
    }
}

// named columns instead of select('*') since this runs every 30s per signed-in tab
const NOTIFICATION_COLUMNS =
    'id, type, actor_name, actor_avatar_url, actor_id, target_id, target_name, preview, read, created_at';

/**
 * @param {{countOnly?: boolean}} [options] countOnly fetches just the unread
 *        number (a few bytes vs ~10 kB for 50 full rows) since that's all the
 *        closed bell needs.
 */
async function fetchNotifications(options: Record<string, any> = {}) {
    const ns = ensureNotificationState();
    if (!state.user) { ns.items = []; ns.unreadCount = 0; return; }
    // skip the request while offline rather than spend it on a guaranteed error
    if (navigator.onLine === false) return;
    ns.loading = true;
    try {
        const client = await api.getClient();
        if (options.countOnly) {
            const { count, error } = await client
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', state.user.id)
                .eq('read', false);
            if (error) throw error;
            ns.unreadCount = count || 0;
            ns.fetchFailed = false;
            // ns.items left alone; opening the panel refreshes it
            return;
        }
        // one new try at most: the poll asks again soon anyway (js/core/net.ts)
        const userId = state.user.id;
        const data: any[] | null = await dbCall(signal => client
            .from('notifications')
            .select(NOTIFICATION_COLUMNS)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50)
            .abortSignal(signal), { retries: 1 });
        ns.items = data || [];
        ns.unreadCount = ns.items.filter(n => !n.read).length;
        ns.fetchFailed = false;
    } catch (e: any) {
        // fail quietly rather than toast-spam every poll; logged once per
        // outage (re-armed on next success) rather than once per 30s
        if (!ns.fetchFailed) {
            ns.fetchFailed = true;
            log.error('NOTIFICATIONS', 'Failed to load notifications; will keep retrying quietly', e);
        }
    } finally {
        ns.loading = false;
    }
}

// The bell and its panel are drawn by js/app/shell/Notifications.tsx.
function renderNotificationBadge() { notify(); }
function renderNotificationsPanel() { notify(); }

function timeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

/** What happened, after the actor's name: "commented on Emberpup". Plain text. */
function notificationText(n) {
    if (n.type === 'mod_warning') return `issued you a warning${n.target_name ? ` for ${n.target_name}` : ''}`;
    if (n.type === 'mod_muted') return 'muted your account';
    // from the site itself (actor_name is "Woogidex"): admin_set_user_badges
    if (n.type === 'badge_granted') return `gave you the ${n.target_name || 'new'} badge`;
    if (n.type === 'role_granted') return `made you ${/^[aeiou]/i.test(n.target_name || '') ? 'an' : 'a'} ${n.target_name || 'staff member'}`;
    if (n.type === 'mod_banned') return 'suspended your account';
    // from the site itself: admin_decide_case, admin_decide_appeal (Settings > Safety shows the details)
    if (n.type === 'mod_content_removed') return `removed your ${n.target_name === 'comment' ? 'comment' : 'post'} after a review. Reason:`;
    if (n.type === 'report_reviewed') return 'reviewed your report:';
    if (n.type === 'appeal_decided') return `${n.target_name === 'reversed' ? 'accepted' : 'turned down'} your appeal:`;
    // from the site itself (run_event_scheduled_announcements), when an event's results show
    if (n.type === 'event_results') return `has the results of ${n.target_name || 'an event'}. Take a look!`;
    if (n.type === 'mod_comment_deleted') return 'removed one of your comments';
    if (n.type === 'profile_comment') return 'commented on your profile';
    if (n.type === 'follow') return 'started following you';
    if (n.type === 'post_comment') return 'commented on your post';
    if (n.type === 'repost') return `${n.preview ? 'shared' : 'reposted'} ${n.target_name || 'your post'}`;
    if (n.type === 'mon_deleted') return `removed your Fakemon "${n.target_name || 'submission'}" from the Community Hub`;
    if (n.type === 'contest_submission_deleted') return `removed your contest entry "${n.target_name || 'submission'}"`;
    if (n.type === 'event_entry_removed') return `removed your entry from ${n.target_name || 'an event'}${n.preview ? '. Reason:' : ''}`;
    if (n.type === 'event_edit_request') return `asked you to edit your entry in ${n.target_name || 'an event'}. Reason:`;
    if (n.type === 'event_feedback') return `sent you feedback on your entry in ${n.target_name || 'an event'}:`;
    if (n.type === 'event_announcement') return `posted an announcement in ${n.target_name || 'an event'}:`;
    // from the site itself: run_event_scheduled_announcements, when a private contest ends
    if (n.type === 'event_results_private') return `reminds you that ${n.target_name || 'your contest'} has ended. Its entries are private, so post an announcement with the winners:`;
    if (n.type === 'mention') return `mentioned you in ${n.target_name || 'a post'}`;
    // from the triggers on reactions (the preview is the reaction's name)
    if (n.type === 'mon_reaction') return `reacted to ${n.target_name || 'your Fakémon'}`;
    if (n.type === 'post_reaction') return 'reacted to your post';
    if (n.type === 'comment_reaction') return 'reacted to your comment';
    if (n.type === 'comment_reply') return 'replied to your comment';
    if (n.type === 'mod_post_deleted') return 'removed one of your posts';
    if (n.type === 'mod_profile_edited') return `${n.target_name === 'bio' ? 'cleared your profile bio' : 'reset your display name'}${n.preview ? '. Reason:' : ''}`;
    if (n.type === 'mod_event_deleted') return `deleted your event${n.target_name ? ` "${n.target_name}"` : ''}`;
    if (n.type === 'mod_event_unpublished') return `took your event${n.target_name ? ` "${n.target_name}"` : ''} off the site; it's a draft again`;
    return `commented on ${n.target_name || 'your Fakemon'}`;
}

/** The tabs of the notifications page: what each kind counts as. */
export type NotificationTab = 'all' | 'mentions' | 'likes' | 'follows' | 'updates';
const REACTION_TYPES = new Set(['mon_reaction', 'post_reaction', 'comment_reaction']);
function tabOf(type: string): NotificationTab | null {
    if (type === 'mention' || type === 'comment_reply') return 'mentions';
    if (REACTION_TYPES.has(type)) return 'likes';
    if (type === 'follow') return 'follows';
    // what the site itself tells you: badges, roles, reviews, events
    if (/^(mod_|event_|badge_|role_|report_|appeal_)/.test(type) || type === 'mon_deleted' || type === 'contest_submission_deleted') return 'updates';
    return null;
}

// these come in bunches: "Ana and 4 others reacted to Emberpup"
const GROUPED = new Set([...REACTION_TYPES, 'follow']);
const GROUP_WINDOW_MS = 7 * 24 * 3600 * 1000;

export interface NotificationRow {
    id: string; ids: string[]; read: boolean; type: string; tab: NotificationTab | null;
    actorName: string; actorId: string; actorAvatar: string; others: number;
    text: string; preview: string; reaction: string; time: string; path: string;
}

/** The rows, newest first: reactions and follows on the same thing within a week share one row. */
function notificationRows(items: any[]): NotificationRow[] {
    const rows: NotificationRow[] = [];
    const byKey = new Map<string, { row: NotificationRow; actors: Set<string>; at: number }>();
    for (const n of items) {
        const at = new Date(n.created_at).getTime();
        const key = GROUPED.has(n.type) ? `${n.type}|${n.target_id || ''}` : '';
        const group = key ? byKey.get(key) : undefined;
        if (group && group.at - at < GROUP_WINDOW_MS) {
            group.row.ids.push(String(n.id));
            if (!n.read) group.row.read = false;
            if (!group.actors.has(n.actor_id)) { group.actors.add(n.actor_id); group.row.others++; }
            continue;
        }
        const reaction = REACTION_TYPES.has(n.type) ? String(n.preview || '') : '';
        const row: NotificationRow = {
            id: String(n.id), ids: [String(n.id)], read: !!n.read, type: n.type, tab: tabOf(n.type),
            actorName: n.actor_name || 'Someone', actorId: n.actor_id || '', actorAvatar: n.actor_avatar_url || '', others: 0,
            text: notificationText(n), preview: reaction ? '' : (n.preview || ''), reaction, time: timeAgo(n.created_at), path: notificationPath(n)
        };
        rows.push(row);
        if (key) byKey.set(key, { row, actors: new Set([n.actor_id]), at });
    }
    return rows;
}

/**
 * Everything the header's bell and the notifications page show. signedIn
 * false hides it; loading with no rows yet shows skeletons.
 */
function notificationsView(): { signedIn: boolean; open: boolean; unread: number; loading: boolean; items: NotificationRow[] } {
    const ns = ensureNotificationState();
    return {
        signedIn: !!state.user, open: !!ns.open, unread: ns.unreadCount || 0,
        loading: !!ns.loading && !ns.items.length,
        items: notificationRows(ns.items)
    };
}

function startNotificationPolling() {
    const ns = ensureNotificationState();
    if (ns.pollTimer) return;
    ns.pollTimer = setInterval(() => {
        // skip polling a hidden tab; browsers don't throttle timers to zero reliably
        if (document.visibilityState === 'hidden') return;
        fetchNotifications({ countOnly: !ns.open }).then(() => {
            renderNotificationBadge();
            if (ns.open) renderNotificationsPanel();
        });
    }, POLL_INTERVAL_MS);

    // catch up immediately on return instead of waiting for the skipped interval
    if (!ns.visibilityHandler) {
        ns.visibilityHandler = () => {
            if (document.visibilityState !== 'visible' || !state.user) return;
            fetchNotifications({ countOnly: !ns.open }).then(() => {
                renderNotificationBadge();
                if (ns.open) renderNotificationsPanel();
            });
        };
        document.addEventListener('visibilitychange', ns.visibilityHandler);
    }
}

function stopNotificationPolling() {
    const ns = ensureNotificationState();
    if (ns.pollTimer) { clearInterval(ns.pollTimer); ns.pollTimer = null; }
    if (ns.visibilityHandler) {
        document.removeEventListener('visibilitychange', ns.visibilityHandler);
        ns.visibilityHandler = null;
    }
}

async function refreshNotifications() {
    const ns = ensureNotificationState();
    if (!state.user) {
        ns.items = [];
        ns.unreadCount = 0;
        ns.open = false;
        stopNotificationPolling();
        renderNotificationBadge();
        return;
    }
    notify();
    await fetchNotifications();
    renderNotificationBadge();
    if (ns.open) renderNotificationsPanel();
    startNotificationPolling();
}

function toggleNotificationsPanel(event) {
    event?.stopPropagation();
    const ns = ensureNotificationState();
    ns.open = !ns.open;
    notify();
    // shows the stale rows at once, then refreshes (only the count was polled while closed)
    if (ns.open) fetchNotifications().then(notify);
}

function closeNotificationsPanel() {
    const ns = ensureNotificationState();
    if (!ns.open) return;
    ns.open = false;
    notify();
}

async function markAllNotificationsRead(event) {
    event?.stopPropagation();
    const ns = ensureNotificationState();
    if (!state.user || !ns.unreadCount) return;
    ns.items.forEach(n => { n.read = true; });
    ns.unreadCount = 0;
    renderNotificationBadge();
    renderNotificationsPanel();
    try {
        const client = await api.getClient();
        await client.from('notifications').update({ read: true }).eq('user_id', state.user.id).eq('read', false);
    } catch (e: any) {
        log.error('NOTIFICATIONS', 'Failed to mark all read', e);
    }
}

async function markNotificationRead(id) {
    const ns = ensureNotificationState();
    const n = ns.items.find(x => String(x.id) === String(id));
    if (!n || n.read) return;
    n.read = true;
    ns.unreadCount = Math.max(0, ns.unreadCount - 1);
    renderNotificationBadge();
    try {
        const client = await api.getClient();
        await client.from('notifications').update({ read: true }).eq('id', id);
    } catch (e: any) {
        log.error('NOTIFICATIONS', 'Failed to mark notification read', e);
    }
}

/**
 * Where a notification leads, as a route path ('post/12'), or '' when it
 * leads nowhere. Profiles open by user id: the page swaps in the username.
 */
function notificationPath(n): string {
    const target = String(n.target_id || '');
    const event = (sub = '') => `events/${encodeURIComponent(target.replace(/^event:/, ''))}${sub}`;
    // "post:<id>", "mon:<id>", "profile:<id>" or "event:<id>"
    const tagged = () => {
        const [kind, id] = target.split(':');
        const key = encodeURIComponent(id || '');
        if (kind === 'mon') return `community/${key}`;
        if (kind === 'profile') return `profile/${key}`;
        if (kind === 'event') return `events/${key}`;
        return `post/${key}`;
    };
    switch (n.type) {
        case 'mod_content_removed': case 'report_reviewed': case 'appeal_decided': return 'settings/safety';
        // your own profile, where the badge now shows
        case 'badge_granted': case 'role_granted': return state.user?.id ? `profile/${state.user.id}` : '';
        case 'follow': return n.actor_id ? `profile/${encodeURIComponent(n.actor_id)}` : '';
    }
    if (!target) return '';
    switch (n.type) {
        case 'mon_comment': return `community/${encodeURIComponent(target)}`;
        case 'profile_comment': return `profile/${encodeURIComponent(target)}`;
        case 'post_comment': return `post/${encodeURIComponent(target)}`;
        case 'event_entry_removed': case 'event_announcement': case 'event_results': return event();
        case 'event_edit_request': case 'event_feedback': return event('/enter');
        // straight to where the announcement gets written
        case 'event_results_private': case 'mod_event_unpublished': return event('/dashboard');
        // where it was, or what was reposted
        case 'mention': case 'comment_reply': case 'repost':
        case 'mon_reaction': case 'post_reaction': case 'comment_reaction': return tagged();
    }
    return '';
}

/** A notification was clicked: it is read (a grouped row: all of it), and the panel closes. Its link does the rest. */
function onNotificationClick(ids: string | string[]) {
    for (const id of Array.isArray(ids) ? ids : [ids]) markNotificationRead(id);
    closeNotificationsPanel();
}

// ==================== which kinds you get ====================
// Saved in a private row (notification_prefs); the server drops a kind you've
// turned off before it's ever stored, so it can't show up or count as unread.
// Moderation notices always get through.

/** The kinds you can switch off: [type, label, what it is]. */
export const NOTIFICATION_KINDS: Array<[string, string, string]> = [
    ['follow', 'New followers', 'When someone starts following you.'],
    ['mon_comment', 'Comments on your Fakémon', 'When someone comments on a Fakémon you published.'],
    ['post_comment', 'Comments on your posts', 'When someone comments on something you posted.'],
    ['profile_comment', 'Posts on your wall', 'When someone writes on your profile.'],
    ['mon_reaction', 'Reactions to your Fakémon', 'When someone reacts to a Fakémon you published. One a person a day.'],
    ['post_reaction', 'Reactions to your posts', 'When someone reacts to something you posted. One a person a day.'],
    ['comment_reaction', 'Reactions to your comments', 'When someone reacts to one of your comments. One a person a day.'],
    ['repost', 'Reposts and shares', 'When someone reposts or shares your Fakémon or posts.'],
    ['mention', 'Mentions', 'When someone @mentions you in a post, a comment, their bio or the art credits of a Fakémon they publish.'],
    ['comment_reply', 'Replies', 'When someone replies to one of your comments.'],
    ['event_results', 'Event results', 'When an event you entered or follow shows its results.'],
    ['event_announcement', 'Event announcements', 'When an event you follow posts an announcement. Entering an event follows it.'],
    ['badge_granted', 'New badges', 'When you are given a badge. A new role always tells you.']
];

const prefState: { userId: string | null; prefs: Record<string, boolean> | null; loading: boolean } = { userId: null, prefs: null, loading: false };

async function loadNotificationPrefs() {
    const me = state.user?.id;
    if (!me || prefState.loading) return;
    prefState.loading = true;
    try {
        const client = await api.getClient();
        const { data, error } = await client.from('notification_prefs').select('prefs').eq('user_id', me).maybeSingle();
        if (error) throw error;
        prefState.userId = me;
        prefState.prefs = data?.prefs || {};
    } catch (e: any) {
        log.warn('NOTIFICATIONS', 'Could not load notification settings', e);
        prefState.prefs = prefState.prefs || {};
    } finally {
        prefState.loading = false;
        notify();
    }
}

/** Your settings, or null while they load (asking starts the load). Missing keys mean on. */
export function notificationPrefs(): Record<string, boolean> | null {
    if (!state.user) return null;
    if (prefState.userId !== state.user.id) {
        prefState.prefs = null;
        prefState.userId = state.user.id;
        loadNotificationPrefs();
    }
    return prefState.prefs;
}

/** Turns one kind (or "all") on or off. */
export async function setNotificationPref(key: string, on: boolean) {
    const me = state.user?.id;
    if (!me) return;
    const before = { ...(prefState.prefs || {}) };
    const next = { ...before, [key]: on };
    prefState.prefs = next;
    notify();
    try {
        const client = await api.getClient();
        const { error } = await client.from('notification_prefs').upsert({ user_id: me, prefs: next, updated_at: new Date().toISOString() });
        if (error) throw error;
    } catch (e: any) {
        prefState.prefs = before;
        notify();
        api.showToast?.('Could not save that setting. Please try again.', 'error');
        log.warn('NOTIFICATIONS', 'Could not save notification settings', e);
    }
}

export {
    notificationsView,
    createNotification, fetchNotifications, refreshNotifications, renderNotificationBadge, renderNotificationsPanel,
    toggleNotificationsPanel, closeNotificationsPanel, markAllNotificationsRead, markNotificationRead, onNotificationClick
};
