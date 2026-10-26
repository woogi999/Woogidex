// What a business account adds to a profile (js/features/business.ts): the
// category, a contact button, pinned posts, and, for the account itself,
// insights. CSS: core css/profile.css (the business part at the end).

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, state } from '../../core/app.ts';
import { Icon } from './Icon.tsx';
import { Modal } from './Modal.tsx';
import { timeAgo } from './feed.tsx';
import { registerDialog, openDialog, type DialogProps } from '../dialogs.tsx';
import type { Insights, PinnedPost } from '../../features/business.ts';

/** "Business · Official" under the name. */
export function BusinessLine({ userId }: { userId: string }) {
    const { info } = api.businessInfo(userId);
    if (info.account_type !== 'business') return null;
    return (
        <span className="biz-line">
            <Icon name="briefcase" size={13} />
            {info.business_category || 'Business'}
        </span>
    );
}

/** The profile's action buttons for a business account: Email (others), Insights (the account itself). */
export function BusinessActions({ userId, isOwn }: { userId: string; isOwn: boolean }) {
    const { info } = api.businessInfo(userId);
    if (info.account_type !== 'business') return null;
    return (
        <>
            {!isOwn && info.business_email && (
                <a className="btn btn-secondary btn-sm" href={`mailto:${info.business_email}`} rel="nofollow"><Icon name="envelope" size={14} /> Email</a>
            )}
            {isOwn && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDialog('business-insights', {})}><Icon name="chart-bar" size={14} /> Insights</button>}
        </>
    );
}

/** Up to three posts the account pinned, above its timeline (like X and Instagram). */
export function PinnedPosts({ userId, isOwn }: { userId: string; isOwn: boolean }) {
    const { info, pinned } = api.businessInfo(userId);
    if (info.account_type !== 'business' || !pinned.length) return null;
    return (
        <section className="biz-pinned" aria-label="Pinned posts">
            {pinned.map((p: PinnedPost) => (
                <article key={p.id} className="biz-pin">
                    <span className="biz-pin-kicker"><Icon name="pin" size={12} /> Pinned</span>
                    <button type="button" className="biz-pin-body" onClick={() => api.openPost(p.id)}>
                        {p.body ? p.body.slice(0, 280) : `${p.mon_ids?.length || 0} Fakémon`}
                    </button>
                    <span className="biz-pin-meta">
                        <time dateTime={p.created_at}>{timeAgo(p.created_at)}</time>
                        {isOwn && <button type="button" className="link-btn" onClick={() => api.togglePin(p.id)}>Unpin</button>}
                    </span>
                </article>
            ))}
        </section>
    );
}

// ==================== insights ====================

const RANGES = [7, 28, 90];

