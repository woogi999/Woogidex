// Paint on the landing page's white: the cursor picks up the color of
// whatever it passes over (a letter of the logo, Joltik, a spot on the
// painting, a button, a type badge) and lays it on the page as it moves. Each
// touch is a soft blot that keeps spreading for a moment, now and then
// bleeding a little run outward, then dries into the page and slowly fades.
// Colors mix where they overlap (multiplied, like pigment, on the light theme;
// laid over each other, like gouache on dark paper, on the dark one), and the
// brush, while it still has paint on it, smears ink that's already down into
// its own color as it goes, greyer and fainter the longer it's dragged; a spent
// brush just passes over. Switching theme paints the paper over from its
// history, as if it had all been done on the new theme. Every visit to the page
// starts on clean paper (LandingPage keys it on the visit).
//
// Canvases under the page's content: the blooms still spreading, the paint just
// laid (the sheet), and cut-outs of older paint fading away on the compositor.
// Kept light: blots are stamped from cached sprites, blooms live in a reused
// pool, the canvases are half resolution, drying costs no script, ink is felt
// from a color grid instead of read back off the canvas, and the pointer is
// read once a frame. A setting (LandingSmudge),
// off by default on low-end devices and touch screens, where a drag is a
// scroll; with reduced motion the blooms land at full size.

import { useEffect, useRef, type RefObject } from 'react';
import { artOpacityAt, sceneColorAt } from './LandingArt.tsx';

type RGB = [number, number, number];

// the logo's own colors (FloatingLogo.tsx, public/assets/favicon.png)
const LOGO_TOP: RGB = [243, 162, 241], LOGO_BOTTOM: RGB = [168, 124, 255], JOLTIK: RGB = [245, 210, 46];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const parseRgb = (css: string): [number, number, number, number] | null => {
    const m = css.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
};
const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';

// on the dark paper pigments are pushed a little richer. (They used to be lightened
// and added like light, which piled up into a milky white that dried to a crust.)
const DARK_RICH = 1.15;
// how far a brush drags paint before it's lost most of its color (e-folding, in px)
const WEAR_PX = 1400;
// lifting paint: the blot it's stamped with (any color, only its shape counts) and how hard
const LIFT: RGB = [0, 0, 0], LIFT_K = 0.8;
/** A bit more saturated, so washes of sampled color stay colorful instead of going grey. */
function saturate(c: RGB, amount: number): RGB {
    const avg = (c[0] + c[1] + c[2]) / 3;
    return [clamp(avg + (c[0] - avg) * amount, 0, 255), clamp(avg + (c[1] - avg) * amount, 0, 255), clamp(avg + (c[2] - avg) * amount, 0, 255)];
}

/** The color of the thing under the pointer, or null when it's bare page (or something with no color of its own). */
function colorUnder(x: number, y: number, page: RGB): RGB | null {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    // the logo: Joltik, or the letter's pink-to-violet at that height
    const logo = el.closest('.flogo');
    if (logo) {
        const rider = logo.querySelector('.flogo-rider')?.getBoundingClientRect();
        if (rider && x >= rider.left && x <= rider.right && y >= rider.top && y <= rider.bottom - rider.height * 0.25) return JOLTIK;
        const letter = el.closest('.flogo-letter')?.getBoundingClientRect();
        if (!letter) return null;
        return mix(LOGO_TOP, LOGO_BOTTOM, clamp((y - letter.top) / letter.height));
    }
    // the front page's buttons
    const cta = el.closest('.lp-cta');
    if (cta) {
        if (cta.classList.contains('lp-cta-alt')) return null;
        const r = cta.getBoundingClientRect();
        return mix(LOGO_TOP, LOGO_BOTTOM, clamp((y - r.top) / r.height));
    }
    // the painting: the color right there, but only where it really shows
    if (el.closest('.lp-art')) return artOpacityAt(x, y) > 0.55 ? sceneColorAt(x, y) : null;
    // anything else with a color of its own: a type badge, a primary button, a chip
    for (let node: Element | null = el; node && !node.classList.contains('lp'); node = node.parentElement) {
        const bg = parseRgb(getComputedStyle(node).backgroundColor);
        if (!bg || bg[3] < 0.6) continue;
        const [r, g, b] = bg;
        // the page's own white (and near-whites like cards) isn't a color to pick up
        const close = Math.abs(r - page[0]) + Math.abs(g - page[1]) + Math.abs(b - page[2]) < 60;
        if (close || Math.max(r, g, b) - Math.min(r, g, b) < 28) return null;
        return [r, g, b];
    }
    return null;
}

