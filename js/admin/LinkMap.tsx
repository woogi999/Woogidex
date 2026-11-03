// The link map: an account and everything tied to it, drawn as a graph, the
// way an OSINT link chart shows who connects to whom. Accounts are circles;
// the addresses (an IPv6 /64 counts as one) and devices they used sit
// between them, so two accounts on the same network or machine end up next
// to each other. public.admin_link_graph builds it (two steps out, at most
// ~120 accounts); the layout is a small force simulation run once, here.
//
// Click an account to re-centre the map on it, an address or device to see
// everyone on it (and ban it from there).

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../app/components/Icon.tsx';
import { Modal } from '../app/components/Modal.tsx';
import { openDialog, registerDialog, type DialogProps } from '../app/dialogs.tsx';
import { fmtDate, getClient } from './core.ts';
import { ListState } from './ui.tsx';

interface GraphNode {
    id: string; kind: 'user' | 'ip' | 'fp' | 'dev'; label: string; value?: string; username?: string; root?: boolean;
    banned?: boolean; restriction?: string | null; created_at?: string; where?: string | null;
}
interface Graph { nodes: GraphNode[]; edges: Array<{ user: string; id: string }>; }
interface Placed extends GraphNode { x: number; y: number; links: number; }

const W = 900, H = 620;

/** Force-directed layout: linked nodes pull together, every pair pushes apart. Deterministic (seeded by order). */
function layout(g: Graph): Placed[] {
    const nodes: Placed[] = g.nodes.map((n, i) => {
        const a = (i / Math.max(1, g.nodes.length)) * Math.PI * 2 * 3.7;
        const r = n.root ? 0 : 120 + (i % 7) * 25;
        return { ...n, x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, links: 0 };
    });
    const at = new Map(nodes.map((n, i) => [n.id, i]));
    const links = g.edges.map(e => [at.get(e.user), at.get(e.id)]).filter(([a, b]) => a !== undefined && b !== undefined) as Array<[number, number]>;
    links.forEach(([a, b]) => { nodes[a].links++; nodes[b].links++; });
    const n = nodes.length;
    for (let step = 0; step < 320; step++) {
        const cool = 1 - step / 320;
        const fx = new Float64Array(n), fy = new Float64Array(n);
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
            const d2 = Math.max(dx * dx + dy * dy, 25);
            const f = 2600 / d2;
            const d = Math.sqrt(d2);
            dx /= d; dy /= d;
            fx[i] += dx * f; fy[i] += dy * f; fx[j] -= dx * f; fy[j] -= dy * f;
        }
        for (const [a, b] of links) {
            const dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y;
            const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const f = (d - 70) * 0.04;
            fx[a] += dx / d * f; fy[a] += dy / d * f; fx[b] -= dx / d * f; fy[b] -= dy / d * f;
        }
        for (let i = 0; i < n; i++) {
            // a gentle pull to the middle keeps loose pieces on the page
            fx[i] += (W / 2 - nodes[i].x) * 0.004; fy[i] += (H / 2 - nodes[i].y) * 0.004;
            if (nodes[i].root) { nodes[i].x += (W / 2 - nodes[i].x) * 0.2; nodes[i].y += (H / 2 - nodes[i].y) * 0.2; continue; }
            const cap = 12 * cool + 0.5;
            nodes[i].x += Math.max(-cap, Math.min(cap, fx[i]));
            nodes[i].y += Math.max(-cap, Math.min(cap, fy[i]));
            nodes[i].x = Math.max(30, Math.min(W - 30, nodes[i].x));
            nodes[i].y = Math.max(24, Math.min(H - 24, nodes[i].y));
        }
    }
    // spread a small graph over the canvas instead of leaving it in a knot in the middle
    if (n > 1) {
        const xs = nodes.map(p => p.x), ys = nodes.map(p => p.y);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const scale = Math.min((W - 120) / Math.max(x1 - x0, 1), (H - 90) / Math.max(y1 - y0, 1), 3);
        if (scale > 1) {
            const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
            nodes.forEach(p => { p.x = W / 2 + (p.x - cx) * scale; p.y = H / 2 + (p.y - cy) * scale; });
        }
    }
    return nodes;
}

const KIND_NAME = { user: 'Account', ip: 'Address', fp: 'Device fingerprint', dev: 'Browser' } as const;

