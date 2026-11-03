// The Community Hub feed's pieces: a Fakemon card (laid out like Instagram),
// a post (text first, like Tumblr, with the Fakemon it shows off), reposts
// and shares, emoji reactions, the "write a post" box, and the picker for
// adding your published Fakemon to a post. Data and actions: js/features/social.ts.

import { useEffect, useRef, useState } from 'react';
import { api, state } from '../../core/app.ts';
import { evoBadgeLabel } from '../../features/community-feed-model.ts';
import { Avatar } from './Avatar.tsx';
import { BadgeRow } from './Badge.tsx';
import { Icon } from './Icon.tsx';
import { Link, insideControl, monPath } from './Link.tsx';
import { EmojiInput, RichText } from './EmojiInput.tsx';
import { CommentThread, ReactionSummary, timeAgo } from './comments.tsx';
import { notify } from '../store.ts';
import { LazyArt } from './community.tsx';
import { TypeBadges } from './profile.tsx';
import { Modal } from './Modal.tsx';
import { useClickAway } from './editor/fields.tsx';
import { registerDialog, openDialog, type DialogProps } from '../dialogs.tsx';
import { PollEditor, PollView } from './polls.tsx';
import { ModButton, modContext, type ModTarget } from './ModButton.tsx';
import { emptyPoll, type PollDraft } from '../../features/polls.ts';
import type { FeedItem } from '../../features/feed-algorithm.ts';
import { STAGE_LABEL, effectivePhase, fetchEvents } from '../../features/events.ts';
import { SkeletonRows } from './Skeleton.tsx';
import { openCommentControls, openReportDialog } from '../../features/safety.ts';

// timeAgo lives with the comments now; it's re-exported for the pages that
// already import it from here
export { timeAgo };

/** Counts a card as seen once most of it has been on screen for a moment. */
function useImpression(id: string) {
    const ref = useRef<HTMLElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        let timer: any = null;
        const io = new IntersectionObserver(entries => {
            const visible = entries.some(e => e.intersectionRatio >= 0.6);
            if (visible && !timer) timer = setTimeout(() => { api.recordImpression?.(id); io.disconnect(); }, 900);
            if (!visible && timer) { clearTimeout(timer); timer = null; }
        }, { threshold: [0, 0.6] });
        io.observe(el);
        return () => { io.disconnect(); clearTimeout(timer); };
    }, [id]);
    return ref;
}

/** What the staff tools act on for a feed card: its author, and the post or Fakémon itself. */
const modTarget = (item: FeedItem): ModTarget => {
    const kind = item.kind === 'mon' ? 'mon' : 'post';
    return {
        userId: item.user_id, userName: item.author_name,
        content: { kind, id: item.id, label: kind === 'mon' ? `"${item.fakemon_data?.name || 'a Fakémon'}"` : 'a post' },
        onRemoved: () => api.dropFeedItem?.(kind, item.id)
    };
};

/** Opens a card's address on a click, unless the click was on a link or button inside it. */
function openCard(e: React.MouseEvent, path: string) {
    if (!insideControl(e)) api.openPath(path);
}

