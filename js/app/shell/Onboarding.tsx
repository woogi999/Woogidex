// First-visit tips (js/features/onboarding.ts has the steps and what's been
// seen). The first time a part of the site opens, a small card walks through
// a few things on it, pointing at each one. It never blocks the page: the
// dimmed backdrop lets clicks through, a dialog opening hides it until the
// dialog closes, and leaving the page ends it. Skip, Esc or the last step
// marks that part done, so the same tips never show twice. Settings can turn
// them off altogether (ShowTips in app.ts).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../core/app.ts';
import { currentTourSection, markTourSeen, tourSeen, TOURS, type TourKey, type TourStep } from '../../features/onboarding.ts';
import { useStore } from '../store.ts';
import { effectiveZoom } from '../../core/ui-scale.ts';

const GAP = 14;
const EDGE = 12;

/** Something else is talking to the user right now. */
function blocked(): boolean {
    return !!document.querySelector('.modal-overlay.active, .move-detail-popup, .header-profile-popover, .notifications-panel');
}

function visible(el: Element | null): el is HTMLElement {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function findTarget(step: TourStep): HTMLElement | null {
    for (const sel of step.targets || []) {
        const el = document.querySelector(sel);
        if (visible(el)) return el;
    }
    return null;
}

function reducedMotion() {
    return document.documentElement.classList.contains('reduce-motion')
        || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

interface Place { top: number; left: number; side: 'below' | 'above' | 'right' | 'center'; arrow: number }

function placeCard(target: DOMRect | null, w: number, h: number): Place {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - w - EDGE));
    const clampY = (y: number) => Math.max(EDGE, Math.min(y, vh - h - EDGE));
    if (!target) return { top: clampY((vh - h) / 2), left: clampX((vw - w) / 2), side: 'center', arrow: 0 };
    const mid = target.left + target.width / 2;
    // something tall (a sidebar): beside it
    if (target.height > vh * 0.5 && target.right + GAP + w < vw - EDGE) {
        return { top: clampY(target.top + 48), left: target.right + GAP, side: 'right', arrow: 0 };
    }
    const left = clampX(mid - w / 2);
    const arrow = Math.max(18, Math.min(mid - left, w - 18));
    if (target.bottom + GAP + h < vh - EDGE) return { top: target.bottom + GAP, left, side: 'below', arrow };
    if (target.top - GAP - h > EDGE) return { top: target.top - GAP - h, left, side: 'above', arrow };
    return { top: clampY(vh - h - EDGE), left, side: 'center', arrow: 0 };
}

export function Onboarding() {
    useStore();
    const on = api.getShowTips?.() !== false;
    const section = on ? currentTourSection() : null;
    const [tour, setTour] = useState<{ key: TourKey; step: number } | null>(null);

    // a part of the site seen for the first time: wait for it to settle (and
    // for any dialog to close), then start its tips
    useEffect(() => {
        if (tour || !section || tourSeen(section)) return;
        let tries = 0;
        const timer = setInterval(() => {
            tries++;
            if (currentTourSection() !== section || tourSeen(section)) { clearInterval(timer); return; }
            if (blocked()) return;
            // the page's first thing to point at usually arrives with its data; don't wait forever
            if (!findTarget(TOURS[section][0]) && tries < 6) return;
            clearInterval(timer);
            setTour({ key: section, step: 0 });
        }, 700);
        return () => clearInterval(timer);
    }, [section, tour]);

    // leaving the page ends its tips, and counts as having seen them (turning
    // tips off just ends them)
    useEffect(() => {
        if (tour && section !== tour.key) {
            if (on) markTourSeen(tour.key);
            setTour(null);
        }
    }, [section, tour, on]);

    if (!tour || section !== tour.key) return null;
    const finish = () => { markTourSeen(tour.key); setTour(null); };
    return <TipCard key={`${tour.key}-${tour.step}`} steps={TOURS[tour.key]} index={tour.step}
        onStep={step => setTour({ key: tour.key, step })} onDone={finish} />;
}