function LinkMapDialog({ close, userId, name }: DialogProps<{ userId: string; name: string }>) {
    const [center, setCenter] = useState({ id: userId, name });
    const [state, setState] = useState<{ loading: boolean; error: string; graph: Graph | null }>({ loading: true, error: '', graph: null });
    const [hover, setHover] = useState<Placed | null>(null);
    useEffect(() => {
        let live = true;
        setState({ loading: true, error: '', graph: null });
        (async () => {
            try {
                const client = await getClient();
                const { data, error } = await client.rpc('admin_link_graph', { p_user: center.id, p_depth: 2 });
                if (error) throw error;
                if (live) setState({ loading: false, error: '', graph: data });
            } catch (e: any) {
                if (live) setState({ loading: false, error: e.message, graph: null });
            }
        })();
        return () => { live = false; };
    }, [center.id]);

    const placed = useMemo(() => state.graph ? layout(state.graph) : [], [state.graph]);
    const byId = useMemo(() => new Map(placed.map(p => [p.id, p])), [placed]);
    const accounts = placed.filter(p => p.kind === 'user');

    function open(p: Placed) {
        if (p.kind === 'user') { if (!p.root) setCenter({ id: p.id, name: p.label }); return; }
        if (p.kind === 'ip') openDialog('admin-ip', { ip: p.value || p.label });
        else openDialog('admin-device', { kind: p.kind === 'fp' ? 'fingerprint' : 'device', value: p.value || '' });
    }

    return (
        <Modal onClose={close} title={`Link map: ${center.name}`} className="modal-wide admin-linkmap-modal" labelledBy="admin-linkmap-title">
            <p className="admin-section-sub">
                Accounts tied to <strong>{center.name}</strong> through a shared address or device, two steps out. A shared address is a lead, not proof: households, schools and phone networks share them. A shared device fingerprint or browser is much stronger.
                {center.id !== userId && <> <button type="button" className="admin-link-btn" onClick={() => setCenter({ id: userId, name })}>Back to {name}</button></>}
            </p>
            {state.loading || state.error || !state.graph
                ? <ListState loading={state.loading} error={state.error} />
                : (
                    <>
                        <div className="admin-linkmap-legend">
                            <span><i className="lm-dot lm-user" /> account</span>
                            <span><i className="lm-dot lm-ip" /> address</span>
                            <span><i className="lm-dot lm-fp" /> device fingerprint</span>
                            <span><i className="lm-dot lm-dev" /> browser</span>
                            <span><i className="lm-dot lm-banned" /> banned / held</span>
                            <span className="admin-muted">{accounts.length} account{accounts.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="admin-linkmap-wrap">
                            <svg viewBox={`0 0 ${W} ${H}`} className="admin-linkmap" role="img" aria-label={`Accounts linked to ${center.name}`}>
                                <g className="lm-edges">
                                    {state.graph.edges.map((e, i) => {
                                        const a = byId.get(e.user), b = byId.get(e.id);
                                        if (!a || !b) return null;
                                        const lit = hover && (hover.id === a.id || hover.id === b.id);
                                        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`lm-edge lm-edge-${b.kind}${lit ? ' is-lit' : ''}`} />;
                                    })}
                                </g>
                                {placed.map(p => {
                                    const r = p.kind === 'user' ? (p.root ? 15 : 10) : 6 + Math.min(p.links, 6);
                                    const flagged = p.banned || !!p.restriction;
                                    return (
                                        <g key={p.id} transform={`translate(${p.x},${p.y})`} className={`lm-node lm-${p.kind}${p.root ? ' is-root' : ''}${flagged ? ' is-banned' : ''}`}
                                            onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(h => h?.id === p.id ? null : h)}
                                            onClick={() => open(p)} role="button" tabIndex={0} aria-label={`${KIND_NAME[p.kind]} ${p.label}`}
                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p); } }}>
                                            {p.kind === 'user' ? <circle r={r} />
                                                : p.kind === 'ip' ? <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} />
                                                : <polygon points={`0,${-r - 1} ${r + 1},0 0,${r + 1} ${-r - 1},0`} />}
                                            {(p.kind === 'user' || hover?.id === p.id) && <text y={r + 13} textAnchor="middle">{p.label.length > 22 ? p.label.slice(0, 21) + '…' : p.label}</text>}
                                        </g>
                                    );
                                })}
                            </svg>
                            {hover && (
                                <div className="admin-linkmap-tip" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}>
                                    <strong>{KIND_NAME[hover.kind]}</strong> {hover.kind === 'user' ? hover.label : <code>{hover.value || hover.label}</code>}
                                    {hover.username && <div>@{hover.username}</div>}
                                    {hover.created_at && <div>joined {fmtDate(hover.created_at)}</div>}
                                    {hover.where && <div>{hover.where}</div>}
                                    <div>{hover.links} link{hover.links === 1 ? '' : 's'}</div>
                                    {hover.banned && <div className="admin-error">banned</div>}
                                    {hover.restriction && <div className="admin-error">held: {hover.restriction.replace('_', ' ')}</div>}
                                    <div className="admin-muted">{hover.kind === 'user' ? (hover.root ? 'the account in the middle' : 'click to centre on it') : 'click for everyone on it'}</div>
                                </div>
                            )}
                        </div>
                        {accounts.length <= 1 && <p className="admin-section-sub"><Icon name="check-circle" size={14} /> Nothing else is tied to this account yet.</p>}
                    </>
                )}
        </Modal>
    );
}
registerDialog('admin-link-map', LinkMapDialog);
