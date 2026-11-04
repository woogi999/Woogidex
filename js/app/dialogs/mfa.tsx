// Two-factor dialogs: the code step after a password (or a Google/Discord)
// sign-in, and setting up an authenticator app. The forms are
// js/app/components/TwoFactor.tsx; the gate that opens the code step is
// requireSecondFactor() in js/features/auth.ts.

import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { TwoFactorCode, TwoFactorSetup } from '../components/TwoFactor.tsx';

/** The code step. Closing it without a code signs the account out (resolve(false)). */
function MfaCodeDialog({ close, resolve }: DialogProps<{ resolve: (ok: boolean) => void }>) {
    const finish = (ok: boolean) => { close(); resolve(ok); };
    return (
        <Modal onClose={() => finish(false)} title="Two-factor sign-in" className="tf-modal" labelledBy="tf-code-title" dismissible={false}>
            <TwoFactorCode onDone={() => finish(true)} onCancel={() => finish(false)} />
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

registerDialog('mfa-code', MfaCodeDialog);
registerDialog('mfa-setup', MfaSetupDialog);
