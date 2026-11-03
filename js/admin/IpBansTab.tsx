// IP bans: addresses (or ranges) that can't use the site at all. Enforced by
// worker/index.js, which asks public.ip_ban_check() before serving a page or
// an API call; a ban takes effect within a minute. Listing needs view_ips;
// banning and lifting also need ban (both re-checked by the RPCs).

import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../app/components/Icon.tsx';
import { Modal } from '../app/components/Modal.tsx';
import { openDialog, registerDialog, type DialogProps } from '../app/dialogs.tsx';
import { useStore } from '../app/store.ts';
import { ask, can, fmtDate, getClient, reload, reloads, showToast } from './core.ts';
import { ListState, SortSelect, byDate, byNumber, byText, useSort, type SortOption } from './ui.tsx';
import { BAN_LENGTHS, DeviceBansSection } from './DeviceBans.tsx';
import './LinkMap.tsx';

interface IpBan {
    id: number; ip_range: string; reason: string; created_by: string | null; created_by_name: string | null;
    created_at: string; expires_at: string | null; active: boolean; accounts_seen: number;
}

const BAN_SORTS: SortOption<IpBan>[] = [
    ['new', 'Newest first', byDate(b => b.created_at)],
    ['old', 'Oldest first', byDate(b => b.created_at, true)],
    ['active', 'Active first', (a, b) => Number(b.active) - Number(a.active) || byDate<IpBan>(x => x.created_at)(a, b)],
    ['accounts', 'Most accounts seen', byNumber(b => b.accounts_seen)],
    ['address', 'Address', byText(b => b.ip_range)]
];

export function IpBansTab() {
    useStore();
    const sort = useSort('ip-bans', BAN_SORTS);
    const [showLifted, setShowLifted] = useState(false);
    const [state, setState] = useState<{ loading: boolean; error: string; rows: IpBan[] }>({ loading: true, error: '', rows: [] });

    async function load() {
        setState(s => ({ ...s, loading: true, error: '' }));
        try {
            const client = await getClient();
            const { data, error } = await client.rpc('admin_list_banned_ips');
            if (error) throw error;
            setState({ loading: false, error: '', rows: data || [] });
        } catch (e: any) {
            setState({ loading: false, error: e.message, rows: [] });
        }
    }
    useEffect(() => { load(); }, [reloads.ipBans]);

    async function lift(b: IpBan) {
        const answer = await ask({ title: `Lift the ban on ${b.ip_range}`, blurb: 'The address can use the site again within a minute. The ban stays in this list (as lifted) and in the mod log.', confirm: 'Lift ban', requireReason: false });
        if (!answer) return;
        try {
            const client = await getClient();
            const { error } = await client.rpc('admin_unban_ip', { p_id: b.id });
            if (error) throw error;
            showToast('Ban lifted', 'success');
            reload('ipBans');
            reload('log');
        } catch (e: any) {
            showToast(e.message || 'Could not lift that ban.', 'error');
        }
    }

    const rows = sort.sort(state.rows.filter(b => showLifted || b.active));
    return (
        <>
            <div className="admin-section-head">
                <h3>Address bans</h3>
                <div className="admin-row-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={load}><Icon name="refresh-cw" /> Reload</button>
                    {can('ban') && <button type="button" className="btn btn-primary btn-sm" onClick={() => openDialog('admin-ip-ban', {})}><Icon name="plus" /> Ban an address</button>}
                </div>
            </div>
            <p className="admin-section-sub">A banned address gets a "blocked" page instead of the site, and every request to the API is refused, signed in or not. It takes effect within a minute. Use it for ban evasion and abuse from one place; one address is often shared by a whole household, school or phone network, so check <em>accounts seen</em> first.</p>
            <div className="admin-search-bar">
                <label className="admin-checkbox-row" style={{ margin: 0, flex: 1 }}><input type="checkbox" checked={showLifted} onChange={e => setShowLifted(e.target.checked)} /> Show lifted and expired bans</label>
                <SortSelect sort={sort} />
            </div>
            {state.loading || state.error || !rows.length
                ? <ListState loading={state.loading} error={state.error} empty={state.rows.length ? 'No active bans.' : 'No address has been banned.'} />
                : rows.map(b => (
                    <div className={`admin-comment-row${b.active ? '' : ' admin-muted'}`} key={b.id}>
                        <div>
                            <div className="admin-comment-meta">
                                <span className="admin-comment-kind">{b.active ? (b.expires_at ? 'temporary' : 'permanent') : 'lifted'}</span>
                                <strong><code>{b.ip_range}</code></strong>
                                <span>by {b.created_by_name || 'staff'} · {fmtDate(b.created_at)}</span>
                                {b.expires_at && <span>{b.active ? 'until' : 'ended'} {fmtDate(b.expires_at)}</span>}
                                <span>{b.accounts_seen} account{b.accounts_seen === 1 ? '' : 's'} seen here</span>
                            </div>
                            {b.reason ? <p>{b.reason}</p> : <p className="admin-muted">(no reason given)</p>}
                        </div>
                        {b.active && can('ban') && <button type="button" className="btn btn-secondary btn-sm" onClick={() => lift(b)}><Icon name="lock-open" /> Lift</button>}
                    </div>
                ))}
            <DeviceBansSection />
        </>
    );
}

const LENGTHS = BAN_LENGTHS;

function IpBanDialog({ close, ip = '' }: DialogProps<{ ip?: string }>) {
    const [range, setRange] = useState(ip);
    const [hours, setHours] = useState(0);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!range.trim()) { showToast('Enter an address or range.', 'error'); return; }
        setBusy(true);
        try {
            const client = await getClient();
            const { error } = await client.rpc('admin_ban_ip', { p_range: range.trim(), p_reason: reason.trim(), p_hours: hours || null });
            if (error) throw error;
            showToast(`${range.trim()} is banned`, 'success');
            close();
            reload('ipBans');
            reload('log');
        } catch (err: any) {
            showToast(err.message || 'Could not ban that address.', 'error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal onClose={close} title="Ban an address" labelledBy="admin-ip-ban-title">
            <form onSubmit={submit}>
                <p className="admin-section-sub">Everyone at this address loses the site, signed in or not. A range (like <code>203.0.113.0/24</code>) covers every address in it; ranges wider than /16 (IPv4) or /32 (IPv6) are refused.</p>
                <div className="admin-modal-row">
                    <div className="form-group">
                        <label htmlFor="admin-ip-ban-range">Address or range</label>
                        <input id="admin-ip-ban-range" type="text" spellCheck={false} autoFocus={!ip} required placeholder="203.0.113.7" value={range} onChange={e => setRange(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="admin-ip-ban-length">How long</label>
                        <select id="admin-ip-ban-length" value={hours} onChange={e => setHours(Number(e.target.value))}>
                            {LENGTHS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                        </select>
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="admin-ip-ban-reason">Reason <span>(staff only)</span></label>
                    <textarea id="admin-ip-ban-reason" rows={2} autoFocus={!!ip} placeholder="E.g. ban evasion by @someone, same address as their suspended account" value={reason} onChange={e => setReason(e.target.value)} />
                </div>
                <div className="admin-modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                    <button type="submit" className="btn btn-danger" disabled={busy}>Ban address</button>
                </div>
            </form>
        </Modal>
    );
}
registerDialog('admin-ip-ban', IpBanDialog);
