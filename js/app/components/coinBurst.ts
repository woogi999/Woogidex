// The Woobux "collect" moment, the way games do it: a handful of coins burst
// out of the button you pressed, spin and glint for a beat, then fly with a
// trail to your balance in the lower left corner, which appears for the
// moment, bumps as each coin lands and counts up to the new total.
//
// One layer over the page, nothing to click (pointer-events: none), removed
// when it ends. Reduced motion and low-end devices skip the flight: the
// balance shows and counts, and that is all. CSS: css/woobux.css (.wbx-fx).

import { gsap } from 'gsap';
import { reducedMotion } from '../../core/motion.ts';

const COIN = 'assets/woobux.svg';
let running: gsap.core.Timeline | null = null;

/** The balance chip in the lower left corner: made once, reused. */
function bank(): { root: HTMLElement; coin: HTMLElement; num: HTMLElement } {
    let root = document.querySelector<HTMLElement>('.wbx-bank');
    if (!root) {
        root = document.createElement('div');
        root.className = 'wbx-bank';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.innerHTML = `<span class="wbx-bank-coin"><img src="${COIN}" width="26" height="26" alt=""></span><span class="wbx-bank-text"><strong class="wbx-bank-num">0</strong><small>Woobux</small></span>`;
        document.body.appendChild(root);
    }
    return { root, coin: root.querySelector<HTMLElement>('.wbx-bank-coin')!, num: root.querySelector<HTMLElement>('.wbx-bank-num')! };
}

const fmt = (n: number) => Math.round(n).toLocaleString();

/**
 * Plays the collect animation from `from` (the button) and counts the
 * balance chip from `before` to `after`.
 */
export function coinBurst(from: Element | null, before: number, after: number) {
    running?.progress(1).kill();
    const { root, coin, num } = bank();
    const gained = Math.max(0, after - before);
    num.textContent = fmt(before);
    const counter = { v: before };
    const quiet = reducedMotion() || document.documentElement.classList.contains('low-end') || !from;

    const tl = gsap.timeline({ onComplete: () => { running = null; } });
    running = tl;
    tl.set(root, { display: 'flex' })
        .fromTo(root, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: quiet ? 0.2 : 0.35, ease: 'power3.out' });

    if (quiet) {
        tl.to(counter, { v: after, duration: 0.6, ease: 'power2.out', onUpdate: () => { num.textContent = fmt(counter.v); } })
            .to(root, { opacity: 0, duration: 0.3, delay: 1.4 })
            .set(root, { display: 'none' });
        return;
    }

    const layer = document.createElement('div');
    layer.className = 'wbx-fx';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    const start = from!.getBoundingClientRect();
    const sx = start.left + start.width / 2, sy = start.top + start.height / 2;
    // the chip's coin, where each coin lands (read when the coin leaves, after the chip is placed)
    const target = () => { const r = coin.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

    const count = Math.max(8, Math.min(22, 6 + Math.round(gained / 25)));
    const size = 30;
    const coins: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
        const c = document.createElement('span');
        c.className = 'wbx-fly';
        c.innerHTML = `<img src="${COIN}" width="${size}" height="${size}" alt="">`;
        layer.appendChild(c);
        coins.push(c);
    }

    const landAt = 0.55;          // the burst and the hover before the flight
    const flight = 0.62;
    const spread = 0.045;         // time between coins leaving
    coins.forEach((c, i) => {
        const angle = (i / count) * Math.PI * 2 + gsap.utils.random(-0.35, 0.35);
        const dist = gsap.utils.random(56, 128);
        const bx = sx + Math.cos(angle) * dist, by = sy + Math.sin(angle) * dist * 0.8 - 24;
        gsap.set(c, { x: sx - size / 2, y: sy - size / 2, scale: 0.2, rotation: gsap.utils.random(-90, 90), opacity: 0 });
        // burst: out from the button, a pop and a spin
        tl.to(c, { x: bx - size / 2, y: by - size / 2, scale: gsap.utils.random(0.85, 1.15), rotation: `+=${gsap.utils.random(-140, 140)}`, opacity: 1, duration: 0.42, ease: 'back.out(1.6)' }, 0.04 + i * 0.008);
        // the glint across the coin (css .wbx-fly.is-glint)
        tl.add(() => c.classList.add('is-glint'), 0.3 + gsap.utils.random(0, 0.15));
        const leave = landAt + i * spread;
        // the flight: x and y on different curves, so the path bends; a trail of ghosts follows
        tl.add(() => {
            const t = target();
            const tx = t.x - size / 2, ty = t.y - size / 2;
            gsap.to(c, { x: tx, duration: flight, ease: 'power2.in' });
            gsap.to(c, { y: ty, duration: flight, ease: 'back.in(1.4)' });
            gsap.to(c, { scale: 0.62, rotation: '+=220', duration: flight, ease: 'power1.in' });
            trail(layer, c, tx, ty, flight);
        }, leave);
        // landing: the coin goes, the chip bumps and counts
        tl.add(() => {
            c.remove();
            gsap.fromTo(coin, { scale: 1.28 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' });
            counter.v = before + (gained * (i + 1)) / count;
            num.textContent = fmt(counter.v);
        }, leave + flight);
    });
    const end = landAt + (count - 1) * spread + flight;
    tl.add(() => { num.textContent = fmt(after); root.classList.add('is-full'); }, end + 0.02)
        .to(root, { opacity: 0, x: -16, duration: 0.35, ease: 'power2.in', delay: 1.5 }, end + 0.05)
        .add(() => { layer.remove(); root.classList.remove('is-full'); gsap.set(root, { display: 'none' }); });
}

/** Three fading copies that chase a coin, a step behind each other. */
function trail(layer: HTMLElement, coinEl: HTMLElement, tx: number, ty: number, flight: number) {
    const x0 = gsap.getProperty(coinEl, 'x') as number, y0 = gsap.getProperty(coinEl, 'y') as number;
    for (let k = 1; k <= 3; k++) {
        const g = document.createElement('span');
        g.className = 'wbx-trail';
        layer.appendChild(g);
        gsap.set(g, { x: x0 + 7, y: y0 + 7, opacity: 0.55 - k * 0.12, scale: 1 - k * 0.18 });
        gsap.to(g, { x: tx + 7, duration: flight, ease: 'power2.in', delay: k * 0.045 });
        gsap.to(g, { y: ty + 7, duration: flight, ease: 'back.in(1.4)', delay: k * 0.045, onComplete: () => g.remove() });
        gsap.to(g, { scale: 0.2, duration: flight, ease: 'power1.in', delay: k * 0.045 });
    }
}