/** @param to the item's own page: its time links there, the way Facebook's does */
function Byline({ item, verb, to }: { item: FeedItem; verb?: string; to?: string }) {
    const isMine = !!state.user && state.user.id === item.user_id;
    const following = !isMine && api.isFollowing?.(item.user_id);
    return (
        <div className="feed-byline">
            <Link to={`profile/${item.user_id}`} className="feed-byline-avatar" aria-label={`${item.author_name || 'Creator'}'s profile`}>
                <Avatar userId={item.user_id} url={item.author_avatar_url} name={item.author_name} className="feed-avatar" />
            </Link>
            <div className="feed-byline-text">
                <span className="feed-byline-name">
                    <Link to={`profile/${item.user_id}`} className="community-author-link" data-user-id={item.user_id}>{item.author_name || 'Someone'}</Link>
                    <BadgeRow badgeKeys={item.author_badges} size={13} />
                    {/* a post in a group: "Name > Group", like Facebook */}
                    {item.group && (
                        <>
                            <Icon name="chevron-right" size={12} className="feed-byline-sep" />
                            <Link to={`groups/${item.group.slug}`} className="feed-byline-group">
                                {item.group.name}
                            </Link>
                        </>
                    )}
                </span>
                <span className="feed-byline-meta">
                    {verb && <>{verb} · </>}
                    {to
                        ? <Link to={to} className="feed-byline-time"><time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()}>{timeAgo(item.created_at)}</time></Link>
                        : <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()}>{timeAgo(item.created_at)}</time>}
                    {item.edited_at && <> · edited</>}
                </span>
            </div>
            {!isMine && state.user && (
                following
                    ? <span className="feed-following-chip"><Icon name="check" size={12} /> Following</span>
                    : <button type="button" className="feed-follow-btn" onClick={() => api.followUser(item.user_id)}>Follow</button>
            )}
            <ModButton target={modTarget(item)} />
        </div>
    );
}

// ==================== under every card ====================

/** A card's comments, opened in place under it (like Facebook) rather than on another page. */
function InlineComments({ kind, item, targetName }: { kind: 'mon' | 'post'; item: FeedItem; targetName?: string }) {
    return (
        <div className="feed-comments">
            <CommentThread kind={kind} parentId={item.id} ownerId={item.user_id} targetName={targetName} autoFocus
                onCount={n => { if (Number(item.comment_count || 0) !== n) { item.comment_count = n; notify(); } }} />
        </div>
    );
}

export function Reactions({ post }: { post: any }) {
    const kind = post.kind === 'mon' ? 'mon' : 'post';
    return <ReactionSummary kind={kind} id={post.id} counts={post.reactions || {}} mine={post.my_reactions || []} onToggle={emoji => api.toggleReaction({ ...post, kind }, emoji)} />;
}

/** Repost, share with your own words on top (Threads' Repost / Quote, Facebook's Share), or copy the link. */
function RepostButton({ item }: { item: FeedItem }) {
    const [menu, setMenu] = useState(false);
    const target = api.repostTarget(item);
    const mine = !!target.reposted_by_me;
    // a private group's post stays in the group: only its link can be copied
    const privateGroup = target.group?.visibility === 'private';
    const ref = useClickAway(menu, () => setMenu(false));
    return (
        <div className="feed-menu-wrap feed-repost-wrap" ref={ref}>
            <button type="button" className={`feed-action${mine ? ' is-reposted' : ''}`} aria-haspopup="menu" aria-expanded={menu}
                title={mine ? 'Reposted' : 'Share'} onClick={() => setMenu(v => !v)}>
                <Icon name="arrow-path-rounded-square" size={18} /><span>{Number(target.repost_count || 0)}</span>
            </button>
            {menu && (
                <div className="feed-menu feed-repost-menu" role="menu">
                    {!privateGroup && (
                        <>
                            <button type="button" role="menuitem" onClick={() => { setMenu(false); if (api.requireAccount?.('Sign in to repost.')) api.toggleRepost(item); }}>
                                <Icon name="arrow-path-rounded-square" size={14} /> {mine ? 'Undo repost' : 'Repost'}
                            </button>
                            <button type="button" role="menuitem" onClick={() => { setMenu(false); if (api.requireAccount?.('Sign in to share.')) openDialog('quote-repost', { item: target }); }}>
                                <Icon name="pencil-square" size={14} /> Share with your thoughts
                            </button>
                        </>
                    )}
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); target.kind === 'mon' ? api.copyCommunityShareLink(target.id) : api.copyPostLink(target.id); }}>
                        <Icon name="link" size={14} /> Copy link
                    </button>
                </div>
            )}
        </div>
    );
}

