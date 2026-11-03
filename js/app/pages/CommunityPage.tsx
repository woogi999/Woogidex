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

const TABS: Array<[Panel, string]> = [['feed', 'Home'], ['browse', 'Browse'], ['groups', 'Groups'], ['events', 'Events']];
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
    const guest = !state.user;
    return (
        <div className={`hub${guest ? ' is-guest' : ''}`}>
            {/* the hub's sections, as a sidebar (a scrolling row of chips on a phone) */}
            <aside className="hub-nav" aria-label="Community Hub">
                {guest
                    ? <button className="btn btn-primary hub-publish" type="button" onClick={() => api.openAuthModal?.('signup')}><Icon name="user-plus" /><span>Join Woogidex</span></button>
                    : <button className="btn btn-primary hub-publish" type="button" onClick={() => api.openCommunityPublishModal()}><Icon name="upload" /><span>Publish a Fakémon</span></button>}
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
                {panel === 'browse' && (guest ? <GuestLocked what="browse" /> : <Browse />)}
                {panel === 'events' && (guest ? <GuestLocked what="events" /> : <div className="community-panel"><EventsPanel /></div>)}
                {panel === 'groups' && (guest ? <GuestLocked what="groups" /> : <div className="community-panel"><GroupsPanel /></div>)}
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
    // signing in (or out) on this page swaps the guest feed for the full one
    useEffect(() => { api.fetchFeed(tab); }, [tab, state.user?.id]);

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

    const guest = !state.user;
    return (
        <div className="feed-layout">
            <div className="feed-main">
                {guest ? <GuestHero /> : <PostComposer />}
                <div className="feed-list" ref={list}>
                    {t.error && <div className="feed-empty"><Icon name="exclamation-triangle" size={20} /><p>{t.error}</p></div>}
                    {!items.length && t.loading && <FeedSkeleton />}
                    {!items.length && !t.loading && !t.error && <EmptyFeed />}
                    {guest
                        ? <WithInlineCards items={items.slice(0, shown)} done={shown >= items.length && !t.loading} cards={[
                            [4, <GuestJoinCard key="join" />]
                        ]} />
                        : oneColumn
                        ? <WithInlineCards items={items.slice(0, shown)} done={shown >= items.length && !t.loading} cards={[
                            [3, <LiveContests key="live" inline />],
                            [6, <SuggestedCreators key="creators" items={creatorPool} inline />]
                        ]} />
                        : items.slice(0, shown).map(item => <FeedCard key={`${item.kind}:${item.id}`} item={item} />)}
                </div>
                <div ref={sentinel} className="feed-sentinel" />
                {guest && items.length > 0 && shown >= items.length && !t.loading && (
                    <div className="feed-end guest-feed-end">
                        <Icon name="sparkles" size={22} />
                        <p>That's everything you can see without an account.</p>
                        <span>Sign up to see every Fakémon, posts from everyone, groups and events.</span>
                        <div className="guest-cta-buttons">
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => api.openAuthModal?.('signup')}>Create a free account</button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.openAuthModal?.('signin')}>Sign in</button>
                        </div>
                    </div>
                )}
                {!guest && items.length > 0 && shown >= items.length && (
                    <div className="feed-end">
                        <Icon name="check-circle" size={22} />
                        <p>You're all caught up!</p>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={t.loading} onClick={() => api.fetchFeed(tab, { older: true })}>Show older stuff</button>
                    </div>
                )}
                {t.loading && items.length > 0 && <FeedSkeleton count={1} />}
            </div>
            {!oneColumn && guest && (
                <aside className="feed-rail" aria-label="Join Woogidex">
                    <GuestRail />
                </aside>
            )}
            {!oneColumn && !guest && (
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

// ==================== signed out ====================
// The hub opens for everyone, but signed out it shows only open Fakémon and
// Woogidex's own posts (news and updates). Everything else asks you to join.

const PERKS: Array<[string, string]> = [
    ['sparkles', 'Publish your Fakémon and get likes and comments'],
    ['users', 'Follow creators and join groups'],
    ['trophy', 'Enter events and contests'],
    ['chat-bubble-left-right', 'Message other makers'],
    ['cloud', 'Back up your collection to the cloud']
];

function GuestButtons({ small = false }: { small?: boolean }) {
    const size = small ? ' btn-sm' : '';
    return (
        <div className="guest-cta-buttons">
            <button type="button" className={`btn btn-primary${size}`} onClick={() => api.openAuthModal?.('signup')}>Sign up, it's free</button>
            <button type="button" className={`btn btn-secondary${size}`} onClick={() => api.openAuthModal?.('signin')}>Log in</button>
        </div>
    );
}

/** Top of the guest feed: what this is, and how to get the rest. */
function GuestHero() {
    return (
        <section className="guest-hero">
            <div className="guest-hero-text">
                <span className="guest-hero-kicker"><Icon name="globe" size={14} /> Community Hub</span>
                <h2>See what people are making</h2>
                <p>You're looking at open Fakémon and news from Woogidex. Make an account to see everything, and to share your own.</p>
            </div>
            <GuestButtons />
        </section>
    );
}

/** The feed's side column, signed out. */
function GuestRail() {
    return (
        <section className="feed-rail-card guest-rail">
            <h3>Join the community</h3>
            <ul className="guest-perks">{PERKS.map(([icon, text]) => <li key={text}><Icon name={icon} size={16} />{text}</li>)}</ul>
            <GuestButtons small />
            <p className="guest-rail-note">Making Fakémon never needs an account. Your collection stays on this device.</p>
        </section>
    );
}

/** In among the guest feed's cards, like a phone app's "Suggested for you". */
function GuestJoinCard() {
    return (
        <section className="feed-card feed-inline guest-join-card" aria-label="Join Woogidex">
            <header className="feed-inline-head">
                <span className="feed-inline-icon"><Icon name="user-plus" size={16} /></span>
                <h3>There's a lot more in here</h3>
            </header>
            <p>Sign up to see every Fakémon, posts from everyone, and your own feed.</p>
            <GuestButtons small />
        </section>
    );
}

const LOCKED: Record<string, [string, string, string]> = {
    browse: ['layout-grid', 'Browse every Fakémon', 'Search and sort everything the community has published, by type, stats, likes and more.'],
    groups: ['users', 'Groups', 'Art clubs, region projects and battle teams. Join one, or start your own.'],
    events: ['trophy', 'Events and contests', 'Enter your Fakémon in community events, vote, and see the winners.']
};

/** A section of the hub that needs an account. */
function GuestLocked({ what }: { what: 'browse' | 'groups' | 'events' }) {
    const [icon, title, body] = LOCKED[what];
    return (
        <div className="community-panel guest-locked">
            <span className="guest-locked-icon"><Icon name={icon} size={28} /></span>
            <h2>{title}</h2>
            <p>{body}</p>
            <p className="guest-locked-sub">This part of the hub needs a free account.</p>
            <GuestButtons />
            <button type="button" className="link-btn guest-locked-back" onClick={() => api.showCommunityPanel('feed')}>Back to Home</button>
        </div>
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
