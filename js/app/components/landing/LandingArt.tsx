// The landing page's painting as a band across the page: layered PNGs in
// public/assets/landing/ (day, or night in the dark theme), each layer
// panning by its own depth with the cursor, or with the phone's tilt on a
// touch screen, and drifting up as the page scrolls past it (it opens on the
// top of the picture). Its top and bottom fade softly into the page along a
// slight curve, from a mask drawn to the band's own size. Whatever is passed
// in (the buttons) sits on top and doesn't move.
//
// Reduced motion or a low-end device gets the still painting. The images
// are painted by scripts/landing-painter/ and can be painted over or
// replaced: same names, same sizes (see that folder's README).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { isLowEndDevice, prefersSavingData } from '../../../core/device.ts';
import { useViewShown } from '../../store.ts';
import { effectiveZoom } from '../../../core/ui-scale.ts';

export const ART_LAYERS = ['sky', 'clouds', 'far', 'sea', 'fg'] as const;
type ArtLayer = typeof ART_LAYERS[number];
type Theme = 'day' | 'night';

// how far each layer travels with the cursor or tilt (0 = not at all)
const DEPTH: Record<ArtLayer, number> = { sky: 0.08, clouds: 0.2, far: 0.32, sea: 0.55, fg: 1 };

// relative, so they resolve against <base href> like the site's other images. The
// WebP copies, a tenth the size of the PNGs they're made from (scripts/landing-webp.py)
const imageFor = (theme: Theme, name: ArtLayer) => `assets/landing/${theme}/${name}.webp`;
const themeNow = (): Theme => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'night' : 'day');

// each theme's images, loaded once per visit
const loads = new Map<Theme, Promise<void>>();
const loaded = new Set<Theme>();
const images = new Map<Theme, HTMLImageElement[]>();
function loadTheme(theme: Theme): Promise<void> {
    let p = loads.get(theme);
    if (!p) {
        const imgs = ART_LAYERS.map(l => { const img = new Image(); img.src = imageFor(theme, l); return img; });
        images.set(theme, imgs);
        p = Promise.all(imgs.map(img => new Promise<void>(resolve => {
            if (img.complete) resolve();
            else img.onload = img.onerror = () => resolve();
        }))).then(() => { loaded.add(theme); });
        loads.set(theme, p);
    }
    return p;
}

// ---- what color the painting is at a point (PaintSmudge.tsx picks it up) ----
// The layers flattened into one small picture, made the first time it's asked.
const IMG_W = 2400, IMG_H = 1350, FLAT_W = 480, FLAT_H = 270;
const flats = new Map<Theme, ImageData | null>();
function flattened(theme: Theme): ImageData | null {
    if (flats.has(theme)) return flats.get(theme)!;
    if (!loaded.has(theme)) return null;
    const canvas = document.createElement('canvas');
    canvas.width = FLAT_W; canvas.height = FLAT_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    for (const img of images.get(theme) || []) if (img.naturalWidth) ctx.drawImage(img, 0, 0, FLAT_W, FLAT_H);
    let data: ImageData | null = null;
    try { data = ctx.getImageData(0, 0, FLAT_W, FLAT_H); } catch { /* no pixels to read */ }
    flats.set(theme, data);
    return data;
}

/** The painting's color under a point on screen, or null off the painting. */
export function sceneColorAt(clientX: number, clientY: number): [number, number, number] | null {
    const layer = document.querySelector<HTMLElement>('.lp-layer-sea');
    const data = flattened(themeNow());
    if (!layer || !data) return null;
    // the layers are background-size: cover, centred (css/landing.css .lp-layer)
    const r = layer.getBoundingClientRect();
    const scale = Math.max(r.width / IMG_W, r.height / IMG_H);
    const x = (clientX - r.left - (r.width - IMG_W * scale) / 2) / scale;
    const y = (clientY - r.top - (r.height - IMG_H * scale) / 2) / scale;
    if (x < 0 || y < 0 || x >= IMG_W || y >= IMG_H) return null;
    const i = (Math.floor((y / IMG_H) * FLAT_H) * FLAT_W + Math.floor((x / IMG_W) * FLAT_W)) * 4;
    return [data.data[i], data.data[i + 1], data.data[i + 2]];
}

// ---- the faded edge ----
/**
 * The band's mask: opaque in the middle, fading to nothing over `fadeTop` /
 * `fadeBottom` px toward edges that dip toward the middle by `curve` px, so
 * the painting reaches furthest at the sides. Drawn in thin vertical strips,
 * each its own gradient.
 */