/** The same row on every card, Fakémon and posts alike. */
function FeedActions({ item, comments, onComments }: { item: FeedItem; comments: boolean; onComments: () => void }) {
    return (
        <div className="feed-actions">
            <Reactions post={item} />
            <button type="button" className={`feed-action${comments ? ' is-open' : ''}`} aria-expanded={comments} title="Comments"
                onClick={() => { if (state.user || api.requireAccount?.('Sign in to read and write comments.')) onComments(); }}>
                <Icon name="message-circle" size={18} /><span>{Number(item.comment_count || 0)}</span>
            </button>
            <RepostButton item={item} />
        </div>
    );
}

// ==================== a published Fakemon ====================
// Instagram's order: who posted it, the picture, the actions, then the words.

export function MonFeedCard({ item }: { item: FeedItem }) {
    const ref = useImpression(`mon:${item.id}`);
    const [comments, setComments] = useState(false);
    const mon = item.fakemon_data || {};
    const evo = evoBadgeLabel(item);
    // the link opens it; this only counts the open for the feed's ranking
    const opened = () => api.recordOpened?.(item.id, item.user_id);
    return (
        <article className="feed-card feed-card-mon" ref={ref as any} {...modContext(modTarget(item))}>
            <Byline item={item} verb="published a Fakémon" to={monPath(item.id)} />
            <Link to={monPath(item.id)} className="feed-mon-art-btn" onClick={opened} aria-label={`Open ${mon.name || 'this Fakémon'}`}>
                <LazyArt row={item as any} className="feed-mon-art" full>{evo && <span className="community-card-evo-badge">{evo}</span>}</LazyArt>
            </Link>
            <FeedActions item={item} comments={comments} onComments={() => setComments(v => !v)} />
            <div className="feed-mon-body">
                <div className="feed-mon-title">
                    <Link to={monPath(item.id)} className="feed-mon-name" onClick={opened}>{mon.name || 'Unnamed'}</Link>
                    {mon.number && <span className="feed-mon-number">{mon.number}</span>}
                    <TypeBadges type1={mon.type1} type2={mon.type2} />
                </div>
                {mon.species && <div className="feed-mon-species">The {mon.species}</div>}
                {item.caption && <p className="feed-mon-caption">{item.caption}</p>}
            </div>
            {comments && <InlineComments kind="mon" item={item} targetName={mon.name || 'your Fakémon'} />}
        </article>
    );
}

const postPath = (id: string) => `post/${encodeURIComponent(id)}`;

// ==================== a post ====================

/** The Fakemon a post shows off, as a small gallery. */
export function PostMons({ mons }: { mons: any[] }) {
    if (!mons?.length) return null;
    const many = mons.length > 1;
    return (
        <div className={`post-mons post-mons-${Math.min(mons.length, 4)}${many ? ' is-many' : ''}`}>
            {mons.map(m => {
                const row = { id: m.id, fakemon_data: { name: m.name, type1: m.type1, type2: m.type2 } };
                return (
                    <Link key={m.id} to={monPath(m.id)} className="post-mon" title={`Open ${m.name || 'this Fakémon'}`}>
                        <LazyArt row={row as any} className="post-mon-art" full />
                        <span className="post-mon-label">
                            <strong>{m.name || 'Unnamed'}</strong>
                            <span className="post-mon-types">
                                {[m.type1, m.type2].filter(Boolean).map(t => <span key={t} className={`type-badge type-${String(t).toLowerCase()}`}>{t}</span>)}
                            </span>
                        </span>
                    </Link>
                );
            })}
        </div>
    );
}

