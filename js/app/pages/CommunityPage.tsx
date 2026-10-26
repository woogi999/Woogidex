// The Community Hub (/community): the feed (Fakemon and posts from everyone
// and from your groups, ranked "For you"), the browsable grid, groups
// (/groups), and events and contests. Your own uploads are on your profile. Data and actions
// stay in js/features/community.ts and js/features/social.ts.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, state } from '../../core/app.ts';
import { CommunityFeed } from '../components/community.tsx';
import { EventsPanel } from '../components/EventsPanel.tsx';
import { Icon } from '../components/Icon.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { FeedCard, FeedSkeleton, PostComposer } from '../components/feed.tsx';
import { events, getLiveEvents, showEventView } from '../../features/events.ts';
import { useStore } from '../store.ts';
import { useSlide } from '../hooks.ts';
import { fadeSwap, staggerIn } from '../../core/motion.ts';
import { NetworkNotice } from '../components/NetworkNotice.tsx';
import { GroupsPanel, YourGroupsRail } from '../components/groups.tsx';
import type { FeedItem } from '../../features/feed-algorithm.ts';

type Panel = 'feed' | 'browse' | 'events' | 'groups';

const TABS: Array<[Panel, string]> = [['feed', 'Feed'], ['browse', 'Browse Fakémon'], ['groups', 'Groups'], ['events', 'Events']];
const PANELS = TABS.map(([k]) => k);

// One column: the rail's sections become cards inside the feed. Keep in step
// with the one-column rule for .feed-layout in css/feed.css.
const ONE_COLUMN = '(max-width: 1000px), (max-aspect-ratio: 4/5)';

/** Whether a media query matches, kept current. */
function useMedia(query: string): boolean {
    const [on, setOn] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const mq = window.matchMedia(query);
        const set = () => setOn(mq.matches);
        set();
        mq.addEventListener('change', set);
        return () => mq.removeEventListener('change', set);
    }, [query]);
    return on;
}

export function CommunityPage() {
    useStore();
    const cs = api.communityState();
    const panel: Panel = (PANELS.includes(cs.panel) ? cs.panel : 'feed') as Panel;
    // the sections list is a sidebar (sections go up and down) or, on a
    // phone, a row of chips (sections go left and right)
    const main = useSlide(panel, PANELS, useMedia('(max-width: 760px)') ? 'x' : 'y');
    return (
        <div className="hub">
            {/* the hub's sections, as a sidebar (a scrolling row of chips on a phone) */}
            <aside className="hub-nav" aria-label="Community Hub">
                <button className="btn btn-primary hub-publish" type="button" onClick={() => api.openCommunityPublishModal()}><Icon name="upload" /><span>Publish a Fakémon</span></button>
                <nav className="hub-nav-list" id="community-tabs" role="tablist" aria-orientation="vertical">
                    {TABS.map(([key, label]) => (
                        <button key={key} className={`hub-nav-item${panel === key ? ' active' : ''}`} type="button" role="tab" aria-selected={panel === key}
                            onClick={() => {
                                if (key === 'events') events.view = { kind: 'list' };
                                if (key === 'groups') api.groupsState().view = { kind: 'list' };
                                api.showCommunityPanel(key);
                            }}>{label}</button>
                    ))}
                </nav>
            </aside>
            <div className="hub-main" ref={main}>
                <NetworkNotice />
                {panel === 'feed' && <Feed />}
                {panel === 'browse' && <Browse />}
                {panel === 'events' && <div className="community-panel"><EventsPanel /></div>}
                {panel === 'groups' && <div className="community-panel"><GroupsPanel /></div>}
            </div>
        </div>
    );
}

// ==================== the feed ====================

const CHUNK = 12;

// one feed, ranked "For you" (js/features/feed-algorithm.ts)
const FEED = 'foryou';

