// The Woobux "collect" moment, the way games do it: a thin ring of light
// and a few star glints at the button you pressed, coins that pop out one
// by one (each on its own timing), spin and glint, then fly to your balance
// in the lower left corner. Each coin draws a white-gold trail that tapers
// to a point behind it (one canvas for all trails). Where a coin lands, star
// glints pop and the balance bumps and counts up to the new total.
//
// One layer over the page, nothing to click (pointer-events: none), removed
// when it ends. Reduced motion and low-end devices skip the flight: the
// balance shows and counts, and that is all. CSS: css/woobux.css (.wbx-fx).

import { gsap } from 'gsap';
import { reducedMotion } from '../../core/motion.ts';

const COIN = 'assets/woobux.svg';
let running: gsap.core.Timeline | null = null;
/** Removes the last run's layer and ticker, if it is still going when a new one starts. */
let cleanup: (() => void) | null = null;
const R = gsap.utils.random;

/** Your balance in the lower left corner: a coin and the number, no box. Made once, reused. */
function bank(): { root: HTMLElement; coin: HTMLElement; num: HTMLElement } {
    let root = document.querySelector<HTMLElement>('.wbx-bank');
    if (!root) {
        root = document.createElement('div');
        root.className = 'wbx-bank';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.innerHTML = `<span class="wbx-bank-coin"><img src="${COIN}" width="34" height="34" alt=""></span><strong class="wbx-bank-num">0</strong><span class="wbx-sr">Woobux</span>`;
        document.body.appendChild(root);
    }
    return { root, coin: root.querySelector<HTMLElement>('.wbx-bank-coin')!, num: root.querySelector<HTMLElement>('.wbx-bank-num')! };
}

const fmt = (n: number) => Math.round(n).toLocaleString();
const centre = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

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
 * each point fades and shrinks with its age, so the tail tapers and dies away.
 */
interface Trail { pts: Array<{ x: number; y: number; t: number }>; live: boolean; get: () => { x: number; y: number } }
const TRAIL_LIFE = 380;     // ms a point of light lasts
const TRAIL_STEP = 3;       // px between points, filled in when a coin moves fast
const TRAIL_SIZE = 24;      // px across the trail at the coin

/**
 * The light every point draws: a solid white-gold disc with a defined edge,
 * then a thin soft halo past the edge. Drawn once.
 */
let glowSprite: HTMLCanvasElement | null = null;
function glow(): HTMLCanvasElement {
    if (glowSprite) return glowSprite;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    // a wind trail: almost white, a hint of warmth only at the very edge
    r.addColorStop(0, 'rgba(255, 255, 255, 1)');
    r.addColorStop(0.5, 'rgba(255, 255, 252, 1)');
    // the edge: the disc ends in a short step, not a long fade
    r.addColorStop(0.58, 'rgba(255, 246, 220, 1)');
    r.addColorStop(0.64, 'rgba(255, 236, 190, .25)');
    r.addColorStop(1, 'rgba(255, 236, 190, 0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return (glowSprite = c);
}

/**
 * Draws every trail: discs of light laid along the path, the newest on top.
 * Plain blending, not additive: overlapping discs would add up to a white
 * blob and lose the edge.
 */
function drawTrails(ctx: CanvasRenderingContext2D, trails: Trail[]) {
    const now = performance.now();
    const sprite = glow();
    // nearly solid, like a game's wind trail; the age fade does the rest
    const strength = 0.95;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
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
        while (tr.pts.length && now - tr.pts[0].t > TRAIL_LIFE) tr.pts.shift();
        for (const p of tr.pts) {
            const k = 1 - (now - p.t) / TRAIL_LIFE;              // 1 fresh, 0 gone
            const size = TRAIL_SIZE * (0.15 + 0.85 * Math.pow(k, 0.9));
            ctx.globalAlpha = Math.min(1, Math.pow(k, 0.8) * strength);
            ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
        }
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
    const { root, coin, num } = bank();
    const gained = Math.max(0, after - before);
    num.textContent = fmt(before);
    const quiet = reducedMotion() || document.documentElement.classList.contains('low-end') || !from;

    const tl = gsap.timeline({ onComplete: () => { running = null; } });
    running = tl;
    tl.set(root, { display: 'flex' })
        .fromTo(root, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: quiet ? 0.2 : 0.35, ease: 'power3.out' });

    if (quiet) {
        const counter = { v: before };
        tl.to(counter, { v: after, duration: 0.6, ease: 'power2.out', onUpdate: () => { num.textContent = fmt(counter.v); } })
            .to(root, { opacity: 0, duration: 0.3, delay: 1.4 })
            .set(root, { display: 'none' });
        return;
    }

    const layer = document.createElement('div');
    layer.className = 'wbx-fx';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    // the trails' canvas, sharp on a high-density screen
    const canvas = document.createElement('canvas');
    canvas.className = 'wbx-trails';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    layer.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const trails: Trail[] = [];
    const tick = () => drawTrails(ctx, trails);
    gsap.ticker.add(tick);
    cleanup = () => { gsap.ticker.remove(tick); layer.remove(); };

    // where you pressed: one thin ring of light and a few star glints
    const s = centre(from!);
    const ring = document.createElement('span');
    ring.className = 'wbx-ring';
    layer.appendChild(ring);
    gsap.set(ring, { x: s.x, y: s.y, xPercent: -50, yPercent: -50 });
    tl.fromTo(ring, { scale: 0.25, opacity: 1 }, { scale: 1.6, opacity: 0, duration: 0.5, ease: 'power2.out' }, 0)
        .add(() => glints(layer, s.x, s.y, 6, [30, 70], [8, 14]), 0.02);

    const count = Math.max(10, Math.min(24, 8 + Math.round(gained / 20)));
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
        tl.add(() => {
            const t = centre(coin);
            trail.live = true;
            // x and y on different curves, so each path bends its own way
            gsap.to(c, { x: t.x, duration: fly, ease: 'power2.in' });
            gsap.to(c, { y: t.y, duration: fly, ease: `back.in(${R(0.8, 1.8).toFixed(2)})` });
            gsap.to(c, { scale: 0.55, rotation: `+=${R(160, 320)}`, duration: fly, ease: 'power1.in' });
        }, leave);
        // landing: the coin goes, glints pop at the balance, it bumps and counts
        tl.add(() => {
            trail.live = false;
            c.remove();
            const t = centre(coin);
            glints(layer, t.x, t.y, 3, [14, 30], [6, 10]);
            gsap.fromTo(coin, { scale: 1.25 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' });
            landed++;
            num.textContent = fmt(before + (gained * landed) / count);
        }, leave + fly);
        lastLand = Math.max(lastLand, leave + fly);
    }
    tl.add(() => { num.textContent = fmt(after); root.classList.add('is-full'); }, lastLand + 0.02)
        .to(root, { opacity: 0, x: -16, duration: 0.35, ease: 'power2.in', delay: 1.5 }, lastLand + 0.05)
        .add(() => { cleanup?.(); cleanup = null; root.classList.remove('is-full'); gsap.set(root, { display: 'none' }); });
}
