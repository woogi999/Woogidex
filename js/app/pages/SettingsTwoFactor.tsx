// Settings > Account > Two-factor sign-in: turn email codes on or off, and
// set up, add or remove authenticator apps. The forms are
// js/app/components/TwoFactor.tsx; the rules, js/features/mfa.ts; the
// styles, css/two-factor.css.

import { useEffect, useState } from 'react';
import { api, state } from '../../core/app.ts';
import { openDialog } from '../dialogs.tsx';
import { Icon } from '../components/Icon.tsx';
import { confirmDialog } from '../../core/confirm-dialog.ts';
import { disableEmailCodes, emailStatus, listTotp, removeTotp, type TotpFactor } from '../../features/mfa.ts';
import { GroupHead } from './SettingsPage.tsx';

function Chip({ on }: { on: boolean }) {
    return <span className={`tf-chip${on ? ' is-on' : ''}`}>{on ? 'On' : 'Off'}</span>;
}

export function TwoFactorGroup() {
    const [apps, setApps] = useState<TotpFactor[] | null>(null);
    const [email, setEmail] = useState(false);
    const [error, setError] = useState('');
    const load = () => Promise.all([listTotp(), emailStatus().then(s => s.enabled).catch(() => false)])
        .then(([list, on]) => { setApps(list); setEmail(on); setError(''); })
        .catch(e => setError(e.message || 'Two-factor could not be loaded.'));
    useEffect(() => { load(); }, []);

    const setupApp = () => openDialog('mfa-setup', {
        resolve: (ok: boolean) => { if (ok) { api.showToast?.('Authenticator app added. Sign-in now asks for its code.', 'success'); load(); } }
    });
    const setupEmail = () => openDialog('mfa-email-setup', {
        resolve: (ok: boolean) => { if (ok) { api.showToast?.('Email codes are on. Each sign-in now sends a code to your email.', 'success'); load(); } }
    });
    async function removeApp(f: TotpFactor) {
        const last = (apps || []).length === 1;
        const ok = await confirmDialog({
            title: last ? 'Remove your last authenticator app?' : 'Remove this app?',
            message: last
                ? (email ? 'Sign-in will ask for an email code instead.' : 'Your password alone will sign you in again.')
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
    async function turnOffEmail() {
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
    const on = hasApp || email;
    const canEmail = !!state.user?.hasRealEmail;
    const summary = !on ? 'Only your password protects this account. Turn on one way below.'
        : hasApp ? 'Each sign-in asks for a code from your authenticator app.'
            : 'Each sign-in sends a code to your email.';
    return (
        <section className="st-group">
            <GroupHead title="Two-factor sign-in" desc="Ask for a code each time you sign in, so a stolen password is not enough." />
            <div className="st-card tf-card">
                {error ? <p className="tf-error">{error}</p> : !apps ? <p className="tf-muted">Checking…</p> : (
                    <>
                        <div className="tf-status">
                            <span className={`tf-badge${on ? ' is-on' : ''}`}><Icon name={on ? 'shield-check' : 'shield-exclamation'} size={16} />{on ? 'On' : 'Off'}</span>
                            <span className="tf-muted">{summary}</span>
                        </div>
                        <ul className="tf-methods">
                            <li>
                                <span className="tf-head-icon"><Icon name="envelope" size={20} /></span>
                                <span className="tf-method-text">
                                    <strong>Email codes <Chip on={email} /></strong>
                                    <small>{email
                                        ? (hasApp ? 'A backup: sign-in uses your app while you have one.' : 'A code goes to your email each time you sign in.')
                                        : canEmail ? 'A code goes to your email each time you sign in. Quick to set up.' : 'Add a confirmed email to your account first.'}</small>
                                </span>
                                {email
                                    ? <button type="button" className="btn btn-secondary btn-sm" onClick={turnOffEmail}>Turn off</button>
                                    : <button type="button" className="btn btn-secondary btn-sm" onClick={setupEmail} disabled={!canEmail}>Turn on</button>}
                            </li>
                            <li>
                                <span className="tf-head-icon"><Icon name="device-phone-mobile" size={20} /></span>
                                <span className="tf-method-text">
                                    <strong>Authenticator app <Chip on={hasApp} /></strong>
                                    <small>{hasApp ? 'Add a spare app on a second device, in case you lose your phone.' : 'A code from an app on your phone. The strongest choice.'}</small>
                                    {hasApp && (
                                        <ul className="tf-apps">
                                            {apps.map(f => (
                                                <li key={f.id}>
                                                    <span>{f.friendly_name || 'Authenticator'}<small>Added {new Date(f.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</small></span>
                                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeApp(f)}>Remove</button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </span>
                                <button type="button" className={`btn btn-sm ${hasApp ? 'btn-secondary' : 'btn-primary'}`} onClick={setupApp}>
                                    <Icon name="plus" size={14} />{hasApp ? 'Add' : 'Set up'}
                                </button>
                            </li>
                        </ul>
                    </>
                )}
            </div>
        </section>
    );
}
