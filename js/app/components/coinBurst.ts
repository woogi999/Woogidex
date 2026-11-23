// The Woobux "collect" moment, the way games do it: a thin ring of light
// and a few star glints at the button you pressed, coins that pop out one
// by one (each on its own timing), spin and glint, then fly to your balance.
// Each coin draws a trail behind it (one canvas for all trails): gold-white
// at the coin, almost white further back, tapering to a point. Where a coin
// lands, star glints pop and the balance bumps and counts up to the new total.
//
// Where the coins go: a balance that is already on screen (any element with
// data-wbx-balance, its number in [data-wbx-num], like the chip on Fun), so
// the coins land where you already look. Only when no balance shows does the
// small balance in the lower left corner (.wbx-bank) come up for the moment.
//
// One layer over the page, nothing to click (pointer-events: none), removed
// when it ends. Reduced motion and low-end devices skip the flight: the
// balance counts, and that is all. CSS: css/woobux.css (.wbx-fx).

import { gsap } from 'gsap';
import { reducedMotion } from '../../core/motion.ts';

const COIN = 'assets/woobux.svg';
let running: gsap.core.Timeline | null = null;
/** Removes the last run's layer and ticker, if it is still going when a new one starts. */
let cleanup: (() => void) | null = null;
const R = gsap.utils.random;

const fmt = (n: number) => Math.round(n).toLocaleString();
const centre = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

/** Where the coins land: the coin to bump and a way to show a number. */
interface Target { coin: HTMLElement; show: (n: number) => void; root: HTMLElement; own: boolean }

/** Your balance in the lower left corner: a coin and the number, no box. Made once, reused. */
function bankEl(): HTMLElement {
    let root = document.querySelector<HTMLElement>('.wbx-bank');
    if (!root) {
        root = document.createElement('div');
        root.className = 'wbx-bank';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.innerHTML = `<span class="wbx-bank-coin"><img src="${COIN}" width="34" height="34" alt=""></span><strong class="wbx-bank-num">0</strong><span class="wbx-sr">Woobux</span>`;
        document.body.appendChild(root);
    }
    return root;
}

/**
 * A balance already on screen: in the viewport and not covered by
 * something else (the header, a dialog). The first one in the page wins.
 */
function shownBalance(): Target | null {
    for (const el of document.querySelectorAll<HTMLElement>('[data-wbx-balance]')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
        const c = centre(el), hit = document.elementFromPoint(c.x, c.y);
        if (!hit || !el.contains(hit)) continue;
        const num = el.querySelector<HTMLElement>('[data-wbx-num]');
        // the number is React's own text node: change its value, never replace it
        const text = num?.firstChild?.nodeType === Node.TEXT_NODE ? num.firstChild : null;
        const coin = el.querySelector<HTMLElement>('.woobux-icon') || el;
        return { coin, root: el, own: false, show: n => { if (text) text.nodeValue = fmt(n); } };
    }
    return null;
}

function bank(): Target {
    const root = bankEl();
    const num = root.querySelector<HTMLElement>('.wbx-bank-num')!;
    return { root, own: true, coin: root.querySelector<HTMLElement>('.wbx-bank-coin')!, show: n => { num.textContent = fmt(n); } };
}

/** Small four-point stars that pop out from (x, y) and fade. */
function glints(layer: HTMLElement, x: number, y: number, n: number, reach: [number, number], size: [number, number]) {
    for (let k = 0; k < n; k++) {
        const el = document.createElement('span');
        el.className = 'wbx-star';
        layer.appendChild(el);
        const a = R(0, Math.PI * 2), d = R(reach[0], reach[1]), s = R(size[0], size[1]);
        gsap.set(el, { x, y, xPercent: -50, yPercent: -50, width: s, height: s, scale: 0, rotation: R(-20, 20) });
        gsap.timeline({ onComplete: () => el.remove() })
            .to(el, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, duration: R(0.35, 0.6), ease: 'power3.out' }, 0)
            .to(el, { scale: 1, duration: 0.14, ease: 'power2.out' }, R(0, 0.08))
            .to(el, { scale: 0, rotation: '+=45', duration: R(0.25, 0.4), ease: 'power2.in' }, '>-0.02');
    }
}

