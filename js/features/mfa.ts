// ==================== two-factor sign-in (TOTP) ====================
// An authenticator app code as the second step of signing in. Supabase Auth
// keeps the factors; a session that passed the code is "aal2". The database
// relies on it (Woogidex-DB migration 20261104180000_two_factor.sql):
// staff powers need it, and an account with two-factor on gets no data until
// the code is in.
//
// A leaf module (it only needs the Supabase client), so the staff console
// (Woogidex-Console) uses the same code. The UI: js/app/components/TwoFactor.tsx.

import { getClient } from '../core/supabase.ts';

export interface TotpFactor { id: string; friendly_name?: string; status: string; created_at: string }
export interface Enrollment { id: string; qr: string; secret: string }

/** The "aal" claim of an access token: 'aal2' once the code passed. */
export function tokenAal(accessToken?: string | null): string {
    try {
        const part = String(accessToken || '').split('.')[1] || '';
        const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(json).aal || 'aal1';
    } catch { return 'aal1'; }
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
