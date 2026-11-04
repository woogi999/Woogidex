// The two-factor forms: the code step of signing in (an app code or an email
// code), setting up an authenticator app, turning on email codes, and the
// choice between the two. The site shows them in dialogs
// (js/app/dialogs/mfa.tsx); the staff console (Woogidex-Console) shows them on
// its sign-in page. They need only React, the icons and js/features/mfa.ts.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import { finishEnrollment, listTotp, sendEmailCode, startEnrollment, verifyCode, verifyEmailCode, type Enrollment, type SecondFactor, type TotpFactor } from '../../features/mfa.ts';

/**
 * The 6-digit field: one real input (so paste, autofill and a phone's
 * one-time-code suggestion work) drawn as six cells. Calls onComplete when
 * the sixth digit is in.
 */
function CodeInput({ id, value, onChange, onComplete, autoFocus = true, disabled = false }: {
    id: string; value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; autoFocus?: boolean; disabled?: boolean;
}) {
    const [focused, setFocused] = useState(false);
    return (
        <div className={`tf-otp${focused ? ' is-focused' : ''}`}>
            <input id={id} className="tf-otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
                autoFocus={autoFocus} disabled={disabled} value={value} aria-describedby={`${id}-hint`}
                onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                    onChange(v);
                    if (v.length === 6 && v !== value) onComplete?.(v);
                }} />
            <div className="tf-otp-cells" aria-hidden>
                {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} className={`tf-otp-cell${i === Math.min(value.length, 5) && focused ? ' is-caret' : ''}${value[i] ? ' is-filled' : ''}`}>{value[i] || ''}</span>
                ))}
            </div>
            <span id={`${id}-hint`} className="sr-only">6 digits</span>
        </div>
    );
}

/** The icon and short lead at the top of each form. */
function FormHead({ icon, children }: { icon: string; children: ReactNode }) {
    return (
        <div className="tf-head">
            <span className="tf-head-icon"><Icon name={icon} size={20} /></span>
            <p className="tf-lead">{children}</p>
        </div>
    );
}

