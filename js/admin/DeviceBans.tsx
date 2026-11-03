// Devices: a browser's device id, or its fingerprint (js/core/fingerprint.ts),
// recorded with sign-ups, sign-ins and visits. Banning one blocks every
// account that shows up on it from posting (evaluate_account_trust), new
// ones included. Listing needs view_ips; banning also needs ban (both
// re-checked by the RPCs).

import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../app/components/Icon.tsx';
import { Modal } from '../app/components/Modal.tsx';
import { openDialog, registerDialog, type DialogProps } from '../app/dialogs.tsx';
import { useStore } from '../app/store.ts';
import { ask, can, fmtDate, getClient, reload, reloads, showToast } from './core.ts';
import { ListState } from './ui.tsx';

interface DeviceBan {
    id: number; kind: 'fingerprint' | 'device'; value: string; reason: string; created_by_name: string | null;
    created_at: string; expires_at: string | null; active: boolean; accounts_seen: number;
}

const kindLabel = (k: string) => k === 'fingerprint' ? 'Fingerprint' : 'Browser';
export const BAN_LENGTHS: Array<[number, string]> = [[0, 'Permanent'], [1, '1 hour'], [24, '24 hours'], [168, '7 days'], [720, '30 days'], [2160, '90 days']];

export function DeviceBansSection() {
    useStore();
    const [showLifted, setShowLifted] = useState(false);
    const [state, setState] = useState<{ loading: boolean; error: string; rows: DeviceBan[] }>({ loading: true, error: '', rows: [] });
    async function load() {
        setState(s => ({ ...s, loading: true, error: '' }));
        try {
            const client = await getClient();
            const { data, error } = await client.rpc('admin_list_banned_devices');
            if (error) throw error;
            setState({ loading: false, error: '', rows: data || [] });
        } catch (e: any) {
            setState({ loading: false, error: e.message, rows: [] });
        }
    }
    useEffect(() => { load(); }, [reloads.ipBans]);
    async function lift(b: DeviceBan) {
        const answer = await ask({ title: 'Lift this device ban', blurb: 'New accounts on this device can post again. Accounts it already blocked stay blocked until you clear their hold in Users.', confirm: 'Lift ban', requireReason: false });
        if (!answer) return;
        try {
            const client = await getClient();
            const { error } = await client.rpc('admin_unban_device', { p_id: b.id });
            if (error) throw error;
            showToast('Device ban lifted', 'success');
            reload('ipBans');
            reload('log');
        } catch (e: any) {
            showToast(e.message || 'Could not lift that ban.', 'error');
        }
    }
    const rows = state.rows.filter(b => showLifted || b.active);
    return (
        <>
            <div className="admin-section-head" style={{ marginTop: 28 }}><h3>Device bans</h3></div>
            <p className="admin-section-sub">Devices are banned from an account's sessions (the <em>device</em> column) or from its link map. Any account seen on a banned device is blocked from posting, including ones made after the ban. A fingerprint can match identical machines (a school computer lab), so check <em>accounts seen</em> before banning one.</p>
            <div className="admin-search-bar">
                <label className="admin-checkbox-row" style={{ margin: 0, flex: 1 }}><input type="checkbox" checked={showLifted} onChange={e => setShowLifted(e.target.checked)} /> Show lifted and expired bans</label>
            </div>
            {state.loading || state.error || !rows.length
                ? <ListState loading={state.loading} error={state.error} empty="No device is banned." />
                : rows.map(b => (
                    <div className={`admin-comment-row${b.active ? '' : ' admin-muted'}`} key={b.id}>
                        <div>
                            <div className="admin-comment-meta">
                                <span className="admin-comment-kind">{kindLabel(b.kind)}</span>
                                <button type="button" className="admin-ip-addr" onClick={() => openDialog('admin-device', { kind: b.kind, value: b.value })}><code>{b.value.slice(0, 16)}…</code></button>
                                <span>by {b.created_by_name || 'staff'} · {fmtDate(b.created_at)}</span>
                                {b.expires_at && <span>{b.active ? 'until' : 'ended'} {fmtDate(b.expires_at)}</span>}
                                <span>{b.accounts_seen} account{b.accounts_seen === 1 ? '' : 's'} seen on it</span>
                            </div>
                            {b.reason ? <p>{b.reason}</p> : <p className="admin-muted">(no reason given)</p>}
                        </div>
                        {b.active && can('ban') && <button type="button" className="btn btn-secondary btn-sm" onClick={() => lift(b)}><Icon name="lock-open" /> Lift</button>}
                    </div>
                ))}
        </>
    );
}