/** What a share-with-your-thoughts shows of its original: a small card you can open. */
export function RepostEmbed({ item }: { item: any }) {
    if (!item || item.missing) return <div className="repost-embed is-missing"><Icon name="no-symbol" size={16} /> This is no longer available.</div>;
    if (item.kind === 'event') return <EventEmbed item={item} />;
    const name = item.author_name || 'Someone';
    if (item.kind === 'mon') {
        const mon = item.fakemon_data || {};
        return (
            <Link to={monPath(item.id)} className="repost-embed is-mon">
                <LazyArt row={item} className="repost-embed-art" />
                <span className="repost-embed-text">
                    <span className="repost-embed-by"><Avatar userId={item.user_id} url={item.author_avatar_url} name={name} className="feed-avatar feed-avatar-xs" />{name}</span>
                    <strong>{mon.name || 'Unnamed'}</strong>
                    <TypeBadges type1={mon.type1} type2={mon.type2} />
                </span>
            </Link>
        );
    }
    return (
        // a card, not one link: its words can hold @name and #tag links of their own
        <div className="repost-embed is-post" onClick={e => openCard(e, postPath(item.id))}>
            <span className="repost-embed-by">
                <Avatar userId={item.user_id} url={item.author_avatar_url} name={name} className="feed-avatar feed-avatar-xs" />{name}
                <Link to={postPath(item.id)}><time dateTime={item.created_at}>{timeAgo(item.created_at)}</time></Link>
            </span>
            {item.body && <div className="post-body is-clamped repost-embed-body"><RichText text={item.body} /></div>}
            {(item.mons || []).length > 0 && <span className="repost-embed-mons">{(item.mons || []).map((m: any) => m.name).filter(Boolean).join(' · ')}</span>}
        </div>
    );
}

const EVENT_STAGE: Record<string, string> = { upcoming: 'Opens soon', open: 'Taking entries', closed: 'Entries closed', voting: 'Voting', tallying: 'Results soon', ended: 'Ended' };

/** The events a post shows, each as a small card that opens it. */
export function PostEvents({ events }: { events?: any[] }) {
    if (!events?.length) return null;
    return <div className="post-events">{events.map(e => <EventEmbed key={e.id} item={e} />)}</div>;
}

/** A shared event (js/features/events.ts): its cover, name and where it's at; opens the event. */
function EventEmbed({ item }: { item: any }) {
    return (
        <Link to={`events/${encodeURIComponent(item.slug || item.id)}`} className="repost-embed is-event">
            <span className="repost-embed-event-art">{item.cover_image ? <img src={item.cover_image} alt="" loading="lazy" draggable={false} /> : <Icon name="trophy" size={24} />}</span>
            <span className="repost-embed-text">
                <span className="repost-embed-event-meta"><Icon name="calendar-days" size={13} />Event{item.category ? ` · ${item.category}` : ''} · {EVENT_STAGE[item.stage] || 'Event'}</span>
                <strong>{item.title}</strong>
                {item.tagline && <span className="repost-embed-event-tagline">{item.tagline}</span>}
                {item.entry_count != null && <span className="repost-embed-event-meta">{item.entry_count} {Number(item.entry_count) === 1 ? 'entry' : 'entries'}</span>}
            </span>
        </Link>
    );
}

/**
 * A post's words. In the feed they're clamped to a few lines; "Keep reading"
 * shows when they're cut, either by the clamp (measured, since it depends on
 * the width) or by the server (a very long post), and opens the rest in place.
 * Only a post the server cut short goes to its own page for the rest.
 */
function PostBody({ item, full, onOpen }: { item: FeedItem; full: boolean; onOpen: () => void }) {
    const box = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [clamped, setClamped] = useState(false);
    const clamp = !full && !expanded;
    useEffect(() => {
        const el = box.current?.querySelector('.rich-text') as HTMLElement | null;
        if (!el || !clamp) { setClamped(false); return; }
        const measure = () => setClamped(el.scrollHeight - el.clientHeight > 2);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [item.body, clamp]);
    const more = !full && (clamped || !!item.truncated);
    const readMore = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (item.truncated && (expanded || !clamped)) { onOpen(); return; }
        setExpanded(true);
    };
    return (
        <div ref={box} className={`post-body${clamp ? ' is-clamped' : ''}`}
            onClick={e => { if (!full && !expanded && !(e.target as HTMLElement).closest('a, button, .rt-spoiler')) { if (clamped) setExpanded(true); else if (item.truncated || state.user) onOpen(); } }}>
            <RichText text={item.body || ""} />
            {more && <button type="button" className="post-more" onClick={readMore}>Keep reading</button>}
        </div>
    );
}

