// Two-factor dialogs: the code step after a password (or a Google/Discord)
// sign-in, setting up an authenticator app, and turning on email codes. The
// forms are js/app/components/TwoFactor.tsx; the gate that opens the code
// step is requireSecondFactor() in js/features/auth.ts.

import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { EmailCodeForm, TwoFactorCode, TwoFactorSetup } from '../components/TwoFactor.tsx';
import type { SecondFactor } from '../../features/mfa.ts';

/** The code step (an app code, or an email code). Closing it without a code signs the account out (resolve(false)). */
function MfaCodeDialog({ close, resolve, method = 'totp' }: DialogProps<{ resolve: (ok: boolean) => void; method?: SecondFactor }>) {
    const finish = (ok: boolean) => { close(); resolve(ok); };
    return (
        <Modal onClose={() => finish(false)} title="Two-factor sign-in" className="tf-modal" labelledBy="tf-code-title" dismissible={false}>
            {method === 'email'
                ? <EmailCodeForm purpose="signin" onDone={() => finish(true)} onCancel={() => finish(false)} />
                : <TwoFactorCode onDone={() => finish(true)} onCancel={() => finish(false)} />}
        </Modal>
    );
}

/** Setting up an app; resolve(true) once it is on. */
function MfaSetupDialog({ close, resolve }: DialogProps<{ resolve?: (ok: boolean) => void }>) {
    const finish = (ok: boolean) => { close(); resolve?.(ok); };
    return (
        <Modal onClose={() => finish(false)} title="Turn on two-factor sign-in" className="tf-modal" labelledBy="tf-setup-title">
            <TwoFactorSetup onDone={() => finish(true)} onCancel={() => finish(false)} />
        </Modal>
    );
}

/** Turning on email codes; resolve(true) once they are on. */
function MfaEmailSetupDialog({ close, resolve }: DialogProps<{ resolve?: (ok: boolean) => void }>) {
    const finish = (ok: boolean) => { close(); resolve?.(ok); };
    return (
        <Modal onClose={() => finish(false)} title="Turn on email codes" className="tf-modal" labelledBy="tf-email-setup-title">
            <EmailCodeForm purpose="setup" onDone={() => finish(true)} onCancel={() => finish(false)} cancelLabel="Cancel" />
        </Modal>
    );
}

registerDialog('mfa-code', MfaCodeDialog);
registerDialog('mfa-setup', MfaSetupDialog);
registerDialog('mfa-email-setup', MfaEmailSetupDialog);
