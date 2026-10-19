// The generator for the landing page's painting (public/assets/landing/):
// an elevated view from a mountain ledge over a turquoise sea with islands,
// puffy clouds and the sun (day), or the same view by moonlight (night).
// Every surface is laid down as thousands of short, slightly bent brush
// strokes with jittered color, so it reads as oil paint rather than vector
// shapes. Seeded, so it paints the same picture every time.
//
// It paints one image per depth layer (the landing scene moves them
// separately for parallax) plus the cloud bank the page scrolls up into.
// index.html beside this file runs it and offers each layer as a WebP; the
// site itself only loads those files, so they can be painted over or replaced.
// Nothing here is AI-generated: the site doesn't allow AI art.

export type SceneTheme = 'day' | 'night';
export const SCENE_LAYERS = ['sky', 'clouds', 'far', 'sea', 'fg'] as const;
export type SceneLayer = typeof SCENE_LAYERS[number];

type HSL = [number, number, number];
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): AnyCanvas {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
}

interface Palette {
    sky: Array<[number, HSL]>;
    light: { x: number; y: number; r: number; core: HSL; glow: HSL };
    cloudHi: HSL; cloudMid: HSL; cloudLo: HSL;
    farHaze: HSL; far: HSL; farLit: HSL;
    rock: HSL; rockLit: HSL; rockShade: HSL; green: HSL; greenLit: HSL;
    sea: Array<[number, HSL]>; glint: HSL; foam: HSL;
    fgRock: HSL; fgRockLit: HSL; fgRockDark: HSL; fgGrass: HSL; fgGrassLit: HSL; pine: HSL; pineLit: HSL;
    trunk: HSL; flowers: HSL[];
    night: boolean;
}

const DAY: Palette = {
    sky: [[0, [212, 70, 50]], [0.3, [205, 76, 60]], [0.5, [196, 70, 74]], [0.6, [190, 58, 84]]],
    light: { x: 0.27, y: 0.14, r: 0.026, core: [52, 100, 97], glow: [48, 100, 88] },
    cloudHi: [40, 60, 99], cloudMid: [208, 45, 90], cloudLo: [214, 34, 72],
    farHaze: [196, 48, 82], far: [205, 34, 70], farLit: [32, 28, 80],
    rock: [18, 20, 44], rockLit: [30, 42, 66], rockShade: [214, 24, 38], green: [104, 38, 34], greenLit: [84, 52, 50],
    sea: [[0.56, [186, 46, 72]], [0.62, [183, 60, 52]], [0.8, [185, 68, 40]], [1, [190, 74, 29]]],
    glint: [52, 100, 96], foam: [182, 45, 93],
    fgRock: [24, 18, 30], fgRockLit: [32, 48, 58], fgRockDark: [228, 22, 16], fgGrass: [108, 42, 27], fgGrassLit: [78, 58, 50],
    pine: [152, 34, 17], pineLit: [118, 30, 32], trunk: [20, 30, 22],
    flowers: [[330, 72, 74], [48, 92, 66], [0, 0, 97], [280, 48, 76]],
    night: false
};

const NIGHT: Palette = {
    sky: [[0, [234, 55, 9]], [0.3, [230, 48, 16]], [0.5, [224, 42, 26]], [0.6, [220, 38, 34]]],
    light: { x: 0.74, y: 0.16, r: 0.03, core: [48, 45, 94], glow: [218, 60, 70] },
    cloudHi: [222, 28, 56], cloudMid: [226, 30, 36], cloudLo: [232, 34, 22],
    farHaze: [222, 32, 32], far: [226, 30, 22], farLit: [215, 26, 40],
    rock: [230, 24, 17], rockLit: [214, 24, 34], rockShade: [236, 30, 11], green: [190, 26, 14], greenLit: [180, 22, 26],
    sea: [[0.56, [222, 34, 30]], [0.62, [220, 44, 20]], [0.8, [218, 50, 14]], [1, [222, 55, 9]]],
    glint: [214, 40, 90], foam: [214, 26, 62],
    fgRock: [234, 25, 9], fgRockLit: [214, 26, 32], fgRockDark: [240, 30, 5], fgGrass: [192, 26, 11], fgGrassLit: [182, 24, 25],
    pine: [212, 30, 8], pineLit: [204, 22, 20], trunk: [230, 20, 8],
    flowers: [[300, 24, 42], [50, 36, 46], [0, 0, 60], [270, 24, 44]],
    night: true
};

// ---- small tools ----
/** '#rrggbb' with an alpha, for gradients that fade a color in or out (not through black). */
function withAlpha(hex: string, a: number) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mulberry32(seed: number) {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
type Rng = () => number;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a: HSL, b: HSL, t: number): HSL => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: HSL, dl = 0, a = 1) => `hsla(${c[0].toFixed(1)},${c[1].toFixed(1)}%,${clamp(c[2] + dl, 0, 100).toFixed(1)}%,${a})`;
function ramp(stops: Array<[number, HSL]>, v: number): HSL {
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
        if (v <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    }
    return stops[stops.length - 1][1];
}
function gauss(rng: Rng) { return (rng() + rng() + rng() - 1.5) / 1.5; }

