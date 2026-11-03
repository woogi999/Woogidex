// The hub's Groups panel: the list of groups (yours, and ones to discover),
// a new group's form, and one group's page (posts, about, members), laid out
// like a Facebook group with Reddit's sorting and rules. Data and actions:
// js/features/groups.ts. CSS: core css/groups.css.

import { useEffect, useRef, useState } from 'react';
import { api, state } from '../../core/app.ts';
import { Icon } from './Icon.tsx';
import { Avatar } from './Avatar.tsx';
import { Modal } from './Modal.tsx';
import { FeedCard, FeedSkeleton, PostComposer, timeAgo } from './feed.tsx';
import { registerDialog, openDialog, type DialogProps } from '../dialogs.tsx';
import { SkeletonRows } from './Skeleton.tsx';
import { staggerIn } from '../../core/motion.ts';
import type { Group, GroupDraft, GroupTab, GroupSort, Member, MemberAction } from '../../features/groups.ts';

const COLORS = ['', '#e0245e', '#f08030', '#d4a017', '#2d8a3e', '#1f9eb3', '#2c5aa0', '#55607a'];

/** The group's own color, or the site accent. */
const tint = (g: Pick<Group, 'color'>) => ({ '--group': g.color || 'var(--accent)' } as React.CSSProperties);

export function GroupsPanel() {
    const v = api.groupsState().view;
    if (v.kind === 'new') return <NewGroup />;
    if (v.kind === 'group') return <GroupPage slug={v.slug} tab={v.tab} />;
    return <GroupList />;
}

/** A group's letter tile: the first letter on the group's color. */
export function GroupTile({ group, size = 'md' }: { group: Pick<Group, 'name' | 'color'>; size?: 'sm' | 'md' | 'lg' }) {
    return <span className={`group-tile group-tile-${size}`} style={tint(group)} aria-hidden="true">{(group.name || '?').trim().charAt(0).toUpperCase()}</span>;
}

