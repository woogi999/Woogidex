// One WebRTC data channel between two browsers, through Cloudflare's TURN
// relay (STUN and TURN servers from the Worker's /turn-credentials, which
// gives them only to a signed-in user). The handshake (SDP offer and answer,
// ICE candidates) goes through a `Signaling` the caller gives: battles use
// the battle_signals table (js/battle/net/rtc.ts), device transfers their own
// table with encrypted payloads (js/features/device-transfer.ts).
//
// Roles: the offerer makes the channel and leads every reconnect. The
// answerer waits for an offer. A new offer carries a new `generation`, and
// each side drops signals from an older one.
//
// `relayOnly` (the default) uses only the relay. Then neither side sees the
// other's IP address, which matters between strangers (battles). It fails
// when there is no relay, and never falls back to a direct connection.

import { log } from './log.ts';
import { apiUrl } from './supabase.ts';

export type PeerStatus = 'connecting' | 'connected' | 'reconnecting' | 'lost';
export type SignalKind = 'offer' | 'answer' | 'ice';
export interface Signal { kind: SignalKind; payload: any }

/** How the two sides find each other. `poll` returns the other side's new signals, oldest first. */
export interface Signaling {
    send(kind: SignalKind, payload: any): Promise<void>;
    poll(): Promise<Signal[]>;
}

export interface PeerOptions {
    role: 'offerer' | 'answerer';
    signaling: Signaling;
    /** the signed-in user's access token, for the relay credentials */
    token: () => Promise<string>;
    label?: string;
    relayOnly?: boolean;
    onStatus?: (status: PeerStatus) => void;
    /** each message as it came (a string); the caller checks its shape */
    onMessage?: (data: string) => void;
    /** seconds before a dropped connection counts as lost */
    graceMs?: number;
    pollMs?: number;
}

const OFFERER_RETRY_MS = 2000;

export class RelayPeer {
    opts: Required<Omit<PeerOptions, 'label'>> & { label: string };
    pc: RTCPeerConnection | null = null;
    channel: RTCDataChannel | null = null;
    generation = 0;
    hasTurn: boolean | null = null;    // null until the servers are fetched
    lastError = '';
    private pollTimer: any = null;
    private disconnectTimer: any = null;
    private destroyed = false;
    private polling = false;
    private pendingCandidates: any[] = [];
    private queued: string[] = [];

    constructor(opts: PeerOptions) {
        this.opts = {
            label: 'data', relayOnly: true, onStatus: () => {}, onMessage: () => {}, graceMs: 45000, pollMs: 900,
            ...opts
        } as any;
    }

    async start() {
        if (this.opts.role === 'offerer') await this.openAsOfferer();
        else await this.openAsAnswerer();
        this.poll();
        this.pollTimer = setInterval(() => this.poll(), this.opts.pollMs);
    }