/** One brush stroke: a short, slightly bent line with round ends. */
function stroke(ctx: Ctx2D, x: number, y: number, len: number, w: number, ang: number, color: string, bend = 0) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const hx = (c * len) / 2, hy = (s * len) / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x - hx, y - hy);
    ctx.quadraticCurveTo(x - s * bend, y + c * bend, x + hx, y + hy);
    ctx.stroke();
}

/** A ridge line: midpoint displacement, n+1 heights in 0..1. */
function ridge(rng: Rng, levels: number, rough: number, start = 0.5, end = 0.5): number[] {
    const n = 1 << levels;
    const h = new Array(n + 1).fill(0);
    h[0] = start; h[n] = end;
    let step = n, amp = 0.5;
    while (step > 1) {
        const half = step / 2;
        for (let i = half; i < n; i += step) h[i] = (h[i - half] + h[i + half]) / 2 + (rng() - 0.5) * amp;
        amp *= rough;
        step = half;
    }
    const lo = Math.min(...h), hi = Math.max(...h);
    return h.map(v => (v - lo) / (hi - lo || 1));
}
/** A ridge given a shape: env(t) sets how tall the range is along its length. */
const shaped = (h: number[], env: (t: number) => number) => h.map((v, i) => (0.25 + 0.75 * v) * env(i / (h.length - 1)));
const bump = (t: number, at: number, w: number) => Math.exp(-((t - at) * (t - at)) / (2 * w * w));
const sample = (h: number[], t: number) => {
    const f = clamp(t) * (h.length - 1), i = Math.floor(f), k = f - i;
    return lerp(h[i], h[Math.min(i + 1, h.length - 1)], k);
};

interface Ctx { ctx: Ctx2D; W: number; H: number; rng: Rng; pal: Palette; q: number; u: number }

/**
 * Covers a clipped region with strokes: a coarse block fill so nothing shows
 * through, then two passes of strokes, broad and then finer.
 */
function paintRegion(k: Ctx, path: Path2D, box: [number, number, number, number],
    o: { step: number; len: number; width: number; color: (x: number, y: number) => HSL; angle: (x: number, y: number) => number; jl: number; alpha?: number; passes?: number }) {
    const { ctx, rng } = k;
    const step = o.step / k.q;
    ctx.save();
    ctx.clip(path);
    const [x0, y0, x1, y1] = box;
    const blk = step * 2.4;
    for (let y = y0; y < y1; y += blk) {
        for (let x = x0; x < x1; x += blk) {
            ctx.fillStyle = css(o.color(x + blk / 2, y + blk / 2));
            ctx.fillRect(x, y, blk + 1, blk + 1);
        }
    }
    const passes: Array<readonly [number, number]> = o.passes === 1 ? [[1, 1]] : [[1.6, 1.5], [1, 0.8]];
    for (const [mul, wmul] of passes) {
        const st = step * mul;
        for (let y = y0 - st; y < y1 + st; y += st * 0.62) {
            for (let x = x0 - st; x < x1 + st; x += st) {
                const px = x + (rng() - 0.5) * st * 1.4, py = y + (rng() - 0.5) * st;
                const c = o.color(px, py);
                stroke(ctx, px, py, o.len * mul * (0.6 + rng() * 0.8), o.width * wmul * (0.7 + rng() * 0.6),
                    o.angle(px, py) + gauss(rng) * 0.18, css([c[0] + gauss(rng) * 3, c[1], c[2]], gauss(rng) * o.jl, o.alpha ?? 1), (rng() - 0.5) * o.width);
            }
        }
    }
    ctx.restore();
}

// ---- the layers ----

