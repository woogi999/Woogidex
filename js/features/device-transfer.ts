// Move your local collection to another device (Settings > Your data).
//
// Both devices sign in to the same account. One device sends: it shows a
// pairing code. The other receives: you type the code there. They connect
// with WebRTC (js/core/peer.ts), and the collection goes straight from one
// browser to the other. The server only passes the handshake on.
//
// Security, in layers:
//   1. Only a signed-in account gets relay servers, and the handshake rows
//      are readable by that account only (Woogidex-DB migration
//      20261123120000_device_transfer_signals).
//   2. The pairing code (50 random bits) never leaves the two screens. A key
//      made from it (PBKDF2, 200 000 rounds) encrypts every handshake row with
//      AES-GCM, and a hash made from it names the rows. Someone with the
//      account's session but not the code can neither read the offer nor
//      answer it, so cannot join. The SDP carries the DTLS fingerprints, so
//      the channel is end-to-end once the handshake is authentic.
//   3. The receiver checks the size and the SHA-256 of what came, and the
//      file goes through the normal import (js/export/export.ts), the same
//      checks as a JSON file you pick yourself. Nothing is imported before
//      you choose Add or Replace.

import { api } from '../core/app.ts';
import { log } from '../core/log.ts';
import { RelayPeer, type Signal, type Signaling, type SignalKind } from '../core/peer.ts';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
const CODE_LEN = 10;
const CHUNK = 16 * 1024;
const MAX_BYTES = 512 * 1024 * 1024;
const TABLE = 'device_transfer_signals';

export type TransferStage = 'idle' | 'starting' | 'waiting' | 'connecting' | 'sending' | 'receiving' | 'review' | 'done' | 'error';
export interface TransferState {
    stage: TransferStage;
    role: 'sender' | 'receiver' | null;
    code: string;
    sent: number;
    total: number;
    message: string;
    summary: Record<string, number> | null;
}

// ---- the pairing code ----

/** A new code like "K7Q2M-9XPT4": 10 characters from 31, about 50 bits. */
export function newPairingCode(): string {
    const out: string[] = [];
    const bytes = new Uint8Array(32);
    while (out.length < CODE_LEN) {
        crypto.getRandomValues(bytes);
        // 248 is the largest multiple of 31 under 256: no bias toward the first letters
        for (const b of bytes) if (b < 248 && out.length < CODE_LEN) out.push(ALPHABET[b % 31]);
    }
    return `${out.slice(0, 5).join('')}-${out.slice(5).join('')}`;
}

/** A typed code in its one form, or '' when it cannot be a code. */
export function normalizeCode(text: string): string {
    const raw = String(text || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    if (raw.length !== CODE_LEN || [...raw].some(c => !ALPHABET.includes(c))) return '';
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** The AES key and the row name, both made from the code. */
async function keysFor(code: string) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('woogidex-device-transfer-v1'), iterations: 200000 }, base, 512);
    const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const channel = hex(await crypto.subtle.digest('SHA-256', bits.slice(32)));
    return { key, channel };
}

async function seal(key: CryptoKey, data: any, aad: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) }, key, new TextEncoder().encode(JSON.stringify(data)));
    return `${b64(iv)}.${b64(ct)}`;
}

async function open(key: CryptoKey, text: string, aad: string): Promise<any> {
    const [iv, ct] = String(text).split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: new TextEncoder().encode(aad) }, key, unb64(ct));
    return JSON.parse(new TextDecoder().decode(plain));
}