    // ---- the connection ----
    private async newPeerConnection() {
        const iceServers = await fetchIceServers(await this.opts.token().catch(() => ''));
        this.hasTurn = iceServers.some(srv => ([] as any[]).concat(srv?.urls || []).some(u => /^turns?:/.test(String(u))));
        log.info('RTC', 'ICE servers resolved', { count: iceServers.length, turn: this.hasTurn, relayOnly: this.opts.relayOnly });
        // relay-only with no relay is a hard failure, not a quiet direct connection:
        // a leaked address cannot be taken back
        if (this.opts.relayOnly && !this.hasTurn) {
            throw new Error('The connection needs the TURN relay, which is not reachable right now. Without it both sides would see each other\'s IP address, so it cannot start.');
        }
        if (!iceServers.length) throw new Error('The connection servers are not reachable right now. Check your connection and try again.');
        const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: this.opts.relayOnly ? 'relay' : 'all' });
        pc.onicecandidate = e => { if (e.candidate) this.signal('ice', { candidate: e.candidate.toJSON() }); };
        pc.onconnectionstatechange = () => this.connState(pc.connectionState);
        return pc;
    }

    private async openAsOfferer() {
        this.generation++;
        this.pendingCandidates = [];
        this.teardown();
        this.opts.onStatus('connecting');
        const pc = await this.newPeerConnection();
        this.pc = pc;
        this.bind(pc.createDataChannel(this.opts.label, { ordered: true }));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.signal('offer', { sdp: offer });
    }

    private async openAsAnswerer() {
        this.pendingCandidates = [];
        this.teardown();
        this.opts.onStatus('connecting');
        const pc = await this.newPeerConnection();
        this.pc = pc;
        pc.ondatachannel = e => this.bind(e.channel);
    }

    private teardown() {
        try { this.channel?.close(); } catch { /* already gone */ }
        try { this.pc?.close(); } catch { /* already gone */ }
        this.channel = null;
        this.pc = null;
    }

    private bind(channel: RTCDataChannel) {
        this.channel = channel;
        channel.bufferedAmountLowThreshold = 256 * 1024;
        channel.onopen = () => {
            this.opts.onStatus('connected');
            clearTimeout(this.disconnectTimer); this.disconnectTimer = null;
            const queued = this.queued; this.queued = [];
            queued.forEach(m => this.sendRaw(m));
        };
        channel.onclose = () => this.drop();
        channel.onerror = () => { /* onconnectionstatechange leads the recovery */ };
        channel.onmessage = e => { if (typeof e.data === 'string') this.opts.onMessage(e.data); };
    }

    private connState(state: string) {
        if (state === 'failed') this.drop();
        else if (state === 'disconnected') {
            if (this.disconnectTimer) return;
            this.opts.onStatus('reconnecting');
            this.disconnectTimer = setTimeout(() => this.drop(), this.opts.graceMs);
        } else if (state === 'connected') { clearTimeout(this.disconnectTimer); this.disconnectTimer = null; }
    }

    private drop() {
        if (this.destroyed) return;
        clearTimeout(this.disconnectTimer); this.disconnectTimer = null;
        this.opts.onStatus('lost');
        // the offerer heals the connection; the answerer waits for its new offer
        if (this.opts.role === 'offerer') setTimeout(() => this.reconnect(), OFFERER_RETRY_MS);
    }

    /** For a "try again" button, and the offerer's own retry. */
    async reconnect() {
        if (this.destroyed) return;
        if (this.opts.role !== 'offerer') { this.opts.onStatus('reconnecting'); return; }
        try { await this.openAsOfferer(); }
        catch (err: any) {
            this.lastError = err?.message || String(err);
            log.warn('RTC', 'Could not reopen the connection', err);
            this.opts.onStatus('lost');
        }
    }

    // ---- the handshake ----
    private async signal(kind: SignalKind, payload: any) {
        try { await this.opts.signaling.send(kind, { generation: this.generation, ...payload }); }
        catch { /* the poll sees the state again and the handshake carries on */ }
    }

    private async poll() {
        if (this.destroyed || this.polling) return;
        // one poll at a time: a slow link must not answer the same offer twice
        this.polling = true;
        try {
            for (const s of await this.opts.signaling.poll()) await this.handle(s);
        } catch (err: any) {
            if (this.hasTurn === false && this.opts.relayOnly) { this.lastError = err?.message || String(err); this.opts.onStatus('lost'); }
        } finally { this.polling = false; }
    }

    private async handle({ kind, payload }: Signal) {
        const gen = payload?.generation;
        if (!this.pc && kind !== 'offer') return;
        if (this.opts.role === 'answerer' && kind === 'offer') {
            // a new generation: the offerer started again, so this side does too
            if (this.generation !== 0 && gen !== this.generation) await this.openAsAnswerer();
            this.generation = gen;
            await this.pc!.setRemoteDescription(payload.sdp);
            await this.flushCandidates();
            const answer = await this.pc!.createAnswer();
            await this.pc!.setLocalDescription(answer);
            await this.signal('answer', { sdp: answer });
        } else if (this.opts.role === 'offerer' && kind === 'answer' && gen === this.generation) {
            if (this.pc!.signalingState === 'have-local-offer') {
                await this.pc!.setRemoteDescription(payload.sdp);
                await this.flushCandidates();
            }
        } else if (kind === 'ice' && gen === this.generation) {
            if (this.pc!.remoteDescription) {
                try { await this.pc!.addIceCandidate(payload.candidate); } catch { /* an old candidate */ }
            } else this.pendingCandidates.push(payload.candidate);
        }
    }

    private async flushCandidates() {
        const queued = this.pendingCandidates; this.pendingCandidates = [];
        for (const c of queued) { try { await this.pc!.addIceCandidate(c); } catch { /* an old candidate */ } }
    }

    // ---- messages ----
    /** Sends a string now, or once the channel is open again. */
    sendRaw(data: string) {
        if (this.channel?.readyState === 'open') this.channel.send(data);
        else this.queued.push(data);
    }

    /** Waits while the channel holds more than `limit` bytes not yet sent (for big transfers). */
    async drain(limit = 1024 * 1024) {
        const ch = this.channel;
        if (!ch || ch.bufferedAmount <= limit) return;
        await new Promise<void>(resolve => {
            const done = () => { ch.removeEventListener('bufferedamountlow', done); ch.removeEventListener('close', done); resolve(); };
            ch.addEventListener('bufferedamountlow', done);
            ch.addEventListener('close', done);
        });
    }

    isOpen() { return this.channel?.readyState === 'open'; }

    destroy() {
        this.destroyed = true;
        clearInterval(this.pollTimer); this.pollTimer = null;
        clearTimeout(this.disconnectTimer); this.disconnectTimer = null;
        this.teardown();
    }
}

/**
 * STUN and TURN servers from the Worker (/turn-credentials), which makes
 * short-lived Cloudflare TURN credentials for a signed-in user. A `warning`
 * means no relay came back: it goes to the log, so a missing secret does not
 * fail without a trace.
 */
export async function fetchIceServers(token: string): Promise<any[]> {
    try {
        const res = await fetch(apiUrl('turn-credentials'), { method: 'POST', headers: { authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data?.warning) log.warn('RTC', 'No TURN relay', { warning: data.warning });
        if (Array.isArray(data?.iceServers) && data.iceServers.length) return data.iceServers;
    } catch (err: any) {
        log.warn('RTC', 'TURN credentials unreachable', err);
    }
    return [];
}
