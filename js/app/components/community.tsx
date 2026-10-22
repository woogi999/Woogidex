// Pieces of the Community Hub: feed cards, the landing shelves' cards, lazy
// artwork, and a post's comment thread.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../core/app.ts';
import { STAT_KEYS, communityBst, emptyFeedMessage, evoBadgeLabel, prepareCommunityFeed } from '../../features/community-feed-model.ts';
import { Avatar } from './Avatar.tsx';
import { BadgeRow } from './Badge.tsx';
import { ReactionSummary } from './comments.tsx';
import { Icon } from './Icon.tsx';
import { ShieldedArt } from './ShieldedArt.tsx';
import { TypeBadges } from './profile.tsx';
import { modContext } from './ModButton.tsx';

/** A row of the community feed (published_mons, slimmed). */
export interface FeedRow {
    id: string;
    user_id: string;
    published_at: string;
    source_fakemon_id?: string;
    author_name?: string;
    author_avatar_url?: string;
    author_badges?: string[];
    like_count?: number;
    comment_count?: number;
    view_count?: number;
    liked_by_me?: boolean;
    family_snapshots?: any[];
    family_full?: any[];
    fakemon_data?: { name?: string; species?: string; number?: string; type1?: string; type2?: string; artwork?: string; thumbnail?: string; [k: string]: any };
    [extra: string]: any;
}

// ==================== artwork ====================

/**
 * A post's artwork, fetched once its slot nears the screen (the feed query
 * carries no images; see requestCardArtwork in js/features/community.ts).
 */
export function LazyArt({ row, className = 'card-art', children, full = false }: {
    row: FeedRow; className?: string; children?: ReactNode;
    /** the original artwork rather than the card thumbnail, for big pictures */
    full?: boolean;
}) {
    const mon = row.fakemon_data || {};
    const [art, setArt] = useState<string>(full ? '' : mon.thumbnail || mon.artwork || '');
    const ref = useRef<HTMLElement>(null);

    useEffect(() => {
        if (art) return;
        let live = true;
        const fetchIt = () => api.requestCardArtwork?.(row.id, full).then((url: string) => { if (live && url) setArt(url); }).catch(() => {});
        if (typeof IntersectionObserver === 'undefined') { fetchIt(); return () => { live = false; }; }
        const observer = new IntersectionObserver(entries => {
            if (!entries.some(e => e.isIntersecting)) return;
            observer.disconnect();
            fetchIt();
        }, { rootMargin: '300px' });
        if (ref.current) observer.observe(ref.current);
        return () => { live = false; observer.disconnect(); };
    }, [row.id, art, full]);

    const Tag = className.includes('community-landing-art') || className.includes('community-upload-art') ? 'span' : 'div';
    return (
        <Tag className={className} ref={ref as any}>
            {art
                ? <ShieldedArt src={art} alt={`${mon.name || 'Fakémon'} artwork`} />
                : <img className="no-art-placeholder" src="assets/no_art_placeholder.png" alt="No artwork" draggable={false} />}
            {children}
        </Tag>
    );
}

// ==================== the browse feed ====================

function SkeletonCard() {
    return (
        <div className="collection-card community-card skel-card">
            <div className="card-art skel" />
            <div className="card-body">
                <div className="skel skel-text skel-name" />
                <div className="card-types"><span className="skel skel-pill" /><span className="skel skel-pill" /></div>
                <div className="community-card-stats"><span className="skel skel-pill" /><span className="skel skel-pill" /><span className="skel skel-pill" /></div>
                <div className="community-card-author"><span className="skel skel-circle" /><span className="skel skel-text" /></div>
            </div>
        </div>
    );
}

export function AuthorLine({ row, className = 'community-card-author', prefix = '' }: { row: FeedRow; className?: string; prefix?: string }) {
    return (
        <div className={className}>
            <Avatar userId={row.user_id} url={row.author_avatar_url} name={row.author_name} />
            <span className="community-author-link" data-user-id={row.user_id}
                onClick={e => { e.stopPropagation(); api.showUserProfile(row.user_id); }}>
                {prefix}{row.author_name}
            </span>
            <BadgeRow badgeKeys={row.author_badges} size={13} />
        </div>
    );
}