/** The handshake through the table: sealed with the code's key, read only from the other side. */
function transferSignaling(client: any, role: 'sender' | 'receiver', key: CryptoKey, channel: string): Signaling & { clear(): Promise<void> } {
    let lastId = 0;
    const other = role === 'sender' ? 'receiver' : 'sender';
    return {
        async send(kind: SignalKind, payload: any) {
            // the kind and the role are part of the seal: a row cannot be replayed as another
            const sealed = await seal(key, payload, `${channel}|${role}|${kind}`);
            const { error } = await client.from(TABLE).insert({ channel, role, kind, payload: sealed });
            if (error) throw error;
        },
        async poll(): Promise<Signal[]> {
            const { data, error } = await client.from(TABLE).select('id, kind, payload')
                .eq('channel', channel).eq('role', other).gt('id', lastId).order('id', { ascending: true }).limit(200);
            if (error) throw error;
            const out: Signal[] = [];
            for (const r of data || []) {
                lastId = Math.max(lastId, r.id);
                // a row that does not open with the code's key is not from the other device: dropped
                try { out.push({ kind: r.kind, payload: await open(key, r.payload, `${channel}|${other}|${r.kind}`) }); }
                catch { log.warn('TRANSFER', 'A handshake row did not open with this code; ignored'); }
            }
            return out;
        },
        async clear() {
            try { await client.from(TABLE).delete().eq('channel', channel); } catch { /* the hourly clean-up takes them */ }
        }
    };
}

// ---- one transfer at a time ----

let current: TransferState = { stage: 'idle', role: null, code: '', sent: 0, total: 0, message: '', summary: null };
let peer: RelayPeer | null = null;
let signaling: ReturnType<typeof transferSignaling> | null = null;
let received: { meta: any; parts: string[]; bytes: number } | null = null;
let ready: string | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<TransferState>) {
    current = { ...current, ...patch };
    listeners.forEach(fn => fn());
}

export const transferState = () => current;
export function onTransferChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** What a collection file holds, in counts, for both screens. */
function summarize(bundle: any): Record<string, number> {
    const n = (x: any) => Array.isArray(x) ? x.length : 0;
    const folders = Array.isArray(bundle?.folders) ? bundle.folders : [];
    return {
        Fakémon: n(bundle?.fakemonDB), Moves: n(bundle?.customMoves), Abilities: n(bundle?.customAbilities), Items: n(bundle?.customItems),
        Types: folders.filter((f: any) => f?.type === 'custom-type').length,
        Conditions: folders.filter((f: any) => f?.type === 'custom-condition').length,
        Regions: folders.filter((f: any) => f?.type === 'region').length
    };
}

async function signedInClient() {
    const client = await api.getClient?.();
    const { data } = await client.auth.getSession();
    if (!data?.session) throw new Error('Sign in on both devices, to the same account, to move your data.');
    return client;
}

async function sha256(text: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }

function fail(err: any) {
    const message = err?.message || String(err);
    log.warn('TRANSFER', 'Transfer stopped', { message });
    set({ stage: 'error', message });
    stopPeer();
}

function stopPeer() {
    peer?.destroy(); peer = null;
    signaling?.clear(); signaling = null;
}

/** Stops whatever runs, and goes back to the start. */
export function cancelTransfer() {
    stopPeer();
    received = null; ready = null;
    set({ stage: 'idle', role: null, code: '', sent: 0, total: 0, message: '', summary: null });
}

async function startPeer(role: 'sender' | 'receiver', code: string, onMessage: (raw: string) => void, onOpen: () => void) {
    const client = await signedInClient();
    const { key, channel } = await keysFor(code);
    signaling = transferSignaling(client, role, key, channel);
    let opened = false;
    peer = new RelayPeer({
        role: role === 'sender' ? 'offerer' : 'answerer',
        label: 'woogidex-transfer',
        // both ends are the same person, and the handshake is sealed: a direct
        // connection is allowed (faster on one network); the relay is the fallback
        relayOnly: false,
        graceMs: 20000,
        signaling,
        token: async () => (await client.auth.getSession()).data?.session?.access_token || '',
        onStatus: s => {
            if (s === 'connected' && !opened) { opened = true; onOpen(); }
            else if (s === 'lost' && current.stage !== 'done' && current.stage !== 'review') set({ message: 'The connection dropped. Trying again...' });
        },
        onMessage
    });
    await peer.start();
}

// ---- sending ----

