// /search?q=... -- the full results for the header's search box (pressing
// Enter there lands here). Everything local is searched as the page renders;
// Community Hub posts arrive after, for signed-in visitors.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { state } from '../../core/app.ts';
import { log } from '../../core/log.ts';
import { Icon } from '../components/Icon.tsx';
import { COMMUNITY_PAGE_LIMIT, GROUPS, PAGE_LIMIT, PEOPLE_PAGE_LIMIT, communityResults, localGroups, peopleResults, type GroupKey, type SearchResult } from '../../features/search.ts';
import { openSearchPage, takeSearchFilter } from '../../features/global-search.ts';
import { SearchRow } from '../components/SearchRow.tsx';
import { useQueryParam, useSlide } from '../hooks.ts';
import { useStore } from '../store.ts';
import { FeedCard, FeedSkeleton } from '../components/feed.tsx';
import { fetchTagFeed, popularTags } from '../../features/social.ts';
import type { FeedItem } from '../../features/feed-algorithm.ts';

type Filter = 'all' | GroupKey;
type CommunityStatus = '' | 'loading' | 'signed-out' | 'error';

/** A #tag on its own searches the posts carrying it. */
const HASHTAG = /^#([A-Za-z0-9_]{1,24})$/;

export function SearchPage() {
    const version = useStore();
    const query = useQueryParam('q').trim();
    const hashtag = query.match(HASHTAG)?.[1]?.toLowerCase() || '';
    const [filter, setFilter] = useState<Filter>('all');
    const [draft, setDraft] = useState(query);
    const [community, setCommunity] = useState<{ query: string; list: SearchResult[]; people: SearchResult[]; status: CommunityStatus }>({ query: '', list: [], people: [], status: '' });

    // a new search (typed here, from the header, or back/forward) starts over
    useEffect(() => { setDraft(query); setFilter(takeSearchFilter() as Filter); }, [query]);

    const local = useMemo(() => (query ? localGroups(query, PAGE_LIMIT) : null), [query, version]);
    const signedIn = !!state.user;

    useEffect(() => {
        if (!query) { setCommunity({ query, list: [], people: [], status: '' }); return; }
        if (!signedIn) { setCommunity({ query, list: [], people: [], status: 'signed-out' }); return; }
        let live = true;
        setCommunity({ query, list: [], people: [], status: 'loading' });
        Promise.allSettled([communityResults(query, COMMUNITY_PAGE_LIMIT), peopleResults(query, PEOPLE_PAGE_LIMIT)]).then(([mons, people]) => {
            if (!live) return;
            const failed = mons.status === 'rejected' || people.status === 'rejected';
            if (failed) log.warn('SEARCH', 'Community search failed', { error: String((mons as any).reason || (people as any).reason) });
            setCommunity({
                query, status: failed ? 'error' : '',
                list: mons.status === 'fulfilled' ? mons.value : [],
                people: people.status === 'fulfilled' ? people.value : []
            });
        });
        return () => { live = false; };
    }, [query, signedIn]);

    const groups: Record<GroupKey, SearchResult[]> = {
        fakemon: local?.fakemon || [],
        library: local?.library || [],
        pages: local?.pages || [],
        people: community.query === query ? community.people : [],
        community: community.query === query ? community.list : []
    };
    const communityStatus = community.query === query ? community.status : (query && signedIn ? 'loading' : '');
    const total = GROUPS.reduce((n, [key]) => n + groups[key].length, 0);

    function submit(event: FormEvent) {
        event.preventDefault();
        openSearchPage(draft, { filter });
    }

    function pick(result: SearchResult) {
        try { result.run(); } catch (err) { log.error('SEARCH', 'Search result action failed', { title: result.title, error: String(err) }); }
    }

    const tabs: Array<[Filter, string, number]> = [
        ['all', 'All', total],
        ...GROUPS.map(([key, label]): [Filter, string, number] => [key, label.replace(/^Your /, '').replace(/^./, c => c.toUpperCase()), groups[key].length])
    ];
    const results = useSlide(filter, tabs.map(([k]) => k));

    const section = ([key, label]: [GroupKey, string], cap: number) => {
        const list = groups[key];
        let status = '';
        if (key === 'community' || key === 'people') {
            const what = key === 'people' ? 'people' : 'the Community Hub';
            if (communityStatus === 'loading') status = `Searching ${what}…`;
            else if (communityStatus === 'signed-out') status = key === 'people' ? 'Sign in to search for people.' : 'Sign in to search Community Hub posts.';
            else if (communityStatus === 'error') status = `Couldn't search ${what} right now.`;
        }
        if (!list.length && !status) return null;
        const shown = cap ? list.slice(0, cap) : list;
        return (
            <section className="search-section" key={key}>
                <header className="search-section-head">
                    <h2>{label}</h2>
                    {cap > 0 && list.length > cap && (
                        <button type="button" className="btn btn-secondary btn-sm search-see-more" onClick={() => setFilter(key)}>See all {list.length}</button>
                    )}
                </header>
                {shown.length > 0 && (
                    <div className="search-list">
                        {shown.map((r, i) => <SearchRow key={`${r.title}-${i}`} result={r} query={query} className="search-row" onPick={pick} />)}
                    </div>
                )}
                {status && <p className="search-section-status">{status}</p>}
            </section>
        );
    };

    const sections = filter === 'all'
        ? GROUPS.map(g => section(g, 6)).filter(Boolean)
        : [section(GROUPS.find(([key]) => key === filter) || GROUPS[0], 0)].filter(Boolean);

    return (
        <>
            <div className="page-header">
                <div className="page-heading">
                    <h1 className="page-title">Search</h1>
                </div>
            </div>

            <form className="search-page-form" role="search" onSubmit={submit}>
                <Icon name="search" />
                <input type="search" placeholder="Search Woogidex" autoComplete="off" spellCheck={false} aria-label="Search Woogidex"
                    value={draft} onChange={e => setDraft(e.target.value)} />
                <button className="btn btn-primary" type="submit">Search</button>
            </form>

            <div className="tabs search-page-tabs" role="tablist" aria-label="Filter results">
                {tabs.map(([key, label, n]) => (
                    <button key={key} type="button" role="tab" className={`tab${filter === key ? ' active' : ''}`} aria-selected={filter === key} onClick={() => setFilter(key)}>
                        {label}{query && <span className="search-tab-count">{n}</span>}
                    </button>
                ))}
            </div>

            {hashtag ? <HashtagResults tag={hashtag} /> : (
            <>
            <div className="search-page-results" ref={results}>
                {query && /^[A-Za-z0-9_]{2,24}$/.test(query) && (
                    <button type="button" className="search-hashtag-jump" onClick={() => openSearchPage(`#${query.toLowerCase()}`)}>
                        <Icon name="hashtag" size={16} /><span>See posts tagged <strong>#{query.toLowerCase()}</strong></span><Icon name="chevron-right" size={14} />
                    </button>
                )}
                {!query ? (
                    <div className="search-page-empty"><Icon name="search" /><p>Type something to search for.</p></div>
                ) : sections.length ? sections : (
                    <div className="search-page-empty">
                        <Icon name="search-x" />
                        <p>Nothing matches “{query}”.</p>
                        <span>Check the spelling, or try a shorter word.</span>
                    </div>
                )}
            </div>
            </>
            )}
        </>
    );
}