function Actions({ children }: { children: ReactNode }) {
    return <div className="tf-actions">{children}</div>;
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

    async function check(value = code) {
        if (busy) return;
        setBusy(true);
        setError('');
        try { await verifyCode(value, factorId); onDone(); }
        catch (err: any) { setError(err.message || 'The code could not be checked.'); setCode(''); }
        finally { setBusy(false); }
    }
    const submit = (e: FormEvent) => { e.preventDefault(); check(); };

    return (
        <form className="tf-form" onSubmit={submit}>
            <FormHead icon="device-phone-mobile">Open your authenticator app and type the 6-digit code for Woogidex.</FormHead>
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
                <CodeInput id="tf-code" value={code} onChange={setCode} onComplete={check} disabled={busy} />
            </div>
            {error && <p className="tf-error" role="alert">{error}</p>}
            <Actions>
                {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>}
                <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}><Icon name="shield-check" size={16} /> {busy ? 'Checking…' : 'Verify'}</button>
            </Actions>
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

    async function check(value = code) {
        if (!enrollment || busy) return;
        setBusy(true);
        setError('');
        try { await finishEnrollment(enrollment.id, value); onDone(); }
        catch (err: any) { setError(err.message || 'The code could not be checked.'); setCode(''); }
        finally { setBusy(false); }
    }
    const submit = (e: FormEvent) => { e.preventDefault(); check(); };
    const copy = async () => {
        if (!enrollment) return;
        try { await navigator.clipboard.writeText(enrollment.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the key stays on screen to type */ }
    };

    return (
        <form className="tf-form" onSubmit={submit}>
            <FormHead icon="device-phone-mobile">{intro || 'Each time you sign in, Woogidex will also ask for a code from an app on your phone.'}</FormHead>
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
                    <CodeInput id="tf-setup-code" value={code} onChange={setCode} onComplete={check} autoFocus={false} disabled={!enrollment || busy} />
                </li>
            </ol>
            {error && <p className="tf-error" role="alert">{error}</p>}
            <Actions>
                {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>}
                <button type="submit" className="btn btn-primary" disabled={!enrollment || busy || code.length !== 6}><Icon name="shield-check" size={16} /> {busy ? 'Checking…' : 'Turn on'}</button>
            </Actions>
        </form>
    );
}

/**
 * The email code: sends one to the account's email when it opens, then checks
 * it. purpose 'signin' is the code step of signing in; 'setup' turns email
 * codes on.
 */
export function EmailCodeForm({ purpose, onDone, onCancel, cancelLabel = 'Sign out' }: { purpose: 'signin' | 'setup'; onDone: () => void; onCancel?: () => void; cancelLabel?: string }) {
    const [to, setTo] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [sending, setSending] = useState(false);
    const [wait, setWait] = useState(0);
    // one email per form, also when development mode runs the effect twice
    const sent = useRef(false);

    async function send() {
        setSending(true);
        setError('');
        try { setTo(await sendEmailCode(purpose)); setWait(30); }
        catch (err: any) { setError(err.message || 'The code could not be sent.'); }
        finally { setSending(false); }
    }
    useEffect(() => {
        if (sent.current) return;
        sent.current = true;
        send();
    }, []);
    useEffect(() => {
        if (wait <= 0) return;
        const t = setTimeout(() => setWait(w => w - 1), 1000);
        return () => clearTimeout(t);
    }, [wait]);

    async function check(value = code) {
        if (busy) return;
        setBusy(true);
        setError('');
        try { await verifyEmailCode(value); onDone(); }
        catch (err: any) { setError(err.message || 'The code could not be checked.'); setCode(''); }
        finally { setBusy(false); }
    }
    const submit = (e: FormEvent) => { e.preventDefault(); check(); };

    return (
        <form className="tf-form" onSubmit={submit}>
            <FormHead icon="envelope">
                {to ? <>We sent a 6-digit code to <strong>{to}</strong>. It works for 10 minutes.</>
                    : sending ? 'Sending a code to your email…' : 'Send a code to your email, then type it here.'}
            </FormHead>
            <div className="form-group">
                <label htmlFor="tf-email-code">Code</label>
                <CodeInput id="tf-email-code" value={code} onChange={setCode} onComplete={check} disabled={busy} />
            </div>
            {error && <p className="tf-error" role="alert">{error}</p>}
            <p className="tf-resend">
                Nothing yet? Check your spam folder, or{' '}
                <button type="button" className="tf-link" onClick={send} disabled={sending || wait > 0}>
                    {wait > 0 ? `send a new code in ${wait}s` : 'send a new code'}
                </button>.
            </p>
            <Actions>
                {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>}
                <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}><Icon name="shield-check" size={16} /> {busy ? 'Checking…' : purpose === 'setup' ? 'Turn on' : 'Verify'}</button>
            </Actions>
        </form>
    );
}

/** The two ways to get a code, for a first setup (the staff console asks this). */
export function TwoFactorChoice({ onPick, onCancel, cancelLabel = 'Sign out', canEmail = true }: { onPick: (m: SecondFactor) => void; onCancel?: () => void; cancelLabel?: string; canEmail?: boolean }) {
    return (
        <div className="tf-form">
            <ul className="tf-methods">
                <li>
                    <span className="tf-head-icon"><Icon name="envelope" size={20} /></span>
                    <span className="tf-method-text"><strong>Email codes</strong><small>{canEmail ? 'A code goes to your email each time you sign in. Quick to set up.' : 'Add a confirmed email to your account first.'}</small></span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPick('email')} disabled={!canEmail}>Use email</button>
                </li>
                <li>
                    <span className="tf-head-icon"><Icon name="device-phone-mobile" size={20} /></span>
                    <span className="tf-method-text"><strong>Authenticator app</strong><small>A code from an app on your phone. The strongest choice.</small></span>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onPick('totp')}>Use an app</button>
                </li>
            </ul>
            {onCancel && <Actions><button type="button" className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button></Actions>}
        </div>
    );
}
