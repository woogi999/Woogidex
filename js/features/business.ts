// Business accounts: an account type only staff can set (the Woogidex
// account is one). A business account shows a category and a contact email
// on its profile, pins up to three posts to the top of it, and sees insights
// about its followers and posts. Server side: woogidex-backend
// supabase/migrations/20261026140000_business_accounts.sql.

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';
import { log } from '../core/log.ts';

export interface BusinessInfo {
    account_type: 'personal' | 'business';
    business_category: string;
    business_email: string;
    pinned_post_ids: string[];
}
export interface PinnedPost { id: string; body: string; created_at: string; mon_ids: string[]; }
export interface Insights {
    days: number; followers: number; new_followers: number;
    follower_series: Array<{ day: string; total: number }>;
    posts: number; reactions: number; comments: number; reposts: number; mon_views: number;
    top_posts: Array<{ id: string; body: string; created_at: string; reactions: number; comments: number; reposts: number }>;
}

const PERSONAL: BusinessInfo = { account_type: 'personal', business_category: '', business_email: '', pinned_post_ids: [] };
const cache = new Map<string, { info: BusinessInfo; pinned: PinnedPost[] }>();
const loading = new Map<string, Promise<void>>();

/** A profile's business info and pinned posts; a personal account (or a database without the columns yet) reads as personal. */
export function businessInfo(userId: string | null | undefined): { info: BusinessInfo; pinned: PinnedPost[] } {
    if (!userId) return { info: PERSONAL, pinned: [] };
    const hit = cache.get(userId);
    if (hit) return hit;
    if (!loading.has(userId)) loading.set(userId, loadBusiness(userId));
    return { info: PERSONAL, pinned: [] };
}

async function loadBusiness(userId: string) {
    try {
        const client = await api.getClient();
        const { data, error } = await client.from('profiles')
            .select('account_type, business_category, business_email, pinned_post_ids').eq('id', userId).maybeSingle();
        if (error) throw error;
        const info: BusinessInfo = { ...PERSONAL, ...(data || {}) };
        let pinned: PinnedPost[] = [];
        if (info.account_type === 'business' && info.pinned_post_ids?.length) {
            const { data: rows } = await client.from('community_posts').select('id, body, created_at, mon_ids').in('id', info.pinned_post_ids);
            const byId = new Map((rows || []).map((r: PinnedPost) => [r.id, r]));
            pinned = info.pinned_post_ids.map(id => byId.get(id)).filter(Boolean) as PinnedPost[];
        }
        cache.set(userId, { info, pinned });
    } catch (e) {
        // the columns are not there yet: everyone is a personal account
        log.debug('BUSINESS', 'No business info', { error: String((e as any)?.message || e) });
        cache.set(userId, { info: PERSONAL, pinned: [] });
    } finally {
        loading.delete(userId);
        notify();
    }
}

export function forgetBusiness(userId: string) { cache.delete(userId); }

/** You are signed in as a business account. */
export function isBusiness(): boolean {
    return businessInfo(state.user?.id).info.account_type === 'business';
}

export function isPinned(postId: string): boolean {
    return businessInfo(state.user?.id).info.pinned_post_ids.includes(postId);
}

/** Pins a post of yours to the top of your profile (three at most; a fourth replaces the oldest pin), or unpins it. */
export async function togglePin(postId: string): Promise<void> {
    const me = state.user?.id;
    if (!me) return;
    const cur = businessInfo(me).info.pinned_post_ids;
    const next = cur.includes(postId) ? cur.filter(id => id !== postId) : [postId, ...cur].slice(0, 3);
    try {
        const client = await api.getClient();
        const { error } = await client.from('profiles').update({ pinned_post_ids: next }).eq('id', me);
        if (error) throw error;
        api.showToast?.(cur.includes(postId) ? 'Unpinned.' : 'Pinned to your profile.', 'success');
        cache.delete(me);
        businessInfo(me);
        api.invalidateProfile?.(me);
    } catch (e: any) {
        api.showToast?.(e?.message || 'Could not change your pins.', 'error');
    }
}

/** Saves the category and the contact email of your business account. */
export async function saveBusinessDetails(category: string, email: string): Promise<boolean> {
    const me = state.user?.id;
    if (!me) return false;
    const mail = email.trim();
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { api.showToast?.('That email address does not look right.', 'warning'); return false; }
    try {
        const client = await api.getClient();
        const { error } = await client.from('profiles').update({ business_category: category.trim().slice(0, 40), business_email: mail }).eq('id', me);
        if (error) throw error;
        cache.delete(me);
        businessInfo(me);
        api.invalidateProfile?.(me);
        api.showToast?.('Saved.', 'success');
        return true;
    } catch (e: any) {
        api.showToast?.(e?.message || 'Could not save.', 'error');
        return false;
    }
}

export async function fetchInsights(days = 28): Promise<Insights> {
    const client = await api.getClient();
    const { data, error } = await client.rpc('business_insights', { p_days: days });
    if (error) throw error;
    return data as Insights;
}

/** Signed in or out: drop what was cached for the last account. */
export function onBusinessAuthChange() {
    cache.clear();
    if (state.user?.id) businessInfo(state.user.id);
}
