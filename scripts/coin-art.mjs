// Writes the Woobux coin, the save pass and the shop cart as vector SVG, after the owner's coin
// reference (a tilted gold octagon): a thick edge to the lower left, a
// bevelled rim, a recessed face and a raised "W" with its own edge. The
// save pass is a blue and white ticket built the same way, and the shop
// cart is a normal steel shopping cart in the same art style.
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

/** A raised solid: its own edge, a face, and a light rim inside the face. `c` = [edge dark, edge light, edge base, face gradient id, rim colour]. */
function raised(p, by, c, clipId) {
    return extrude(p, by, c[0], c[1], c[2])
        + `<polygon points="${pts(p)}" fill="url(#${c[3]})"/>`
        + `<clipPath id="${clipId}"><polygon points="${pts(p)}"/></clipPath>`
        + `<polygon points="${pts(p)}" fill="none" stroke="${c[4]}" stroke-width=".75" stroke-linejoin="round" opacity=".85" clip-path="url(#${clipId})"/>`;
}

const defs = id => `<defs>
<linearGradient id="${id}rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe14a"/><stop offset="1" stop-color="#f7bb12"/></linearGradient>
<radialGradient id="${id}floor" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fbbf16"/><stop offset="1" stop-color="#f2a00b"/></radialGradient>
<linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe03c"/><stop offset="1" stop-color="#fbc51a"/></linearGradient>
</defs>`;

// ==================== the coin ====================
// No shine or sparkle drawn on it: the site adds light where it moves.
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
        + '</svg>\n';
}

// ==================== the save pass ====================
// A ticket in blue and white only, built like the coin: a thick edge to the
// lower left, a bevelled rim, a recessed white panel with a raised flame
// (the streak it keeps), and a white stub past a punched tear-off line.

/** A ticket: chamfered corners (like the coin's octagon) and a half-round notch in each side. */
function ticket(hw, hh, c, notch) {
    const arc = side => Array.from({ length: 7 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 6;
        return side > 0 ? [hw - notch * Math.cos(a), notch * Math.sin(a)] : [-hw + notch * Math.cos(a), -notch * Math.sin(a)];
    });
    return [[-hw + c, -hh], [hw - c, -hh], [hw, -hh + c], ...arc(1), [hw, hh - c], [hw - c, hh], [-hw + c, hh], [-hw, hh - c], ...arc(-1), [-hw, -hh + c]];
}
const chamferRect = (x0, y0, x1, y1, c) => [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
const FLAME = [[0, -11], [2.2, -6.5], [5.5, -3.5], [6.8, 1], [6, 5.2], [3.5, 8.2], [0, 9.2], [-3.5, 8.2], [-6, 5.2], [-6.8, 1], [-5.3, -2.6], [-3.6, -1], [-3.2, -4.6], [-1.6, -7.6]];

function savePass() {
    const id = 'svp';
    const v = view(32.8, 31, -0.2, 0.95);
    const shape = ticket(28, 17, 5, 4.6);
    const outer = shape.map(v);
    const rim = scale(shape, 0.915, 0.86).map(v);
    const lip = chamferRect(-21.5, -10.5, 9.5, 10.5, 3.4).map(v);
    const floor = chamferRect(-19.4, -8.5, 7.4, 8.5, 2.4).map(v);
    const stubOuter = chamferRect(14.4, -10.5, 22.4, 10.5, 2.4).map(v);
    const holes = Array.from({ length: 6 }, (_, i) => v([11.9, -11.5 + i * 4.6]));
    const flame = FLAME.map(([x, y]) => v([x * 0.78 - 6, y * 0.78 + 0.6]));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs>
<linearGradient id="${id}rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8dff"/><stop offset="1" stop-color="#2b62e0"/></linearGradient>
<linearGradient id="${id}floor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dce8ff"/></linearGradient>
<linearGradient id="${id}glyph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b97ff"/><stop offset="1" stop-color="#2c63e2"/></linearGradient>
</defs>`
        + extrude(outer, EDGE, '#16357f', '#3a6fe0', '#1c3f96')
        + bevel(outer, rim, '#2c5fd6', '#cfe1ff')
        + `<polygon points="${pts(rim)}" fill="url(#${id}rim)"/>`
        + bevel(lip, floor, '#2a59c8', '#ffffff', true)
        + `<polygon points="${pts(floor)}" fill="url(#${id}floor)"/>`
        + `<polygon points="${pts(stubOuter)}" fill="#ffffff" opacity=".92"/>`
        + holes.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="1.05" fill="#ffffff"/><circle cx="${f(x - 0.25)}" cy="${f(y + 0.25)}" r=".55" fill="#c7dbff"/>`).join('')
        + raised(flame, [-1, 1.1], ['#163a91', '#2f61d4', '#1a4099', `${id}glyph`, '#bcd6ff'], `${id}fc`)
        + '</svg>\n';
}

