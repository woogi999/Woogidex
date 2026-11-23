// Writes the Woobux coin and the coupon as vector SVG, after the owner's coin
// reference (a tilted gold octagon): a thick edge to the lower left, a
// bevelled rim, a recessed face and a raised "W" with its own edge. The
// coupon is a ticket in the same gold, bevel and edge.
// Usage: node scripts/coin-art.mjs public/assets
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('out dir?');

// ---- colour helpers ----
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));

// ---- geometry helpers ----
const f = n => +n.toFixed(2);
const pts = p => p.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
const add = ([x, y], [u, v]) => [x + u, y + v];
const area = p => p.reduce((s, [x, y], i) => { const [u, v] = p[(i + 1) % p.length]; return s + x * v - u * y; }, 0) / 2;
/** Each edge with its outward unit normal. */
function edges(p) {
    const sign = area(p) > 0 ? 1 : -1;
    return p.map((a, i) => {
        const b = p[(i + 1) % p.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        return { a, b, n: [sign * dy / len, -sign * dx / len] };
    });
}
/** A view: rotate, squash, then move to the centre. */
const view = (cx, cy, rot, sy = 1) => ([x, y]) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [cx + x * c - y * s, cy + (x * s + y * c) * sy];
};
const octagon = r => Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI / 8) + (i * Math.PI) / 4;
    return [r * Math.cos(a), r * Math.sin(a)];
});
const scale = (p, sx, sy = sx) => p.map(([x, y]) => [x * sx, y * sy]);

// light comes from the upper left
const LIGHT = (() => { const v = [-0.5, -0.87]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l]; })();
const lit = n => n[0] * LIGHT[0] + n[1] * LIGHT[1];          // -1..1
const shade = (n, darkC, lightC) => mix(darkC, lightC, (lit(n) + 1) / 2);

// the edge (thickness) runs to the lower left
const EDGE = [-2.7, 2.5];

/** A solid's edge: the shape moved along EDGE, and a shaded band for each edge that faces it. */
function extrude(p, by, darkC, lightC, base) {
    let s = `<polygon points="${pts(p.map(q => add(q, by)))}" fill="${base}"/>`;
    for (const { a, b, n } of edges(p)) {
        if (n[0] * by[0] + n[1] * by[1] <= 0) continue;
        s += `<polygon points="${pts([a, b, add(b, by), add(a, by)])}" fill="${shade(n, darkC, lightC)}"/>`;
    }
    return s;
}

/** Bands between an outer and an inner shape (same point count). `inward`: a wall going down into a recess. */
function bevel(outer, inner, darkC, lightC, inward = false) {
    return edges(outer).map(({ n }, i) => {
        const j = (i + 1) % outer.length;
        const facing = inward ? [-n[0], -n[1]] : n;
        return `<polygon points="${pts([outer[i], outer[j], inner[j], inner[i]])}" fill="${shade(facing, darkC, lightC)}" stroke="${shade(facing, darkC, lightC)}" stroke-width=".25" stroke-linejoin="round"/>`;
    }).join('');
}

// the W, centred on 0,0, about 22 wide
const W = [[-11, -8], [-6.7, -8], [-3.6, 3], [-1.4, -4.6], [1.4, -4.6], [3.6, 3], [6.7, -8], [11, -8], [5.7, 8.6], [1.7, 8.6], [0, 3], [-1.7, 8.6], [-5.7, 8.6]];

/** A raised W: its own edge, then the face with a light rim. */
function raisedW(v, k, id) {
    const p = scale(W, k).map(v);
    const by = [EDGE[0] * 0.55 * k, EDGE[1] * 0.55 * k];
    return extrude(p, by, '#9c4a08', '#dc7a0e', '#a9520a')
        + `<polygon points="${pts(p)}" fill="url(#${id}w)"/>`
        + `<polygon points="${pts(p)}" fill="none" stroke="#fff4b8" stroke-width="${f(0.7 * k)}" stroke-linejoin="round" opacity=".85" clip-path="url(#${id}wc)"/>`
        + `<clipPath id="${id}wc"><polygon points="${pts(p)}"/></clipPath>`;
}

/** A four-point sparkle. */
const sparkle = (x, y, r, o = 1) => `<path d="M${f(x)} ${f(y - r)}C${f(x + r * 0.16)} ${f(y - r * 0.16)} ${f(x + r * 0.16)} ${f(y - r * 0.16)} ${f(x + r)} ${f(y)}C${f(x + r * 0.16)} ${f(y + r * 0.16)} ${f(x + r * 0.16)} ${f(y + r * 0.16)} ${f(x)} ${f(y + r)}C${f(x - r * 0.16)} ${f(y + r * 0.16)} ${f(x - r * 0.16)} ${f(y + r * 0.16)} ${f(x - r)} ${f(y)}C${f(x - r * 0.16)} ${f(y - r * 0.16)} ${f(x - r * 0.16)} ${f(y - r * 0.16)} ${f(x)} ${f(y - r)}Z" fill="#ffffff" opacity="${o}"/>`;

