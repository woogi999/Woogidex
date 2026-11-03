// Groups: communities inside the Community Hub, a mix of Reddit and Facebook.
// Anyone can make one, public or private. Members post in it, and the home
// feed shows posts from your groups. Owners and moderators approve join
// requests, remove people and posts, and edit the group.
//
// The tables and rules are in woogidex-backend
// supabase/migrations/20261026040105_community_groups.sql and
// 20261026150000_community_groups.sql. Every write is an RPC there.
// The UI is js/app/components/groups.tsx, on the hub's Groups panel.
//
// /groups                the list: your groups, and groups to discover
// /groups/new            make a group
// /groups/<slug>[/tab]   one group: posts, about, members

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';
import { log } from '../core/log.ts';
import { prepareFeedRows } from './social.ts';
import { confirmDialog } from '../core/confirm-dialog.ts';
import { replaceRoute } from '../core/router.ts';
import type { FeedItem } from './feed-algorithm.ts';

export interface Group {
    id: string; slug: string; name: string; description: string; rules: string;
    visibility: 'public' | 'private'; color: string; owner_id: string;
    member_count: number; post_count: number; created_at: string; archived_at: string | null;
}
export type GroupRole = 'owner' | 'moderator' | 'member';
export type MemberStatus = 'active' | 'pending' | 'left' | 'removed' | 'banned';
export interface Membership { group_id: string; user_id: string; role: GroupRole; status: MemberStatus; joined_at: string; }
export interface Member extends Membership { profile: { id: string; username?: string; display_name?: string; avatar_url?: string } | null; }
export type GroupTab = 'posts' | 'about' | 'members';
export type GroupSort = 'new' | 'top';
export type GroupView = { kind: 'list' } | { kind: 'new' } | { kind: 'group'; slug: string; tab: GroupTab };

export const GROUP_TABS: GroupTab[] = ['posts', 'about', 'members'];
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;

interface GroupsState {
    view: GroupView;
    list: { items: Group[]; loading: boolean; loaded: boolean; error: string };
    /** your rows in group_members, by group id */
    mine: Map<string, Membership>;
    mineFor: string | null;
    bySlug: Record<string, { group: Group | null; loading: boolean; error: string }>;
    feeds: Record<string, { items: FeedItem[]; loading: boolean; hasMore: boolean; sort: GroupSort; error: string }>;
    members: Record<string, { items: Member[]; loading: boolean; error: string }>;
}

function gs(): GroupsState {
    if (!state.groups) {
        state.groups = {
            view: { kind: 'list' },
            list: { items: [], loading: false, loaded: false, error: '' },
            mine: new Map(), mineFor: null, bySlug: {}, feeds: {}, members: {}
        } as GroupsState;
    }
    return state.groups;
}
export function groupsState(): GroupsState { return gs(); }

/** The message a failed RPC should show: ours are written for people (P0001). */
function problem(e: any, fallback: string): string {
    if (e?.code === 'P0001' && e.message) return e.message;
    return api.friendlyModerationError?.(e) || fallback;
}

// ==================== routing ====================

function routeFor(v: GroupView): [string, string] {
    if (v.kind === 'new') return ['groups/new', 'New group'];
    if (v.kind === 'group') {
        const name = gs().bySlug[v.slug]?.group?.name || 'Group';
        return [`groups/${v.slug}${v.tab !== 'posts' ? `/${v.tab}` : ''}`, name];
    }
    return ['groups', 'Groups'];
}

function viewFromParam(param = ''): GroupView {
    const [slug, sub] = String(param || '').toLowerCase().split('/');
    if (!slug) return { kind: 'list' };
    if (slug === 'new') return { kind: 'new' };
    if (!SLUG_PATTERN.test(slug)) return { kind: 'list' };
    return { kind: 'group', slug, tab: (GROUP_TABS as string[]).includes(sub) ? sub as GroupTab : 'posts' };
}

/** Shows a view of the Groups panel and loads what it needs. */
export function showGroupView(v: GroupView, { route = true } = {}) {
    gs().view = v;
    if (route) {
        const [path, title] = routeFor(v);
        api.setRoute?.(path, title);
    }
    loadForView(v);
    notify();
    window.scrollTo({ top: 0 });
}

