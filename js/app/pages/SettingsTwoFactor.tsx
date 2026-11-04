// Settings > Account > Two-factor sign-in: turn on an authenticator app,
// add a second one as a spare, or remove one. The forms are
// js/app/components/TwoFactor.tsx; the rules, js/features/mfa.ts.

import { useEffect, useState } from 'react';
import { api } from '../../core/app.ts';
import { openDialog } from '../dialogs.tsx';
import { Icon } from '../components/Icon.tsx';
import { confirmDialog } from '../../core/confirm-dialog.ts';
import { listTotp, removeTotp, type TotpFactor } from '../../features/mfa.ts';
import { GroupHead } from './SettingsPage.tsx';

export function TwoFactorGroup() {
    const [apps, setApps] = useState<TotpFactor[] | null>(null);
    const [error, setError] = useState('');
    const load = () => listTotp().then(list => { setApps(list); setError(''); }).catch(e => setError(e.message || 'Two-factor could not be loaded.'));
    useEffect(() => { load(); }, []);
    const setup = () => openDialog('mfa-setup', {
        resolve: (ok: boolean) => { if (ok) { api.showToast?.('Two-factor sign-in is on. Keep your phone close when you sign in.', 'success'); load(); } }
    });
    async function remove(f: TotpFactor) {
        const last = (apps || []).length === 1;
        const ok = await confirmDialog({
            title: last ? 'Turn off two-factor sign-in?' : 'Remove this app?',
            message: last ? 'Your password alone will sign you in again. Staff accounts need two-factor for staff tools.' : 'You can still sign in with your other app.',
            confirmLabel: last ? 'Turn off' : 'Remove'
        });
        if (!ok) return;
        try {
            await removeTotp(f.id);
            // straight from the answer: Supabase's factor list can lag a moment behind a removal
            setApps(list => (list || []).filter(x => x.id !== f.id));
            api.showToast?.(last ? 'Two-factor sign-in is off.' : 'App removed.', 'info');
        }
        catch (e: any) { api.showToast?.(e.message || 'The app could not be removed.', 'error'); }
    }

    const on = !!apps?.length;
    return (
        <section className="st-group">
            <GroupHead title="Two-factor sign-in" desc="Ask for a code from an app on your phone each time you sign in, so a stolen password is not enough. Staff accounts need it." />
            <div className="st-card tf-card">
                {error ? <p className="tf-error">{error}</p> : !apps ? <p className="tf-muted">Checking…</p> : (
                    <>
                        <div className="tf-status">
                            <span className={`tf-badge${on ? ' is-on' : ''}`}><Icon name={on ? 'shield-check' : 'shield-exclamation'} size={16} />{on ? 'On' : 'Off'}</span>
                            <span className="tf-muted">{on ? `${apps.length} authenticator app${apps.length === 1 ? '' : 's'}` : 'Only your password protects this account.'}</span>
                            <button type="button" className={`btn btn-sm ${on ? 'btn-secondary' : 'btn-primary'}`} onClick={setup}>
                                <Icon name="plus" size={14} />{on ? 'Add a spare app' : 'Turn on'}
                            </button>
                        </div>
                        {on && (
                            <ul className="tf-apps">
                                {apps.map(f => (
                                    <li key={f.id}>
                                        <Icon name="device-phone-mobile" size={16} />
                                        <span>{f.friendly_name || 'Authenticator'}<small>Added {new Date(f.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</small></span>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => remove(f)}>Remove</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {on && <p className="tf-muted">A spare app on a second device keeps you in if you lose your phone.</p>}
                    </>
                )}
            </div>
        </section>
    );
}