function paintSky(k: Ctx) {
    const { ctx, W, H, rng, pal } = k;
    const path = new Path2D(); path.rect(0, 0, W, H);
    paintRegion(k, path, [0, 0, W, H], {
        step: 22 * k.u, len: 90 * k.u, width: 24 * k.u, jl: 2.2, passes: 1,
        color: (_x, y) => ramp(pal.sky, y / H),
        angle: () => 0
    });
    const lx = pal.light.x * W, ly = pal.light.y * H, lr = pal.light.r * Math.max(W, H);
    if (pal.night) {
        // stars, thinning toward the horizon
        for (let i = 0; i < 420; i++) {
            const x = rng() * W, y = Math.pow(rng(), 1.6) * H * 0.55;
            const r = (0.4 + rng() * rng() * 1.6) * k.u;
            ctx.fillStyle = `rgba(235,240,255,${(0.35 + rng() * 0.6) * (1 - y / (H * 0.6))})`;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
    }
    // the glow, then the disc
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr * (pal.night ? 9 : 12));
    g.addColorStop(0, css(pal.light.glow, 0, pal.night ? 0.45 : 0.75));
    g.addColorStop(0.25, css(pal.light.glow, 0, pal.night ? 0.16 : 0.3));
    g.addColorStop(1, css(pal.light.glow, 0, 0));
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!pal.night) {
        // soft shafts of light falling from the sun
        for (let i = 0; i < 7; i++) {
            const a = 0.35 + i * 0.32 + gauss(rng) * 0.08, spread = 0.035 + rng() * 0.03, reach = H * 1.1;
            const ray = ctx.createLinearGradient(lx, ly, lx + Math.cos(a) * reach, ly + Math.sin(a) * reach);
            ray.addColorStop(0, 'rgba(255,250,225,0.16)'); ray.addColorStop(1, 'rgba(255,250,225,0)');
            ctx.fillStyle = ray;
            ctx.beginPath(); ctx.moveTo(lx, ly);
            ctx.lineTo(lx + Math.cos(a - spread) * reach, ly + Math.sin(a - spread) * reach);
            ctx.lineTo(lx + Math.cos(a + spread) * reach, ly + Math.sin(a + spread) * reach);
            ctx.closePath(); ctx.fill();
        }
    }
    ctx.restore();
    for (let i = 0; i < 160; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * lr;
        stroke(ctx, lx + Math.cos(a) * d, ly + Math.sin(a) * d, lr * 0.5, lr * 0.32, a + Math.PI / 2, css(pal.light.core, gauss(rng) * 2, 0.9));
    }
    if (pal.night) {
        // a few soft craters
        for (let i = 0; i < 7; i++) {
            ctx.fillStyle = 'rgba(150,160,190,0.22)';
            ctx.beginPath(); ctx.arc(lx + gauss(rng) * lr * 0.5, ly + gauss(rng) * lr * 0.5, lr * (0.1 + rng() * 0.18), 0, Math.PI * 2); ctx.fill();
        }
    }
}

/** A puffy, flat-bottomed cloud, painted dab by dab, lit from the sun's side. */
function paintCloud(k: Ctx, cx: number, cy: number, w: number, pal: Palette, colors?: { hi: HSL; mid: HSL; lo: HSL }) {
    const { ctx, rng } = k;
    const hi = colors?.hi || pal.cloudHi, md = colors?.mid || pal.cloudMid, lo = colors?.lo || pal.cloudLo;
    const lightX = pal.light.x < 0.5 ? -0.6 : 0.6;
    const puffs: Array<[number, number, number]> = [];
    const n = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const r = w * (0.1 + 0.15 * Math.sin(Math.PI * t)) * (0.8 + rng() * 0.45);
        puffs.push([cx + (t - 0.5) * w * 0.86, cy - r * 0.55 - Math.sin(Math.PI * t) * w * 0.05, r]);
    }
    for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
        const r = w * (0.12 + rng() * 0.08);
        puffs.push([cx + (rng() - 0.5) * w * 0.4, cy - w * 0.16 - rng() * w * 0.06, r]);
    }
    const dabs: Array<[number, number, number, number, number]> = [];
    for (const [px, py, r] of puffs) {
        const count = Math.round((r * r) / (k.u * k.u * 30) * k.q * k.q) + 20;
        for (let j = 0; j < count; j++) {
            const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
            const x = px + Math.cos(a) * d, y = py + Math.sin(a) * d;
            if (y > cy + r * 0.12) continue; // the flat bottom
            const nx = (x - px) / r, ny = (y - py) / r;
            const lit = clamp(0.5 + 0.5 * (nx * lightX + ny * -0.8)) * clamp(1.1 - (y - (cy - w * 0.25)) / (w * 0.35), 0.25, 1);
            dabs.push([x, y, lit, a + Math.PI / 2, d / r]);
        }
    }
    dabs.sort((p, q) => p[2] - q[2]);
    for (const [x, y, lit, ang, edge] of dabs) {
        const c = lit < 0.5 ? mix(lo, md, lit * 2) : mix(md, hi, (lit - 0.5) * 2);
        const size = w * 0.05 * (0.6 + rng() * 0.8);
        stroke(ctx, x, y, size * 1.8, size, ang + gauss(rng) * 0.4, css(c, gauss(rng) * 1.5, edge > 0.85 ? 0.55 : 0.95), size * 0.4);
    }
}