function loadForView(v: GroupView) {
    loadMyMemberships();
    if (v.kind === 'list') loadGroupsList();
    if (v.kind === 'group') {
        loadGroup(v.slug).then(g => {
            if (!g) return;
            if (v.tab === 'posts' && !gs().feeds[g.id]) loadGroupFeed(g.id);
            if (v.tab === 'members') loadGroupMembers(g.id);
            // the address and the tab title wait for the group's name
            if (gs().view === v) api.setPageTitle?.(routeFor(v)[1]);
        });
    }
}

/** /groups[/...]: the hub, on the Groups panel, at whatever the address names. */
export async function openGroups(param = '') {
    if (!api.requireAccount?.('Sign in to see groups.', () => openGroups(param))) return;
    const view = viewFromParam(param);
    gs().view = view;
    await api.openCommunityHub?.({ panel: 'groups' });
    // the hub just set its own address; put the group's back
    const [path, title] = routeFor(view);
    replaceRoute(path);
    api.setPageTitle?.(title);
    loadForView(view);
}

/** The Groups panel was picked in the hub's sidebar. */
export function onGroupsPanelShown() {
    const v = gs().view;
    const [path, title] = routeFor(v);
    replaceRoute(path);
    api.setPageTitle?.(title);
    loadForView(v);
}

// ==================== reads ====================

export async function loadMyMemberships(force = false) {
    const s = gs();
    const uid = state.user?.id || null;
    if (!uid) { s.mine = new Map(); s.mineFor = null; return; }
    if (!force && s.mineFor === uid) return;
    s.mineFor = uid;
    try {
        const client = await api.getClient();
        const { data, error } = await client.from('group_members').select('group_id, user_id, role, status, joined_at')
            .eq('user_id', uid).in('status', ['active', 'pending', 'banned']).limit(500);
        if (error) throw error;
        s.mine = new Map((data || []).map((m: Membership) => [m.group_id, m]));
    } catch (e) {
        log.warn('GROUPS', 'Could not load your groups', e);
        s.mineFor = null;
    }
    notify();
}

export async function loadGroupsList(force = false) {
    const l = gs().list;
    if (l.loading || (l.loaded && !force)) return;
    l.loading = true;
    l.error = '';
    notify();
    try {
        const client = await api.getClient();
        const { data, error } = await client.from('community_groups').select('*').is('archived_at', null)
            .order('member_count', { ascending: false }).order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        l.items = data || [];
        l.loaded = true;
        for (const g of l.items) gs().bySlug[g.slug] = { group: g, loading: false, error: '' };
    } catch (e: any) {
        log.error('GROUPS', 'Could not load groups', e);
        l.error = /community_groups/.test(String(e?.message)) ? 'Groups aren’t switched on yet.' : 'Couldn’t load groups.';
    } finally {
        l.loading = false;
        notify();
    }
}

export async function loadGroup(slug: string, force = false): Promise<Group | null> {
    const s = gs();
    const cur = s.bySlug[slug];
    if (cur?.group && !force) return cur.group;
    s.bySlug[slug] = { group: cur?.group || null, loading: true, error: '' };
    notify();
    try {
        const client = await api.getClient();
        const { data, error } = await client.from('community_groups').select('*').eq('slug', slug).maybeSingle();
        if (error) throw error;
        s.bySlug[slug] = { group: data || null, loading: false, error: data ? '' : 'This group doesn’t exist, or it was archived.' };
        notify();
        return data || null;
    } catch (e) {
        log.error('GROUPS', 'Could not load a group', e);
        s.bySlug[slug] = { group: null, loading: false, error: 'Couldn’t load this group.' };
        notify();
        return null;
    }
}

const FEED_PAGE = 30;

export async function loadGroupFeed(groupId: string, { older = false, sort }: { older?: boolean; sort?: GroupSort } = {}) {
    const s = gs();
    const f = s.feeds[groupId] ||= { items: [], loading: false, hasMore: true, sort: 'new', error: '' };
    if (f.loading) return;
    if (sort && sort !== f.sort) { f.sort = sort; f.items = []; f.hasMore = true; older = false; }
    f.loading = true;
    f.error = '';
    notify();
    try {
        const client = await api.getClient();
        // "top" is one page of the month's best; only "new" pages back in time
        const before = older && f.sort === 'new' && f.items.length ? f.items[f.items.length - 1].created_at : null;
        const { data, error } = await client.rpc('group_feed', { p_group: groupId, p_before: before, p_limit: FEED_PAGE, p_sort: f.sort });
        if (error) throw error;
        const rows = await prepareFeedRows(data || []);
        f.items = older ? [...f.items, ...rows.filter(r => !f.items.some(x => x.id === r.id))] : rows;
        f.hasMore = f.sort === 'new' && rows.length === FEED_PAGE;
    } catch (e) {
        log.error('GROUPS', 'Could not load the group feed', e);
        f.error = 'Couldn’t load the posts.';
    } finally {
        f.loading = false;
        notify();
    }
}