const memberLabel = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'member' : 'members'}`;

// ==================== the list ====================

function GroupList() {
    const s = api.groupsState();
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const mineIds = new Set<string>([...s.mine.values()].filter((m: any) => m.status === 'active' || m.status === 'pending').map((m: any) => m.group_id));
    const all: Group[] = s.list.items.filter((g: Group) => !q || `${g.name} ${g.description} ${g.slug}`.toLowerCase().includes(q));
    const mine = all.filter(g => mineIds.has(g.id));
    const discover = all.filter(g => !mineIds.has(g.id));
    return (
        <div className="groups">
            <header className="groups-head">
                <div>
                    <h2>Groups</h2>
                    <p>Find your people: art clubs, regional dex projects, battle teams and more.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => api.showGroupView({ kind: 'new' })}><Icon name="plus" size={16} /> Create group</button>
            </header>
            <input type="search" className="groups-search" placeholder="Search groups" aria-label="Search groups" value={query} onChange={e => setQuery(e.target.value)} />
            {s.list.error && <div className="feed-empty"><Icon name="exclamation-triangle" size={20} /><p>{s.list.error}</p></div>}
            {!s.list.loaded && s.list.loading && <SkeletonRows count={5} avatar label="Loading groups" />}
            {s.list.loaded && (
                <>
                    {mine.length > 0 && (
                        <section className="groups-section">
                            <h3>Your groups</h3>
                            <div className="groups-rows">{mine.map(g => <GroupRow key={g.id} group={g} />)}</div>
                        </section>
                    )}
                    <section className="groups-section">
                        <h3>{mine.length ? 'Discover' : 'Popular groups'}</h3>
                        {discover.length
                            ? <div className="groups-rows">{discover.map(g => <GroupRow key={g.id} group={g} />)}</div>
                            : <div className="feed-empty"><Icon name="user-group" size={26} /><p>{q ? 'No groups match that.' : 'No groups yet. Make the first one!'}</p></div>}
                    </section>
                </>
            )}
        </div>
    );
}

function GroupRow({ group }: { group: Group }) {
    const status = api.myGroupStatus(group.id);
    return (
        <div className="group-row" style={tint(group)}>
            <button type="button" className="group-row-main" onClick={() => api.showGroupView({ kind: 'group', slug: group.slug, tab: 'posts' })}>
                <GroupTile group={group} />
                <span className="group-row-text">
                    <strong>{group.name}</strong>
                    <small>
                        <Icon name={group.visibility === 'private' ? 'lock-closed' : 'globe-alt'} size={12} />
                        {group.visibility === 'private' ? 'Private' : 'Public'} · {memberLabel(group.member_count)} · {group.post_count} posts
                    </small>
                    {group.description && <span className="group-row-desc">{group.description}</span>}
                </span>
            </button>
            <JoinButton group={group} status={status} compact />
        </div>
    );
}

function JoinButton({ group, status, compact }: { group: Group; status: string | null; compact?: boolean }) {
    const [busy, setBusy] = useState(false);
    const run = async (fn: () => Promise<unknown>) => { setBusy(true); await fn(); setBusy(false); };
    if (status === 'banned') return <span className="group-status-chip">Banned</span>;
    if (status === 'active') {
        if (compact) return <span className="group-status-chip is-in"><Icon name="check" size={12} /> Joined</span>;
        return api.myGroupRole(group.id) === 'owner'
            ? <span className="group-status-chip is-in"><Icon name="star" size={12} /> Owner</span>
            : <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => api.leaveGroup(group))}><Icon name="check" size={14} /> Joined</button>;
    }
    if (status === 'pending') return <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => api.leaveGroup(group))}>Requested</button>;
    return (
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => api.joinGroup(group))}>
            {group.visibility === 'private' ? 'Ask to join' : 'Join'}
        </button>
    );
}

// ==================== a new group ====================

function NewGroup() {
    const [d, setD] = useState<GroupDraft>({ name: '', slug: '', description: '', rules: '', visibility: 'public', color: '' });
    const [slugTouched, setSlugTouched] = useState(false);
    const [busy, setBusy] = useState(false);
    const set = (patch: Partial<GroupDraft>) => setD(cur => ({ ...cur, ...patch }));
    const slugOk = api.SLUG_PATTERN.test(d.slug);
    const nameOk = d.name.trim().length >= 3;
    async function submit() {
        if (busy || !slugOk || !nameOk) return;
        setBusy(true);
        await api.createGroup(d);
        setBusy(false);
    }
    return (
        <div className="groups groups-new">
            <button type="button" className="link-btn groups-back" onClick={() => api.showGroupView({ kind: 'list' })}><Icon name="arrow-left" size={14} /> All groups</button>
            <div className="groups-new-grid">
                <form className="groups-form" onSubmit={e => { e.preventDefault(); submit(); }}>
                    <h2>Create a group</h2>
                    <GroupFields d={d} set={set} />
                    <div className="form-group">
                        <label htmlFor="group-slug">Address</label>
                        <div className="groups-slug">
                            <span>/groups/</span>
                            <input id="group-slug" type="text" value={d.slug} maxLength={32} autoComplete="off" spellCheck={false}
                                onChange={e => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }); }}
                                onFocus={() => { if (!slugTouched && !d.slug) set({ slug: api.slugFromName(d.name) }); }} />
                        </div>
                        <p className="field-hint">{d.slug && !slugOk ? '3 to 32 letters, numbers or dashes, with no dash at the start or end.' : 'The link to your group. You cannot change it later.'}</p>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => api.showGroupView({ kind: 'list' })}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={busy || !slugOk || !nameOk}>{busy ? 'Creating…' : 'Create group'}</button>
                    </div>
                </form>
                <aside className="groups-preview" aria-label="Preview">
                    <span className="groups-preview-label">Preview</span>
                    <div className="group-cover is-preview" style={tint(d)} />
                    <div className="group-preview-body">
                        <GroupTile group={{ name: d.name || 'Group', color: d.color }} size="lg" />
                        <strong>{d.name || 'Group name'}</strong>
                        <small><Icon name={d.visibility === 'private' ? 'lock-closed' : 'globe-alt'} size={12} /> {d.visibility === 'private' ? 'Private' : 'Public'} group · 1 member</small>
                        {d.description && <p>{d.description}</p>}
                    </div>
                </aside>
            </div>
        </div>
    );
}

/** Name, description, privacy, rules and color: shared by the new-group form and the settings dialog. */
function GroupFields({ d, set, lockVisibility }: { d: Omit<GroupDraft, 'slug'>; set: (p: Partial<GroupDraft>) => void; lockVisibility?: boolean }) {
    return (
        <>
            <div className="form-group">
                <label htmlFor="group-name">Name</label>
                <input id="group-name" type="text" value={d.name} maxLength={50} placeholder="Regional Dex Makers" autoFocus
                    onChange={e => set({ name: e.target.value })} />
            </div>
            <div className="form-group">
                <label htmlFor="group-desc">What is it about? <span className="label-optional">(optional)</span></label>
                <textarea id="group-desc" rows={3} maxLength={500} value={d.description} onChange={e => set({ description: e.target.value })} />
            </div>
            <fieldset className="form-group groups-privacy" disabled={lockVisibility}>
                <legend>Who can see it</legend>
                {([['public', 'globe-alt', 'Public', 'Anyone can see the posts and join.'],
                    ['private', 'lock-closed', 'Private', 'Anyone can find the group, but only members see the posts. A moderator lets each person in.']] as const).map(([key, icon, label, desc]) => (
                    <label key={key} className={`groups-privacy-opt${d.visibility === key ? ' is-on' : ''}`}>
                        <input type="radio" name="group-visibility" value={key} checked={d.visibility === key} onChange={() => set({ visibility: key })} />
                        <Icon name={icon} size={18} />
                        <span><strong>{label}</strong><small>{desc}</small></span>
                    </label>
                ))}
                {lockVisibility && <p className="field-hint">Only the owner can change this.</p>}
            </fieldset>
            <div className="form-group">
                <label htmlFor="group-rules">Rules <span className="label-optional">(one a line, optional)</span></label>
                <textarea id="group-rules" rows={4} maxLength={2000} value={d.rules} placeholder={'Be kind\nCredit the artist\nNo AI art'}
                    onChange={e => set({ rules: e.target.value })} />
            </div>
            <div className="form-group">
                <span className="groups-color-label">Color</span>
                <div className="groups-colors" role="radiogroup" aria-label="Group color">
                    {COLORS.map(c => (
                        <button key={c || 'accent'} type="button" role="radio" aria-checked={d.color === c} aria-label={c || 'Site color'}
                            className={`groups-color${d.color === c ? ' is-on' : ''}`} style={{ background: c || 'var(--accent)' }} onClick={() => set({ color: c })} />
                    ))}
                </div>
            </div>
        </>
    );
}

// ==================== one group ====================

function GroupPage({ slug, tab }: { slug: string; tab: GroupTab }) {
    const s = api.groupsState();
    const entry = s.bySlug[slug];
    const group: Group | null = entry?.group || null;
    if (!group) {
        if (entry?.error) {
            return (
                <div className="groups">
                    <div className="feed-empty"><Icon name="exclamation-triangle" size={24} /><p>{entry.error}</p>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.showGroupView({ kind: 'list' })}>All groups</button></div>
                </div>
            );
        }
        return <div className="groups"><div className="group-cover skel" /><SkeletonRows count={4} avatar label="Loading the group" /></div>;
    }
    const status = api.myGroupStatus(group.id);
    const member = status === 'active';
    const canSee = group.visibility === 'public' || member || !!api.isStaff?.();
    const mod = api.canModerateGroup(group.id);
    const go = (t: GroupTab) => api.showGroupView({ kind: 'group', slug, tab: t });
    return (
        <div className="groups group-page" style={tint(group)}>
            <button type="button" className="link-btn groups-back" onClick={() => api.showGroupView({ kind: 'list' })}><Icon name="arrow-left" size={14} /> All groups</button>
            <div className="group-cover" />
            <header className="group-head">
                <GroupTile group={group} size="lg" />
                <div className="group-head-text">
                    <h1>{group.name}</h1>
                    <p>
                        <Icon name={group.visibility === 'private' ? 'lock-closed' : 'globe-alt'} size={13} />
                        {group.visibility === 'private' ? 'Private group' : 'Public group'} · {memberLabel(group.member_count)}
                    </p>
                </div>
                <div className="group-head-actions">
                    <JoinButton group={group} status={status} />
                    <button type="button" className="btn btn-secondary btn-sm" title="Copy link" aria-label="Copy the group link"
                        onClick={() => { navigator.clipboard?.writeText(api.groupShareUrl(group)); api.showToast?.('Link copied.', 'success'); }}>
                        <Icon name="link" size={14} />
                    </button>
                    {mod && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDialog('group-settings', { group })}><Icon name="cog-6-tooth" size={14} /> Manage</button>}
                </div>
            </header>
            <nav className="tabs group-tabs" role="tablist" aria-label="Group">
                {(['posts', 'about', 'members'] as GroupTab[]).map(t => (
                    <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => go(t)}>
                        {t === 'posts' ? 'Posts' : t === 'about' ? 'About' : 'Members'}
                    </button>
                ))}
            </nav>
            <div className="group-body">
                <div className="group-main">
                    {tab === 'posts' && (canSee ? <GroupPosts group={group} member={member} /> : <PrivateNotice group={group} status={status} />)}
                    {tab === 'about' && <GroupAbout group={group} />}
                    {tab === 'members' && (canSee ? <GroupMembers group={group} /> : <PrivateNotice group={group} status={status} />)}
                </div>
                {tab !== 'about' && (
                    <aside className="group-side" aria-label="About this group">
                        <GroupAbout group={group} compact />
                    </aside>
                )}
            </div>
        </div>
    );
}

function PrivateNotice({ group, status }: { group: Group; status: string | null }) {
    return (
        <div className="feed-empty">
            <Icon name="lock-closed" size={26} />
            <p>{status === 'pending'
                ? 'Your request is in. A moderator will let you in soon.'
                : `${group.name} is private. Join it to see the posts and the members.`}</p>
        </div>
    );
}

function GroupPosts({ group, member }: { group: Group; member: boolean }) {
    const f = api.groupsState().feeds[group.id] || { items: [], loading: true, hasMore: false, sort: 'new', error: '' };
    const sentinel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = sentinel.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting) && f.hasMore && !f.loading) api.loadGroupFeed(group.id, { older: true });
        }, { rootMargin: '600px' });
        io.observe(el);
        return () => io.disconnect();
    }, [group.id, f.hasMore, f.loading, f.items.length]);
    const sort = (s: GroupSort) => api.loadGroupFeed(group.id, { sort: s });
    const list = useRef<HTMLDivElement>(null);
    const fresh = !f.loading && f.items.length > 0 ? `${f.sort}:${f.items[0]?.id}` : '';
    useEffect(() => { if (fresh && list.current) staggerIn(Array.from(list.current.children)); }, [fresh]);
    return (
        <div className="group-posts">
            {member && <PostComposer group={{ id: group.id, name: group.name }} />}
            <div className="group-sort" role="group" aria-label="Sort posts">
                {([['new', 'clock', 'New'], ['top', 'arrow-trending-up', 'Top this month']] as const).map(([key, icon, label]) => (
                    <button key={key} type="button" className={`group-sort-btn${f.sort === key ? ' active' : ''}`} aria-pressed={f.sort === key} onClick={() => sort(key)}>
                        <Icon name={icon} size={14} /> {label}
                    </button>
                ))}
            </div>
            <div className="feed-list" ref={list}>
                {f.error && <div className="feed-empty"><Icon name="exclamation-triangle" size={20} /><p>{f.error}</p></div>}
                {!f.items.length && f.loading && <FeedSkeleton />}
                {!f.items.length && !f.loading && !f.error && (
                    <div className="feed-empty"><Icon name="chat-bubble-left-right" size={26} /><p>{member ? 'No posts yet. Start the first conversation!' : 'No posts yet.'}</p></div>
                )}
                {f.items.map((item: any) => <FeedCard key={`${item.kind}:${item.id}`} item={item} />)}
            </div>
            <div ref={sentinel} className="feed-sentinel" />
            {f.loading && f.items.length > 0 && <FeedSkeleton count={1} />}
        </div>
    );
}

function GroupAbout({ group, compact }: { group: Group; compact?: boolean }) {
    const rules = group.rules.split('\n').map(r => r.trim()).filter(Boolean);
    return (
        <div className={`group-about${compact ? ' is-compact' : ''}`}>
            <section>
                <h3>About</h3>
                {group.description ? <p className="group-about-desc">{group.description}</p> : !compact && <p className="group-about-desc is-empty">No description yet.</p>}
                <ul className="group-facts">
                    <li><Icon name={group.visibility === 'private' ? 'lock-closed' : 'globe-alt'} size={16} />
                        <span><strong>{group.visibility === 'private' ? 'Private' : 'Public'}</strong>
                            <small>{group.visibility === 'private' ? 'Only members see who is in it and what they post.' : 'Anyone can see who is in it and what they post.'}</small></span></li>
                    <li><Icon name="users" size={16} /><span><strong>{memberLabel(group.member_count)}</strong><small>{group.post_count} posts</small></span></li>
                    <li><Icon name="calendar-days" size={16} /><span><strong>Made {timeAgo(group.created_at)} ago</strong><small>{new Date(group.created_at).toLocaleDateString()}</small></span></li>
                </ul>
            </section>
            {rules.length > 0 && (
                <section>
                    <h3>Rules</h3>
                    <ol className="group-rules">{rules.map((r, i) => <li key={i}>{r}</li>)}</ol>
                </section>
            )}
        </div>
    );
}

// ==================== members ====================

function GroupMembers({ group }: { group: Group }) {
    const m = api.groupsState().members[group.id];
    const mod = api.canModerateGroup(group.id);
    const iAmOwner = api.myGroupRole(group.id) === 'owner' || !!api.isStaff?.();
    if (!m || (m.loading && !m.items.length)) return <SkeletonRows count={6} avatar label="Loading members" />;
    if (m.error) return <div className="feed-empty"><p>{m.error}</p></div>;
    const by = (st: string) => m.items.filter((x: Member) => x.status === st);
    const order = { owner: 0, moderator: 1, member: 2 } as Record<string, number>;
    const active = by('active').sort((a: Member, b: Member) => order[a.role] - order[b.role]);
    return (
        <div className="group-members">
            {mod && by('pending').length > 0 && (
                <section>
                    <h3>Waiting to join <span className="group-count">{by('pending').length}</span></h3>
                    {by('pending').map((x: Member) => (
                        <MemberRow key={x.user_id} m={x}>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => api.moderateMember(group, x.user_id, 'approve')}>Let in</button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.moderateMember(group, x.user_id, 'decline')}>Decline</button>
                        </MemberRow>
                    ))}
                </section>
            )}
            <section>
                <h3>Members <span className="group-count">{active.length}</span></h3>
                {active.map((x: Member) => (
                    <MemberRow key={x.user_id} m={x}>
                        {x.role !== 'member' && <span className={`group-role is-${x.role}`}>{x.role === 'owner' ? 'Owner' : 'Moderator'}</span>}
                        {mod && x.user_id !== state.user?.id && x.role !== 'owner' && (x.role === 'member' || iAmOwner) && (
                            <MemberMenu group={group} m={x} owner={iAmOwner} />
                        )}
                    </MemberRow>
                ))}
            </section>
            {mod && by('banned').length > 0 && (
                <section>
                    <h3>Banned</h3>
                    {by('banned').map((x: Member) => (
                        <MemberRow key={x.user_id} m={x}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.moderateMember(group, x.user_id, 'unban')}>Unban</button>
                        </MemberRow>
                    ))}
                </section>
            )}
        </div>
    );
}

const nameOf = (m: Member) => m.profile?.display_name || m.profile?.username || 'Someone';

function MemberRow({ m, children }: { m: Member; children?: React.ReactNode }) {
    return (
        <div className="group-member">
            <button type="button" className="group-member-main" onClick={() => api.showUserProfile(m.user_id)}>
                <Avatar userId={m.user_id} url={m.profile?.avatar_url} name={nameOf(m)} className="feed-avatar feed-avatar-sm" />
                <span><strong>{nameOf(m)}</strong>{m.profile?.username && <small>@{m.profile.username}</small>}</span>
            </button>
            <span className="group-member-actions">{children}</span>
        </div>
    );
}

function MemberMenu({ group, m, owner }: { group: Group; m: Member; owner: boolean }) {
    const [open, setOpen] = useState(false);
    const act = (a: MemberAction) => { setOpen(false); api.moderateMember(group, m.user_id, a, nameOf(m)); };
    return (
        <div className="feed-menu-wrap group-member-menu">
            <button type="button" className="feed-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${nameOf(m)}`} onClick={() => setOpen(v => !v)}>
                <Icon name="ellipsis-horizontal" size={18} />
            </button>
            {open && (
                <div className="feed-menu feed-menu-right" role="menu" onMouseLeave={() => setOpen(false)}>
                    {owner && m.role === 'member' && <button type="button" role="menuitem" onClick={() => act('make_moderator')}><Icon name="shield-check" size={14} /> Make moderator</button>}
                    {owner && m.role === 'moderator' && <button type="button" role="menuitem" onClick={() => act('make_member')}><Icon name="user" size={14} /> Make member</button>}
                    {owner && <button type="button" role="menuitem" onClick={() => act('make_owner')}><Icon name="star" size={14} /> Make owner</button>}
                    <button type="button" role="menuitem" onClick={() => act('remove')}><Icon name="user-minus" size={14} /> Remove</button>
                    <button type="button" role="menuitem" className="is-danger" onClick={() => act('ban')}><Icon name="no-symbol" size={14} /> Ban</button>
                </div>
            )}
        </div>
    );
}

