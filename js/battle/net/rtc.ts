// WebRTC data channel between battlers, relayed through TURN. The connection
// itself is js/core/peer.ts (RelayPeer). This file gives it the battle's
// handshake: SDP and ICE go through Supabase's battle_signals table, which
// only the battle's two players can read. Relay-only on purpose: it hides
// both players' IP addresses from each other (public-lobby strangers).
// Side 0 (p1) always offers, side 1 (p2) always answers, even across reconnects.

import { api } from '../../core/app.ts';
import { RelayPeer, type Signal, type Signaling } from '../../core/peer.ts';
import { isValidPeerMessage } from './protocol.ts';

/** The battle's handshake rows, the other player's only, oldest first. */
function battleSignaling(client: any, battleId: any, meId: any): Signaling {
    let lastId = 0;
    return {
        async send(kind, payload) {
            await client.from('battle_signals').insert({ battle_id: battleId, sender_id: meId, kind, payload });
        },
        async poll(): Promise<Signal[]> {
            const { data, error } = await client.from('battle_signals')
                .select('id, sender_id, kind, payload')
                .eq('battle_id', battleId).neq('sender_id', meId).gt('id', lastId)
                .order('id', { ascending: true });
            if (error) throw error;
            const rows = data || [];
            for (const r of rows) lastId = Math.max(lastId, r.id);
            return rows.map((r: any) => ({ kind: r.kind, payload: r.payload }));
        }
    };
}

export class BattleRTC {
    battleId: any;
    mySide: any;
    onStatus: any;
    onMessage: any;
    peer: RelayPeer | null = null;
    private queuedSends: any[] = [];
    constructor({ battleId, mySide, onStatus, onMessage }: { battleId?: any; mySide?: any; onStatus?: any; onMessage?: any }) {
        this.battleId = battleId;
        this.mySide = mySide;         // 0 = offerer, 1 = answerer
        this.onStatus = onStatus || (() => {});
        this.onMessage = onMessage || (() => {});
    }

    /** null until the relay was asked for; false when none came back (the status line says why). */
    get hasTurn() { return this.peer ? this.peer.hasTurn : null; }
    get lastError() { return this.peer?.lastError || ''; }

    async start() {
        const client = await api.getClient();
        const { data } = await client.auth.getUser();
        const meId = data?.user?.id || null;
        this.peer = new RelayPeer({
            role: this.mySide === 0 ? 'offerer' : 'answerer',
            label: 'battle',
            relayOnly: true,
            signaling: battleSignaling(client, this.battleId, meId),
            token: async () => (await client.auth.getSession()).data?.session?.access_token || '',
            onStatus: s => this.onStatus(s),
            onMessage: raw => {
                let msg;
                try { msg = JSON.parse(raw); } catch { return; }
                if (isValidPeerMessage(msg)) this.onMessage(msg);
            }
        });
        const queued = this.queuedSends; this.queuedSends = [];
        queued.forEach(m => this.peer!.sendRaw(JSON.stringify(m)));
        await this.peer.start();
    }

    reconnect() { return this.peer?.reconnect(); }

    // held until the channel opens, so a move chosen mid-reconnect still lands
    send(msg: any) {
        if (this.peer) this.peer.sendRaw(JSON.stringify(msg));
        else this.queuedSends.push(msg);
    }

    destroy() { this.peer?.destroy(); }
}