export function refreshGroupFeed(groupId: string) {
    const f = gs().feeds[groupId];
    loadGroupFeed(groupId, { sort: f?.sort || 'new' });
    const g = Object.values(gs().bySlug).find(x => x.group?.id === groupId)?.group;
    if (g) loadGroup(g.slug, true);
}

export async function loadGroupMembers(groupId: string) {
    const s = gs();
    const m = s.members[groupId] ||= { items: [], loading: false, error: '' };
    if (m.loading) return;
    m.loading = true;
    m.error = '';
    notify();
    try {
        const client = await api.getClient();
        const { data, error } = await client.from('group_members')
            .select('group_id, user_id, role, status, joined_at, profile:profiles(id, username, display_name, avatar_url)')
            .eq('group_id', groupId).in('status', ['active', 'pending', 'banned'])
            .order('joined_at', { ascending: true }).limit(500);
        if (error) throw error;
        m.items = (data || []) as Member[];
    } catch (e) {
        log.error('GROUPS', 'Could not load members', e);
        m.error = 'Couldn’t load the members.';
    } finally {
        m.loading = false;
        notify();
    }
}

/** Your active role in a group, or null. */
export function myGroupRole(groupId: string): GroupRole | null {
    const m = gs().mine.get(groupId);
    return m?.status === 'active' ? m.role : null;
}
export function myGroupStatus(groupId: string): MemberStatus | null {
    return gs().mine.get(groupId)?.status || null;
}
/** The groups you are an active member of, for the post composer and the hub rail. */
export function myGroups(): Group[] {
    const s = gs();
    const all = new Map<string, Group>();
    for (const g of s.list.items) all.set(g.id, g);
    for (const x of Object.values(s.bySlug)) if (x.group) all.set(x.group.id, x.group);
    return [...s.mine.values()].filter(m => m.status === 'active').map(m => all.get(m.group_id)).filter(Boolean) as Group[];
}
/** Owner or moderator: approves requests, removes people and posts, edits the group. */
export function canModerateGroup(groupId: string): boolean {
    const r = myGroupRole(groupId);
    return r === 'owner' || r === 'moderator' || !!api.isStaff?.();
}

// ==================== writes ====================

export interface GroupDraft { name: string; slug: string; description: string; rules: string; visibility: 'public' | 'private'; color: string; }

/** A group address from a name: lowercase, dashes, 3 to 32 characters. */
export function slugFromName(name: string): string {
    return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/g, '');
}

export async function createGroup(d: GroupDraft): Promise<string | null> {
    if (!api.requireAccount?.('Sign in to make a group.')) return null;
    const text = [d.name, d.description, d.rules].join('\n');
    if (!(await api.guardContent?.(text, 'group') ?? true)) return null;
    try {
        const client = await api.getClient();
        const { data, error } = await client.rpc('create_group', {
            p_name: d.name.trim(), p_slug: d.slug.trim().toLowerCase(), p_description: d.description.trim(),
            p_visibility: d.visibility, p_rules: d.rules.trim(), p_color: d.color || ''
        });
        if (error) throw error;
        api.showToast?.('Your group is up!', 'success');
        gs().list.loaded = false;
        await loadMyMemberships(true);
        showGroupView({ kind: 'group', slug: data, tab: 'posts' });
        return data;
    } catch (e: any) {
        api.showToast?.(problem(e, 'Could not make the group.'), 'error');
        return null;
    }
}

export async function updateGroup(g: Group, d: Omit<GroupDraft, 'slug'>): Promise<boolean> {
    const text = [d.name, d.description, d.rules].join('\n');
    if (!(await api.guardContent?.(text, 'group') ?? true)) return false;
    try {
        const client = await api.getClient();
        const { error } = await client.rpc('update_group', {
            p_group: g.id, p_name: d.name.trim(), p_description: d.description.trim(), p_rules: d.rules.trim(),
            p_visibility: d.visibility, p_color: d.color || ''
        });
        if (error) throw error;
        api.showToast?.('Saved.', 'success');
        await loadGroup(g.slug, true);
        return true;
    } catch (e: any) {
        api.showToast?.(problem(e, 'Could not save the group.'), 'error');
        return false;
    }
}

