// A notice on the Community Hub and in Messages when the connection comes
// from a VPN or hosting network that staff listed. Reading still works; the
// server refuses posts, comments, reactions, follows and messages
// (guard_network_write). Status: js/features/safety.ts.

import { useEffect, useState } from 'react';
import { state } from '../../core/app.ts';
import { Icon } from './Icon.tsx';
import { VPN_MESSAGE } from '../../features/safety-model.ts';
import { cachedNetworkStatus, onNetworkStatus, refreshNetworkStatus } from '../../features/safety.ts';

export function NetworkNotice() {
    const [vpn, setVpn] = useState(cachedNetworkStatus());
    useEffect(() => {
        const off = onNetworkStatus(() => setVpn(cachedNetworkStatus()));
        if (state.user) refreshNetworkStatus().then(setVpn);
        return off;
    }, []);
    if (!vpn || !state.user) return null;
    return (
        <div className="safety-banner" role="status">
            <Icon name="shield-check" size={18} />
            <span>{VPN_MESSAGE}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => refreshNetworkStatus(true).then(setVpn)}>Check again</button>
        </div>
    );
}
