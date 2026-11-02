// Small SVG and HTML charts for the analytics pages (Region Analytics and the
// editor's Analysis tab). One look for all of them: hairline grids, thin
// marks, the accent hue for "this", a neutral gray for "the rest", text in
// text colours only. Each mark explains itself on hover through a data-tip
// attribute, which <ChartFrame> turns into one shared tooltip. Entrances run
// through js/core/motion.ts and stay still for reduced motion.

import { effectiveZoom } from '../../core/ui-scale.ts';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { chartEntrance } from '../../core/motion.ts';

// ---- the frame: tooltip and entrance ----

/**
 * Wraps a chart: plays its entrance one time, and shows the data-tip of
 * whatever mark is under the pointer (or focused, for keyboard users).
 */
export function ChartFrame({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const tip = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => { if (ref.current) return chartEntrance(ref.current); }, []);
    const hide = () => { if (tip.current) tip.current.hidden = true; };
    const show = (target: EventTarget | null) => {
        const el = (target as Element | null)?.closest?.('[data-tip]') as HTMLElement | SVGElement | null;
        const t = tip.current;
        if (!el || !ref.current || !t) { hide(); return; }
        const box = ref.current.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        t.textContent = el.getAttribute('data-tip') || '';
        const z = effectiveZoom(ref.current);
        t.style.left = `${(r.left + r.width / 2 - box.left) / z}px`;
        t.style.top = `${(r.top - box.top) / z}px`;
        // restart the fade for each new mark
        t.hidden = true; void t.offsetWidth; t.hidden = false;
    };
    return (
        <div ref={ref} className={`chart ${className}`} role="group" aria-label={label}
            onPointerOver={e => show(e.target)} onPointerLeave={hide}
            onFocus={e => show(e.target)} onBlur={hide}>
            {children}
            <div ref={tip} className="chart-tip" role="status" hidden />
        </div>
    );
}

const fmt = (n: number, d = 0) => Number(n.toFixed(d)).toLocaleString();

// ---- radar: a stat spread against a reference ----

export interface RadarSeries { name: string; values: number[]; kind: 'main' | 'ref'; band?: Array<[number, number]>; }

/** Six stats around a hexagon. The main series is the accent; the reference is gray. */
export function Radar({ axes, series, max, label }: { axes: string[]; series: RadarSeries[]; max: number; label: string }) {
    const size = 260, c = size / 2, r = 92;
    const point = (i: number, v: number) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
        const k = Math.max(0, Math.min(1, v / max)) * r;
        return [c + Math.cos(a) * k, c + Math.sin(a) * k];
    };
    const path = (vals: number[]) => vals.map((v, i) => point(i, v).join(',')).join(' ');
    const rings = [0.25, 0.5, 0.75, 1];
    return (
        <ChartFrame label={label} className="chart-radar">
            <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
                {rings.map(k => <polygon key={k} className="chart-grid" points={axes.map((_, i) => point(i, max * k).join(',')).join(' ')} />)}
                {axes.map((a, i) => {
                    const [x, y] = point(i, max);
                    const [lx, ly] = point(i, max * 1.2);
                    return (
                        <g key={a}>
                            <line className="chart-grid" x1={c} y1={c} x2={x} y2={y} />
                            <text className="chart-axis-label" x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">{a}</text>
                        </g>
                    );
                })}
                <g className="chart-scale" style={{ transformOrigin: `${c}px ${c}px` }}>
                    {series.map(s => s.band && (
                        <polygon key={`${s.name}-band`} className="chart-band"
                            points={[...s.band.map(([, hi], i) => point(i, hi).join(',')), ...s.band.map(([lo], i) => point(i, lo).join(',')).reverse()].join(' ')} />
                    ))}
                    {series.map(s => <polygon key={s.name} className={`chart-radar-shape ${s.kind}`} points={path(s.values)} />)}
                    {series.filter(s => s.kind === 'main').map(s => s.values.map((v, i) => {
                        const [x, y] = point(i, v);
                        const ref = series.find(o => o.kind === 'ref');
                        return <circle key={`${s.name}-${i}`} className="chart-dot main" cx={x} cy={y} r={4.5} tabIndex={0}
                            data-tip={`${axes[i]}: ${fmt(v)}${ref ? ` (${ref.name} ${fmt(ref.values[i])})` : ''}`} />;
                    }))}
                </g>
            </svg>
            {series.length > 1 && (
                <div className="chart-legend">
                    {series.map(s => <span key={s.name}><i className={`chart-key ${s.kind}`} />{s.name}</span>)}
                    {series.some(s => s.band) && <span><i className="chart-key band" />± one spread</span>}
                </div>
            )}
        </ChartFrame>
    );
}