const defs = id => `<defs>
<linearGradient id="${id}rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe14a"/><stop offset="1" stop-color="#f7bb12"/></linearGradient>
<radialGradient id="${id}floor" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fbbf16"/><stop offset="1" stop-color="#f2a00b"/></radialGradient>
<linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe03c"/><stop offset="1" stop-color="#fbc51a"/></linearGradient>
<linearGradient id="${id}sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>`;

/** A soft diagonal shine across a shape. */
const sheen = (id, shape, x, y) => `<clipPath id="${id}sc"><polygon points="${pts(shape)}"/></clipPath>`
    + `<g clip-path="url(#${id}sc)"><rect x="${x}" y="${y}" width="9" height="90" fill="url(#${id}sheen)" transform="rotate(28 ${x} ${y})"/></g>`;

// ==================== the coin ====================
function coin() {
    const id = 'wbx';
    const v = view(33.2, 30.2, -0.24, 0.95);
    const R = 27;
    const outer = octagon(R).map(v);
    const rim = octagon(R - 2.4).map(v);
    const lip = octagon(R * 0.7).map(v);
    const floor = octagon(R * 0.7 - 2.6).map(v);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${defs(id)}`
        + extrude(outer, EDGE, '#a24d07', '#ef8a0f', '#b4580a')
        + bevel(outer, rim, '#f29010', '#fff2a2')
        + `<polygon points="${pts(rim)}" fill="url(#${id}rim)"/>`
        + bevel(lip, floor, '#b35a0b', '#ffe37c', true)
        + `<polygon points="${pts(floor)}" fill="url(#${id}floor)"/>`
        + raisedW(v, 0.92, id)
        + sheen(id, rim, 20, -10)
        + sparkle(49.5, 13.5, 4.2, 0.95)
        + '</svg>\n';
}

// ==================== the coupon ====================
// A crumpled sheet of blue paper, in the coin's style: flat facets lit from
// the upper left (each crease is a small triangle with its own tilt), a thin
// edge to the lower left, a tear-off line, and a raised emblem: a flame with
// angel wings and a halo.

/** The same numbers every run, so the paper crumples the same way each time. */
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Shade for a facet from its three corners in 3D (x, y, height): light from the upper left and in front. */
function facetShade([a, b, c], darkC, lightC) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (n[2] < 0) n = n.map(x => -x);
    const len = Math.hypot(...n) || 1;
    const L = [-0.45, -0.6, 0.66];
    const d = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / len;
    return mix(darkC, lightC, Math.max(0, Math.min(1, (d - 0.35) / 0.6)));
}

/** A feather: a long leaf from `b` toward angle `a` (degrees, y down). */
function feather([bx, by], a, len, wid) {
    const d = [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)], n = [-d[1], d[0]];
    const at = (t, s) => [bx + d[0] * len * t + n[0] * wid * s, by + d[1] * len * t + n[1] * wid * s];
    return [[bx, by], at(0.28, 0.5), at(0.72, 0.42), at(1, 0), at(0.78, -0.3), at(0.32, -0.42)];
}

const FLAME = [[0, -11], [2.2, -6.5], [5.5, -3.5], [6.8, 1], [6, 5.2], [3.5, 8.2], [0, 9.2], [-3.5, 8.2], [-6, 5.2], [-6.8, 1], [-5.3, -2.6], [-3.6, -1], [-3.2, -4.6], [-1.6, -7.6]];

function coupon() {
    const id = 'cpn';
    const v = view(32.6, 31.5, -0.17, 0.95);
    const rnd = seeded(20261123);
    // the sheet: a 6 x 4 grid of points, the edge ones pushed in and out a little, the inner ones a lot, each with a height
    const NX = 6, NY = 4, HW = 27, HH = 17.5;
    const grid = [];
    for (let j = 0; j <= NY; j++) {
        const row = [];
        for (let i = 0; i <= NX; i++) {
            const edge = i === 0 || j === 0 || i === NX || j === NY;
            const jx = (rnd() - 0.5) * (edge ? (i === 0 || i === NX ? 1.8 : 1.2) : 3.2);
            const jy = (rnd() - 0.5) * (edge ? (j === 0 || j === NY ? 1.8 : 1.2) : 3.2);
            row.push([-HW + (2 * HW * i) / NX + jx, -HH + (2 * HH * j) / NY + jy, (rnd() - 0.5) * (edge ? 3 : 7)]);
        }
        grid.push(row);
    }
    const P = (i, j) => grid[j][i];
    const facets = [];
    for (let j = 0; j < NY; j++) {
        for (let i = 0; i < NX; i++) {
            const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
            // the crease runs one way or the other, so the folds do not line up
            if ((i + j) % 2) facets.push([a, b, c], [a, c, d]); else facets.push([a, b, d], [b, c, d]);
        }
    }
    const outline = [
        ...Array.from({ length: NX + 1 }, (_, i) => P(i, 0)),
        ...Array.from({ length: NY - 1 }, (_, j) => P(NX, j + 1)),
        ...Array.from({ length: NX + 1 }, (_, i) => P(NX - i, NY)),
        ...Array.from({ length: NY - 1 }, (_, j) => P(0, NY - 1 - j))
    ].map(p => v([p[0], p[1]]));
    const paper = facets.map(t => {
        const fill = facetShade(t, '#2a55c8', '#a8d0ff');
        return `<polygon points="${pts(t.map(p => v([p[0], p[1]])))}" fill="${fill}" stroke="${fill}" stroke-width=".3" stroke-linejoin="round"/>`;
    }).join('');

    // the tear-off line: holes punched through, edge colour inside
    const holes = Array.from({ length: 7 }, (_, i) => v([16.5 + (rnd() - 0.5) * 0.6, -13.2 + i * 4.4]));

    // the emblem: centred left of the tear line
    const at = (x, y, k = 0.82) => v([x * k - 5, y * k + 1.5]);
    const flame = FLAME.map(([x, y]) => at(x, y));
    const core = FLAME.map(([x, y]) => at(x * 0.5, y * 0.5 + 3.6));
    const wingL = [[220, 12.5, 4.2], [198, 11, 3.8], [176, 8.5, 3.4]].map(([a, l, w]) => feather([-5.6, 1.8], a, l, w));
    const wingR = [[320, 12.5, 4.2], [342, 11, 3.8], [4, 8.5, 3.4]].map(([a, l, w]) => feather([5.6, 1.8], a, l, w));
    const wings = [...wingL, ...wingR].map(fp => {
        const p = fp.map(([x, y]) => at(x, y));
        return extrude(p, [-0.7, 0.7], '#5d7fc4', '#93b2ea', '#4a68ad')
            + `<polygon points="${pts(p)}" fill="url(#${id}feather)" stroke="#ffffff" stroke-width=".35" stroke-linejoin="round"/>`;
    }).join('');
    const [hx, hy] = at(0, -14.8);
    const halo = (dx, dy, color, w) => `<ellipse cx="${f(hx + dx)}" cy="${f(hy + dy)}" rx="5" ry="1.55" fill="none" stroke="${color}" stroke-width="${w}" transform="rotate(-9.7 ${f(hx)} ${f(hy)})"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs>
<linearGradient id="${id}fire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf3a"/><stop offset=".55" stop-color="#ff8a1f"/><stop offset="1" stop-color="#f05a14"/></linearGradient>
<linearGradient id="${id}core" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset="1" stop-color="#ffd54a"/></linearGradient>
<linearGradient id="${id}feather" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d4e5ff"/></linearGradient>
<linearGradient id="${id}sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>`
        + extrude(outline, [-1.3, 1.2], '#14307a', '#2d56b8', '#173887')
        + paper
        + holes.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="1" fill="#183a8f"/><circle cx="${f(x - 0.25)}" cy="${f(y + 0.25)}" r=".5" fill="#0f2763"/>`).join('')
        + wings
        // the flame: its own edge, the face, a light rim, the bright core
        + extrude(flame, [-1, 1.1], '#9c3206', '#d4570e', '#a63a08')
        + `<polygon points="${pts(flame)}" fill="url(#${id}fire)"/>`
        + `<clipPath id="${id}fc"><polygon points="${pts(flame)}"/></clipPath><polygon points="${pts(flame)}" fill="none" stroke="#ffe9a0" stroke-width=".8" stroke-linejoin="round" opacity=".8" clip-path="url(#${id}fc)"/>`
        + `<polygon points="${pts(core)}" fill="url(#${id}core)"/>`
        // the halo: a darker ring under it gives the raised look
        + halo(-0.6, 0.7, '#b07a06', 1.6) + halo(0, 0, '#ffd84a', 1.4) + halo(-0.3, -0.3, '#fff3b0', 0.45)
        + sheen(id, outline, 14, -12)
        + sparkle(54.5, 9.5, 3.4, 0.95)
        + '</svg>\n';
}

writeFileSync(join(out, 'woobux.svg'), coin());
writeFileSync(join(out, 'coupon.svg'), coupon());
console.log('written woobux.svg, coupon.svg');