export function PostFeedCard({ item, full = false }: { item: FeedItem; full?: boolean }) {
    const ref = useImpression(`post:${item.id}`);
    const isMine = !!state.user && state.user.id === item.user_id;
    // group moderators remove posts in their group too
    const groupMod = !!item.group && !!api.canModerateGroup?.(item.group.id);
    const canDelete = isMine || !!api.isStaff?.() || groupMod;
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(item.body || '');
    const [menu, setMenu] = useState(false);
    // the full post page still has its own link; comments open right here
    const [comments, setComments] = useState(full);
    const open = () => api.openPath(postPath(item.id));
    const verb = item.repost ? 'shared' : (item.mon_ids || []).length ? `shared ${(item.mon_ids || []).length} Fakémon`
        : (item.events || []).length ? `shared ${(item.events || []).length === 1 ? 'an event' : `${item.events.length} events`}` : '';
    return (
        <article className={`feed-card feed-card-post${full ? ' is-full' : ''}`} ref={ref as any} {...modContext(modTarget(item))}>
            <div className="feed-card-head">
                <Byline item={item} verb={verb} to={full ? undefined : postPath(item.id)} />
                {(isMine || canDelete || state.user) && (
                    <div className="feed-menu-wrap">
                        <button type="button" className="feed-menu-btn" aria-label="Post options" onClick={() => setMenu(v => !v)}><Icon name="ellipsis-horizontal" size={18} /></button>
                        {menu && (
                            <div className="feed-menu" onMouseLeave={() => setMenu(false)}>
                                {isMine && <button type="button" onClick={() => { setMenu(false); setDraft(item.body || ''); setEditing(true); }}><Icon name="pencil" size={14} /> Edit</button>}
                                {isMine && <button type="button" onClick={() => { setMenu(false); openCommentControls('post', item.id); }}><Icon name="chat-bubble-left-right" size={14} /> Who can comment</button>}
                                {isMine && api.isBusiness?.() && <button type="button" onClick={() => { setMenu(false); api.togglePin(item.id); }}><Icon name="pin" size={14} /> {api.isPinned(item.id) ? 'Unpin from profile' : 'Pin to profile'}</button>}
                                <button type="button" onClick={() => { setMenu(false); api.copyPostLink(item.id); }}><Icon name="link" size={14} /> Copy link</button>
                                {!isMine && state.user && <button type="button" onClick={() => { setMenu(false); openReportDialog('post', item.id, null, item.author_name || ''); }}><Icon name="flag" size={14} /> Report</button>}
                                {canDelete && <button type="button" className="is-danger" onClick={() => { setMenu(false); api.deletePost(item.id); }}><Icon name="trash-2" size={14} /> {isMine ? 'Delete' : groupMod && !api.isStaff?.() ? 'Remove from group' : 'Remove (staff)'}</button>}
                            </div>
                        )}
                    </div>
                )}
            </div>
            {editing ? (
                <div className="post-edit">
                    <EmojiInput value={draft} onChange={setDraft} maxLength={4000} rows={4} autoFocus toolbar />
                    <div className="post-edit-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={async () => { if (await api.editPost(item.id, draft)) setEditing(false); }}>Save</button>
                    </div>
                </div>
            ) : item.body ? (
                <PostBody item={item} full={full} onOpen={open} />
            ) : null}
            <PostMons mons={item.mons || []} />
            <PostEvents events={item.events} />
            <PollView kind="post" parentId={item.id} />
            {item.repost && <div className="repost-embed-wrap"><RepostEmbed item={item.repost} /></div>}
            {(item.tags || []).length > 0 && (
                <div className="post-tags">{(item.tags || []).map((t: string) => (
                    <Link key={t} to={`search?q=${encodeURIComponent('#' + t)}`} className="post-tag" title={`Posts tagged #${t}`}>#{t}</Link>
                ))}</div>
            )}
            <FeedActions item={item} comments={comments} onComments={() => setComments(v => !v)} />
            {comments && <InlineComments kind="post" item={item} />}
        </article>
    );
}