// ---- histogram: how many fall in each bin ----

export function Histogram({ bins, label, marker }: {
    bins: Array<{ label: string; value: number; tip?: string }>;
    label: string;
    /** a reference line, as a fraction 0..1 of the width, with its own label */
    marker?: { at: number; label: string };
}) {
    const top = Math.max(1, ...bins.map(b => b.value));
    return (
        <ChartFrame label={label} className="chart-histogram">
            <div className="chart-cols" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}>
                {bins.map(b => (
                    <div key={b.label} className="chart-col" tabIndex={0} data-tip={b.tip || `${b.label}: ${b.value}`}>
                        <span className="chart-col-value">{b.value || ''}</span>
                        <span className="chart-col-bar chart-grow-y" style={{ height: `${(b.value / top) * 100}%` }} />
                    </div>
                ))}
                {marker && <span className="chart-col-marker" style={{ left: `${marker.at * 100}%` }}><b>{marker.label}</b></span>}
            </div>
            <div className="chart-col-labels" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}>
                {bins.map(b => <span key={b.label}>{b.label}</span>)}
            </div>
        </ChartFrame>
    );
}

// ---- strip plot: one dot per item along a scale ----

/** Past this many points a dot each is unreadable (and slow): the plot bins them. */
const STRIP_MAX = 120;

export function StripPlot({ points, min, max, bands, label, unit = '' }: {
    points: Array<{ label: string; value: number }>;
    min: number; max: number;
    bands?: Array<{ from: number; to: number; label: string }>;
    label: string; unit?: string;
}) {
    if (points.length > STRIP_MAX) {
        const step = 10;
        const bins: Array<{ label: string; value: number; tip: string }> = [];
        for (let lo = min; lo < max; lo += step) {
            const last = lo + step >= max;
            const n = points.filter(p => p.value >= lo && (last || p.value < lo + step)).length;
            bins.push({ label: String(lo), value: n, tip: `${lo}${last ? '+' : `–${lo + step - 1}`}${unit}: ${n}` });
        }
        return <Histogram label={label} bins={bins} />;
    }
    const x = (v: number) => `${((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 100}%`;
    // dots that would overlap move to the next row
    const rows: number[][] = [];
    const placed = [...points].sort((a, b) => a.value - b.value).map(p => {
        const pos = ((p.value - min) / (max - min)) * 100;
        let row = rows.findIndex(r => r.every(q => Math.abs(q - pos) > 3.2));
        if (row < 0) { rows.push([]); row = rows.length - 1; }
        rows[row].push(pos);
        return { ...p, row };
    });
    const height = Math.max(3, rows.length) * 14 + 12;
    return (
        <ChartFrame label={label} className="chart-strip">
            <div className="chart-strip-plot" style={{ height }}>
                {bands?.map((b, i) => (
                    <span key={b.label} className={`chart-strip-band${i % 2 ? ' alt' : ''}`} style={{ left: x(b.from), width: `calc(${x(b.to)} - ${x(b.from)})` }}>
                        <em>{b.label}</em>
                    </span>
                ))}
                {placed.map(p => (
                    <span key={p.label + p.value} className="chart-strip-dot chart-pop" tabIndex={0} data-tip={`${p.label}: ${fmt(p.value)}${unit}`}
                        style={{ left: x(p.value), bottom: 6 + p.row * 14 }} />
                ))}
            </div>
            <div className="chart-strip-axis"><span>{min}{unit}</span><span>{Math.round((min + max) / 2)}{unit}</span><span>{max}{unit}+</span></div>
        </ChartFrame>
    );
}

// ---- percentile rows: where a value sits among 0..100 ----

export function PercentileRows({ rows, label, mainName, refName }: {
    rows: Array<{ label: string; value: number | null; compare?: number | null }>;
    label: string; mainName: string; refName?: string;
}) {
    return (
        <ChartFrame label={label} className="chart-pct">
            {rows.map(r => (
                <div key={r.label} className="chart-pct-row">
                    <span className="chart-pct-label">{r.label}</span>
                    <span className="chart-pct-track">
                        {[25, 50, 75].map(t => <i key={t} className={`chart-pct-tick${t === 50 ? ' mid' : ''}`} style={{ left: `${t}%` }} />)}
                        {r.value != null && <span className="chart-pct-fill chart-grow" style={{ width: `${r.value}%` }} />}
                        {r.compare != null && <span className="chart-pct-dot ref chart-pop" tabIndex={0} style={{ left: `${r.compare}%` }} data-tip={`${refName}: ${Math.round(r.compare)}th percentile`} />}
                        {r.value != null && <span className="chart-pct-dot main chart-pop" tabIndex={0} style={{ left: `${r.value}%` }} data-tip={`${mainName}: ${Math.round(r.value)}th percentile`} />}
                    </span>
                    <span className="chart-pct-value">{r.value == null ? '–' : Math.round(r.value)}</span>
                </div>
            ))}
            <div className="chart-legend">
                <span><i className="chart-key main dot" />{mainName}</span>
                {refName && rows.some(r => r.compare != null) && <span><i className="chart-key ref dot" />{refName}</span>}
                <span className="chart-legend-note">50 = middle of the pool</span>
            </div>
        </ChartFrame>
    );
}