// ==================== the cart (the shop) ====================
// A normal supermarket cart, drawn in the coin's art style (a thick edge to
// the lower left, bevels, light from the upper left) but in a cart's own
// colours: a grey steel frame, an open wire basket you can see through, a
// red plastic grip and black rubber wheels with grey hubs.

/** A convex polygon moved inward by d on every side (its corners stay matched). */
function inset(p, d) {
    const e = edges(p);
    const line = ({ a, b, n }) => ({ a: add(a, [-n[0] * d, -n[1] * d]), b: add(b, [-n[0] * d, -n[1] * d]) });
    const hit = (l1, l2) => {
        const [x1, y1] = l1.a, [x2, y2] = l1.b, [x3, y3] = l2.a, [x4, y4] = l2.b;
        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4) || 1e-9;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
        return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    return e.map((_, i) => hit(line(e[(i + e.length - 1) % e.length]), line(e[i])));
}

/** Each corner of a polygon cut off c along both of its sides (twice the points). */
function cut(p, c) {
    return p.flatMap((q, i) => {
        const a = p[(i + p.length - 1) % p.length], b = p[(i + 1) % p.length];
        const toward = (r) => { const dx = r[0] - q[0], dy = r[1] - q[1], l = Math.hypot(dx, dy) || 1; return [q[0] + dx / l * c, q[1] + dy / l * c]; };
        return [toward(a), toward(b)];
    });
}

/** A bar of width w along a path, as one outline (mitred corners). */
function barAlong(path, w) {
    const h = w / 2;
    const side = s => path.map((p, i) => {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        const n1 = i > 0 ? norm(path[i - 1], p) : norm(p, b), n2 = i < path.length - 1 ? norm(p, path[i + 1]) : norm(a, p);
        const m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m) || 1, k = 1 / Math.max(0.35, (m[0] * n1[0] + m[1] * n1[1]) / ml);
        return [p[0] + s * h * k * m[0] / ml, p[1] + s * h * k * m[1] / ml];
    });
    return [...side(1), ...side(-1).reverse()];
}
const norm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };

// the cart's materials: [edge dark, edge light, edge base, face gradient, rim light]
const STEEL = ['#4d5663', '#9aa5b4', '#5f6977', 'crtsteel', '#ffffff'];
const GRIP = ['#8f1d17', '#e0574c', '#a8261e', 'crtgrip', '#ffc2bb'];

/** A wheel: a black rubber octagon with its edge and bevel, and a grey hub. */
function wheel(v, cx, cy, r) {
    const at = p => v(add(p, [cx, cy]));
    const outer = octagon(r).map(at), tread = octagon(r - 1).map(at);
    const hub = octagon(r * 0.45).map(at), cap = octagon(r * 0.45 - 0.6).map(at);
    return extrude(outer, [EDGE[0] * 0.5, EDGE[1] * 0.5], '#111317', '#3a3f48', '#1a1d22')
        + bevel(outer, tread, '#16191e', '#6b717c')
        + `<polygon points="${pts(tread)}" fill="url(#crttire)"/>`
        + bevel(hub, cap, '#5f6977', '#ffffff')
        + `<polygon points="${pts(cap)}" fill="url(#crtsteel)"/>`;
}