// ---- the brush's blots, painted once and stamped ----
// A blot is the same soft round shape every time, only its color and size
// change, so each color's blot is drawn once into a little sprite and stamped
// with drawImage from then on (colors rounded to 32 steps a channel, the last
// 96 kept).
const SPRITE = 64;
// On white a thin wash multiplied in still reads as its color; laid over the
// dark page the same thin wash mostly shows the dark through it and goes a
// muddy grey, so the dark theme's blots carry this much more paint.
const DARK_BODY = 1.9;
const sprites = new Map<number, HTMLCanvasElement>();
function spriteFor(c: RGB, dense = false): HTMLCanvasElement {
    const key = (dense ? 1 << 15 : 0) | ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    let s = sprites.get(key);
    if (s) { sprites.delete(key); sprites.set(key, s); return s; }
    s = document.createElement('canvas');
    s.width = s.height = SPRITE;
    const ctx = s.getContext('2d')!, r = SPRITE / 2, body = dense ? DARK_BODY : 1;
    const rgb = `${(((key >> 10) & 31) << 3) | 4},${(((key >> 5) & 31) << 3) | 4},${((key & 31) << 3) | 4}`;
    const g = ctx.createRadialGradient(r, r, r * 0.2, r, r, r);
    g.addColorStop(0, `rgba(${rgb},${0.34 * body})`);
    g.addColorStop(0.7, `rgba(${rgb},${0.24 * body})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SPRITE, SPRITE);
    sprites.set(key, s);
    if (sprites.size > 96) sprites.delete(sprites.keys().next().value!);
    return s;
}
/** How much paint a blot leaves at a fraction of its radius (the sprite's gradient). */
const blotAlpha = (f: number) => (f < 0.2 ? 0.34 : f < 0.7 ? 0.34 - (f - 0.2) * 0.2 : f < 1 ? (0.24 * (1 - f)) / 0.3 : 0);

/** A wet bloom: a blot that spreads out to its full size, then dries. Kept in a fixed pool and reused. */
interface Bloom { x: number; y: number; r0: number; r1: number; pig: RGB; k: number; color: RGB; sprite: HTMLCanvasElement | null; age: number; life: number; bled: number }
// a fast stroke lays a lot of blots; past this many wet ones the most nearly dry
// one dries early to make room, so the line never breaks
const MAX_BLOOMS = 600;


/** One thing that happened to the paper, kept so it can be painted over for the other theme. */
interface Mark { x: number; y: number; r: number; pig: RGB | null; k: number }

// the canvases are half the page's resolution: the blots are soft, so it
// doesn't show, and it's a quarter of the pixels to paint, dry and composite
const RES = 0.5;
// the drying. Paint goes down on the sheet (the page-sized dry canvas); every
// SHEET_MS what's on it is cut out onto a canvas of its own, only as big as the
// paint, and that piece fades away over DRY_MS as a CSS opacity animation, then
// goes. The compositor runs it, so it's smooth at any frame rate and costs no
// script at all. (Rubbing a little alpha off the canvas every tick was choppy,
// and 8-bit premultiplied color rounded faint paint up into a pale crust.)
const SHEET_MS = 800, DRY_MS = 12000;
/** How much of a piece is left t of the way through its drying: quick at first, then trailing off. */
const dryLeft = (t: number) => (t >= 1 ? 0 : (1 - t) * (1 - t));
const DRY_FRAMES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map(t => ({ offset: t, opacity: dryLeft(t) }));
// what's on the paper is also kept as a coarse grid, so the brush can feel for
// ink without reading pixels back off the canvas. Each cell keeps how much paint
// it has and the pigment in it (the mix of the colors laid there, as they read
// on white): what a brush picks up is that pigment, not the pile's darker look,
// or smearing through paint would multiply it on itself until it went black.
const CELL = 12;
type Box = [number, number, number, number];
/** A cut-out of dried paint, fading away. */
interface Piece { el: HTMLCanvasElement; ctx: CanvasRenderingContext2D; box: Box; marks: Mark[]; anim: Animation }

export function PaintSmudge({ root }: { root: RefObject<HTMLElement | null> }) {
    const dryRef = useRef<HTMLCanvasElement>(null);
    const wetRef = useRef<HTMLCanvasElement>(null);
    const piecesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const host = root.current, dry = dryRef.current, wet = wetRef.current, shelf = piecesRef.current;
        // whether it runs at all is a setting (LandingSmudge in app.ts; off by
        // default on low-end devices and touch screens); LandingPage decides
        if (!host || !dry || !wet || !shelf) return;
        const dctx = dry.getContext('2d')!;
        const wctx = wet.getContext('2d')!;
        const still = () => document.documentElement.classList.contains('reduce-motion') || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        let isDark = dark();
        let page: RGB | null = null;
        const blend = (): GlobalCompositeOperation => (isDark ? 'source-over' : 'multiply');
        // pigments are kept as they read on white; the dark theme makes them a little richer
        const toTheme = (c: RGB): RGB => (isDark ? saturate(c, DARK_RICH) : c);

        // ---- the ink grid ----
        let gw = 0, gh = 0;
        let gR = new Float32Array(0), gG = gR, gB = gR, gA = gR;
        let gT = new Float64Array(0);       // when each cell last changed
        // the grid dries with the pieces (give or take the half a sheet it waits to be cut)
        const cellAlpha = (i: number) => gA[i] * dryLeft(Math.max(0, performance.now() - gT[i] - SHEET_MS / 2) / DRY_MS);
        const growGrid = (w: number, h: number) => {
            const nw = Math.ceil(w / CELL), nh = Math.ceil(h / CELL);
            if (nw === gw && nh === gh) return;
            const n = nw * nh;
            const nR = new Float32Array(n), nG = new Float32Array(n), nB = new Float32Array(n), nA = new Float32Array(n), nT = new Float64Array(n);
            for (let y = 0; y < Math.min(gh, nh); y++) for (let x = 0; x < Math.min(gw, nw); x++) {
                const a = y * gw + x, b = y * nw + x;
                nR[b] = gR[a]; nG[b] = gG[a]; nB[b] = gB[a]; nA[b] = gA[a]; nT[b] = gT[a];
            }
            gR = nR; gG = nG; gB = nB; gA = nA; gT = nT; gw = nw; gh = nh;
        };
        /** Every grid cell a blot of radius r at (x, y) touches, with how much paint it leaves there. */
        const cells = (x: number, y: number, r: number, fn: (i: number, amount: number) => void) => {
            const x0 = Math.max(0, Math.floor((x - r) / CELL)), x1 = Math.min(gw - 1, Math.floor((x + r) / CELL));
            const y0 = Math.max(0, Math.floor((y - r) / CELL)), y1 = Math.min(gh - 1, Math.floor((y + r) / CELL));
            for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
                const amount = blotAlpha(Math.hypot((cx + 0.5) * CELL - x, (cy + 0.5) * CELL - y) / r);
                if (amount > 0) fn(cy * gw + cx, amount);
            }
        };
        /** A dried blot soaks into the grid: more paint, and its pigment mixed in by how much of it there is. */
        const soak = (x: number, y: number, r: number, pig: RGB, k: number) => {
            const now = performance.now();
            cells(x, y, r, (i, amount) => {
                const as = amount * k, ab = cellAlpha(i), share = as / (as + ab);
                gR[i] += (pig[0] - gR[i]) * share; gG[i] += (pig[1] - gG[i]) * share; gB[i] += (pig[2] - gB[i]) * share;
                gA[i] = as + ab * (1 - as); gT[i] = now;
            });
        };
        /** The paint already on the paper at a point: its pigment and how much. */
        const inkAt = (x: number, y: number): { c: RGB; a: number } | null => {
            const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
            if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return null;
            const i = cy * gw + cx, a = cellAlpha(i);
            return a < 40 / 255 ? null : { c: [gR[i], gG[i], gB[i]], a };
        };

        // the dry paint covers the whole landing page, so it stays where it fell. The wet
        // layer is repainted every frame anyway, so it only needs to cover the screen: it's
        // a viewport-sized canvas that follows the scroll, a fraction of the pixels to
        // redraw and hand to the compositor each frame. Both draw in page coordinates.
        let cssW = 0, cssH = 0, vh = 0;
        let hostTop = 0, scrolled = window.scrollY, wetTop = -1;
        const measure = () => { hostTop = host.getBoundingClientRect().top + window.scrollY; scrolled = window.scrollY; };
        const fit = () => {
            const w = host.clientWidth, h = host.scrollHeight;
            if (vh !== window.innerHeight) {
                vh = window.innerHeight;
                wet.width = Math.ceil(w * RES); wet.height = Math.ceil(vh * RES);
                wet.style.width = `${w}px`; wet.style.height = `${vh}px`;
                wetTop = -1; wetDirty = true;
            }
            measure();
            if (w === cssW && h === cssH) return;
            let old: HTMLCanvasElement | null = null;
            if (dry.width && dry.height) {
                old = document.createElement('canvas');
                old.width = dry.width; old.height = dry.height;
                old.getContext('2d')!.drawImage(dry, 0, 0);
            }
            if (w !== cssW) { wet.width = Math.ceil(w * RES); wet.style.width = `${w}px`; wetTop = -1; wetDirty = true; }
            cssW = w; cssH = h;
            dry.width = Math.ceil(w * RES);
            dry.height = Math.ceil(h * RES);
            dry.style.width = `${w}px`; dry.style.height = `${h}px`;
            if (old) dctx.drawImage(old, 0, 0);
            // drawn in page pixels from here on
            dctx.setTransform(RES, 0, 0, RES, 0, 0);
            growGrid(w, h);
        };

        // the part of the sheet with paint on it, and when the first of it went down
        let dryBox: Box | null = null, sheetAt = 0;
        let wetDirty = false;               // the wet layer has something on it to clear
        const grow = (box: Box | null, x: number, y: number, r: number): Box =>
            box ? [Math.min(box[0], x - r), Math.min(box[1], y - r), Math.max(box[2], x + r), Math.max(box[3], y + r)] : [x - r, y - r, x + r, y + r];
        const touches = (b: Box, x: number, y: number, r: number) => x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3];
        const stamp = (ctx: CanvasRenderingContext2D, s: HTMLCanvasElement, x: number, y: number, r: number) => ctx.drawImage(s, x - r, y - r, r * 2, r * 2);

        // ---- what's happened to the sheet and to each piece, oldest first ----
        let marks: Mark[] = [];
        let pieces: Piece[] = [];
        const draw = (ctx: CanvasRenderingContext2D, m: Mark) => {
            ctx.globalCompositeOperation = m.pig ? blend() : 'destination-out';
            ctx.globalAlpha = m.pig ? m.k : LIFT_K;
            stamp(ctx, m.pig ? spriteFor(toTheme(m.pig), isDark) : spriteFor(LIFT), m.x, m.y, m.r);
        };
        // paint going down on the sheet, mixing with what's there
        const lay = (x: number, y: number, r: number, pig: RGB, k: number) => {
            const m = { x, y, r, pig, k };
            draw(dctx, m);
            marks.push(m);
            if (!dryBox) sheetAt = performance.now();
            dryBox = grow(dryBox, x, y, r);
            soak(x, y, r, pig, k);
        };
        // paint coming back up off the paper (the sheet and any piece under the brush), onto the brush
        const lift = (x: number, y: number, r: number) => {
            const m = { x, y, r, pig: null, k: 1 };
            if (dryBox && touches(dryBox, x, y, r)) { draw(dctx, m); marks.push(m); }
            for (const p of pieces) if (touches(p.box, x, y, r)) { draw(p.ctx, m); p.marks.push(m); }
            const now = performance.now();
            cells(x, y, r, (i, amount) => { gA[i] = cellAlpha(i) * (1 - amount * LIFT_K); gT[i] = now; });
        };
        /** Cuts what's on the sheet out onto a piece of its own, which then dries away. */
        const cut = () => {
            if (!dryBox) return;
            // on whole canvas pixels, so the piece lines up exactly with where the paint was
            const px = 1 / RES;
            const x0 = Math.max(0, Math.floor((dryBox[0] - 2) / px) * px), y0 = Math.max(0, Math.floor((dryBox[1] - 2) / px) * px);
            const x1 = Math.min(cssW, Math.ceil((dryBox[2] + 2) / px) * px), y1 = Math.min(cssH, Math.ceil((dryBox[3] + 2) / px) * px);
            const list = marks;
            dryBox = null; marks = [];
            if (x1 <= x0 || y1 <= y0) return;
            const el = document.createElement('canvas');
            el.className = 'lp-paint';
            el.width = Math.ceil((x1 - x0) * RES); el.height = Math.ceil((y1 - y0) * RES);
            el.style.left = `${x0}px`; el.style.top = `${y0}px`;
            el.style.width = `${el.width / RES}px`; el.style.height = `${el.height / RES}px`;
            const ctx = el.getContext('2d')!;
            ctx.drawImage(dry, x0 * RES, y0 * RES, el.width, el.height, 0, 0, el.width, el.height);
            ctx.setTransform(RES, 0, 0, RES, -x0 * RES, -y0 * RES);
            dctx.clearRect(x0, y0, x1 - x0, y1 - y0);
            shelf.appendChild(el);
            const piece: Piece = { el, ctx, box: [x0, y0, x1, y1], marks: list, anim: el.animate(DRY_FRAMES, { duration: DRY_MS, fill: 'forwards' }) };
            piece.anim.onfinish = () => { el.remove(); pieces = pieces.filter(p => p !== piece); };
            pieces.push(piece);
        };
        /** Paints the sheet and every piece over from their history, on the current theme. */
        const repaint = () => {
            dctx.clearRect(0, 0, cssW, cssH);
            for (const m of marks) draw(dctx, m);
            for (const p of pieces) {
                p.ctx.clearRect(p.box[0], p.box[1], p.box[2] - p.box[0], p.box[3] - p.box[1]);
                for (const m of p.marks) draw(p.ctx, m);
            }
        };

        // ---- the blooms, in a pool: blooms[0..live) are wet, the rest wait to be reused ----
        const blooms: Bloom[] = Array.from({ length: MAX_BLOOMS }, () => ({ x: 0, y: 0, r0: 0, r1: 0, pig: [0, 0, 0] as RGB, k: 1, color: [0, 0, 0] as RGB, sprite: null, age: 0, life: 1, bled: 0 }));
        let live = 0;
        // dried blooms go down onto the paper
        const dryOut = (b: Bloom) => lay(b.x, b.y, b.r1, b.pig, b.k);
        const spawn = (x: number, y: number, r0: number, r1: number, pig: RGB, k: number, life: number, bled: number) => {
            let b: Bloom;
            if (live < MAX_BLOOMS) b = blooms[live++];
            else {
                // full: the one closest to dry finishes now, and its slot takes the new one
                let ripest = 0;
                for (let i = 1; i < live; i++) if (blooms[i].age / blooms[i].life > blooms[ripest].age / blooms[ripest].life) ripest = i;
                b = blooms[ripest];
                dryOut(b);
            }
            b.x = x; b.y = y; b.r0 = r0; b.r1 = r1; b.age = 0; b.life = life; b.bled = bled;
            b.pig = pig; b.k = k; b.color = toTheme(pig); b.sprite = spriteFor(b.color, isDark);
        };
        const addBloom = (x: number, y: number, size: number, pig: RGB, k: number) => {
            spawn(x, y, size * 0.4, size * (0.9 + Math.random() * 0.6), pig, k, 15 + Math.random() * 15, 0);
            // a few flecks thrown off to the side, like a real spill
            if (Math.random() < 0.3) {
                const a = Math.random() * Math.PI * 2, d = size * (1 + Math.random() * 1.4);
                spawn(x + Math.cos(a) * d, y + Math.sin(a) * d, size * 0.08, size * 0.22, pig, k, 10, 2);
            }
        };

        fit();
        const sizeWatch = new ResizeObserver(fit);
        sizeWatch.observe(host);
        window.addEventListener('resize', fit);
        const onScroll = () => { scrolled = window.scrollY; if (live) kick(); };
        window.addEventListener('scroll', onScroll, { passive: true });

        // ---- the brush ----
        let color: RGB | null = null;       // the pigment on it, as it reads on white
        let load = 0;                       // how much paint is on the brush, 0..1
        let dragged = 0;                    // how far it's smeared since it last dipped, px
        let last: { x: number; y: number; t: number } | null = null;
        // what the pointer was over, read once a frame in the move event (while the layout is
        // still clean, so asking where things are costs nothing) and painted in the frame
        let pending: { x: number; y: number; under: RGB | null; bare: boolean } | null = null;

        // one stroke a frame, however many moves a fast mouse reported
        const stroke = (p: NonNullable<typeof pending>, now: number) => {
            const { x, y, under } = p;
            if (under) {
                // dipping the brush: the newest color, full of paint
                color = saturate(under, 1.15); load = 1; dragged = 0;
                last = { x, y, t: now };
                return;
            }
            const from = last || { x, y, t: now };
            last = { x, y, t: now };
            if (!p.bare || !color || load <= 0.02) return;
            const dist = Math.hypot(x - from.x, y - from.y);
            // the longer the brush drags, the more its color wears out: greyer and fainter.
            // What it lays down is that worn color, so smearing it again wears it further.
            dragged += dist;
            const fresh = Math.exp(-dragged / WEAR_PX);
            // a brush with paint on it running through paint already down smears it: lifts some
            // off the paper and mixes it into its own color. It doesn't put paint back on the
            // brush, though, so a spent brush only passes over old paint, and an old smear
            // can't be picked up and dragged on and on
            const ink = inkAt(x, y);
            if (ink) {
                const got = Math.min(0.12, ink.a * 0.3) * clamp(dist / 12, 0.25, 1);
                color = mix(color, ink.c, got / (load + got));
                lift(x, y, 10 + 10 * load);
            }
            color = saturate(color, 1 - 0.5 * (1 - Math.exp(-dist / WEAR_PX)));
            const k = 0.25 + 0.75 * fresh;
            // slow strokes pool fat, quick ones streak thin
            const speed = dist / Math.max(8, now - from.t);
            const width = (8 + 22 * load) * clamp(1.35 - speed * 0.35, 0.45, 1.35);
            const steps = Math.max(1, Math.ceil(dist / (width * 0.35)));
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                addBloom(from.x + (x - from.x) * t + (Math.random() - 0.5) * width * 0.3,
                    from.y + (y - from.y) * t + (Math.random() - 0.5) * width * 0.3, width, color, k);
                load = Math.max(0, load - 0.012 * (width * 0.35) / 10);
            }
            // where the brush runs dry, the last of the paint pools
            if (load <= 0.02) addBloom(x, y, 24, color, k);
        };

        let frameId = 0, timer = 0;
        const frame = (now: number) => {
            frameId = 0;
            if (pending) { stroke(pending, now); pending = null; }
            const reduced = still();
            if (wetDirty) {
                wctx.setTransform(1, 0, 0, 1, 0, 0);
                wctx.clearRect(0, 0, wet.width, wet.height);
                wetDirty = false;
            }
            // the wet layer over whatever part of the page is on screen
            const top = Math.round(clamp(scrolled - hostTop, 0, Math.max(0, cssH - vh)));
            if (top !== wetTop) { wetTop = top; wet.style.transform = `translateY(${top}px)`; }
            wctx.setTransform(RES, 0, 0, RES, 0, -top * RES);
            wctx.globalCompositeOperation = blend();
            for (let i = live - 1; i >= 0; i--) {
                const b = blooms[i];
                if (reduced) b.age = b.life;
                const t = b.age / b.life;
                const r = b.r0 + (b.r1 - b.r0) * (1 - Math.pow(1 - t, 3));
                // while it's wet, now and then a run of color bleeds out of the edge
                if (!reduced && b.bled < 2 && live < MAX_BLOOMS && Math.random() < 0.025) {
                    b.bled++;
                    const a = Math.random() * Math.PI * 2;
                    addBloom(b.x + Math.cos(a) * r * 0.9, b.y + Math.sin(a) * r * 0.9, b.r1 * (0.35 + Math.random() * 0.3), b.pig, b.k);
                }
                if (b.age >= b.life) {
                    dryOut(b);
                    // back to the pool: the last wet one takes its place
                    blooms[i] = blooms[--live];
                    blooms[live] = b;
                    continue;
                }
                wctx.globalAlpha = 0.9 * b.k;
                stamp(wctx, b.sprite!, b.x, b.y, r);
                wetDirty = true;
                b.age++;
            }
            // the sheet's paint has sat long enough: off it goes to dry
            if (dryBox && performance.now() - sheetAt >= SHEET_MS) cut();
            // every frame while paint is moving; after that only a wake-up for the next cut
            if (live || pending || wetDirty) frameId = requestAnimationFrame(frame);
            else if (dryBox) timer = window.setTimeout(() => { timer = 0; kick(); }, Math.max(0, SHEET_MS - (performance.now() - sheetAt)));
        };
        const kick = () => {
            if (timer) { clearTimeout(timer); timer = 0; }
            if (!frameId) frameId = requestAnimationFrame(frame);
        };

        const onMove = (e: PointerEvent) => {
            if (e.pointerType === 'touch' || document.body.dataset.page !== 'landing-view') return;
            if (pending) return;
            const box = host.getBoundingClientRect();
            hostTop = box.top + window.scrollY; scrolled = window.scrollY;
            if (!page) {
                const bg = parseRgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
                page = [bg[0], bg[1], bg[2]];
            }
            pending = {
                x: e.clientX - box.left, y: e.clientY - box.top,
                under: colorUnder(e.clientX, e.clientY, page),
                // panels, the footer and controls sit over the paper; paint only goes on bare page
                bare: !(e.target as Element)?.closest?.('.panel, .lp-foot, button, a, input'),
            };
            kick();
        };
        host.addEventListener('pointermove', onMove, { passive: true });
        // a theme switch: the paper is painted over as if it had all been done on the new
        // theme, and the blooms still wet take the new theme's tone
        const themeWatch = new MutationObserver(() => {
            if (dark() === isDark) return;
            isDark = dark();
            page = null;
            repaint();
            for (let i = 0; i < live; i++) { const b = blooms[i]; b.color = toTheme(b.pig); b.sprite = spriteFor(b.color, isDark); }
            kick();
        });
        themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => {
            host.removeEventListener('pointermove', onMove);
            sizeWatch.disconnect();
            window.removeEventListener('resize', fit);
            window.removeEventListener('scroll', onScroll);
            themeWatch.disconnect();
            cancelAnimationFrame(frameId);
            clearTimeout(timer);
            for (const p of pieces) { p.anim.cancel(); p.el.remove(); }
            pieces = [];
        };
    }, [root]);

    return (
        <>
            {/* the drying pieces; no z-index of its own, so they blend with the page like the sheet does */}
            <div ref={piecesRef} className="lp-paint-pieces" aria-hidden="true" />
            <canvas ref={dryRef} className="lp-paint" aria-hidden="true" />
            <canvas ref={wetRef} className="lp-paint lp-paint-wet" aria-hidden="true" />
        </>
    );
}