/** A plain repost (no words of its own): the original's own card, under who reposted it. */
function RepostedCard({ item }: { item: FeedItem }) {
    const mine = !!state.user && state.user.id === item.user_id;
    const original = item.repost;
    return (
        <div className="reposted">
            <div className="reposted-by">
                <Icon name="arrow-path-rounded-square" size={15} />
                <Link to={`profile/${item.user_id}`} className="link-btn">{mine ? 'You' : item.author_name || 'Someone'}</Link>
                <span>reposted · {timeAgo(item.created_at)}</span>
            </div>
            {original.kind === 'mon' ? <MonFeedCard item={original} />
                : original.kind === 'event' ? <div className="feed-card feed-event-card"><RepostEmbed item={original} /></div>
                : <PostFeedCard item={original} />}
        </div>
    );
}

export function FeedCard({ item }: { item: FeedItem }) {
    if (item.kind === 'mon') return <MonFeedCard item={item} />;
    const plain = item.repost && !item.repost.missing && !item.body && !(item.mon_ids || []).length && !(item.events || []).length;
    return plain ? <RepostedCard item={item} /> : <PostFeedCard item={item} />;
}

// ==================== sharing with your thoughts ====================

/** text: words to start from (an event's results post, say) */
function QuoteRepostDialog({ close, item, text: initial = '' }: DialogProps<{ item: any; text?: string }>) {
    const [text, setText] = useState(initial);
    const [busy, setBusy] = useState(false);
    async function share() {
        if (busy) return;
        setBusy(true);
        const ok = await api.quoteRepost(item, text);
        setBusy(false);
        if (ok) close();
    }
    return (
        <Modal onClose={close} title="Share with your thoughts" className="quote-repost-modal">
            <EmojiInput value={text} onChange={setText} maxLength={4000} rows={3} autoFocus toolbar placeholder="Say something about it…" ariaLabel="What you want to say" />
            <RepostEmbed item={item} />
            <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={share}>{busy ? 'Sharing…' : 'Share'}</button>
            </div>
        </Modal>
    );
}
registerDialog('quote-repost', QuoteRepostDialog);

export function FeedSkeleton({ count = 3 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }, (_, i) => (
                <div className="feed-card skel-card" key={i}>
                    <div className="feed-byline"><span className="feed-avatar skel skel-circle" /><span className="skel skel-text" style={{ width: 140 }} /></div>
                    <div className="feed-mon-art skel" style={{ aspectRatio: i % 2 ? '16 / 7' : '4 / 3' }} />
                    <div className="feed-mon-body"><span className="skel skel-text" style={{ width: '60%' }} /><span className="skel skel-text" style={{ width: '40%' }} /></div>
                </div>
            ))}
        </>
    );
}

// ==================== writing a post ====================

/**
 * Writes a post. On a group's page it posts there (group); on the home feed
 * you can pick one of your groups, or everyone.
 */