function Feed() {
    const tab = FEED;
    const social = api.socialState();
    const t = social.feed[tab];
    const items: FeedItem[] = api.feedItems(tab);
    const [shown, setShown] = useState(CHUNK);
    const sentinel = useRef<HTMLDivElement>(null);
    const oneColumn = useMedia(ONE_COLUMN);
    const creatorPool = items;

    const list = useRef<HTMLDivElement>(null);
    useEffect(() => { setShown(CHUNK); }, [tab, t.fetchedAt]);
    // a fresh load: the cards arrive one after another
    useEffect(() => { if (t.fetchedAt && list.current) staggerIn(Array.from(list.current.children)); }, [t.fetchedAt]);
    useEffect(() => { api.fetchFeed(tab); }, [tab]);

    // more cards as you near the bottom; at the very end, older items
    useEffect(() => {
        const el = sentinel.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const io = new IntersectionObserver(entries => {
            if (!entries.some(e => e.isIntersecting)) return;
            if (shown < items.length) setShown(n => n + CHUNK);
        }, { rootMargin: '600px' });
        io.observe(el);
        return () => io.disconnect();
    }, [shown, items.length, tab, t.hasMore, t.loading]);

    return (
        <div className="feed-layout">
            <div className="feed-main">
                <PostComposer />
                <div className="feed-list" ref={list}>
                    {t.error && <div className="feed-empty"><Icon name="exclamation-triangle" size={20} /><p>{t.error}</p></div>}
                    {!items.length && t.loading && <FeedSkeleton />}
                    {!items.length && !t.loading && !t.error && <EmptyFeed />}
                    {oneColumn
                        ? <WithInlineCards items={items.slice(0, shown)} done={shown >= items.length && !t.loading} cards={[
                            [3, <LiveContests key="live" inline />],
                            [6, <SuggestedCreators key="creators" items={creatorPool} inline />]
                        ]} />
                        : items.slice(0, shown).map(item => <FeedCard key={`${item.kind}:${item.id}`} item={item} />)}
                </div>
                <div ref={sentinel} className="feed-sentinel" />
                {items.length > 0 && shown >= items.length && (
                    <div className="feed-end">
                        <Icon name="check-circle" size={22} />
                        <p>You're all caught up!</p>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={t.loading} onClick={() => api.fetchFeed(tab, { older: true })}>Show older stuff</button>
                    </div>
                )}
                {t.loading && items.length > 0 && <FeedSkeleton count={1} />}
            </div>
            {!oneColumn && (
                <aside className="feed-rail" aria-label="More from the hub">
                    <LiveContests />
                    <YourGroupsRail />
                    <SuggestedCreators items={creatorPool} />
                </aside>
            )}
        </div>
    );
}

/**
 * The feed with the rail's sections dealt in among the posts, the way a phone
 * app shows "Suggested for you": each card goes in after the given number of
 * posts. A card whose spot is past the end waits for the last page, then goes
 * at the bottom. A section with nothing to show draws nothing.
 */
function WithInlineCards({ items, done, cards }: { items: FeedItem[]; done: boolean; cards: Array<[number, ReactNode]> }) {
    if (!items.length) return null;
    const out: ReactNode[] = [];
    items.forEach((item, i) => {
        out.push(<FeedCard key={`${item.kind}:${item.id}`} item={item} />);
        for (const [after, card] of cards) if (after === i + 1) out.push(card);
    });
    if (done) for (const [after, card] of cards) if (after > items.length) out.push(card);
    return <>{out}</>;
}

/** A rail section, or the same section as a card in the feed. */
function RailCard({ inline, title, icon, action, className = '', children }: {
    inline?: boolean; title: string; icon: string; action?: ReactNode; className?: string; children: ReactNode;
}) {
    if (!inline) return <section className={`feed-rail-card ${className}`}><h3>{title}</h3>{children}{action}</section>;
    return (
        <section className={`feed-card feed-inline ${className}`} aria-label={title}>
            <header className="feed-inline-head">
                <span className="feed-inline-icon"><Icon name={icon} size={16} /></span>
                <h3>{title}</h3>
                {action}
            </header>
            {children}
        </section>
    );
}

function EmptyFeed() {
    return (
        <div className="feed-empty">
            <Icon name="sparkles" size={26} />
            <p>It's quiet in here. Be the first: publish a Fakémon or write a post!</p>
        </div>
    );
}

/** People who show up in the feed that you don't follow yet, minus anyone who'd rather not be suggested. */
function SuggestedCreators({ items, inline }: { items: FeedItem[]; inline?: boolean }) {
    const ids = [...new Set(items.map(it => it.user_id))].sort();
    const hidden = useUndiscoverable(ids);
    if (!state.user || !hidden) return null;
    const score = new Map<string, { item: FeedItem; n: number }>();
    for (const it of items) {
        if (it.user_id === state.user.id || api.isFollowing(it.user_id) || api.hasBlocked?.(it.user_id) || hidden.has(it.user_id)) continue;
        const e = score.get(it.user_id) || { item: it, n: 0 };
        e.n += 1 + Number(it.like_count || 0) * 0.2 + Number(it.comment_count || 0) * 0.5;
        score.set(it.user_id, e);
    }
    const top = [...score.values()].sort((a, b) => b.n - a.n).slice(0, 5);
    if (!top.length) return null;
    if (inline) {
        return (
            <RailCard inline title="Creators to follow" icon="users">
                <div className="feed-inline-strip">
                    {top.map(({ item }) => (
                        <div className="feed-inline-person" key={item.user_id}>
                            <button type="button" className="feed-inline-person-main" onClick={() => api.showUserProfile(item.user_id)}>
                                <Avatar userId={item.user_id} url={item.author_avatar_url} name={item.author_name} className="feed-avatar feed-avatar-lg" />
                                <strong>{item.author_name || 'Someone'}</strong>
                                <small>In your feed</small>
                            </button>
                            <button type="button" className="feed-follow-btn" onClick={() => api.followUser(item.user_id)}>Follow</button>
                        </div>
                    ))}
                </div>
            </RailCard>
        );
    }
    return (
        <RailCard title="Creators to follow" icon="users">
            {top.map(({ item }) => (
                <div className="feed-rail-person" key={item.user_id}>
                    <button type="button" className="feed-rail-person-main" onClick={() => api.showUserProfile(item.user_id)}>
                        <Avatar userId={item.user_id} url={item.author_avatar_url} name={item.author_name} className="feed-avatar feed-avatar-sm" />
                        <span>{item.author_name || 'Someone'}</span>
                    </button>
                    <button type="button" className="feed-follow-btn" onClick={() => api.followUser(item.user_id)}>Follow</button>
                </div>
            ))}
        </RailCard>
    );
}