/** Starts a send: shows a code, then sends the whole collection once the other device joins. */
export async function startSending() {
    cancelTransfer();
    const code = newPairingCode();
    set({ stage: 'starting', role: 'sender', code, message: '' });
    try {
        const bundle = api.wholeCollectionBundle?.();
        if (!bundle) throw new Error('There is nothing in your collection to move yet.');
        const text = JSON.stringify(bundle);
        if (text.length > MAX_BYTES) throw new Error('The collection is too big to move this way. Use Export and Import instead.');
        const hash = await sha256(text);
        const summary = summarize(bundle);
        set({ total: text.length, summary });
        await startPeer('sender', code, raw => {
            let msg: any; try { msg = JSON.parse(raw); } catch { return; }
            if (msg?.t === 'ack') set({ stage: 'done', message: msg.imported ? 'The other device has your collection now.' : 'The other device got it, but did not import it.' });
        }, async () => {
            set({ stage: 'sending', sent: 0 });
            try {
                peer!.sendRaw(JSON.stringify({ t: 'meta', v: 1, bytes: text.length, hash, summary }));
                for (let i = 0, n = 0; i < text.length; i += CHUNK, n++) {
                    if (!peer) return;
                    await peer.drain();
                    peer.sendRaw(JSON.stringify({ t: 'part', n, d: text.slice(i, i + CHUNK) }));
                    if (n % 16 === 0) set({ sent: Math.min(text.length, i + CHUNK) });
                }
                peer?.sendRaw(JSON.stringify({ t: 'end' }));
                set({ sent: text.length, message: 'Sent. Waiting for the other device to choose Add or Replace...' });
            } catch (err) { fail(err); }
        });
        set({ stage: 'waiting' });
    } catch (err) { fail(err); }
}

// ---- receiving ----

/** Joins a send with the code from the other screen. */
export async function startReceiving(typed: string) {
    const code = normalizeCode(typed);
    if (!code) { set({ stage: 'error', role: 'receiver', message: 'That code does not look right. It has 10 letters and numbers, like K7Q2M-9XPT4.' }); return; }
    cancelTransfer();
    set({ stage: 'connecting', role: 'receiver', code, message: '' });
    received = null;
    try {
        await startPeer('receiver', code, raw => {
            let msg: any; try { msg = JSON.parse(raw); } catch { return; }
            if (msg?.t === 'meta') {
                const bytes = Number(msg.bytes);
                if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES || !/^[a-f0-9]{64}$/.test(String(msg.hash))) { fail(new Error('The other device sent something that is not a collection.')); return; }
                received = { meta: { bytes, hash: String(msg.hash) }, parts: [], bytes: 0 };
                set({ stage: 'receiving', total: bytes, sent: 0 });
            } else if (msg?.t === 'part' && received && Number.isInteger(msg.n) && typeof msg.d === 'string') {
                if (msg.n !== received.parts.length) { fail(new Error('Parts of the collection came out of order. Try again.')); return; }
                received.parts.push(msg.d);
                received.bytes += msg.d.length;
                if (received.bytes > received.meta.bytes) { fail(new Error('The other device sent more than it said it would.')); return; }
                if (msg.n % 16 === 0) set({ sent: received.bytes });
            } else if (msg?.t === 'end' && received) {
                finishReceive();
            }
        }, () => set({ message: '' }));
    } catch (err) { fail(err); }
}

async function finishReceive() {
    if (!received) return;
    const text = received.parts.join('');
    received.parts = [];
    try {
        if (text.length !== received.meta.bytes || await sha256(text) !== received.meta.hash) throw new Error('The collection did not arrive whole. Try again.');
        const bundle = JSON.parse(text);
        if (bundle?.format !== 'woogidex-collection') throw new Error('The other device sent something that is not a collection.');
        ready = text;
        set({ stage: 'review', sent: text.length, summary: summarize(bundle), message: '' });
    } catch (err) { fail(err); }
}

/** Puts what came into this device's collection: added to it, or in place of it. */
export async function importReceived(mode: 'add' | 'replace') {
    if (!ready) return false;
    const file = new File([ready], 'device-transfer.json', { type: 'application/json' });
    const ok = !!(await api.importCollection?.(file, mode === 'replace' ? 'replace' : 'add'));
    try { peer?.sendRaw(JSON.stringify({ t: 'ack', imported: ok })); } catch { /* the sender times out on its own */ }
    ready = null;
    set({ stage: 'done', message: ok ? 'Your collection is on this device now.' : 'The import did not finish. Nothing changed.' });
    // the ack needs a moment on the wire before the connection closes
    setTimeout(stopPeer, 1500);
    return ok;
}