/** A thin steel wire along a path: a dark line for its edge, then the wire. */
function wire(v, path, w = 1.15) {
    const p = barAlong(path, w).map(v);
    const by = [EDGE[0] * 0.3, EDGE[1] * 0.3];
    return `<polygon points="${pts(p.map(q => add(q, by)))}" fill="#5f6977"/>`
        + `<polygon points="${pts(p)}" fill="url(#crtsteel)"/>`;
}

function cart() {
    const id = 'crt';
    const v = view(33, 29.5, -0.1, 0.97);
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    // the basket: wider at the top, its corners cut a little
    const trap = [[-17, -13], [23, -13], [16.2, 7], [-9.6, 7]];
    const [tl, tr, br, bl] = trap;
    // the wires inside the basket: up and down, and two across
    const wires = [
        ...[0.2, 0.4, 0.6, 0.8].map(t => [lerp(tl, tr, t), lerp(bl, br, t)]),
        ...[0.36, 0.68].map(t => [lerp(tl, bl, t), lerp(tr, br, t)])
    ];
    // the basket's rim: a steel ring (the outline minus its inside), with its edge
    const outer = cut(trap, 2).map(v), inner = cut(inset(trap, 2.2), 1.2).map(v);
    const ring = (p, q) => `M${pts(p).replace(/ /g, ' L')}Z M${pts(q).replace(/ /g, ' L')}Z`;
    const by = [EDGE[0] * 0.6, EDGE[1] * 0.6];
    // the frame runs along the basket's back edge (the same slope, from the
    // grip down to the base) and then along the base; the grip sits on its top
    const back = (y) => [tl[0] + (bl[0] - tl[0]) * (y - tl[1]) / (bl[1] - tl[1]), y];
    const frame = barAlong([back(-19.5), back(10.5), [18, 10.5]], 2.8).map(v);
    const grip = barAlong([[back(-19.5)[0] - 7, -19.5], [back(-19.5)[0] + 1.2, -19.5]], 4).map(v);
    // the wheels hang from the base on short struts
    const wheelX = [-3.6, 13.5];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs>
<linearGradient id="${id}steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f8fb"/><stop offset="1" stop-color="#b7c0cc"/></linearGradient>
<linearGradient id="${id}grip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6f61"/><stop offset="1" stop-color="#d6342a"/></linearGradient>
<linearGradient id="${id}tire" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b515b"/><stop offset="1" stop-color="#23272e"/></linearGradient>
</defs>`
        + wheelX.map(x => wire(v, [[x, 10.5], [x, 17.6]], 1.6)).join('')
        + raised(frame, [EDGE[0] * 0.5, EDGE[1] * 0.5], STEEL, `${id}fc`)
        + wires.map(w => wire(v, w)).join('')
        + `<path d="${ring(outer.map(q => add(q, by)), inner.map(q => add(q, by)))}" fill="#5f6977" fill-rule="evenodd"/>`
        + `<path d="${ring(outer, inner)}" fill="url(#${id}steel)" fill-rule="evenodd"/>`
        + `<polygon points="${pts(outer)}" fill="none" stroke="#ffffff" stroke-width=".6" stroke-linejoin="round" opacity=".7"/>`
        + raised(grip, [EDGE[0] * 0.55, EDGE[1] * 0.55], GRIP, `${id}gc`)
        + wheelX.map(x => wheel(v, x, 17.6, 4.2)).join('')
        + '</svg>\n';
}

writeFileSync(join(out, 'woobux.svg'), coin());
writeFileSync(join(out, 'save-pass.svg'), savePass());
writeFileSync(join(out, 'shop-cart.svg'), cart());
console.log('written woobux.svg, save-pass.svg, shop-cart.svg');
