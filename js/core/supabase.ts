// Leaf module (no imports) so admin.html and the main site can share one copy
// instead of duplicating the project URL/key across files.
// The anon/publishable key is public by design; access is enforced by RLS server-side.
export const SUPABASE_PROJECT_URL = 'https://qstbascfeolkyxtrqqwv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_B4jEJ--w0XFsgXDmQeJREA_xH1GRBsf';

// The API: worker/index.js in Woogidex-DB, in front of Supabase, behind
// Cloudflare's rate limiting. The site's live hosts call api.woogidex.com.
// Anywhere else (the dev server, a local preview) it is /sb on the page's own
// origin, proxied by vite.config.js. /sb also stays on the live hosts: saved
// avatar addresses use it.
const LIVE_HOSTS = ['woogidex.com', 'dex.woogi.xyz'];
const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
export const API_ORIGIN = LIVE_HOSTS.includes(pageHost) ? 'https://api.woogidex.com' : '';

export const SUPABASE_URL = typeof window === 'undefined' ? SUPABASE_PROJECT_URL
    : API_ORIGIN || `${window.location.origin}/sb`;

/** The address of one of the Worker's own endpoints: apiUrl('turn-credentials'). */
export function apiUrl(path: string): string {
    return `${API_ORIGIN || window.location.origin}/${path.replace(/^\/+/, '')}`;
}

// supabase-js names the saved session after the API's host. That host
// changed (dex.woogi.xyz/sb, then api.woogidex.com), so the name stays the
// one it always had, from the page's host. Else everyone is signed out.
const SESSION_KEY = `sb-${pageHost.split('.')[0] || 'woogidex'}-auth-token`;

/**
 * Drops this browser's copy of the session without telling the server, so
 * its refresh token stays good for a later switch back (js/features/accounts.ts).
 * A sign-out, by contrast, ends the session on the server too.
 */
export function forgetLocalSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* storage blocked */ }
}

let supabase: any = null;

const FETCH_TIMEOUT_MS = 30000;
function timedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const signal = init.signal && 'any' in AbortSignal ? (AbortSignal as any).any([init.signal, timeout]) : init.signal || timeout;
    return fetch(input, { ...init, signal }).then(res => {
        // the Worker refused this address (worker/index.js, isBanned): the page
        // itself was cached or reached without passing it, so go and get the
        // blocked page instead of leaving every request failing silently
        // (once a session: on a slow network the offline shell can answer again)
        if (res.status === 403 && res.headers.get('x-woogi-blocked') && typeof location !== 'undefined') {
            try {
                if (!sessionStorage.getItem('woogidex.blocked')) { sessionStorage.setItem('woogidex.blocked', '1'); location.replace('/'); }
            } catch { /* storage blocked: stay put rather than risk a loop */ }
        }
        return res;
    });
}

export async function getClient() {
    if (supabase) return supabase;
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: SESSION_KEY },
        // a backend that's down often hangs instead of failing; this turns a
        // hang into an error, so loaders fall through to their error state
        global: { fetch: timedFetch }
    });
    return supabase;
}