// ==================== settings ====================

function GroupSettings({ close, group }: DialogProps<{ group: Group }>) {
    const owner = api.myGroupRole(group.id) === 'owner' || !!api.isStaff?.();
    const [d, setD] = useState({ name: group.name, description: group.description, rules: group.rules, visibility: group.visibility, color: group.color });
    const [busy, setBusy] = useState(false);
    const set = (p: Partial<GroupDraft>) => setD(cur => ({ ...cur, ...p }));
    return (
        <Modal onClose={close} title="Manage group" className="groups-settings">
            <form className="groups-form" onSubmit={async e => { e.preventDefault(); setBusy(true); if (await api.updateGroup(group, d)) close(); setBusy(false); }}>
                <GroupFields d={d} set={set} lockVisibility={!owner} />
                <div className="modal-actions">
                    {owner && <button type="button" className="btn btn-danger groups-archive" onClick={() => { close(); api.archiveGroup(group); }}>Archive group</button>}
                    <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={busy || d.name.trim().length < 3}>{busy ? 'Saving…' : 'Save'}</button>
                </div>
            </form>
        </Modal>
    );
}
registerDialog('group-settings', GroupSettings);

// ==================== the hub rail ====================

/** "Your groups" beside the feed: shortcuts, and a way in when you have none. */
export function YourGroupsRail() {
    const s = api.groupsState();
    useEffect(() => { api.loadMyMemberships(); api.loadGroupsList(); }, []);
    if (!state.user || !s.list.loaded) return null;
    const groups: Group[] = api.myGroups().slice(0, 6);
    return (
        <section className="feed-rail-card rail-groups">
            <h3>Your groups</h3>
            {groups.length ? groups.map(g => (
                <button key={g.id} type="button" className="rail-group" onClick={() => api.showGroupView({ kind: 'group', slug: g.slug, tab: 'posts' })}>
                    <GroupTile group={g} size="sm" />
                    <span>{g.name}</span>
                </button>
            )) : <p className="rail-groups-empty">Join groups for the stuff you are into.</p>}
            <button type="button" className="link-btn" onClick={() => api.showGroupView({ kind: groups.length ? 'list' : 'list' })}>
                {groups.length ? 'See all groups' : 'Find groups'} <Icon name="arrow-right" size={12} />
            </button>
        </section>
    );
}