/** One device: every account seen on it, and the ban button. */
function DeviceDialog({ close, kind, value }: DialogProps<{ kind: 'fingerprint' | 'device'; value: string }>) {
    const [state, setState] = useState<{ loading: boolean; error: string; rows: any[] }>({ loading: true, error: '', rows: [] });
    const [banning, setBanning] = useState(false);
    const [reason, setReason] = useState('');
    const [hours, setHours] = useState(0);
    useEffect(() => {
        let live = true;
        (async () => {
            try {
                const client = await getClient();
                const { data, error } = await client.rpc('admin_device_neighbours', { p_kind: kind, p_value: value });
                if (error) throw error;
                if (live) setState({ loading: false, error: '', rows: data || [] });
            } catch (e: any) {
                if (live) setState({ loading: false, error: e.message, rows: [] });
            }
        })();
        return () => { live = false; };
    }, [kind, value]);
    async function ban(e: FormEvent) {
        e.preventDefault();
        try {
            const client = await getClient();
            const { error } = await client.rpc('admin_ban_device', { p_kind: kind, p_value: value, p_reason: reason.trim(), p_hours: hours || null });
            if (error) throw error;
            showToast('Device banned', 'success');
            close();
            reload('ipBans');
            reload('log');
        } catch (err: any) {
            showToast(err.message || 'Could not ban that device.', 'error');
        }
    }
    const info = state.rows.find(r => r.device_info)?.device_info;
    return (
        <Modal onClose={close} title={`${kindLabel(kind)} ${value.slice(0, 12)}…`} className="modal-wide" labelledBy="admin-device-title">
            <p className="admin-section-sub">{kind === 'fingerprint'
                ? 'Accounts on a device that draws and sounds exactly like this one. Usually one machine; sometimes a batch of identical ones.'
                : 'Accounts used from this exact browser (its stored device id).'}</p>
            {info && <p className="admin-section-sub"><code>{[info.platform, info.screen, info.tz, info.gpu, Array.isArray(info.langs) ? info.langs.join(', ') : ''].filter(Boolean).join(' · ')}</code></p>}
            <div className="admin-ip-scroll">
                {state.loading || state.error || !state.rows.length
                    ? <ListState loading={state.loading} error={state.error} empty="No accounts recorded on it." />
                    : (
                        <table className="admin-ip-table">
                            <thead><tr><th>account</th><th>first seen</th><th>last seen</th><th>events</th></tr></thead>
                            <tbody>{state.rows.map(r => (
                                <tr key={r.user_id}>
                                    <td><strong>{r.display_name || r.username || '(deleted)'}</strong>{r.username && <> <span className="admin-user-handle">@{r.username}</span></>}</td>
                                    <td>{fmtDate(r.first_seen)}</td><td>{fmtDate(r.last_seen)}</td><td>{r.events}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    )}
            </div>
            {can('ban') && (banning ? (
                <form onSubmit={ban} style={{ marginTop: 14 }}>
                    <div className="admin-modal-row">
                        <div className="form-group">
                            <label htmlFor="admin-device-reason">Reason <span>(staff only)</span></label>
                            <input id="admin-device-reason" type="text" autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="E.g. alt accounts of a suspended user" />
                        </div>
                        <div className="form-group">
                            <label htmlFor="admin-device-length">How long</label>
                            <select id="admin-device-length" value={hours} onChange={e => setHours(Number(e.target.value))}>
                                {BAN_LENGTHS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="admin-modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setBanning(false)}>Cancel</button>
                        <button type="submit" className="btn btn-danger">Ban device</button>
                    </div>
                </form>
            ) : (
                <div className="admin-modal-actions">
                    <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setBanning(true)}><Icon name="no-symbol" /> Ban this device</button>
                </div>
            ))}
        </Modal>
    );
}
registerDialog('admin-device', DeviceDialog);