function BusinessInsights({ close }: DialogProps) {
    const [days, setDays] = useState(28);
    const [data, setData] = useState<Insights | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let live = true;
        setError('');
        api.fetchInsights(days).then((d: Insights) => { if (live) setData(d); }).catch((e: any) => { if (live) setError(e?.message || 'Could not load insights.'); });
        return () => { live = false; };
    }, [days]);
    const tiles: Array<[string, number]> = data ? [
        ['Followers', data.followers], ['New followers', data.new_followers], ['Posts', data.posts],
        ['Reactions', data.reactions], ['Comments', data.comments], ['Reposts', data.reposts]
    ] : [];
    return (
        <Modal onClose={close} title="Insights" className="biz-insights">
            <div className="biz-range" role="group" aria-label="Time range">
                {RANGES.map(d => (
                    <button key={d} type="button" className={days === d ? 'active' : ''} aria-pressed={days === d} onClick={() => setDays(d)}>Last {d} days</button>
                ))}
            </div>
            {error && <p className="auth-modal-error">{error}</p>}
            {!data && !error && <div className="biz-loading"><span className="spinner" /></div>}
            {data && (
                <>
                    <div className="biz-tiles">
                        {tiles.map(([label, n]) => (
                            <div key={label} className="biz-tile"><span>{label}</span><strong>{Number(n).toLocaleString()}</strong></div>
                        ))}
                    </div>
                    <section className="biz-section">
                        <h3>Followers</h3>
                        <FollowerChart series={data.follower_series} />
                    </section>
                    <section className="biz-section">
                        <h3>Top posts</h3>
                        {!data.top_posts.length ? <p className="biz-muted">No posts in this time.</p> : (
                            <ol className="biz-top">
                                {data.top_posts.map(p => (
                                    <li key={p.id}>
                                        <button type="button" className="biz-top-body" onClick={() => { close(); api.openPost(p.id); }}>{p.body || 'A post with Fakémon'}</button>
                                        <span className="biz-top-stats">
                                            <span title="Reactions"><Icon name="face-smile" size={13} /> {p.reactions}</span>
                                            <span title="Comments"><Icon name="chat-bubble-oval-left" size={13} /> {p.comments}</span>
                                            <span title="Reposts"><Icon name="arrow-path-rounded-square" size={13} /> {p.reposts}</span>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                    <p className="biz-muted">Fakémon views, all time: {Number(data.mon_views).toLocaleString()}</p>
                </>
            )}
        </Modal>
    );
}
registerDialog('business-insights', BusinessInsights);

/**
 * One series, followers over the range: a 2px line on a light area, a hover
 * crosshair with the day's number, and the numbers as a table for screen readers.
 */
function FollowerChart({ series }: { series: Array<{ day: string; total: number }> }) {
    const [hover, setHover] = useState<number | null>(null);
    const box = useRef<SVGSVGElement>(null);
    const W = 560, H = 160, PAD = { l: 36, r: 8, t: 10, b: 22 };
    const pts = useMemo(() => {
        const max = Math.max(1, ...series.map(s => s.total));
        const min = Math.min(...series.map(s => s.total), max);
        const lo = Math.max(0, min - Math.ceil((max - min) * 0.15) - 1);
        const x = (i: number) => PAD.l + (series.length < 2 ? 0 : (i / (series.length - 1)) * (W - PAD.l - PAD.r));
        const y = (v: number) => PAD.t + (1 - (v - lo) / Math.max(1, max - lo)) * (H - PAD.t - PAD.b);
        return { list: series.map((s, i) => ({ ...s, x: x(i), y: y(s.total) })), max, lo };
    }, [series]);
    if (!series.length) return <p className="biz-muted">No data yet.</p>;
    const line = pts.list.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L${pts.list[pts.list.length - 1].x.toFixed(1)},${H - PAD.b} L${PAD.l},${H - PAD.b} Z`;
    const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const onMove = (e: React.PointerEvent) => {
        const r = box.current!.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        let best = 0;
        pts.list.forEach((p, i) => { if (Math.abs(p.x - px) < Math.abs(pts.list[best].x - px)) best = i; });
        setHover(best);
    };
    const h = hover !== null ? pts.list[hover] : null;
    return (
        <div className="biz-chart">
            <svg ref={box} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Followers, from ${series[0].total} to ${series[series.length - 1].total}`}
                onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
                <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="biz-axis" />
                <text x={PAD.l - 6} y={PAD.t + 4} className="biz-tick" textAnchor="end">{pts.max}</text>
                <text x={PAD.l - 6} y={H - PAD.b} className="biz-tick" textAnchor="end">{pts.lo}</text>
                <text x={PAD.l} y={H - 6} className="biz-tick">{fmt(series[0].day)}</text>
                <text x={W - PAD.r} y={H - 6} className="biz-tick" textAnchor="end">{fmt(series[series.length - 1].day)}</text>
                <path d={area} className="biz-area" />
                <path d={line} className="biz-line-path" />
                {h && (
                    <>
                        <line x1={h.x} x2={h.x} y1={PAD.t} y2={H - PAD.b} className="biz-cross" />
                        <circle cx={h.x} cy={h.y} r={4.5} className="biz-dot" />
                    </>
                )}
            </svg>
            {h && <div className="biz-tip" style={{ left: `${(h.x / W) * 100}%` }}><strong>{h.total}</strong> followers<span>{fmt(h.day)}</span></div>}
            <table className="sr-only">
                <caption>Followers by day</caption>
                <tbody>{series.map(s => <tr key={s.day}><th scope="row">{s.day}</th><td>{s.total}</td></tr>)}</tbody>
            </table>
        </div>
    );
}

/** Settings > Account > Business: the category and the contact email (business accounts only). */
export function BusinessSettingsGroup() {
    const { info } = api.businessInfo(state.user?.id);
    const [category, setCategory] = useState(info.business_category);
    const [email, setEmail] = useState(info.business_email);
    const [busy, setBusy] = useState(false);
    useEffect(() => { setCategory(info.business_category); setEmail(info.business_email); }, [info.business_category, info.business_email]);
    if (info.account_type !== 'business') return null;
    return (
        <section className="st-group">
            <div className="st-group-head"><h3>Business</h3><p>Shown on your profile. Staff turn business accounts on and off.</p></div>
            <form className="biz-settings" onSubmit={async e => { e.preventDefault(); setBusy(true); await api.saveBusinessDetails(category, email); setBusy(false); }}>
                <div className="form-group">
                    <label htmlFor="biz-category">Category</label>
                    <input id="biz-category" type="text" maxLength={40} value={category} placeholder="Official, Art studio, Fan game…" onChange={e => setCategory(e.target.value)} />
                </div>
                <div className="form-group">
                    <label htmlFor="biz-email">Contact email <span className="label-optional">(optional, public)</span></label>
                    <input id="biz-email" type="email" maxLength={254} value={email} placeholder="hello@example.com" onChange={e => setEmail(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </form>
        </section>
    );
}
