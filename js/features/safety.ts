// ==================== safety tools ====================
// Reports on posts, comments, Fakémon, profiles and events; your moderation
// history and appeals; hidden words; comment controls on your own things;
// and the VPN check for Community Hub actions. The server decides everything
// (migration 20261025120000_moderation_system.sql in Woogidex-DB). These
// calls only carry the request and turn errors into plain words. Wording and
// rules: js/features/safety-model.ts. Dialogs: js/app/dialogs/safety.tsx.

import { state, api } from '../core/app.ts';
import { log } from '../core/log.ts';
import { getClient } from '../core/supabase.ts';
import { openDialog } from '../app/dialogs.tsx';
import type { CommentKind, ReportKind } from './safety-model.ts';

const errText = (e: any, fallback: string) => String(e?.message || '') || fallback;

/** Opens the report dialog. Signed-out visitors are asked to sign in first. */
export function openReportDialog(kind: ReportKind, id: string, commentKind: CommentKind | null = null, name = '') {
    if (!state.user) { api.openAuthModal?.('signin'); return; }
    openDialog('report', { kind, id, commentKind, name });
}

/** Sends a report. Returns '' when it worked, or what went wrong. */
export async function reportContent(kind: ReportKind, id: string, commentKind: CommentKind | null, reason: string, details: string): Promise<string> {
    try {
        const client = await getClient();
        const { error } = await client.rpc('report_content', {
            p_kind: kind, p_id: id, p_comment_kind: kind === 'comment' ? commentKind : null, p_reason: reason, p_details: details.trim()
        });
        if (error) throw error;
        log.info('SAFETY', 'Report sent', { kind, reason });
        return '';
    } catch (e: any) {
        log.warn('SAFETY', 'Report failed', e);
        return errText(e, 'Your report could not be sent. Please try again.');
    }
}

export async function loadMyReports(): Promise<{ rows: any[]; error: string }> {
    try {
        const client = await getClient();
        const { data, error } = await client.rpc('my_reports');
        if (error) throw error;
        return { rows: data || [], error: '' };
    } catch (e: any) {
        return { rows: [], error: errText(e, 'Could not load your reports.') };
    }
}

export async function loadModerationHistory(): Promise<{ rows: any[]; error: string }> {
    try {
        const client = await getClient();
        const { data, error } = await client.rpc('my_moderation_history');
        if (error) throw error;
        return { rows: data || [], error: '' };
    } catch (e: any) {
        return { rows: [], error: errText(e, 'Could not load your account history.') };
    }
}

export async function submitAppeal(actionId: string, body: string): Promise<string> {
    try {
        const client = await getClient();
        const { error } = await client.rpc('submit_appeal', { p_action: actionId, p_body: body.trim() });
        if (error) throw error;
        return '';
    } catch (e: any) {
        return errText(e, 'Your appeal could not be sent. Please try again.');
    }
}

export async function loadHiddenWords(): Promise<string[]> {
    try {
        const client = await getClient();
        const { data, error } = await client.rpc('my_hidden_words');
        if (error) throw error;
        return data || [];
    } catch (e: any) {
        log.warn('SAFETY', 'Could not load hidden words', e);
        return [];
    }
}

export async function saveHiddenWords(words: string[]): Promise<string> {
    try {
        const client = await getClient();
        const { error } = await client.rpc('set_hidden_words', { p_words: words });
        if (error) throw error;
        return '';
    } catch (e: any) {
        return errText(e, 'Could not save your hidden words.');
    }
}

/** The comment setting on a post, Fakémon, profile or event. Missing means everyone. */
export async function loadCommentControl(kind: CommentKind, id: string): Promise<{ mode: string; slow_seconds: number }> {
    try {
        const client = await getClient();
        const { data, error } = await client.from('comment_controls').select('mode, slow_seconds')
            .eq('target_kind', kind).eq('target_id', id).maybeSingle();
        if (error) throw error;
        return data || { mode: 'everyone', slow_seconds: 0 };
    } catch {
        return { mode: 'everyone', slow_seconds: 0 };
    }
}

export async function saveCommentControl(kind: CommentKind, id: string, mode: string, slowSeconds: number): Promise<string> {
    try {
        const client = await getClient();
        const { error } = await client.rpc('set_comment_control', { p_kind: kind, p_id: id, p_mode: mode, p_slow_seconds: slowSeconds });
        if (error) throw error;
        return '';
    } catch (e: any) {
        return errText(e, 'Could not change the comment setting.');
    }
}

export function openCommentControls(kind: CommentKind, id: string) {
    openDialog('comment-controls', { kind, id });
}

export async function loadHiddenComments(): Promise<{ rows: any[]; error: string }> {
    try {
        const client = await getClient();
        const { data, error } = await client.rpc('my_hidden_comments');
        if (error) throw error;
        return { rows: data || [], error: '' };
    } catch (e: any) {
        return { rows: [], error: errText(e, 'Could not load hidden comments.') };
    }
}

/** Hides or shows a comment on your own post, Fakémon, profile or event (Instagram's "hide comment"). */
export async function setCommentHidden(table: string, id: string, hidden: boolean): Promise<string> {
    try {
        const client = await getClient();
        const { error } = await client.rpc('owner_set_comment_hidden', { p_kind: table, p_id: id, p_hidden: hidden });
        if (error) throw error;
        return '';
    } catch (e: any) {
        return errText(e, 'Could not change that comment.');
    }
}

// ---- VPN check ----
// Cached for two minutes. A network change (VPN on or off) shows up on the
// next check, or at once when a write is refused.
let network: { vpn: boolean; at: number } | null = null;
const NETWORK_TTL_MS = 2 * 60 * 1000;
const networkListeners = new Set<() => void>();

export function cachedNetworkStatus(): boolean {
    return !!network?.vpn;
}

export function onNetworkStatus(fn: () => void): () => void {
    networkListeners.add(fn);
    return () => { networkListeners.delete(fn); };
}

function setNetwork(vpn: boolean) {
    const changed = !!network?.vpn !== vpn;
    network = { vpn, at: Date.now() };
    if (changed) networkListeners.forEach(fn => fn());
}

/** Asks the server whether this connection comes from a listed VPN or hosting network. Fails open. */
export async function refreshNetworkStatus(force = false): Promise<boolean> {
    if (!state.user) return false;
    if (!force && network && Date.now() - network.at < NETWORK_TTL_MS) return network.vpn;
    try {
        const client = await getClient();
        const { data, error } = await client.rpc('my_network_status');
        if (error) throw error;
        setNetwork(!!data?.vpn);
    } catch (e: any) {
        log.warn('SAFETY', 'Network check unavailable', e);
    }
    return !!network?.vpn;
}

/** A write was refused by the VPN guard: remember it so the banner shows. */
export function noteNetworkBlock() {
    setNetwork(true);
}