function fadeMask(w: number, h: number, fadeTop: number, fadeBottom: number, curve: number): string {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const strip = 4;
    const at = (y: number) => Math.min(1, Math.max(0, y / h));
    for (let x = 0; x < w; x += strip) {
        const u = ((x + strip / 2) / w) * 2 - 1;
        const dip = curve * (1 - u * u);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        // eased: a soft start and a soft landing rather than a straight ramp
        g.addColorStop(at(dip), 'rgba(0,0,0,0)');
        g.addColorStop(at(dip + fadeTop * 0.5), 'rgba(0,0,0,0.5)');
        g.addColorStop(at(dip + fadeTop), 'rgba(0,0,0,1)');
        g.addColorStop(at(h - dip - fadeBottom), 'rgba(0,0,0,1)');
        g.addColorStop(at(h - dip - fadeBottom * 0.5), 'rgba(0,0,0,0.5)');
        g.addColorStop(at(h - dip), 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, strip, h);
    }
    return canvas.toDataURL('image/png');
}

// the band's last-drawn mask, so others can ask how much of the painting shows at a point
let maskShape: { fadeTop: number; fadeBottom: number; curve: number } | null = null;

/** How opaque the painting is at a point on screen: 0 in its faded edges and off it, 1 in its middle. */
export function artOpacityAt(clientX: number, clientY: number): number {
    const band = document.querySelector<HTMLElement>('.lp-art');
    if (!band || !maskShape) return 0;
    // the mask is in CSS pixels; the pointer and the rect are window pixels (js/core/ui-scale.ts)
    const r = band.getBoundingClientRect(), z = effectiveZoom(band);
    const x = (clientX - r.left) / z, y = (clientY - r.top) / z, w = r.width / z, h = r.height / z;
    if (x < 0 || y < 0 || x > w || y > h) return 0;
    const u = (x / w) * 2 - 1;
    const dip = maskShape.curve * (1 - u * u);
    const t = Math.min((y - dip) / maskShape.fadeTop, (h - dip - y) / maskShape.fadeBottom);
    return Math.max(0, Math.min(1, t));
}