// ---- gauge: one score out of 100 ----

export function Gauge({ value, label, caption }: { value: number; label: string; caption?: ReactNode }) {
    const v = Math.max(0, Math.min(100, value));
    const r = 54, len = Math.PI * r;
    return (
        <ChartFrame label={label} className="chart-gauge">
            <svg viewBox="0 0 132 76" role="img" aria-label={`${label}: ${Math.round(v)} of 100`}>
                <path className="chart-gauge-track" d={`M 12 68 A ${r} ${r} 0 0 1 120 68`} />
                <path className="chart-gauge-fill chart-draw" d={`M 12 68 A ${r} ${r} 0 0 1 120 68`}
                    style={{ strokeDasharray: `${(v / 100) * len} ${len}` }} />
            </svg>
            <div className="chart-gauge-value"><b>{Math.round(v)}</b><span>/100</span></div>
            {caption && <div className="chart-gauge-caption">{caption}</div>}
        </ChartFrame>
    );
}

// ---- scatter: two measures per item ----

/**
 * The width of an element in CSS pixels, kept current. A chart that sizes its
 * viewBox to this draws dots and text at their real size at any width.
 */
function useWidth(fallback: number) {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(fallback);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const set = () => { const next = Math.round(el.clientWidth); if (next > 0) setW(next); };
        set();
        const ro = new ResizeObserver(set);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, w] as const;
}

export function Scatter({ points, xLabel, yLabel, label, log = false }: {
    /** color: the dot's own fill (a Pokédex colour); the accent when absent */
    points: Array<{ label: string; x: number; y: number; color?: string }>;
    xLabel: string; yLabel: string; label: string; log?: boolean;
}) {
    const [box, w] = useWidth(320);
    const h = Math.round(Math.min(240, Math.max(170, w * 0.38))), pad = { l: 26, r: 10, t: 10, b: 24 };
    const f = (v: number) => (log ? Math.log10(Math.max(v, 0.01)) : v);
    const xs = points.map(p => f(p.x)), ys = points.map(p => f(p.y));
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const sx = (v: number) => pad.l + ((f(v) - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
    const sy = (v: number) => h - pad.b - ((f(v) - y0) / (y1 - y0 || 1)) * (h - pad.t - pad.b);
    return (
        <ChartFrame label={label} className="chart-scatter">
            <div ref={box}>
                <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
                    <line className="chart-grid" x1={pad.l} y1={h - pad.b} x2={w - pad.r} y2={h - pad.b} />
                    <line className="chart-grid" x1={pad.l} y1={pad.t} x2={pad.l} y2={h - pad.b} />
                    <text className="chart-axis-label" x={(w + pad.l) / 2} y={h - 6} textAnchor="middle">{xLabel}{log ? ' (log)' : ''}</text>
                    <text className="chart-axis-label" x={10} y={(h - pad.b) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(h - pad.b) / 2})`}>{yLabel}</text>
                    {points.map(p => (
                        <circle key={p.label} className={`chart-dot chart-pop${p.color ? ' own' : ' main'}`} cx={sx(p.x)} cy={sy(p.y)} r={4} tabIndex={0}
                            style={p.color ? { fill: p.color } : undefined}
                            data-tip={`${p.label}: ${fmt(p.x, 1)} m, ${fmt(p.y, 1)} kg`} />
                    ))}
                </svg>
            </div>
        </ChartFrame>
    );
}

// ---- one bar split into parts ----

export function SplitBar({ parts, label }: { parts: Array<{ label: string; value: number; cls: string }>; label: string }) {
    const total = parts.reduce((n, p) => n + p.value, 0) || 1;
    return (
        <ChartFrame label={label} className="chart-split">
            <div className="chart-split-bar chart-grow">
                {parts.filter(p => p.value).map(p => (
                    <span key={p.label} className={`chart-split-part ${p.cls}`} style={{ flexGrow: p.value }} tabIndex={0}
                        data-tip={`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`} />
                ))}
            </div>
            <div className="chart-legend">
                {parts.map(p => <span key={p.label}><i className={`chart-key swatch ${p.cls}`} />{p.label} <b>{Math.round((p.value / total) * 100)}%</b></span>)}
            </div>
        </ChartFrame>
    );
}
