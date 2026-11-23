// Cloudflare Turnstile, the anti-bot check. Used by guest event entries
// (EventsPanel.tsx) and by sign in, sign up and the password forms
// (js/app/dialogs/auth.tsx). The site key is public by design. Its secret
// lives in two places, never in this repo:
//   * the TURNSTILE_SECRET_KEY function secret (submit-event-guest)
//   * Supabase Auth's captcha setting (Authentication > Attack Protection),
//     which checks the token on every password sign-in, sign-up and reset,
//     also when someone calls the Auth API without this site.
// The widget must list every host the site runs on (woogidex.com,
// dex.woogi.xyz, console.woogidex.com, localhost).

import { useEffect, useRef, useState } from 'react';

export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAFOdMFmuLvO018AE';

let script: Promise<any> | null = null;
function loadTurnstile(): Promise<any> {
    return script ||= new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        tag.async = true;
        tag.onload = () => resolve((window as any).turnstile);
        tag.onerror = () => { script = null; reject(new Error('The anti-bot check could not load.')); };
        document.head.appendChild(tag);
    });
}

/**
 * The check itself. `onToken` gets a token once it passes, and '' when it
 * expires or fails. A token is good for one request: change `resetKey` after
 * each try to get a new one.
 */
export function Turnstile({ onToken, resetKey, action, className = 'ev-turnstile' }: { onToken: (t: string) => void; resetKey: number; action?: string; className?: string }) {
    const box = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let id: string | null = null;
        let live = true;
        onToken('');
        loadTurnstile().then(t => {
            if (!live || !box.current) return;
            id = t.render(box.current, {
                sitekey: TURNSTILE_SITE_KEY,
                ...(action ? { action } : {}),
                theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
                callback: (token: string) => onToken(token),
                'expired-callback': () => onToken(''),
                'error-callback': () => onToken('')
            });
        }).catch(() => setFailed(true));
        return () => { live = false; if (id) (window as any).turnstile?.remove(id); };
    }, [resetKey]);
    return failed
        ? <p className="ev-error" role="alert">The anti-bot check could not load. Check your connection and reload the page.</p>
        : <div className={className} ref={box} />;
}
