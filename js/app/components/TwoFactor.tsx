// The two-factor forms: the code step of signing in, and setting up an
// authenticator app. The site shows them in dialogs (js/app/dialogs/mfa.tsx);
// the staff console (Woogidex-Console) shows them on its sign-in page. They
// need only React, the icons and js/features/mfa.ts.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from './Icon.tsx';
import { finishEnrollment, listTotp, startEnrollment, verifyCode, type Enrollment, type TotpFactor } from '../../features/mfa.ts';

/** The 6-digit field: digits only, filled by a phone's one-time-code suggestion. */
function CodeInput({ id, value, onChange, autoFocus = true }: { id: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
    return (
        <input id={id} className="tf-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
            placeholder="123456" autoFocus={autoFocus} value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} />
    );
}

/** The code step: verifies a code from one of the account's apps. */
export function TwoFactorCode({ onDone, onCancel, cancelLabel = 'Sign out' }: { onDone: () => void; onCancel?: () => void; cancelLabel?: string }) {
    const [factors, setFactors] = useState<TotpFactor[] | null>(null);
    const [factorId, setFactorId] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        listTotp().then(list => { setFactors(list); setFactorId(list[0]?.id || ''); }).catch(e => { setFactors([]); setError(e.message); });
    }, []);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try { await verifyCode(code, factorId); onDone(); }
        catch (err: any) { setError(err.message || 'The code could not be checked.'); setCode(''); }
        finally { setBusy(false); }
    }

    return (
        <form className="tf-form" onSubmit={submit}>
            <p className="tf-lead">Open your authenticator app and type the 6-digit code for Woogidex.</p>
            {factors && factors.length > 1 && (
                <div className="form-group">
                    <label htmlFor="tf-factor">Which app</label>
                    <select id="tf-factor" value={factorId} onChange={e => setFactorId(e.target.value)}>
                        {factors.map(f => <option key={f.id} value={f.id}>{f.friendly_name || 'Authenticator'}</option>)}
                    </select>
                </div>
            )}
            <div className="form-group">
                <label htmlFor="tf-code">Code</label>
                <CodeInput id="tf-code" value={code} onChange={setCode} />
            </div>
            {error && <p className="tf-error" role="alert">{error}</p>}
            <div className="tf-actions">
                {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>}
                <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}><Icon name="shield-check" size={16} /> {busy ? 'Checking…' : 'Verify'}</button>
            </div>
        </form>
    );
}

/** Setting up an app: scan the QR code (or type the key), then confirm with its first code. */
export function TwoFactorSetup({ onDone, onCancel, cancelLabel = 'Cancel', intro }: { onDone: () => void; onCancel?: () => void; cancelLabel?: string; intro?: string }) {
    const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    // one setup per form, also when development mode runs the effect twice
    const started = useRef(false);
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        startEnrollment().then(setEnrollment).catch(e => setError(e.message || 'Two-factor setup could not start.'));
    }, []);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!enrollment || busy) return;
        setBusy(true);
        setError('');
        try { await finishEnrollment(enrollment.id, code); onDone(); }
        catch (err: any) { setError(err.message || 'The code could not be checked.'); setCode(''); }
        finally { setBusy(false); }
    }
    const copy = async () => {
        if (!enrollment) return;
        try { await navigator.clipboard.writeText(enrollment.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the key stays on screen to type */ }
    };

    return (
        <form className="tf-form" onSubmit={submit}>
            <p className="tf-lead">{intro || 'Each time you sign in, Woogidex will also ask for a code from an app on your phone, so a stolen password is not enough.'}</p>
            <ol className="tf-steps">
                <li>
                    <strong>Scan this with an authenticator app</strong>
                    <span>Google Authenticator, Microsoft Authenticator, Authy, 1Password and Bitwarden all work.</span>
                    <div className="tf-qr">
                        {enrollment ? <img src={enrollment.qr} alt="QR code for your authenticator app" width="176" height="176" /> : <span className="tf-qr-wait" aria-busy="true" />}
                    </div>
                    {enrollment && (
                        <span className="tf-secret">
                            Can’t scan it? Type this key: <code>{enrollment.secret}</code>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Icon name={copied ? 'check' : 'clipboard'} size={14} />{copied ? 'Copied' : 'Copy'}</button>
                        </span>
                    )}
                </li>
                <li>
                    <strong>Type the 6-digit code the app shows</strong>
                    <CodeInput id="tf-setup-code" value={code} onChange={setCode} autoFocus={false} />
                </li>
            </ol>
            {error && <p className="tf-error" role="alert">{error}</p>}
            <div className="tf-actions">
                {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>}
                <button type="submit" className="btn btn-primary" disabled={!enrollment || busy || code.length !== 6}><Icon name="shield-check" size={16} /> {busy ? 'Checking…' : 'Turn on'}</button>
            </div>
        </form>
    );
}