function paintClouds(k: Ctx) {
    const { W, H, rng, pal } = k;
    const spots: Array<[number, number, number]> = pal.night
        ? [[0.12, 0.13, 0.2], [0.44, 0.22, 0.24], [0.9, 0.3, 0.18], [0.62, 0.08, 0.14], [0.28, 0.36, 0.12]]
        : [[0.1, 0.12, 0.2], [0.5, 0.2, 0.25], [0.86, 0.32, 0.17], [0.72, 0.07, 0.12], [0.3, 0.38, 0.11]];
    for (const [x, y, s] of spots) paintCloud(k, x * W + gauss(rng) * W * 0.01, y * H, s * W, pal);
    if (!pal.night) {
        // a few birds
        k.ctx.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
            const bx = W * (0.56 + rng() * 0.22), by = H * (0.3 + rng() * 0.1), s = (5 + rng() * 6) * k.u;
            stroke(k.ctx, bx - s * 0.5, by, s, 1.6 * k.u, -0.35, 'rgba(40,55,80,0.7)', -s * 0.2);
            stroke(k.ctx, bx + s * 0.5, by, s, 1.6 * k.u, 0.35, 'rgba(40,55,80,0.7)', -s * 0.2);
        }
    }
}

/** A mountain range from a ridge line, faces lit or shaded by the slope. */
function paintRange(k: Ctx, x0: number, x1: number, base: number, top: number, h: number[], cols: { body: HSL; lit: HSL; shade: HSL; haze: HSL; hazeAmt: number }, step = 8) {
    const { W, pal } = k;
    const yAt = (x: number) => lerp(base, top, sample(h, (x - x0) / (x1 - x0)));
    const path = new Path2D();
    path.moveTo(x0, base + 4);
    for (let x = x0; x <= x1; x += 3) path.lineTo(x, yAt(x));
    path.lineTo(x1, base + 4);
    path.closePath();
    const lx = pal.light.x * W < (x0 + x1) / 2 ? -1 : 1;
    const slope = (x: number) => (yAt(x - 6) - yAt(x + 6)) / 12; // + means rising to the right
    const span = Math.max(1, base - top);
    paintRegion(k, path, [x0, top - 4, x1, base + 4], {
        step: step * k.u, len: 20 * k.u, width: 7 * k.u, jl: 3,
        color: (x, y) => {
            const s = slope(x);
            const lit = clamp(0.5 + s * -lx * 0.9);
            const c = lit > 0.5 ? mix(cols.body, cols.lit, (lit - 0.5) * 2) : mix(cols.shade, cols.body, lit * 2);
            const depthDown = clamp((y - yAt(x)) / span);
            return mix(c, cols.haze, clamp(cols.hazeAmt + depthDown * 0.35));
        },
        // strokes run down the slope, the way you'd paint a mountainside
        angle: x => Math.atan2(yAt(x + 6) - yAt(x - 6), 12) + Math.PI * 0.08
    });
    return yAt;
}

function paintFar(k: Ctx) {
    const { W, H, rng, pal } = k;
    const horizon = H * 0.56;
    // the far massifs on the horizon, deep in haze
    paintRange(k, -W * 0.05, W * 1.05, horizon + 2, H * 0.22,
        shaped(ridge(rng, 8, 0.58), t => 0.3 + 0.7 * Math.max(bump(t, 0.28, 0.12), bump(t, 0.6, 0.08), bump(t, 0.86, 0.1) * 0.8)),
        { body: pal.far, lit: pal.farLit, shade: mix(pal.far, pal.farHaze, 0.15), haze: pal.farHaze, hazeAmt: 0.5 }, 10);
    // nearer ranges on both sides, running down into the sea
    paintRange(k, -W * 0.06, W * 0.44, horizon + 6, H * 0.3,
        shaped(ridge(rng, 7, 0.55), t => 1 - Math.pow(t, 1.4) * 0.9),
        { body: mix(pal.far, pal.rock, 0.4), lit: mix(pal.farLit, pal.rockLit, 0.5), shade: mix(pal.far, pal.rockShade, 0.5), haze: pal.farHaze, hazeAmt: 0.26 }, 8);
    paintRange(k, W * 0.6, W * 1.06, horizon + 6, H * 0.32,
        shaped(ridge(rng, 7, 0.55), t => 0.15 + Math.pow(t, 0.9) * 0.85),
        { body: mix(pal.far, pal.rock, 0.4), lit: mix(pal.farLit, pal.rockLit, 0.5), shade: mix(pal.far, pal.rockShade, 0.5), haze: pal.farHaze, hazeAmt: 0.3 }, 8);
}

function paintPalm(k: Ctx, x: number, y: number, s: number) {
    const { ctx, rng, pal } = k;
    const lean = (rng() - 0.5) * 0.5;
    const topX = x + lean * s, topY = y - s;
    ctx.lineCap = 'round';
    stroke(ctx, (x + topX) / 2, (y + topY) / 2, s, s * 0.07, Math.atan2(topY - y, topX - x), css(pal.trunk), s * 0.08);
    for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.8 + gauss(rng) * 0.15;
        const len = s * (0.45 + rng() * 0.2);
        const ex = topX + Math.cos(a) * len, ey = topY + Math.sin(a) * len * 0.6 + len * 0.25;
        stroke(ctx, (topX + ex) / 2, (topY + ey) / 2, len, s * 0.09, Math.atan2(ey - topY, ex - topX), css(i % 2 ? pal.greenLit : pal.green, gauss(rng) * 3), len * 0.18);
    }
}