/**
 * A coin's trail: the places it passed, each with the time it was there.
 * `live` while the coin flies. The trail is not cut when the coin lands:
 * each point thins with its age, so the tail tapers and dies away.
 */
interface Trail { pts: Array<{ x: number; y: number; t: number }>; live: boolean; get: () => { x: number; y: number } }
const TRAIL_LIFE = 380;     // ms a point of the trail lasts
const TRAIL_STEP = 4;       // px between points, filled in when a coin moves fast
const TRAIL_SIZE = 20;      // px across the trail at the coin (a little under the coin, so the coin stays on top)

/**
 * Draws every trail as one continuous shape: the points joined by lines
 * along both sides, as wide as TRAIL_SIZE at the coin and narrowing to a
 * point at the tail, filled once. One fill means nothing overlaps, so no
 * part of the trail is drawn twice (separate dots showed as beads). The
 * colour runs along it: gold-white at the coin, almost white behind it,
 * and the opacity fades out over the taper. No outline.
 */
const LIGHT_STOPS: Array<[number, string]> = [[0, 'rgba(255, 253, 246, 0)'], [0.35, 'rgba(255, 252, 240, .45)'], [0.7, 'rgba(255, 242, 205, .9)'], [1, 'rgba(255, 224, 150, 1)']];
const DARK_STOPS: Array<[number, string]> = [[0, 'rgba(255, 214, 120, 0)'], [0.35, 'rgba(255, 220, 135, .45)'], [0.7, 'rgba(255, 226, 150, .9)'], [1, 'rgba(255, 222, 140, 1)']];

