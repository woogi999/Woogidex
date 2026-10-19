// Leaf module (no imports) so admin.html and the main site can share one copy
// instead of duplicating the project URL/key across files.
// The anon/publishable key is public by design; access is enforced by RLS server-side.
export const SUPABASE_PROJECT_URL = 'https://qstbascfeolkyxtrqqwv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_B4jEJ--w0XFsgXDmQeJREA_xH1GRBsf';

// Routing API calls through /sb on our own origin (proxied by worker/index.js,
// see vite.config.js for local dev) puts requests behind the same WAF/rate
// limiting as the static site and avoids a CORS preflight. Only flip this on
// once the worker proxy is confirmed live, or every request 404s at once.
const USE_SAME_ORIGIN_PROXY = true;

export const SUPABASE_URL = USE_SAME_ORIGIN_PROXY && typeof window !== 'undefined'
    ? `${window.location.origin}/sb`
    : SUPABASE_PROJECT_URL;

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
        auth: { persistSession: true, autoRefreshToken: true },
        // a backend that's down often hangs instead of failing; this turns a
        // hang into an error, so loaders fall through to their error state
        global: { fetch: timedFetch }
    });
    return supabase;
}