function TipCard({ steps, index, onStep, onDone }: { steps: TourStep[]; index: number; onStep: (i: number) => void; onDone: () => void }) {
    useStore();
    const step = steps[index];
    const last = index === steps.length - 1;
    const card = useRef<HTMLDivElement>(null);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [place, setPlace] = useState<Place | null>(null);
    const [hidden, setHidden] = useState(false);

    // bring the thing into view once, then follow it while the page moves
    useEffect(() => {
        const el = findTarget(step);
        if (el) {
            const r = el.getBoundingClientRect();
            if (r.top < 60 || r.bottom > window.innerHeight - 40) {
                el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
            }
        }
        let frame = 0;
        const measure = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                setHidden(blocked());
                const target = findTarget(step);
                const r = target ? target.getBoundingClientRect() : null;
                // a new rect only when it moved: each one drew the card again
                setRect(old => old && r && old.top === r.top && old.left === r.left && old.width === r.width && old.height === r.height ? old : r);
            });
        };
        measure();
        // a slow check for a target that moves with no scroll or resize
        const timer = setInterval(measure, 1000);
        window.addEventListener('scroll', measure, { passive: true, capture: true });
        window.addEventListener('resize', measure);
        return () => {
            cancelAnimationFrame(frame);
            clearInterval(timer);
            window.removeEventListener('scroll', measure, { capture: true } as any);
            window.removeEventListener('resize', measure);
        };
    }, [step]);

    useLayoutEffect(() => {
        const box = card.current;
        if (!box) return;
        const z = effectiveZoom(box);
        setPlace(placeCard(rect, box.offsetWidth * z, box.offsetHeight * z));
    }, [rect?.top, rect?.left, rect?.width, rect?.height, hidden]);

    // the first tip takes focus so a keyboard can answer it; after Next or
    // Back (a fresh card) it lands back on the main button
    useEffect(() => {
        const box = card.current;
        if (index === 0) box?.focus({ preventScroll: true });
        else box?.querySelector<HTMLElement>('.btn-primary')?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented || blocked()) return;
            // the tip takes this Esc: caught before the page's own handlers (the editor
            // sheet closes on Esc too) and marked handled so they leave it alone
            e.preventDefault();
            onDone();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onDone]);

    if (hidden) return null;
    const pad = 6;
    // the rects are window pixels; top/left are CSS pixels under the interface size
    const z = effectiveZoom();
    return (
        <>
            {rect
                ? <div className="ob-spot" aria-hidden="true" style={{ top: rect.top / z - pad, left: rect.left / z - pad, width: rect.width / z + pad * 2, height: rect.height / z + pad * 2 }} />
                : <div className="ob-dim" aria-hidden="true" />}
            <div ref={card} className={`ob-card ob-${place?.side || 'center'}${place ? ' is-placed' : ''}`} role="dialog" aria-modal="false"
                aria-labelledby="ob-title" aria-describedby="ob-body" tabIndex={-1}
                style={{ top: place ? place.top / z : -9999, left: place ? place.left / z : -9999, ['--ax' as any]: `${(place?.arrow || 0) / z}px` }}>
                <div className="ob-top">
                    <h2 className="ob-title" id="ob-title">{step.title}</h2>
                    <button type="button" className="ob-skip" onClick={onDone}>Skip tips</button>
                </div>
                <p className="ob-body" id="ob-body">{step.body}</p>
                <div className="ob-foot">
                    <span className="ob-dots" role="img" aria-label={`Tip ${index + 1} of ${steps.length}`}>{steps.map((_, i) => <span key={i} className={i === index ? 'is-on' : ''} />)}</span>
                    <span className="ob-actions">
                        {index > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStep(index - 1)}>Back</button>}
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => (last ? onDone() : onStep(index + 1))}>{last ? 'Got it' : 'Next'}</button>
                    </span>
                </div>
            </div>
        </>
    );
}
