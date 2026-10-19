// "This site uses cookies": shown once, until accepted. Everything Woogidex
// stores is needed for it to work or stay safe (the session, the collection,
// the device identifier for abuse protection, js/core/fingerprint.ts), so
// there is nothing optional to switch off; the notice says what's stored and
// links the details. Accepting is remembered in this browser.

import { useState } from 'react';
import { Icon } from '../components/Icon.tsx';
import { api } from '../../core/app.ts';

const KEY = 'woogidex.cookieNotice.v1';

function accepted(): boolean {
    try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function CookieNotice() {
    const [open, setOpen] = useState(() => !accepted());
    if (!open) return null;
    const accept = () => {
        try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* storage blocked: it asks again next time */ }
        setOpen(false);
    };
    return (
        <div className="cookie-notice" role="region" aria-label="Cookies">
            <Icon name="cake" size={20} className="cookie-notice-icon" />
            <p>
                Woogidex uses a cookie and your browser's storage to keep you signed in, save your collection, and protect accounts from abuse.
                No ads, no tracking. <button type="button" className="cookie-notice-link" onClick={() => api.openPrivacyPage?.()}>Learn more</button>
            </p>
            <button type="button" className="btn btn-primary btn-sm" onClick={accept}>Allow cookies</button>
        </div>
    );
}
