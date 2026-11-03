// Wording and rules for the safety tools people use: reporting, the
// moderation history with appeals, hidden words, comment controls and the
// VPN notice. No network calls here, so the rules can be tested alone
// (js/features/safety-model.test.ts). The calls are in js/features/safety.ts.

export type ReportKind = 'post' | 'comment' | 'mon' | 'profile' | 'event';
export type CommentKind = 'post' | 'mon' | 'profile' | 'event';

/** Report reasons, in the order the dialog shows them. Keys match report_content(). */
export const REPORT_REASONS: { key: string; label: string; hint: string }[] = [
    { key: 'spam', label: 'Spam or scam', hint: 'Ads, repeated posts, fake giveaways, links to scams.' },
    { key: 'harassment', label: 'Harassment or bullying', hint: 'Insults, threats, or picking on someone.' },
    { key: 'hate', label: 'Hate', hint: 'Attacks on people for who they are.' },
    { key: 'sexual', label: 'Sexual content', hint: 'Anything NSFW. Woogidex is for all ages.' },
    { key: 'violence', label: 'Violence or threats', hint: 'Real threats or graphic violence.' },
    { key: 'self_harm', label: 'Self-harm', hint: 'Someone may be in danger. Staff see these first.' },
    { key: 'impersonation', label: 'Impersonation', hint: 'Pretends to be another person, a creator or staff.' },
    { key: 'art_theft', label: 'Stolen or AI art', hint: 'Art the poster did not draw, or AI-made art.' },
    { key: 'other', label: 'Something else', hint: 'Tell us what is wrong in the details box.' }
];

export const REPORT_DETAILS_MAX = 1000;

/** What a report is about, in words for the dialog title. */
export function reportTargetLabel(kind: ReportKind): string {
    return ({ post: 'post', comment: 'comment', mon: 'Fakémon', profile: 'profile', event: 'event' } as Record<string, string>)[kind] || 'post';
}

export const REPORT_STATUS: Record<string, { label: string; tone: string }> = {
    open: { label: 'Waiting for staff', tone: '' },
    actioned: { label: 'Staff took action', tone: 'good' },
    dismissed: { label: 'No rule break found', tone: 'muted' }
};

/** One line about a moderation action on your own account. */
export function historyLabel(action: string): string {
    return ({
        warn: 'Warning', mute: 'Mute', ban: 'Suspension', unmute: 'Mute lifted', unban: 'Suspension lifted',
        automod_block: 'Blocked by the filter (strike)', case_remove: 'Content removed', case_restrict: 'Account limited',
        delete_comment: 'Comment removed', delete_post: 'Post removed', delete_mon: 'Fakémon removed',
        reset_display_name: 'Display name reset', clear_bio: 'Bio cleared', account_limit: 'Account limited',
        account_limit_cleared: 'Limit lifted', appeal_reversed: 'Appeal won', appeal_upheld: 'Appeal turned down'
    } as Record<string, string>)[action] || action.replace(/_/g, ' ');
}

export const APPEAL_MIN = 10;
export const APPEAL_MAX = 2000;

export function appealState(entry: { appeal?: { status: string } | null; can_appeal?: boolean; reversed?: boolean }): 'reversed' | 'open' | 'upheld' | 'can' | 'none' {
    if (entry.reversed || entry.appeal?.status === 'reversed') return 'reversed';
    if (entry.appeal?.status === 'open') return 'open';
    if (entry.appeal?.status === 'upheld') return 'upheld';
    return entry.can_appeal ? 'can' : 'none';
}

export const HIDDEN_WORDS_MAX = 200;

/**
 * Turns the hidden-words text box into the list the server stores: one word or
 * phrase per line or comma, trimmed, lower case, 2 to 60 characters, no repeats.
 */
export function parseHiddenWords(text: string): string[] {
    const seen = new Set<string>();
    for (const raw of String(text || '').split(/[\n,]+/)) {
        const w = raw.trim().toLowerCase().replace(/\s+/g, ' ');
        if (w.length >= 2 && w.length <= 60) seen.add(w);
        if (seen.size >= HIDDEN_WORDS_MAX) break;
    }
    return [...seen];
}

export const COMMENT_MODES: { key: 'everyone' | 'followers' | 'off'; label: string }[] = [
    { key: 'everyone', label: 'Everyone can comment' },
    { key: 'followers', label: 'Only people who follow me' },
    { key: 'off', label: 'Comments off' }
];

export const SLOW_MODES: [number, string][] = [[0, 'Off'], [30, '30 seconds'], [120, '2 minutes'], [600, '10 minutes'], [3600, '1 hour']];

export const VPN_MESSAGE = 'You seem to be on a VPN or proxy. You can browse, but posting, commenting, reacting and messages are off until you turn it off.';

/** True when a server error came from the VPN guard (guard_network_write). */
export function isNetworkBlock(error: any): boolean {
    const hint = String(error?.hint || '');
    if (hint === 'woogi_vpn' || hint === 'woogi_network') return true;
    return /VPN or proxy|only work through the Woogidex site/i.test(String(error?.message || ''));
}

/** What the compose box says after the pre-check, for actions that let the text through. */
export function screenNotice(verdict: { action?: string; severity?: string; matches?: any[] } | null): { text: string; tone: 'warning' | 'info' } | null {
    if (!verdict?.matches?.length) return null;
    switch (verdict.action) {
        case 'warn': return { text: 'Heads up: that wording can come across badly. Please keep it friendly.', tone: 'warning' };
        case 'hide':
        case 'escalate': return { text: 'A moderator checks this before other people can see it.', tone: 'info' };
        case 'flag': return { text: 'Heads up: that language is flagged for staff review. Keep it friendly.', tone: 'warning' };
        default: return verdict.severity === 'mild' ? { text: 'Heads up: that language is flagged for staff review. Keep it friendly.', tone: 'warning' } : null;
    }
}