function paintIslet(k: Ctx, cx: number, baseY: number, w: number, h: number, palms: number) {
    const { ctx, rng, pal } = k;
    const top = ridge(rng, 5, 0.5, 0.1, 0.1).map((v, i, a) => v * 0.4 + Math.sin(Math.PI * i / (a.length - 1)) * 0.8);
    const x0 = cx - w / 2, x1 = cx + w / 2;
    // reflection first
    for (let i = 0; i < 40 * k.q; i++) {
        stroke(ctx, cx + (rng() - 0.5) * w, baseY + rng() * h * 0.7, w * 0.15, 2 * k.u, 0, css(pal.night ? pal.rockShade : mix(pal.green, pal.rockShade, 0.5), 0, 0.25));
    }
    paintRange(k, x0, x1, baseY, baseY - h, top, { body: pal.green, lit: pal.greenLit, shade: pal.rockShade, haze: pal.farHaze, hazeAmt: 0.08 }, 4);
    // a sandy or rocky lip at the waterline
    for (let i = 0; i < 30 * k.q; i++) stroke(ctx, cx + (rng() - 0.5) * w * 0.95, baseY - rng() * 2 * k.u, 6 * k.u, 2.4 * k.u, 0, css(pal.night ? pal.rock : [38, 40, 70], gauss(rng) * 4));
    for (let i = 0; i < palms; i++) paintPalm(k, cx + (rng() - 0.5) * w * 0.6, baseY - h * (0.5 + rng() * 0.4), h * (1.2 + rng() * 0.8));
    if (pal.night) {
        for (let i = 0; i < 2; i++) {
            const lx = cx + (rng() - 0.5) * w * 0.4, ly = baseY - h * 0.4;
            ctx.fillStyle = 'rgba(255,200,110,0.95)';
            ctx.beginPath(); ctx.arc(lx, ly, 1.6 * k.u, 0, Math.PI * 2); ctx.fill();
            for (let j = 0; j < 5; j++) stroke(ctx, lx + gauss(rng) * 2, baseY + 4 + j * 4 * k.u, 6 * k.u, 1.4 * k.u, 0, 'rgba(255,190,100,0.35)');
        }
    }
}

function paintSea(k: Ctx) {
    const { ctx, W, H, rng, pal } = k;
    const horizon = H * 0.56;
    const sunX = pal.light.x * W;
    ctx.lineCap = 'round';
    // the water, in rows that grow toward the viewer
    for (let y = horizon; y < H + 10;) {
        const t = (y - horizon) / (H - horizon);
        const len = (10 + t * 70) * k.u, w = (1.6 + t * 6) * k.u;
        const base = ramp(pal.sea, y / H);
        for (let x = -len; x < W + len; x += len * 0.42 / k.q) {
            const streak = rng() < 0.06 ? 6 : 0;
            stroke(ctx, x + rng() * len * 0.3, y + rng() * w, len * (0.7 + rng() * 0.6), w * (0.8 + rng() * 0.5), gauss(rng) * 0.03,
                css([base[0] + gauss(rng) * 3, base[1], base[2]], gauss(rng) * 3.5 + streak), (rng() - 0.5) * w);
        }
        y += Math.max(1.2 * k.u, w * 0.7);
    }
    // the glitter path under the sun (or moon)
    for (let y = horizon; y < H; y += 2.2 * k.u) {
        const t = (y - horizon) / (H - horizon);
        const spread = W * (0.015 + t * 0.11);
        const n = Math.round((2 + t * 9) * k.q * (pal.night ? 0.45 : 1));
        for (let i = 0; i < n; i++) {
            const x = sunX + gauss(rng) * spread;
            stroke(ctx, x, y, (3 + t * 26) * k.u * (0.5 + rng()), (0.8 + t * 2.4) * k.u, 0,
                css(pal.glint, gauss(rng) * 3, pal.night ? 0.25 + rng() * 0.4 : 0.55 + rng() * 0.4));
        }
    }
    // whitecaps scattered over the rest
    const caps = (pal.night ? 90 : 240) * k.q;
    for (let i = 0; i < caps; i++) {
        const t = Math.pow(rng(), 0.6), y = horizon + t * (H - horizon), x = rng() * W;
        const s = (2 + t * 16) * k.u * (0.5 + rng());
        // a little crescent of foam: a bright crest over a softer trail
        stroke(ctx, x, y, s * 1.5, s * 0.22, gauss(rng) * 0.12, css(pal.foam, gauss(rng) * 3, 0.35 + rng() * 0.4), -s * 0.3);
        if (rng() < 0.6) stroke(ctx, x + s * 0.5, y + s * 0.12, s * 0.9, s * 0.14, gauss(rng) * 0.1, css(pal.foam, 2, 0.25 + rng() * 0.3), -s * 0.15);
    }
    // haze on the horizon line
    const g = ctx.createLinearGradient(0, horizon - 6, 0, horizon + H * 0.04);
    g.addColorStop(0, css(pal.farHaze, 0, 0.7)); g.addColorStop(1, css(pal.farHaze, 0, 0));
    ctx.fillStyle = g; ctx.fillRect(0, horizon - 6, W, H * 0.05);

    // the big rocky island on the right, then the islets
    paintRange(k, -W * 0.03, W * 0.22, horizon + H * 0.02, H * 0.46, shaped(ridge(rng, 6, 0.5), t => Math.sin(Math.PI * Math.min(1, t * 1.2)) * 0.9 + 0.1),
        { body: pal.rock, lit: pal.rockLit, shade: pal.rockShade, haze: pal.farHaze, hazeAmt: 0.3 }, 6);
    const yAt = paintRange(k, W * 0.56, W * 1.06, horizon + H * 0.035, H * 0.38, shaped(ridge(rng, 7, 0.58), t => 0.15 + 0.85 * Math.max(bump(t, 0.55, 0.16), bump(t, 0.85, 0.2) * 0.75)),
        { body: pal.rock, lit: pal.rockLit, shade: pal.rockShade, haze: pal.farHaze, hazeAmt: 0.1 }, 6);
    for (let i = 0; i < 26; i++) {
        const x = W * (0.55 + rng() * 0.5), y = yAt(x);
        ctx.fillStyle = css(rng() < 0.5 ? pal.green : pal.greenLit, gauss(rng) * 4);
        ctx.beginPath(); ctx.ellipse(x, y + 2 * k.u, (4 + rng() * 6) * k.u, (2 + rng() * 3) * k.u, 0, 0, Math.PI * 2); ctx.fill();
    }
    paintIslet(k, W * 0.47, H * 0.645, W * 0.09, H * 0.022, 4);
    paintIslet(k, W * 0.66, H * 0.665, W * 0.11, H * 0.026, 5);
    paintIslet(k, W * 0.3, H * 0.62, W * 0.05, H * 0.014, 2);
    paintIslet(k, W * 0.82, H * 0.63, W * 0.05, H * 0.012, 1);
}