/** Which of these people turned off "Show me in search and suggestions"; null until known. */
function useUndiscoverable(ids: string[]): Set<string> | null {
    const [hidden, setHidden] = useState<Set<string> | null>(null);
    const key = ids.join(',');
    useEffect(() => {
        if (!ids.length) { setHidden(new Set()); return; }
        let live = true;
        (async () => {
            try {
                const client = await api.getClient();
                const { data, error } = await client.rpc('undiscoverable', { p_ids: ids });
                if (error) throw error;
                if (live) setHidden(new Set((data || []).map((r: any) => typeof r === 'string' ? r : r.undiscoverable)));
            } catch { if (live) setHidden(new Set()); }
        })();
        return () => { live = false; };
    }, [key]);
    return hidden;
}

// live events have a deadline, so they sit at the top of the rail
function LiveContests({ inline }: { inline?: boolean }) {
    const live = getLiveEvents();
    if (!live.length) return null;
    return (
        <RailCard inline={inline} title="Happening now" icon="trophy" className="community-contest-section">
            {live.slice(0, 3).map(ev => (
                <button type="button" className="community-contest-card" key={ev.id} onClick={() => { api.showCommunityPanel('events'); showEventView({ kind: 'event', id: ev.id }); }}>
                    <span className="community-contest-phase">{ev.phase === 'voting' ? 'Voting open' : 'Taking entries'}</span>
                    <strong>{ev.title}</strong>
                    {ev.category && <span className="community-contest-count">{ev.category}</span>}
                </button>
            ))}
        </RailCard>
    );
}

// ==================== browse ====================

function Browse() {
    const cs = api.communityState();
    const prefs = api.getCommunityPrefs();
    const table = api.communityLayoutMode() === 'table';
    return (
        <div className="community-panel">
            <div className="search-bar community-controls">
                <input type="search" id="community-search-input" placeholder="Search the Community Hub..." aria-label="Search the Community Hub"
                    value={cs.search || ''} onChange={e => api.filterCommunity(e.target.value)} />
                <select value={prefs.sortBy} onChange={e => api.changeCommunitySort(e.target.value, prefs.sortOrder)} aria-label="Sort the community hub by">
                    <option value="activity">Activity</option>
                    <option value="likes">Total likes</option>
                    <option value="comments">Total comments</option>
                    <option value="published">Date published</option>
                    <option value="name">Name</option>
                    <option value="author">Creator</option>
                    <option value="number">Pokédex number</option>
                    <option value="bst">BST</option>
                    <option value="hp">HP</option>
                    <option value="atk">Attack</option>
                    <option value="def">Defense</option>
                    <option value="spa">Sp. Atk</option>
                    <option value="spd">Sp. Def</option>
                    <option value="spe">Speed</option>
                </select>
                <select value={prefs.sortOrder} onChange={e => api.changeCommunitySort(prefs.sortBy, e.target.value)} aria-label="Community sort direction">
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                </select>
                <div className="segmented collection-layout" role="group" aria-label="Layout">
                    {([['grid', 'layout-grid', 'Grid'], ['table', 'table-cells', 'Table']] as const).map(([key, icon, label]) => {
                        const on = (key === 'table') === table;
                        return (
                            <button key={key} type="button" className={on ? 'active' : ''} aria-pressed={on} aria-label={label} title={label}
                                // the listing fades out, changes layout, and fades back in, as in My Collection
                                onClick={() => { if (!on) fadeSwap(document.getElementById('community-listing'), () => api.setCommunityLayout(key)); }}>
                                <Icon name={icon} />
                            </button>
                        );
                    })}
                </div>
            </div>
            <div id="community-listing">
                <CommunityFeed rows={cs.mons || []} loading={!!cs.loading} prefs={{ ...prefs, search: (cs.search || '').trim().toLowerCase() }}
                    viewerId={state.user?.id || null} viewerIsStaff={!!api.isStaff?.()} table={table} />
            </div>
        </div>
    );
}