export function PostComposer({ onPosted, group }: { onPosted?: () => void; group?: { id: string; name: string } }) {
    const [open, setOpen] = useState(false);
    const [where, setWhere] = useState('');
    const [text, setText] = useState('');
    const [mons, setMons] = useState<any[]>([]);
    const [evs, setEvs] = useState<any[]>([]);
    const [poll, setPoll] = useState<PollDraft | null>(null);
    const [busy, setBusy] = useState(false);
    const user = state.user;
    if (!user) return null;
    const name = user.displayName || user.username || 'you';
    async function post() {
        if (busy) return;
        setBusy(true);
        const id = await api.createPost({ body: text, monIds: mons.map(m => m.id), eventIds: evs.map(e => e.id), poll, groupId: group?.id || where || null });
        setBusy(false);
        if (id) { setText(''); setMons([]); setEvs([]); setPoll(null); setOpen(false); onPosted?.(); }
    }
    if (!open) {
        return (
            <div className="post-composer is-collapsed">
                <Avatar userId={user.id} url={user.avatarUrl} name={name} className="feed-avatar" />
                <button type="button" className="post-composer-prompt" onClick={() => setOpen(true)}>{group ? `Post in ${group.name}` : `What are you making, ${name.split(' ')[0]}?`}</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOpen(true); openDialog('pick-post-mons', { selected: mons, onDone: setMons }); }}>
                    <Icon name="sparkles" size={14} /> Show off Fakémon
                </button>
            </div>
        );
    }
    return (
        <div className="post-composer">
            <div className="post-composer-top">
                <Avatar userId={user.id} url={user.avatarUrl} name={name} className="feed-avatar" />
                <strong>{name}</strong>
                {group ? (
                    <span className="post-composer-where"><Icon name="chevron-right" size={12} /> {group.name}</span>
                ) : (api.myGroups?.() || []).length > 0 && (
                    <select className="post-composer-where-pick" value={where} onChange={e => setWhere(e.target.value)} aria-label="Where to post">
                        <option value="">Everyone</option>
                        {api.myGroups().map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                )}
            </div>
            <EmojiInput value={text} onChange={setText} maxLength={4000} rows={4} autoFocus toolbar
                placeholder="Say something! Use #tags, @mentions and :emojis: (try typing :sob or :tatsu)" />
            {poll && <PollEditor value={poll} onChange={setPoll} onRemove={() => setPoll(null)} />}
            {(mons.length > 0 || evs.length > 0) && (
                <div className="post-composer-mons">
                    {mons.map(m => (
                        <span key={m.id} className="post-composer-mon">
                            {m.name}
                            <button type="button" aria-label={`Remove ${m.name}`} onClick={() => setMons(mons.filter(x => x.id !== m.id))}><Icon name="x" size={12} /></button>
                        </span>
                    ))}
                    {evs.map(e => (
                        <span key={e.id} className="post-composer-mon is-event">
                            <Icon name="trophy" size={12} />{e.title}
                            <button type="button" aria-label={`Remove ${e.title}`} onClick={() => setEvs(evs.filter(x => x.id !== e.id))}><Icon name="x" size={12} /></button>
                        </span>
                    ))}
                </div>
            )}
            <div className="post-composer-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDialog('pick-post-mons', { selected: mons, onDone: setMons })}>
                    <Icon name="sparkles" size={14} /> {mons.length ? `Fakémon (${mons.length})` : 'Add Fakémon'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDialog('pick-post-events', { selected: evs, onDone: setEvs })}>
                    <Icon name="trophy" size={14} /> {evs.length ? `Events (${evs.length})` : 'Add event'}
                </button>
                {!poll && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPoll(emptyPoll())}><Icon name="chart-bar" size={14} /> Poll</button>}
                <span className="post-composer-count">{text.length}/4000</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); }}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || (!text.trim() && !mons.length && !evs.length && !poll)} onClick={post}>{busy ? 'Posting…' : 'Post'}</button>
            </div>
        </div>
    );
}

// ==================== which Fakemon go in a post ====================

function PickPostMons({ close, selected, onDone }: DialogProps<{ selected: any[]; onDone: (mons: any[]) => void }>) {
    const [mine, setMine] = useState<any[] | null>(null);
    const [picked, setPicked] = useState<Map<string, any>>(() => new Map((selected || []).map(m => [m.id, m])));
    const [query, setQuery] = useState('');
    useEffect(() => {
        let live = true;
        (async () => {
            const client = await api.getClient();
            const { data } = await client.from('published_mons')
                .select('id, published_at, fakemon_data->>name, fakemon_data->>type1, fakemon_data->>type2')
                .eq('user_id', state.user!.id).order('published_at', { ascending: false }).limit(100);
            if (live) setMine(data || []);
        })();
        return () => { live = false; };
    }, []);
    const toggle = (m: any) => {
        const next = new Map(picked);
        if (next.has(m.id)) next.delete(m.id);
        else if (next.size < 12) next.set(m.id, m);
        else api.showToast?.('Up to 12 Fakémon per post.', 'warning');
        setPicked(next);
    };
    const list = (mine || []).filter(m => !query || String(m.name || '').toLowerCase().includes(query.toLowerCase()));
    return (
        <Modal onClose={close} title="Show off your Fakémon" className="pick-post-mons">
            <p className="field-hint">Pick from what you've published to the hub (up to 12). Haven't published one yet? Publish it from your collection first.</p>
            <input type="search" placeholder="Find one…" value={query} onChange={e => setQuery(e.target.value)} />
            <div className="pick-post-mons-grid">
                {mine === null ? <SkeletonRows count={3} avatar />
                    : !list.length ? <div className="community-empty">{mine.length ? 'Nothing matches.' : 'You haven’t published any Fakémon yet.'}</div>
                    : list.map(m => (
                        <button type="button" key={m.id} className={`pick-post-mon${picked.has(m.id) ? ' is-picked' : ''}`} onClick={() => toggle(m)} aria-pressed={picked.has(m.id)}>
                            <LazyArt row={{ id: m.id, fakemon_data: { name: m.name } } as any} className="pick-post-mon-art" />
                            <span>{m.name || 'Unnamed'}</span>
                            {picked.has(m.id) && <span className="pick-post-mon-check"><Icon name="check" size={14} /></span>}
                        </button>
                    ))}
            </div>
            <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => { onDone([...picked.values()]); close(); }}>Done ({picked.size})</button>
            </div>
        </Modal>
    );
}
registerDialog('pick-post-mons', PickPostMons);