/** A Fakémon's top reactions and the React button; clicks stay out of the card under it. */
export function MonReactions({ row, className = 'community-reactions' }: { row: FeedRow; className?: string }) {
    const mine: string[] = row.my_reactions || [];
    return (
        <div className={className} onClick={e => e.stopPropagation()}>
            <ReactionSummary kind="mon" id={row.id} counts={row.reactions || {}} mine={mine}
                onToggle={emoji => api.toggleReaction({ ...row, kind: 'mon', my_reactions: mine }, emoji)} />
        </div>
    );
}

function CommunityCard({ row, isMine, canDelete }: { row: FeedRow; isMine: boolean; canDelete: boolean }) {
    const mon = row.fakemon_data || {};
    const open = () => api.openMonDetail(row.id);
    const evo = evoBadgeLabel(row);
    return (
        <div className="collection-card community-card" onClick={open}
            {...modContext({ userId: row.user_id, userName: row.author_name, content: { kind: 'mon', id: row.id, label: `"${mon.name || 'a Fakémon'}"` }, onRemoved: () => api.dropFeedItem?.('mon', row.id) })}>
            {canDelete && (
                <button className="card-delete-btn community-unpublish-btn" title={isMine ? 'Unpublish' : 'Remove (staff)'}
                    onClick={e => { e.stopPropagation(); api.unpublishMon(row.id); }}>
                    <Icon name="trash-2" style={{ width: 14, height: 14 }} />
                </button>
            )}
            {/* the family badge sits on the artwork's corner, so every card is the same height */}
            <LazyArt row={row}>{evo && <span className="community-card-evo-badge">{evo}</span>}</LazyArt>
            <div className="card-body">
                <div className="card-name" title={mon.name}>{mon.name}</div>
                <TypeBadges type1={mon.type1} type2={mon.type2} />
                <div className="community-card-stats" aria-label="Community activity">
                    <MonReactions row={row} />
                    <button type="button" className="community-stat-btn" title="Comments" onClick={e => { e.stopPropagation(); open(); }}>
                        <Icon name="message-circle" /><span>{row.comment_count || 0}</span>
                    </button>
                </div>
                <AuthorLine row={row} />
            </div>
        </div>
    );
}

interface FeedProps {
    rows: FeedRow[];
    loading: boolean;
    prefs: { search: string; sortBy: string; sortOrder: 'asc' | 'desc' };
    viewerId: string | null;
    viewerIsStaff: boolean;
}

// ---- the table: My Collection's (Showdown's dex search), plus reactions, comments and the creator ----

const STAT_LABEL: Record<string, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
// label, class, the sort it uses, and whether a first click sorts high to low
const TABLE_COLUMNS: Array<[string, string, string?, boolean?]> = [
    ['', 'col-icon'], ['#', 'col-num', 'number'], ['Name', 'col-name', 'name'], ['Types', 'col-types'],
    ...STAT_KEYS.map(k => [STAT_LABEL[k], 'col-stat', k, true] as [string, string, string, boolean]),
    ['BST', 'col-stat col-bst', 'bst', true], ['Reactions', 'col-reactions', 'likes', true],
    ['Comments', 'col-stat', 'comments', true], ['Creator', 'col-author', 'author']
];

