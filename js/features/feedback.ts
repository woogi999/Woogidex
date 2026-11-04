// ==================== feedback & bug reports ====================
// The account menu's "Feedback & bug reports" dialog. Sending needs an
// account: reports go in public.feedback as the signed-in user (RLS). Each
// report is a support ticket: the writer and staff reply under it
// (public.feedback_messages), and a staff reply sends a notification.
// Staff read and answer them on the staff console (console.woogidex.com, Feedback). The dialog is js/app/dialogs/feedback.tsx.

import { state, api } from '../core/app.ts';
import { log } from '../core/log.ts';
import { getClient } from '../core/supabase.ts';
import { closeDialog, openDialog } from '../app/dialogs.tsx';

export const KINDS = [
    { key: 'bug', label: 'Bug', icon: 'bug', hint: 'Something is broken or doesn’t work the way it should.' },
    { key: 'feedback', label: 'Feedback', icon: 'message-square', hint: 'Tell us what you think of something on the site.' },
    { key: 'idea', label: 'Idea', icon: 'lightbulb', hint: 'Something you’d like Woogidex to have or do.' }
];
export const STATUS = {
    open: 'Open', in_progress: 'In progress', resolved: 'Resolved', wont_fix: 'Won’t fix', duplicate: 'Duplicate'
};
export const TITLE_MAX = 120;
export const BODY_MAX = 4000;

/** Opens the dialog; signed-out visitors are asked to sign in first. A ticket id opens that report's thread. */
export function openFeedbackModal(which = 'send', ticket = '') {
    openDialog('feedback', { tab: which === 'mine' || ticket ? 'mine' : 'send', ticket });
}

export function closeFeedbackModal() {
    closeDialog('feedback');
}

/** Where the reporter is, in words a developer can find: the path plus the open view. */
function currentPlace() {
    const view = document.body.dataset.page || '';
    const editor = document.getElementById('editor-view')?.style.display === 'block' ? ' (editor open)' : '';
    return `${window.location.pathname}${view ? ` · ${view}` : ''}${editor}`.slice(0, 300);
}

/**
 * Sends a report as the signed-in user.
 * @param {{ kind: string, title: string, body: string, withContext: boolean }} report
 * @returns a problem to show, or '' once sent
 */
export async function sendFeedback({ kind, title, body, withContext }: { kind?: any; title?: any; body?: any; withContext?: any }): Promise<string> {
    if (!state.user) return 'Sign in first.';
    title = String(title || '').trim();
    body = String(body || '').trim();
    if (title.length < 3) return 'Give it a title of at least 3 characters.';
    if (body.length < 10) return 'Add a few more details (at least 10 characters).';
    try {
        const client = await getClient();
        const { error } = await client.from('feedback').insert({
            user_id: state.user.id,
            kind: KINDS.some(k => k.key === kind) ? kind : 'feedback',
            title: title.slice(0, TITLE_MAX),
            body: body.slice(0, BODY_MAX),
            page: withContext ? currentPlace() : '',
            user_agent: withContext ? navigator.userAgent.slice(0, 400) : ''
        });
        if (error) throw error;
        log.info('FEEDBACK', 'Report sent', { kind });
        api.showToast?.('Thanks! Your report was sent. You can follow it under My reports.', 'success');
        return '';
    } catch (e: any) {
        log.warn('FEEDBACK', 'Report failed', e);
        return e?.message || 'Your report could not be sent. Please try again.';
    }
}

export interface MyReport {
    id: string; kind: string; title: string; body: string; status: string; created_at: string;
    last_reply_at: string | null; last_reply_staff: boolean;
}

/**
 * Your own reports, newest first, with their status and who replied last.
 */
export async function loadMyFeedback(): Promise<{ rows: MyReport[], error: string }> {
    if (!state.user) return { rows: [] as any[], error: 'Sign in first.' };
    const client = await getClient();
    const { data, error } = await client.from('feedback')
        .select('id, kind, title, body, status, created_at, last_reply_at, last_reply_staff')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false })
        .limit(50);
    return { rows: data || [], error: error ? error.message : '' };
}


// ==================== a ticket's thread ====================

export interface TicketMessage { id: string; is_staff: boolean; body: string; created_at: string; author_id: string | null; author: string }

/** The replies under one of your reports, oldest first. A staff reply names who wrote it. */
export async function loadTicket(id: string): Promise<{ messages: TicketMessage[], error: string }> {
    const client = await getClient();
    const { data, error } = await client.from('feedback_messages')
        .select('id, is_staff, body, created_at, author_id')
        .eq('feedback_id', id)
        .order('created_at', { ascending: true })
        .limit(200);
    if (error) return { messages: [], error: error.message };
    const staffIds = [...new Set((data || []).filter((m: any) => m.is_staff && m.author_id).map((m: any) => m.author_id))];
    const names = new Map<string, string>();
    if (staffIds.length) {
        const { data: people } = await client.from('profiles').select('id, username, display_name').in('id', staffIds);
        for (const p of people || []) names.set(p.id, p.display_name || p.username || '');
    }
    markTicketSeen(id);
    return {
        messages: (data || []).map((m: any) => ({ ...m, author: m.is_staff ? names.get(m.author_id) || '' : 'You' })),
        error: ''
    };
}

/** Sends a reply under one of your reports. Returns a problem to show, or '' once sent. */
export async function sendTicketReply(id: string, body: string): Promise<string> {
    if (!state.user) return 'Sign in first.';
    const text = String(body || '').trim();
    if (!text) return 'Write a reply first.';
    try {
        const client = await getClient();
        const { error } = await client.from('feedback_messages').insert({ feedback_id: id, author_id: state.user.id, body: text.slice(0, BODY_MAX) });
        if (error) throw error;
        return '';
    } catch (e: any) {
        log.warn('FEEDBACK', 'Reply failed', e);
        return e?.message || 'Your reply could not be sent. Please try again.';
    }
}

// When you last opened each ticket, in this browser, so a new staff reply can say so.
const SEEN_KEY = 'woogidex-feedback-seen';
function seenMap(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; }
}
function markTicketSeen(id: string) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seenMap(), [id]: new Date().toISOString() })); } catch { /* storage blocked */ }
}
/** Whether staff replied after you last opened this report here. */
export function hasNewReply(r: MyReport): boolean {
    if (!r.last_reply_staff || !r.last_reply_at) return false;
    const seen = seenMap()[r.id];
    return !seen || new Date(r.last_reply_at).getTime() > new Date(seen).getTime();
}
