// Settings > Account > Two-factor sign-in: turn on an authenticator app,
// add a second one as a spare, or remove one; and turn email codes on or
// off. The forms are js/app/components/TwoFactor.tsx; the rules,
// js/features/mfa.ts.

import { useEffect, useState } from 'react';
import { api, state } from '../../core/app.ts';
import { openDialog } from '../dialogs.tsx';
import { Icon } from '../components/Icon.tsx';
import { confirmDialog } from '../../core/confirm-dialog.ts';
import { disableEmailCodes, emailStatus, listTotp, removeTotp, type TotpFactor } from '../../features/mfa.ts';
import { GroupHead } from './SettingsPage.tsx';

export function TwoFactorGroup() {
    const [apps, setApps] = useState<TotpFactor[] | null>(null);
    const [email, setEmail] = useState<boolean | null>(null);
    const [error, setError] = useState('');
    const load = () => Promise.all([listTotp(), emailStatus().then(s => s.enabled).catch(() => false)])
        .then(([list, on]) => { setApps(list); setEmail(on); setError(''); })
        .catch(e => setError(e.message || 'Two-factor could not be loaded.'));
    useEffect(() => { load(); }, []);
    const setup = () => openDialog('mfa-setup', {
        resolve: (ok: boolean) => { if (ok) { api.showToast?.('Two-factor sign-in is on. Keep your phone close when you sign in.', 'success'); load(); } }
    });
    const setupEmail = () => openDialog('mfa-email-setup', {
        resolve: (ok: boolean) => { if (ok) { api.showToast?.('Email codes are on. Woogidex will email you a code each time you sign in.', 'success'); load(); } }
    });
    async function remove(f: TotpFactor) {
        const last = (apps || []).length === 1;
        const ok = await confirmDialog({
            title: last ? 'Remove your last authenticator app?' : 'Remove this app?',
            message: last
                ? (email ? 'Sign-in will then ask for an email code instead. Staff accounts need an app for staff tools.' : 'Your password alone will sign you in again. Staff accounts need two-factor for staff tools.')
                : 'You can still sign in with your other app.',
            confirmLabel: 'Remove'
        });
        if (!ok) return;
        try {
            await removeTotp(f.id);
            // straight from the answer: Supabase's factor list can lag a moment behind a removal
            setApps(list => (list || []).filter(x => x.id !== f.id));
            api.showToast?.('App removed.', 'info');
        }
        catch (e: any) { api.showToast?.(e.message || 'The app could not be removed.', 'error'); }
    }
    async function removeEmail() {
        const ok = await confirmDialog({
            title: 'Turn off email codes?',
            message: apps?.length ? 'Sign-in will still ask for a code from your authenticator app.' : 'Your password alone will sign you in again.',
            confirmLabel: 'Turn off'
        });
        if (!ok) return;
        try { await disableEmailCodes(); setEmail(false); api.showToast?.('Email codes are off.', 'info'); }
        catch (e: any) { api.showToast?.(e.message || 'Email codes could not be turned off.', 'error'); }
    }

    const hasApp = !!apps?.length;
    const on = hasApp || !!email;
    const canEmail = !!state.user?.hasRealEmail;
    return (
        <section className="st-group">
            <GroupHead title="Two-factor sign-in" desc="Ask for a code each time you sign in, from an app on your phone or sent to your email, so a stolen password is not enough. Staff accounts need an app." />
            <div className="st-card tf-card">
                {error ? <p className="tf-error">{error}</p> : !apps ? <p className="tf-muted">Checking…</p> : (
                    <>
                        <div className="tf-status">
                            <span className={`tf-badge${on ? ' is-on' : ''}`}><Icon name={on ? 'shield-check' : 'shield-exclamation'} size={16} />{on ? 'On' : 'Off'}</span>
                            <span className="tf-muted">{on ? [hasApp && `${apps.length} authenticator app${apps.length === 1 ? '' : 's'}`, email && 'email codes'].filter(Boolean).join(' and ') : 'Only your password protects this account.'}</span>
                        </div>
                        <ul className="tf-apps">
                            {apps.map(f => (
                                <li key={f.id}>
                                    <Icon name="device-phone-mobile" size={16} />
                                    <span>{f.friendly_name || 'Authenticator'}<small>Added {new Date(f.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</small></span>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => remove(f)}>Remove</button>
                                </li>
                            ))}
                            <li>
                                <Icon name="device-phone-mobile" size={16} />
                                <span>{hasApp ? 'Add a spare app' : 'Authenticator app'}<small>{hasApp ? 'A spare app on a second device keeps you in if you lose your phone.' : 'The strongest choice. Staff tools need it.'}</small></span>
                                <button type="button" className={`btn btn-sm ${hasApp ? 'btn-secondary' : 'btn-primary'}`} onClick={setup}><Icon name="plus" size={14} />{hasApp ? 'Add' : 'Set up'}</button>
                            </li>
                            <li>
                                <Icon name="envelope" size={16} />
                                <span>Email codes<small>{email
                                    ? (hasApp ? 'On. Sign-in asks for your app code first, so email codes are a fallback only if you remove your apps.' : 'On. Each sign-in sends a code to your email.')
                                    : canEmail ? 'A code sent to your email each time you sign in.' : 'Add an email to your account first.'}</small></span>
                                {email
                                    ? <button type="button" className="btn btn-secondary btn-sm" onClick={removeEmail}>Turn off</button>
                                    : <button type="button" className="btn btn-secondary btn-sm" onClick={setupEmail} disabled={!canEmail}>Turn on</button>}
                            </li>
                        </ul>
                    </>
                )}
            </div>
        </section>
    );
}
