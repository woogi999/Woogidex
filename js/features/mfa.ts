// ==================== two-factor sign-in (TOTP) ====================
// An authenticator app code as the second step of signing in. Supabase Auth
// keeps the factors; a session that passed the code is "aal2". The database
// relies on it (Woogidex-DB migration 20261104180000_two_factor.sql):
// staff powers need it, and an account with two-factor on gets no data until
// the code is in.
//
// A second kind: a code sent to the account's email (migration
// 20261105120000_email_two_factor.sql, edge function send-email-code). The
// database marks the session as passed; the token stays aal1. An account
// with an app always uses the app code. Staff may use either (migration
// 20261105130000_staff_email_two_factor.sql).
//
// A leaf module (it only needs the Supabase client), so the staff console
// (Woogidex-Console) uses the same code. The UI: js/app/components/TwoFactor.tsx.

import { getClient } from '../core/supabase.ts';

export interface TotpFactor { id: string; friendly_name?: string; status: string; created_at: string }
export interface Enrollment { id: string; qr: string; secret: string }
export type SecondFactor = 'totp' | 'email';
export interface EmailStatus { enabled: boolean; has_app: boolean; needs_code: boolean }

function tokenClaims(accessToken?: string | null): Record<string, any> {
    try {
        const part = String(accessToken || '').split('.')[1] || '';
        return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return {}; }
}

/** The "aal" claim of an access token: 'aal2' once the app code passed. */
export function tokenAal(accessToken?: string | null): string {
    return tokenClaims(accessToken).aal || 'aal1';
}

/** The "session_id" claim: one sign-in. A token refresh keeps it; a new sign-in changes it. */
export function tokenSessionId(accessToken?: string | null): string {
    return String(tokenClaims(accessToken).session_id || '');
}

/**
 * Whether this session still needs the code: the account has a verified
 * factor and the token has not passed it. Read from the session alone, with
 * no call to Supabase, so it is safe inside onAuthStateChange.
 */
export function sessionNeedsCode(session: any): boolean {
    if (!session?.user) return false;
    const verified = (session.user.factors || []).some((f: any) => f.status === 'verified');
    return verified && tokenAal(session.access_token) !== 'aal2';
}

/**
 * Which code this session still needs, asked of the database. The session's
 * own copy of the factors can be old: an app or email codes turned on in
 * another tab or device after this session started. Calls Supabase, so never
 * await it inside onAuthStateChange.
 */
export async function secondFactorNeeded(session: any): Promise<SecondFactor | null> {
    if (!session?.user || tokenAal(session.access_token) === 'aal2') return null;
    if (sessionNeedsCode(session)) return 'totp';
    const client = await getClient();
    const { data, error } = await client.rpc('email_2fa_status');
    if (!error && data) return data.needs_code ? (data.has_app ? 'totp' : 'email') : null;
    // a database without email codes yet: the older check still knows about apps
    const { data: ok, error: okError } = await client.rpc('mfa_satisfied');
    return !okError && ok === false ? 'totp' : null;
}

/** Email codes: on or off, whether an app is set up too. */
export async function emailStatus(): Promise<EmailStatus> {
    const client = await getClient();
    const { data, error } = await client.rpc('email_2fa_status');
    if (error) throw new Error('Email codes could not be loaded.');
    return data as EmailStatus;
}

/** Emails a code for this session. Answers the masked address it went to. */
export async function sendEmailCode(purpose: 'signin' | 'setup'): Promise<string> {
    const client = await getClient();
    const { data, error } = await client.functions.invoke('send-email-code', { body: { purpose } });
    if (error) {
        const msg = await (error as any).context?.json?.().then((b: any) => b?.error).catch(() => null);
        throw new Error(msg || 'The code could not be sent. Try again in a minute.');
    }
    return String(data?.to || 'your email');
}

/** Checks an email code; on success this session may use the site (and, for a setup, email codes are on). */
export async function verifyEmailCode(code: string): Promise<void> {
    const clean = String(code || '').replace(/\D/g, '');
    if (clean.length !== 6) throw new Error('Type the 6 digits from the email.');
    const client = await getClient();
    const { data, error } = await client.rpc('email_2fa_verify', { p_code: clean });
    if (error) throw new Error('The code could not be checked. Try again.');
    if (!data?.ok) throw new Error(data?.error || 'That code is not right.');
}

/** Turns email codes off. Needs a session that passed two-factor. */
export async function disableEmailCodes(): Promise<void> {
    const client = await getClient();
    const { error } = await client.rpc('email_2fa_disable');
    if (error) throw new Error(error.message || 'Email codes could not be turned off.');
}

/** Your authenticator apps (verified ones; a setup left half done is not listed). */
export async function listTotp(): Promise<TotpFactor[]> {
    const client = await getClient();
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    return (data?.totp || []).filter((f: any) => f.status === 'verified');
}

/** Checks a code against one of your apps; on success the session is aal2. */
export async function verifyCode(code: string, factorId?: string): Promise<void> {
    const clean = String(code || '').replace(/\D/g, '');
    if (clean.length !== 6) throw new Error('Type the 6 digits your app shows.');
    const client = await getClient();
    const id = factorId || (await listTotp())[0]?.id;
    if (!id) throw new Error('This account has no authenticator app set up.');
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: id, code: clean });
    if (error) throw new Error(/invalid|expired/i.test(error.message) ? 'That code is not right. Codes change every 30 seconds, so try the newest one.' : error.message);
}

/** Starts setting up an app: a QR code to scan and the same key as text. Clears a setup left half done first. */
export async function startEnrollment(): Promise<Enrollment> {
    const client = await getClient();
    const { data: factors } = await client.auth.mfa.listFactors();
    for (const f of (factors?.all || []).filter((x: any) => x.factor_type === 'totp' && x.status !== 'verified')) {
        await client.auth.mfa.unenroll({ factorId: f.id });
    }
    // the name must be new for the account; the time makes it so
    const when = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator app, added ${when}` });
    if (error) throw error;
    return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Finishes a setup with the first code from the app. */
export async function finishEnrollment(factorId: string, code: string): Promise<void> {
    await verifyCode(code, factorId);
}

/** Removes an app. Needs a session that passed the code. */
export async function removeTotp(factorId: string): Promise<void> {
    const client = await getClient();
    const { error } = await client.auth.mfa.unenroll({ factorId });
    if (error) throw new Error(/aal2/i.test(error.message) ? 'Sign in with your code first, then remove the app.' : error.message);
    // the session has to forget the factor too, or it still reads as two-factor on
    await client.auth.refreshSession();
}