// ==================== which events go in a post ====================

const POST_EVENTS_MAX = 4;

/** Any live event (not a draft) can go in a post: yours to promote, or one you're entering. */
function PickPostEvents({ close, selected, onDone }: DialogProps<{ selected: any[]; onDone: (evs: any[]) => void }>) {
    const [list, setList] = useState<any[] | null>(null);
    const [picked, setPicked] = useState<Map<string, any>>(() => new Map((selected || []).map(e => [e.id, e])));
    const [query, setQuery] = useState('');
    useEffect(() => {
        let live = true;
        fetchEvents().then(rows => { if (live) setList(rows.filter(e => e.phase !== 'draft')); }).catch(() => { if (live) setList([]); });
        return () => { live = false; };
    }, []);
    const toggle = (e: any) => {
        const next = new Map(picked);
        if (next.has(e.id)) next.delete(e.id);
        else if (next.size < POST_EVENTS_MAX) next.set(e.id, { id: e.id, title: e.title });
        else api.showToast?.(`Up to ${POST_EVENTS_MAX} events per post.`, 'warning');
        setPicked(next);
    };
    const q = query.trim().toLowerCase();
    const shown = (list || []).filter(e => !q || [e.title, e.tagline, e.category].some(x => String(x || '').toLowerCase().includes(q)));
    return (
        <Modal onClose={close} title="Link an event" className="pick-post-mons pick-post-events">
            <p className="field-hint">People can open it straight from your post (up to {POST_EVENTS_MAX}).</p>
            <input type="search" placeholder="Find one…" value={query} onChange={e => setQuery(e.target.value)} />
            <div className="pick-post-events-list">
                {list === null ? <SkeletonRows count={4} avatar />
                    : !shown.length ? <div className="community-empty">{list.length ? 'Nothing matches.' : 'There are no live events yet.'}</div>
                    : shown.map(e => (
                        <button type="button" key={e.id} className={`pick-post-event${picked.has(e.id) ? ' is-picked' : ''}`} onClick={() => toggle(e)} aria-pressed={picked.has(e.id)}>
                            <span className="pick-post-event-art">{e.cover_thumb ? <img src={e.cover_thumb} alt="" loading="lazy" draggable={false} /> : <Icon name="trophy" size={20} />}</span>
                            <span className="pick-post-event-text"><strong>{e.title}</strong><small>{[e.category, STAGE_LABEL[effectivePhase(e)]].filter(Boolean).join(' · ')}</small></span>
                            {picked.has(e.id) && <span className="pick-post-mon-check"><Icon name="check" size={14} /></span>}
                        </button>
                    ))}
            </div>
            <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => { onDone([...picked.values()]); close(); }}>Done ({picked.size})</button>
            </div>
        </Modal>
    );
}
registerDialog('pick-post-events', PickPostEvents);