function paintPine(k: Ctx, x: number, baseY: number, h: number) {
    const { ctx, rng, pal } = k;
    const litSide = pal.light.x < 0.5 ? -1 : 1;
    ctx.lineCap = 'round';
    stroke(ctx, x, baseY - h * 0.2, h * 0.4, h * 0.03, Math.PI / 2, css(pal.trunk));
    const tiers = 13;
    for (let t = 0; t < tiers; t++) {
        const f = t / tiers;
        const ty = baseY - h * 0.12 - f * h * 0.86;
        const half = h * 0.2 * Math.pow(1 - f, 0.9) + h * 0.02;
        // the tier's mass, then its needles over it
        ctx.fillStyle = css(pal.pine, -2);
        ctx.beginPath();
        ctx.moveTo(x, ty - h * 0.08);
        ctx.quadraticCurveTo(x - half * 0.5, ty - h * 0.01, x - half, ty + h * 0.035);
        ctx.quadraticCurveTo(x, ty + h * 0.012, x + half, ty + h * 0.035);
        ctx.quadraticCurveTo(x + half * 0.5, ty - h * 0.01, x, ty - h * 0.08);
        ctx.fill();
        for (let i = 0; i < 44 * k.q; i++) {
            const side = rng() < 0.5 ? -1 : 1;
            const reach = Math.sqrt(rng()) * half;
            const px = x + side * reach, py = ty + reach * 0.3 - rng() * h * 0.05;
            const lit = side === litSide ? reach / half : 0.08;
            stroke(ctx, px, py, h * 0.032, h * 0.009, side > 0 ? 0.3 + rng() * 0.35 : Math.PI - 0.3 - rng() * 0.35,
                css(mix(pal.pine, pal.pineLit, lit * 0.9), gauss(rng) * 3));
        }
    }
}

/** A clump of grass blades from one root. */
function tuft(k: Ctx, x: number, y: number, scale: number) {
    const { ctx, rng, pal } = k;
    const n = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < n; j++) {
        const len = (5 + rng() * rng() * 26) * k.u * scale;
        stroke(ctx, x + gauss(rng) * 2 * k.u, y - len * 0.42, len, (1.3 + rng() * 1.5) * k.u, -Math.PI / 2 + gauss(rng) * 0.5,
            css(mix(pal.fgGrass, pal.fgGrassLit, rng() * rng() * 1.3), gauss(rng) * 4), gauss(rng) * len * 0.25);
    }
}