function stillMode() {
    return isLowEndDevice()
        || document.documentElement.classList.contains('reduce-motion')
        || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function LandingArt({ children }: { children: ReactNode }) {
    const shown = useViewShown('landing-view') > 0;
    const band = useRef<HTMLElement>(null);
    const [still, setStill] = useState(stillMode);
    const [ready, setReady] = useState(false);
    const [theme, setTheme] = useState<Theme>(themeNow);

    // ---- the images: the current theme now, the other one when the page is quiet ----
    useEffect(() => {
        if (!shown) return;
        let live = true;
        const load = () => {
            const next = themeNow();
            setTheme(next);
            // already loaded (the other theme is fetched ahead of time): swap straight away
            if (!loaded.has(next)) setReady(false);
            loadTheme(next).then(() => {
                if (!live || themeNow() !== next) return;
                setReady(true);
                if (!prefersSavingData() && !isLowEndDevice()) setTimeout(() => loadTheme(next === 'day' ? 'night' : 'day'), 1500);
            });
        };
        load();
        const themeWatch = new MutationObserver(load);
        themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => { live = false; themeWatch.disconnect(); };
    }, [shown]);

    // ---- the mask, redrawn when the band changes size ----
    useEffect(() => {
        const el = band.current;
        if (!shown || !el || typeof ResizeObserver === 'undefined') return;
        let last = '';
        const draw = () => {
            const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight);
            if (!w || !h || `${w}x${h}` === last) return;
            last = `${w}x${h}`;
            // the bottom fade runs on under the first panel, which overlaps the band (css/landing.css)
            const tuck = parseFloat(getComputedStyle(el).getPropertyValue('--tuck')) || 0;
            // it starts fading where the panel begins, and is gone about halfway down it
            maskShape = { fadeTop: Math.min(170, h * 0.3), fadeBottom: tuck * 0.92, curve: Math.min(70, w * 0.045) };
            const url = `url(${fadeMask(w, h, maskShape.fadeTop, maskShape.fadeBottom, maskShape.curve)})`;
            el.style.setProperty('-webkit-mask-image', url);
            el.style.setProperty('mask-image', url);
            // how far the layers may drift with the scroll before their edges would show
            el.style.setProperty('--sr', `${Math.round(h * 0.11)}px`);
        };
        let timer: ReturnType<typeof setTimeout> | undefined;
        const observer = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(draw, 80); });
        observer.observe(el);
        draw();
        return () => { observer.disconnect(); clearTimeout(timer); };
    }, [shown]);

    useEffect(() => {
        const watch = () => setStill(stillMode());
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        media?.addEventListener?.('change', watch);
        const classWatch = new MutationObserver(watch);
        classWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => { media?.removeEventListener?.('change', watch); classWatch.disconnect(); };
    }, []);

    // ---- the cursor or the phone's tilt (--mx / --my), and the scroll (--sy) ----
    useEffect(() => {
        const el = band.current;
        if (!shown || still || !el) return;
        let frameId = 0;
        let mx = 0, my = 0, tx = 0, ty = 0, sy = 2;
        // how far down the page the band has scrolled away, measured on resize rather than every frame
        // (reading layout each frame, right after writing the variables, made the browser lay out again)
        let gone = 0, scrolled = window.scrollY;
        const measure = () => {
            const r = el.getBoundingClientRect();
            const tuck = parseFloat(getComputedStyle(el).getPropertyValue('--tuck')) || 0;
            scrolled = window.scrollY;
            gone = Math.max(1, r.top + scrolled + r.height - tuck);
        };
        measure();
        const sizeWatch = new ResizeObserver(() => { measure(); kick(); });
        // the band, and the page around it (the hero above can change height and move it)
        sizeWatch.observe(el);
        if (el.parentElement) sizeWatch.observe(el.parentElement);
        const tick = () => {
            frameId = 0;
            if (document.body.dataset.page !== 'landing-view') return;
            // 1 at the top of the page (showing the picture's top), -1 once the band has scrolled away
            const nsy = 1 - 2 * clamp(scrolled / gone);
            if (Math.abs(nsy - sy) > 0.0005) { sy = nsy; el.style.setProperty('--sy', sy.toFixed(4)); }
            mx += (tx - mx) * 0.08;
            my += (ty - my) * 0.08;
            el.style.setProperty('--mx', mx.toFixed(4));
            el.style.setProperty('--my', my.toFixed(4));
            // keep easing toward the target until it's caught up
            if (Math.abs(tx - mx) > 0.001 || Math.abs(ty - my) > 0.001) frameId = requestAnimationFrame(tick);
        };
        const kick = () => { if (!frameId) frameId = requestAnimationFrame(tick); };
        // the scroll position, read in its own event rather than in the frame
        const onScroll = () => { scrolled = window.scrollY; kick(); };
        const onMove = (e: PointerEvent) => {
            if (e.pointerType === 'touch') return;
            tx = (e.clientX / window.innerWidth - 0.5) * 2;
            ty = (e.clientY / window.innerHeight - 0.5) * 2;
            kick();
        };
        let baseBeta: number | null = null;
        const onTilt = (e: DeviceOrientationEvent) => {
            if (e.gamma == null || e.beta == null) return;
            // however the phone is held when the page opens counts as level
            if (baseBeta === null) baseBeta = e.beta;
            tx = clamp(e.gamma / 25, -1, 1);
            ty = clamp((e.beta - baseBeta) / 25, -1, 1);
            kick();
        };
        let tiltOn = false;
        const startTilt = () => {
            if (tiltOn) return;
            tiltOn = true;
            window.addEventListener('deviceorientation', onTilt, { passive: true });
        };
        // iOS asks first, and only from a tap
        const askTilt = () => {
            const ask = (DeviceOrientationEvent as any)?.requestPermission;
            if (typeof ask !== 'function') return;
            ask.call(DeviceOrientationEvent).then((answer: string) => { if (answer === 'granted') startTilt(); }).catch(() => {});
        };
        const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
        window.addEventListener('scroll', onScroll, { passive: true });
        kick();
        if (!coarse) window.addEventListener('pointermove', onMove, { passive: true });
        else if (typeof DeviceOrientationEvent !== 'undefined') {
            if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') document.addEventListener('touchend', askTilt, { once: true });
            else startTilt();
        }
        return () => {
            cancelAnimationFrame(frameId);
            sizeWatch.disconnect();
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('deviceorientation', onTilt);
            document.removeEventListener('touchend', askTilt);
        };
    }, [shown, still]);

    return (
        <section ref={band} className={`lp-art${ready ? ' is-painted' : ''}`}>
            {ART_LAYERS.map(name => (
                <div key={name} className={`lp-layer lp-layer-${name}`} aria-hidden="true"
                    style={{ '--d': DEPTH[name], backgroundImage: `url(${imageFor(theme, name)})` } as CSSProperties} />
            ))}
            <div className="lp-art-content">{children}</div>
        </section>
    );
}
