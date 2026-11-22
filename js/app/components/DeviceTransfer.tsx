// Settings > Data & Storage > Move to another device. The steps on screen
// for js/features/device-transfer.ts: send (show a code) or receive (type the
// code, then Add or Replace). Styles: the end of css/settings.css.

import { useState, useSyncExternalStore } from 'react';
import { api } from '../../core/app.ts';
import {
    cancelTransfer, importReceived, onTransferChange, startReceiving, startSending, transferState
} from '../../features/device-transfer.ts';
import { Icon } from './Icon.tsx';
import { confirmDialog } from '../../core/confirm-dialog.ts';

const mb = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

function Summary({ counts }: { counts: Record<string, number> | null }) {
    if (!counts) return null;
    const parts = Object.entries(counts).filter(([, n]) => n > 0);
    if (!parts.length) return <p className="st-desc">An empty collection.</p>;
    return <ul className="xfer-summary">{parts.map(([k, n]) => <li key={k}><strong>{n}</strong> {k}</li>)}</ul>;
}

function Progress({ sent, total }: { sent: number; total: number }) {
    const pct = total ? Math.min(100, Math.round(sent / total * 100)) : 0;
    return (
        <div className="xfer-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Transfer progress">
            <span style={{ width: `${pct}%` }} />
            <small>{mb(sent)} of {mb(total)}</small>
        </div>
    );
}

export function DeviceTransferGroup() {
    const s = useSyncExternalStore(onTransferChange, transferState);
    const [code, setCode] = useState('');
    const signedIn = !!api.isLoggedIn?.();
    const busy = !['idle', 'done', 'error'].includes(s.stage);
    const replace = async () => {
        if (await confirmDialog({ title: 'Replace this collection?', message: 'Everything in My Collection on this device goes away, and what came from the other device takes its place.', confirmLabel: 'Replace', danger: true })) importReceived('replace');
    };
    return (
        <section className="st-group">
            {/* the same head as SettingsPage's GroupHead, written out to keep the two files apart */}
            <div className="st-group-head">
                <h3>Move to another device</h3>
                <p>Send your whole collection straight from this browser to another one, for a new phone or computer. Sign in to the same account on both. Nothing is stored on our servers.</p>
            </div>
            <div className="st-card xfer">
                {!signedIn && <div className="st-row st-row-static"><span className="st-row-text"><span className="st-label">Sign in first</span><span className="st-desc">Both devices need to be signed in to the same account.</span></span>
                    <span className="st-row-control"><button type="button" className="btn btn-secondary btn-sm" onClick={() => api.openAuthModal?.('signin')}>Sign in</button></span></div>}

                {signedIn && s.stage === 'idle' && (
                    <>
                        <div className="st-row st-row-static">
                            <span className="st-row-text"><span className="st-label">Send from this device</span><span className="st-desc">Shows a code. Type it on the other device.</span></span>
                            <span className="st-row-control"><button type="button" className="btn btn-primary btn-sm" onClick={startSending}><Icon name="arrow-up-tray" size={14} /> Send</button></span>
                        </div>
                        <form className="st-row st-row-static" onSubmit={e => { e.preventDefault(); startReceiving(code); }}>
                            <span className="st-row-text"><label className="st-label" htmlFor="xfer-code">Receive on this device</label><span className="st-desc">Type the code the other device shows.</span>
                                <input id="xfer-code" className="xfer-code-input" type="text" inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false}
                                    maxLength={14} placeholder="K7Q2M-9XPT4" value={code} onChange={e => setCode(e.target.value)} /></span>
                            <span className="st-row-control"><button type="submit" className="btn btn-secondary btn-sm" disabled={code.replace(/[^0-9a-z]/gi, '').length < 10}><Icon name="arrow-down-tray" size={14} /> Receive</button></span>
                        </form>
                    </>
                )}

                {s.role === 'sender' && (s.stage === 'starting' || s.stage === 'waiting') && (
                    <div className="xfer-step">
                        <p className="st-desc">On the other device, open Settings, then Data &amp; Storage, then Receive. Type this code:</p>
                        <p className="xfer-code" aria-live="polite">{s.code}</p>
                        <Summary counts={s.summary} />
                        <p className="st-desc">{s.stage === 'starting' ? 'Getting ready...' : 'Waiting for the other device...'} Keep this page open.</p>
                    </div>
                )}

                {s.stage === 'connecting' && <div className="xfer-step"><p className="st-desc">Connecting to the other device...</p></div>}

                {(s.stage === 'sending' || s.stage === 'receiving') && (
                    <div className="xfer-step">
                        <p className="st-label">{s.stage === 'sending' ? 'Sending your collection' : 'Getting the collection'}</p>
                        <Progress sent={s.sent} total={s.total} />
                        {s.message && <p className="st-desc">{s.message}</p>}
                    </div>
                )}

                {s.stage === 'review' && (
                    <div className="xfer-step">
                        <p className="st-label">The collection arrived</p>
                        <Summary counts={s.summary} />
                        <p className="st-desc">Add it to what is on this device, or replace this device's collection with it.</p>
                        <div className="xfer-actions">
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => importReceived('add')}>Add to my collection</button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={replace}>Replace my collection</button>
                        </div>
                    </div>
                )}

                {(s.stage === 'done' || s.stage === 'error') && (
                    <div className={`xfer-step${s.stage === 'error' ? ' is-error' : ''}`} role={s.stage === 'error' ? 'alert' : 'status'}>
                        <p className="st-label">{s.stage === 'done' ? 'Done' : 'That did not work'}</p>
                        <p className="st-desc">{s.message}</p>
                        <div className="xfer-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={cancelTransfer}>{s.stage === 'done' ? 'OK' : 'Start again'}</button></div>
                    </div>
                )}

                {busy && s.stage !== 'review' && <div className="xfer-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={cancelTransfer}>Cancel</button></div>}
                {s.stage === 'review' && <div className="xfer-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={cancelTransfer}>Cancel, keep this device as it is</button></div>}
            </div>
        </section>
    );
}