function paintForeground(k: Ctx) {
    const { ctx, W, H, rng, pal } = k;
    const litX = pal.light.x < 0.5 ? -1 : 1;
    // left cliff: the ledge you're standing on
    const lh = ridge(rng, 6, 0.55, 0, 1);
    const leftEdge = (x: number) => lerp(H * 0.5, H * 1.04, Math.pow(clamp(x / (W * 0.34)), 1.35)) + (sample(lh, x / (W * 0.34)) - 0.5) * H * 0.06;
    const left = new Path2D();
    left.moveTo(-10, H + 10);
    for (let x = -10; x <= W * 0.36; x += 3) left.lineTo(x, leftEdge(x));
    left.lineTo(W * 0.36, H + 10); left.closePath();
    // right rocks under the pines
    const rh = ridge(rng, 6, 0.55, 1, 0);
    const rightEdge = (x: number) => lerp(H * 1.04, H * 0.6, Math.pow(clamp((x - W * 0.76) / (W * 0.26)), 0.8)) + (sample(rh, (x - W * 0.76) / (W * 0.26)) - 0.5) * H * 0.05;
    const right = new Path2D();
    right.moveTo(W * 0.74, H + 10);
    for (let x = W * 0.74; x <= W + 10; x += 3) right.lineTo(x, rightEdge(x));
    right.lineTo(W + 10, H + 10); right.closePath();

    const rockColor = (edge: (x: number) => number, facing: number) => (x: number, y: number): HSL => {
        const d = (y - edge(x)) / (18 * k.u);
        const rim = clamp(1 - d) * (facing === litX ? 1 : 0.45);
        const body = mix(pal.fgRock, pal.fgRockDark, clamp((y - edge(x)) / (H * 0.35)));
        return mix(body, pal.fgRockLit, rim * 0.85);
    };
    paintRegion(k, left, [-10, H * 0.42, W * 0.37, H + 10], {
        step: 7 * k.u, len: 24 * k.u, width: 8 * k.u, jl: 3.5, color: rockColor(leftEdge, -1),
        angle: x => Math.atan2(leftEdge(x + 5) - leftEdge(x - 5), 10)
    });
    paintRegion(k, right, [W * 0.74, H * 0.52, W + 10, H + 10], {
        step: 7 * k.u, len: 24 * k.u, width: 8 * k.u, jl: 3.5, color: rockColor(rightEdge, 1),
        angle: x => Math.atan2(rightEdge(x + 5) - rightEdge(x - 5), 10)
    });
    // grass along both edges
    ctx.lineCap = 'round';
    const tufts = (edge: (x: number) => number, xa: number, xb: number) => {
        for (let x = xa; x < xb; x += (3 + rng() * 5) * k.u / k.q) tuft(k, x, edge(x) + 2 * k.u, 0.7 + rng() * 0.5);
    };
    tufts(leftEdge, -10, W * 0.35);
    tufts(rightEdge, W * 0.77, W + 10);
    // pines on the right
    paintPine(k, W * 0.93, rightEdge(W * 0.93) + 6 * k.u, H * 0.5);
    paintPine(k, W * 0.86, rightEdge(W * 0.86) + 8 * k.u, H * 0.36);
    paintPine(k, W * 0.99, rightEdge(W * 0.99) + 6 * k.u, H * 0.42);

    // the meadow along the bottom
    const mh = ridge(rng, 7, 0.6, 0.5, 0.5);
    const meadowEdge = (x: number) => H * 0.9 + (sample(mh, x / W) - 0.5) * H * 0.05;
    const meadow = new Path2D();
    meadow.moveTo(-10, H + 10);
    for (let x = -10; x <= W + 10; x += 4) meadow.lineTo(x, meadowEdge(x));
    meadow.lineTo(W + 10, H + 10); meadow.closePath();
    paintRegion(k, meadow, [-10, H * 0.85, W + 10, H + 10], {
        step: 5 * k.u, len: 14 * k.u, width: 3.2 * k.u, jl: 4,
        color: (x, y) => mix(pal.fgGrassLit, pal.fgGrass, clamp((y - meadowEdge(x)) / (H * 0.06))),
        angle: () => -Math.PI / 2
    });
    // clumps along the meadow's edge, then scattered over it, back to front
    for (let x = -10; x < W + 10; x += (3 + rng() * 6) * k.u / k.q) tuft(k, x, meadowEdge(x) + 3 * k.u, 0.8 + rng() * 0.6);
    const clumps: Array<[number, number]> = [];
    for (let i = 0; i < 420 * k.q; i++) { const x = rng() * W; clumps.push([x, meadowEdge(x) + rng() * (H - meadowEdge(x))]); }
    clumps.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of clumps) tuft(k, x, y, 0.9 + (y - H * 0.88) / (H * 0.12) * 0.8);
    // flowers
    for (let i = 0; i < 160 * k.q; i++) {
        const x = rng() * W, y = meadowEdge(x) + rng() * H * 0.08;
        ctx.fillStyle = css(pal.flowers[Math.floor(rng() * pal.flowers.length)], gauss(rng) * 4);
        ctx.beginPath(); ctx.arc(x, y, (1.4 + rng() * 2) * k.u, 0, Math.PI * 2); ctx.fill();
    }
    if (pal.night) {
        // fireflies
        for (let i = 0; i < 28; i++) {
            const x = rng() * W, y = H * (0.72 + rng() * 0.25), r = (6 + rng() * 8) * k.u;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(255,226,140,0.9)'); g.addColorStop(0.25, 'rgba(255,210,110,0.35)'); g.addColorStop(1, 'rgba(255,200,100,0)');
            ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
    }
}