export async function joinGroup(g: Group): Promise<void> {
    if (!api.requireAccount?.('Sign in to join a group.')) return;
    try {
        const client = await api.getClient();
        const { data, error } = await client.rpc('join_group', { p_group: g.id });
        if (error) throw error;
        api.showToast?.(data === 'pending' ? 'Request sent. A moderator will let you in.' : `You joined ${g.name}.`, 'success');
        await loadMyMemberships(true);
        await loadGroup(g.slug, true);
        if (data === 'active') { loadGroupFeed(g.id); api.fetchFeed?.('foryou', { force: true }); }
    } catch (e: any) {
        api.showToast?.(problem(e, 'Could not join the group.'), 'error');
    }
}

export async function leaveGroup(g: Group): Promise<void> {
    const pending = myGroupStatus(g.id) === 'pending';
    const ok = await confirmDialog({
        title: pending ? 'Cancel your request?' : `Leave ${g.name}?`,
        message: g.visibility === 'private' && !pending ? 'It is a private group. To come back, you need a moderator to let you in again.' : '',
        confirmLabel: pending ? 'Cancel request' : 'Leave', danger: true
    });
    if (!ok) return;
    try {
        const client = await api.getClient();
        const { error } = await client.rpc('leave_group', { p_group: g.id });
        if (error) throw error;
        await loadMyMemberships(true);
        await loadGroup(g.slug, true);
        delete gs().feeds[g.id];
        if (g.visibility === 'public') loadGroupFeed(g.id);
        api.fetchFeed?.('foryou', { force: true });
    } catch (e: any) {
        api.showToast?.(problem(e, 'Could not leave the group.'), 'error');
    }
}

export type MemberAction = 'approve' | 'decline' | 'remove' | 'ban' | 'unban' | 'make_moderator' | 'make_member' | 'make_owner';

export async function moderateMember(g: Group, userId: string, action: MemberAction, name = 'them'): Promise<boolean> {
    const asks: Partial<Record<MemberAction, [string, string, string]>> = {
        remove: [`Remove ${name}?`, 'They can join again later.', 'Remove'],
        ban: [`Ban ${name}?`, 'They cannot join or post here until a moderator unbans them.', 'Ban'],
        make_owner: [`Make ${name} the owner?`, 'You become a moderator, and they can change everything, including you.', 'Make owner']
    };
    const ask = asks[action];
    if (ask && !(await confirmDialog({ title: ask[0], message: ask[1], confirmLabel: ask[2], danger: true }))) return false;
    try {
        const client = await api.getClient();
        const { error } = await client.rpc('moderate_group_member', { p_group: g.id, p_user: userId, p_action: action });
        if (error) throw error;
        await Promise.all([loadGroupMembers(g.id), loadGroup(g.slug, true), action === 'make_owner' ? loadMyMemberships(true) : null]);
        return true;
    } catch (e: any) {
        api.showToast?.(problem(e, 'That did not work.'), 'error');
        return false;
    }
}

export async function archiveGroup(g: Group): Promise<void> {
    const ok = await confirmDialog({
        title: `Archive ${g.name}?`,
        message: 'The group and its posts go away for everyone. Staff can bring it back.',
        confirmLabel: 'Archive', danger: true
    });
    if (!ok) return;
    try {
        const client = await api.getClient();
        const { error } = await client.rpc('archive_group', { p_group: g.id });
        if (error) throw error;
        delete gs().bySlug[g.slug];
        gs().list.loaded = false;
        await loadMyMemberships(true);
        showGroupView({ kind: 'list' });
    } catch (e: any) {
        api.showToast?.(problem(e, 'Could not archive the group.'), 'error');
    }
}

export function groupShareUrl(g: Group): string {
    return new URL(`groups/${g.slug}`, document.baseURI).href;
}

/** Signed in or out: the next account starts with a clean slate. */
export function onGroupsAuthChange() {
    const s = gs();
    s.mine = new Map();
    s.mineFor = null;
    s.feeds = {};
    s.members = {};
    s.list = { items: [], loading: false, loaded: false, error: '' };
    loadMyMemberships();
}