/** The posts tagged #tag, as feed cards, newest first; related tags above them. */
function HashtagResults({ tag }: { tag: string }) {
    const [items, setItems] = useState<FeedItem[] | null>(null);
    const [error, setError] = useState('');
    const [more, setMore] = useState(true);
    const [busy, setBusy] = useState(false);
    const [related, setRelated] = useState<Array<{ tag: string; uses: number }>>([]);
    useEffect(() => {
        let live = true;
        setItems(null); setError(''); setMore(true);
        fetchTagFeed(tag).then(rows => { if (live) { setItems(rows); setMore(rows.length >= 40); } })
            .catch(e => { log.warn('SEARCH', 'Tag search failed', { error: String(e?.message || e) }); if (live) { setItems([]); setError('Couldn’t search posts right now.'); } });
        popularTags(tag.slice(0, 3), 10).then(list => { if (live) setRelated(list.filter(t => t.tag !== tag).slice(0, 8)); });
        return () => { live = false; };
    }, [tag, state.user?.id]);
    async function older() {
        if (!items?.length || busy) return;
        setBusy(true);
        try {
            const last = items.reduce((a, b) => (a.created_at < b.created_at ? a : b));
            const rows = await fetchTagFeed(tag, { before: last.created_at });
            const known = new Set(items.map(i => i.id));
            const fresh = rows.filter(r => !known.has(r.id));
            setItems([...items, ...fresh]);
            setMore(fresh.length > 0);
        } catch { setMore(false); }
        setBusy(false);
    }
    return (
        <div className="search-hashtag">
            <header className="search-hashtag-head">
                <span className="search-hashtag-icon"><Icon name="hashtag" size={22} /></span>
                <div>
                    <h2>#{tag}</h2>
                    <p>{items == null ? 'Looking…' : `${items.length}${more && items.length ? '+' : ''} ${items.length === 1 ? 'post' : 'posts'}`}{!state.user ? ' from Woogidex · sign in to see everyone’s' : ''}</p>
                </div>
            </header>
            {related.length > 0 && (
                <div className="search-hashtag-related">
                    {related.map(t => <button key={t.tag} type="button" className="chip" onClick={() => openSearchPage(`#${t.tag}`)}>#{t.tag}</button>)}
                </div>
            )}
            <div className="feed-list search-hashtag-list">
                {items == null && <FeedSkeleton count={2} />}
                {error && <p className="search-section-status">{error}</p>}
                {items?.length === 0 && !error && (
                    <div className="search-page-empty"><Icon name="hashtag" /><p>No posts tagged #{tag} yet.</p><span>Write one! Put #{tag} anywhere in a post.</span></div>
                )}
                {items?.map(item => <FeedCard key={`${item.kind}:${item.id}`} item={item} />)}
            </div>
            {items && items.length > 0 && more && (
                <div className="feed-end"><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={older}>{busy ? 'Loading…' : 'Show older posts'}</button></div>
            )}
        </div>
    );
}
