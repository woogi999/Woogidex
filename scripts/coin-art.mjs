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
/** A ticket: chamfered corners (like the coin's octagon) and a half-round notch in each side. */
function ticket(hw, hh, c, notch) {
    const arc = side => Array.from({ length: 7 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 6;
        return side > 0 ? [hw - notch * Math.cos(a), notch * Math.sin(a)] : [-hw + notch * Math.cos(a), -notch * Math.sin(a)];
    });
    return [[-hw + c, -hh], [hw - c, -hh], [hw, -hh + c], ...arc(1), [hw, hh - c], [hw - c, hh], [-hw + c, hh], [-hw, hh - c], ...arc(-1), [-hw, -hh + c]];
}
const chamferRect = (x0, y0, x1, y1, c) => [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];

function coupon() {
    const id = 'cpn';
    const v = view(32.8, 31, -0.2, 0.95);
    const shape = ticket(28, 17, 5, 4.6);
    const outer = shape.map(v);
    const rim = scale(shape, 0.915, 0.86).map(v);
    const lipL = chamferRect(-21.5, -10.5, 9.5, 10.5, 3.4);
    const floorL = chamferRect(-19.4, -8.5, 7.4, 8.5, 2.4);
    const stub = 15.2;
    const holes = Array.from({ length: 6 }, (_, i) => v([stub, -11.5 + i * 4.6]));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${defs(id)}`
        + extrude(outer, EDGE, '#a24d07', '#ef8a0f', '#b4580a')
        + bevel(outer, rim, '#f29010', '#fff2a2')
        + `<polygon points="${pts(rim)}" fill="url(#${id}rim)"/>`
        + bevel(lipL.map(v), floorL.map(v), '#b35a0b', '#ffe37c', true)
        + `<polygon points="${pts(floorL.map(v))}" fill="url(#${id}floor)"/>`
        // the tear-off line: small holes punched through, edge colour inside
        + holes.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="1.05" fill="#b35a0b"/><circle cx="${f(x - 0.25)}" cy="${f(y + 0.25)}" r=".55" fill="#8f4306"/>`).join('')
        + raisedW(p => v([p[0] * 0.95 - 6, p[1] * 0.95]), 0.7, id)
        // the stub: a raised sparkle
        + (() => { const [x, y] = v([21.6, 0]); return sparkle(x - 0.9, y + 0.8, 5.2, 1).replace('#ffffff', '#b35a0b') + sparkle(x, y, 5.2, 1).replace('#ffffff', '#fff1a6'); })()
        + sheen(id, rim, 16, -12)
        + sparkle(55.5, 10.5, 3.6, 0.95)
        + '</svg>\n';
}

writeFileSync(join(out, 'woobux.svg'), coin());
writeFileSync(join(out, 'coupon.svg'), coupon());
console.log('written woobux.svg, coupon.svg');