function TableHead({ prefs }: { prefs: FeedProps['prefs'] }) {
    return (
        <thead>
            <tr>
                {TABLE_COLUMNS.map(([label, cls, key, high]) => {
                    const on = !!key && prefs.sortBy === key;
                    return (
                        <th key={cls + label} className={cls} scope="col" aria-sort={on ? (prefs.sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}>
                            {key
                                ? <button type="button" className={`table-sort${on ? ' active' : ''}`}
                                    onClick={() => api.changeCommunitySort(key, on ? (prefs.sortOrder === 'asc' ? 'desc' : 'asc') : high ? 'desc' : 'asc')}>
                                    {label}{on && <Icon name={prefs.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} size={11} />}
                                </button>
                                : label}
                        </th>
                    );
                })}
            </tr>
        </thead>
    );
}

const Num = ({ label, value, cls = 'col-stat' }: { label: string; value: ReactNode; cls?: string }) => <td className={cls}><em>{label}</em>{value}</td>;

function CommunityRow({ row, isMine, canDelete }: { row: FeedRow; isMine: boolean; canDelete: boolean }) {
    const mon = row.fakemon_data || {};
    const open = () => api.openMonDetail(row.id);
    const evo = evoBadgeLabel(row);
    const stats = mon.stats;
    return (
        <tr className="dex-row" tabIndex={0} aria-label={mon.name || 'Fakémon'} onClick={open}
            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } }}
            {...modContext({ userId: row.user_id, userName: row.author_name, content: { kind: 'mon', id: row.id, label: `"${mon.name || 'a Fakémon'}"` }, onRemoved: () => api.dropFeedItem?.('mon', row.id) })}>
            <td className="col-icon"><LazyArt row={row} className="card-art dex-art" /></td>
            <td className="col-num">{mon.number || '—'}</td>
            <td className="col-name">
                <span className="dex-name">
                    <span className="card-name dex-name-text" title={mon.name}>{mon.name || 'Unnamed'}</span>
                    {evo && <span className="vanilla-card-tag vanilla-card-tag-inline">{evo}</span>}
                </span>
            </td>
            <td className="col-types"><TypeBadges type1={mon.type1} type2={mon.type2} /></td>
            {STAT_KEYS.map(k => <Num key={k} label={STAT_LABEL[k]} value={stats?.[k] ?? '—'} />)}
            <Num label="BST" value={stats ? communityBst(row) : '—'} cls="col-stat col-bst" />
            <td className="col-reactions"><MonReactions row={row} /></td>
            <Num label="Comments" value={row.comment_count || 0} />
            <td className="col-author">
                <AuthorLine row={row} />
                {canDelete && (
                    <button className="btn btn-secondary btn-icon btn-sm dex-row-remove" type="button" title={isMine ? 'Unpublish' : 'Remove (staff)'} aria-label={isMine ? 'Unpublish' : 'Remove (staff)'}
                        onClick={e => { e.stopPropagation(); api.unpublishMon(row.id); }}>
                        <Icon name="trash-2" size={14} />
                    </button>
                )}
            </td>
        </tr>
    );
}

export function CommunityFeed({ rows, loading, prefs, viewerId, viewerIsStaff, table = false }: FeedProps & { table?: boolean }) {
    if (loading) return table
        ? <div className="dex-table-wrap community-table-loading">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skel skel-text" />)}</div>
        : <div id="community-grid" className="collection-grid">{Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}</div>;
    const visible: FeedRow[] = prepareCommunityFeed(rows, prefs);
    if (!visible.length) return <div className="community-empty">{emptyFeedMessage(prefs.search)}</div>;
    if (table) {
        return (
            <div className="dex-table-wrap" id="community-grid">
                <table className="dex-table dex-table-community">
                    <TableHead prefs={prefs} />
                    <tbody>
                        {visible.map(row => {
                            const isMine = !!viewerId && row.user_id === viewerId;
                            return <CommunityRow key={row.id} row={row} isMine={isMine} canDelete={isMine || viewerIsStaff} />;
                        })}
                    </tbody>
                </table>
            </div>
        );
    }
    return (
        <div id="community-grid" className="collection-grid">
            {visible.map(row => {
                const isMine = !!viewerId && row.user_id === viewerId;
                return <CommunityCard key={row.id} row={row} isMine={isMine} canDelete={isMine || viewerIsStaff} />;
            })}
        </div>
    );
}

// ==================== the landing shelves ====================

export function LandingCard({ row, onOpen }: { row: FeedRow; onOpen?: () => void }) {
    const mon = row.fakemon_data || {};
    return (
        <button type="button" className="community-landing-card" onClick={onOpen || (() => api.openMonDetail(row.id))}>
            <LazyArt row={row} className="community-landing-art" />
            <span className="community-landing-body">
                <span className="community-landing-name">{mon.name || 'Unnamed'}</span>
                <span className="community-landing-author">by {row.author_name || 'Unknown'}</span>
                <span className="community-landing-foot">
                    <span className="community-landing-types">
                        {[mon.type1, mon.type2].filter(Boolean).map(t => <span key={t} className={`type-badge type-${String(t).toLowerCase()}`}>{t}</span>)}
                    </span>
                    <span className="community-landing-stats">
                        <span><Icon name="heart" size={12} /> {Number(row.like_count || 0)}</span>
                        <span><Icon name="message-circle" size={12} /> {Number(row.comment_count || 0)}</span>
                    </span>
                </span>
            </span>
        </button>
    );
}