const PAINT: Record<SceneLayer, (k: Ctx) => void> = { sky: paintSky, clouds: paintClouds, far: paintFar, sea: paintSea, fg: paintForeground };

/**
 * Paints the scene, one canvas per layer.
 * @param quality 1 normal, lower on low-end devices (fewer, bigger strokes)
 */
export function paintScene(theme: SceneTheme, w: number, h: number, scale: number, quality: number): Record<SceneLayer, AnyCanvas> {
    const pal = theme === 'night' ? NIGHT : DAY;
    const out = {} as Record<SceneLayer, AnyCanvas>;
    SCENE_LAYERS.forEach((layer, i) => {
        const canvas = makeCanvas(Math.round(w * scale), Math.round(h * scale));
        const ctx = canvas.getContext('2d') as Ctx2D;
        ctx.lineCap = 'round';
        // brush sizes are designed for a ~900px tall frame
        const u = (canvas.height / 900) * 1;
        PAINT[layer]({ ctx, W: canvas.width, H: canvas.height, rng: mulberry32(7331 + i * 101), pal, q: quality, u });
        out[layer] = canvas;
    });
    return out;
}

/**
 * The bank of clouds the page scrolls up into: puffs along the top that
 * settle into a solid band of the page's own background color below, so the
 * painting hands over to the rest of the page without a seam.
 */
export function paintCloudBank(theme: SceneTheme, w: number, h: number, scale: number, quality: number, pageColor: string): AnyCanvas {
    const pal = theme === 'night' ? NIGHT : DAY;
    const canvas = makeCanvas(Math.round(w * scale), Math.round(h * scale));
    const ctx = canvas.getContext('2d') as Ctx2D;
    ctx.lineCap = 'round';
    const W = canvas.width, H = canvas.height;
    const k: Ctx = { ctx, W, H, rng: mulberry32(424242), pal, q: quality, u: (H / 1440) };
    const colors = theme === 'night'
        ? { hi: [226, 14, 30] as HSL, mid: [232, 14, 18] as HSL, lo: [240, 10, 10] as HSL }
        : { hi: [40, 40, 99] as HSL, mid: [250, 24, 94] as HSL, lo: [236, 22, 84] as HSL };
    // a body of cloud behind the rows, so nothing of the painting shows between them
    const body = ctx.createLinearGradient(0, H * 0.17, 0, H * 0.27);
    body.addColorStop(0, css(colors.mid, 0, 0));
    body.addColorStop(1, css(colors.mid, 0, 1));
    ctx.fillStyle = body;
    ctx.fillRect(0, H * 0.17, W, H * 0.1);
    ctx.fillStyle = css(colors.mid);
    ctx.fillRect(0, H * 0.27, W, H * 0.2);
    // two rows of big clouds, back then front
    for (const [row, size, count] of [[0.2, 0.32, 6], [0.31, 0.38, 7]] as const) {
        for (let i = 0; i < count; i++) {
            const x = ((i + 0.5) / count) * W + gauss(k.rng) * W * 0.03;
            // sized off the taller side too, so a phone still gets big clouds
            paintCloud(k, x, H * row + gauss(k.rng) * H * 0.02, Math.max(W, H * 0.55) * size * (0.85 + k.rng() * 0.3), pal, colors);
        }
    }
    // the clouds melt into the page's own color, then it's solid to the bottom
    const fadeTop = H * 0.25, solidTop = H * 0.38;
    const g = ctx.createLinearGradient(0, fadeTop, 0, solidTop);
    g.addColorStop(0, withAlpha(pageColor, 0));
    g.addColorStop(1, withAlpha(pageColor, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, fadeTop, W, solidTop - fadeTop + 1);
    ctx.fillStyle = pageColor;
    ctx.fillRect(0, solidTop, W, H - solidTop);
    return canvas;
}

export interface PaintJob { theme: SceneTheme; w: number; h: number; bankW: number; bankH: number; scale: number; quality: number; pageColor: string }
export interface PaintedScene { layers: Record<SceneLayer, ImageBitmap | AnyCanvas>; bank: ImageBitmap | AnyCanvas }

/** Everything the landing scene needs for one theme and size. */
export function paintAll(job: PaintJob): { layers: Record<SceneLayer, AnyCanvas>; bank: AnyCanvas } {
    return {
        layers: paintScene(job.theme, job.w, job.h, job.scale, job.quality),
        bank: paintCloudBank(job.theme, job.bankW, job.bankH, job.scale, job.quality, job.pageColor)
    };
}