function drawTrails(ctx: CanvasRenderingContext2D, trails: Trail[]) {
    const now = performance.now();
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    // clear the whole canvas, whatever offset the drawing uses
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
    for (const tr of trails) {
        if (tr.live) {
            const p = tr.get(), last = tr.pts[tr.pts.length - 1];
            if (!last) tr.pts.push({ ...p, t: now });
            else {
                // fill the gap with evenly spaced points, their times spread over the frame
                const d = Math.hypot(p.x - last.x, p.y - last.y), n = Math.floor(d / TRAIL_STEP);
                for (let i = 1; i <= n; i++) {
                    const k = i / n;
                    tr.pts.push({ x: last.x + (p.x - last.x) * k, y: last.y + (p.y - last.y) * k, t: last.t + (now - last.t) * k });
                }
            }
        }
        let drop = 0;
        while (drop < tr.pts.length && now - tr.pts[drop].t > TRAIL_LIFE) drop++;
        if (drop) tr.pts.splice(0, drop);
        const pts = tr.pts, n = pts.length;
        if (n < 2) continue;

        // both sides of the shape: each point moved out along the normal by half its width
        const left: Array<[number, number]> = [], right: Array<[number, number]> = [];
        let nx = 0, ny = -1;
        for (let i = 0; i < n; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
            if (len > 0.01) { nx = -dy / len; ny = dx / len; }
            const k = Math.max(0, 1 - (now - pts[i].t) / TRAIL_LIFE);   // 1 fresh, 0 gone
            const h = (TRAIL_SIZE / 2) * Math.pow(k, 0.8);
            left.push([pts[i].x + nx * h, pts[i].y + ny * h]);
            right.push([pts[i].x - nx * h, pts[i].y - ny * h]);
        }
        const tail = pts[0], head = pts[n - 1];
        const headK = Math.max(0, 1 - (now - head.t) / TRAIL_LIFE);
        const headR = (TRAIL_SIZE / 2) * Math.pow(headK, 0.8);
        if (headR < 0.3) continue;

        ctx.beginPath();
        ctx.moveTo(left[0][0], left[0][1]);
        for (let i = 1; i < n; i++) ctx.lineTo(left[i][0], left[i][1]);
        // a round front at the coin, then back along the other side
        const ang = Math.atan2(ny, nx);
        ctx.arc(head.x, head.y, headR, ang, ang + Math.PI, true);
        for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
        ctx.closePath();

        // colour and opacity from the tail (transparent) to the coin (gold-white).
        // Light theme: the tail goes almost white. Dark theme: it stays warm gold,
        // since white on a dark page looked washed out.
        const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        const stops = dark ? DARK_STOPS : LIGHT_STOPS;
        for (const [at, c] of stops) g.addColorStop(at, c);
        ctx.fillStyle = g;
        // after the coin lands, the whole trail fades as it shrinks away
        ctx.globalAlpha = tr.live ? 1 : Math.min(1, headK / 0.5);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

/**
 * Plays the collect animation from `from` (the button) and counts the
 * balance from `before` to `after`.
 */
export function coinBurst(from: Element | null, before: number, after: number) {
    running?.progress(1).kill();
    cleanup?.();
    cleanup = null;
    const gained = Math.max(0, after - before);
    const target = shownBalance() || bank();
    const { root, coin, show, own } = target;
    // a balance on the page: the corner one stays away
    if (!own) { const b = document.querySelector<HTMLElement>('.wbx-bank'); if (b) gsap.set(b, { display: 'none' }); }
    // where the coins land, read once: the corner balance is put in its
    // final place first (still invisible), so its position is the real one
    if (own) gsap.set(root, { display: 'flex', x: 0, opacity: 0 });
    const T = centre(coin);
    const quiet = reducedMotion() || document.documentElement.classList.contains('low-end') || !from;

    const tl = gsap.timeline({ onComplete: () => { running = null; } });
    running = tl;
    // the page's number may already show the new total: start it at the old one
    // (on the timeline's first tick, after React put the new value in)
    tl.add(() => show(before), 0);
    if (own) {
        tl.set(root, { display: 'flex' }, 0)
            .fromTo(root, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: quiet ? 0.2 : 0.35, ease: 'power3.out' }, 0);
    }

    const finish = (at: number) => {
        tl.add(() => { show(after); root.classList.add(own ? 'is-full' : 'wbx-hit'); }, at);
        if (own) {
            tl.to(root, { opacity: 0, x: -16, duration: 0.35, ease: 'power2.in', delay: 1.5 }, at + 0.03)
                .add(() => { cleanup?.(); cleanup = null; root.classList.remove('is-full'); gsap.set(root, { display: 'none' }); });
        } else {
            // wait for the last trail to fade, then let the number rest
            tl.add(() => { cleanup?.(); cleanup = null; }, at + TRAIL_LIFE / 1000 + 0.05)
                .add(() => root.classList.remove('wbx-hit'), at + 1.2);
        }
    };

    if (quiet) {
        const counter = { v: before };
        tl.to(counter, { v: after, duration: 0.6, ease: 'power2.out', onUpdate: () => show(counter.v) }, 0.05);
        finish(0.7);
        return;
    }

    const layer = document.createElement('div');
    layer.className = 'wbx-fx';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    // where you pressed, and where the coins land: read once, so no frame
    // forces a layout to find them again
    const s = centre(from!);

    // The trails' canvas covers only the flight (the button, the target and
    // room for the burst and the curves), at 1x pixel density: the trails are
    // soft shapes, and a full-screen canvas at 1.5x made every frame redraw
    // and upload millions of pixels.
    const PAD = 220;
    const x0 = Math.max(0, Math.min(s.x, T.x) - PAD), y0 = Math.max(0, Math.min(s.y, T.y) - PAD);
    const x1 = Math.min(innerWidth, Math.max(s.x, T.x) + PAD), y1 = Math.min(innerHeight, Math.max(s.y, T.y) + PAD);
    const canvas = document.createElement('canvas');
    canvas.className = 'wbx-trails';
    canvas.width = Math.max(1, Math.round(x1 - x0));
    canvas.height = Math.max(1, Math.round(y1 - y0));
    Object.assign(canvas.style, { left: `${x0}px`, top: `${y0}px`, width: `${canvas.width}px`, height: `${canvas.height}px` });
    layer.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;
    ctx.translate(-x0, -y0);
    const trails: Trail[] = [];
    const tick = () => drawTrails(ctx, trails);
    gsap.ticker.add(tick);
    cleanup = () => { gsap.ticker.remove(tick); layer.remove(); };

    // where you pressed: one thin ring of light and a few star glints
    const ring = document.createElement('span');
    ring.className = 'wbx-ring';
    layer.appendChild(ring);
    gsap.set(ring, { x: s.x, y: s.y, xPercent: -50, yPercent: -50 });
    tl.fromTo(ring, { scale: 0.25, opacity: 1 }, { scale: 1.6, opacity: 0, duration: 0.5, ease: 'power2.out' }, 0)
        .add(() => glints(layer, s.x, s.y, 6, [30, 70], [8, 14]), 0.02);

    const count = Math.max(10, Math.min(18, 8 + Math.round(gained / 25)));
    const size = 30;
    let landed = 0;
    let lastLand = 0;
    for (let i = 0; i < count; i++) {
        const c = document.createElement('span');
        c.className = 'wbx-fly';
        c.innerHTML = `<img src="${COIN}" width="${size}" height="${size}" alt="">`;
        layer.appendChild(c);
        // each coin on its own clock: when it pops, how long it hangs, how fast it flies
        const pop = R(0, 0.32), popFor = R(0.32, 0.6), hang = R(0.08, 0.5), fly = R(0.48, 0.9);
        const angle = R(0, Math.PI * 2), dist = R(50, 140);
        const bx = s.x + Math.cos(angle) * dist, by = s.y + Math.sin(angle) * dist * 0.75 - R(10, 40);
        gsap.set(c, { x: s.x, y: s.y, xPercent: -50, yPercent: -50, scale: 0.2, rotation: R(-90, 90), opacity: 0 });
        tl.to(c, { x: bx, y: by, scale: R(0.8, 1.2), rotation: `+=${R(-160, 160)}`, opacity: 1, duration: popFor, ease: `back.out(${R(1.2, 2.2).toFixed(2)})` }, pop);
        tl.add(() => c.classList.add('is-glint'), pop + popFor * R(0.4, 0.9));
        const trail: Trail = { pts: [], live: false, get: () => ({ x: gsap.getProperty(c, 'x') as number, y: gsap.getProperty(c, 'y') as number }) };
        trails.push(trail);
        const leave = pop + popFor + hang;
        // The flight is on the same timeline as everything else, and the coin
        // only goes when its own flight ends: a slow frame can no longer take
        // a coin away before it arrives.
        const land = () => {
            trail.live = false;
            c.remove();
            glints(layer, T.x, T.y, 3, [14, 30], [6, 10]);
            gsap.fromTo(coin, { scale: 1.25 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', overwrite: true, clearProps: own ? '' : 'transform' });
            landed++;
            show(before + (gained * landed) / count);
        };
        // x and y on different curves, so each path bends its own way
        tl.to(c, { x: T.x, duration: fly, ease: 'power2.in', onStart: () => { trail.live = true; }, onComplete: land }, leave)
            .to(c, { y: T.y, duration: fly, ease: `back.in(${R(0.8, 1.8).toFixed(2)})` }, leave)
            .to(c, { scale: 0.8, rotation: `+=${R(160, 320)}`, duration: fly, ease: 'power1.in' }, leave);
        lastLand = Math.max(lastLand, leave + fly);
    }
    finish(lastLand + 0.02);
}
