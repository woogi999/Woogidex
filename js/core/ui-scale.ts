// Settings > Appearance > Interface size: the whole site drawn larger or
// smaller (80% to 130%, 100% by default), with CSS `zoom` on the root.
//
// `zoom` rescales position:fixed offsets too, so anything placed from
// pointer or getBoundingClientRect() numbers (menus, popovers, drag ghosts)
// divides by effectiveZoom() before writing left/top.

const KEY = 'woogidex-ui-scale';
export const UI_SCALE_MIN = 80;
export const UI_SCALE_MAX = 130;
export const UI_SCALE_STEP = 5;
export const UI_SCALE_DEFAULT = 100;

const clamp = (n: number) => Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Math.round(n / UI_SCALE_STEP) * UI_SCALE_STEP));

/** The saved size, in percent. */
export function getUiScale(): number {
    try {
        const n = Number(localStorage.getItem(KEY));
        return Number.isFinite(n) && n > 0 ? clamp(n) : UI_SCALE_DEFAULT;
    } catch { return UI_SCALE_DEFAULT; }
}

/** Draws the site at this size and remembers it. */
export function setUiScale(percent: number) {
    const n = clamp(percent);
    try { if (n === UI_SCALE_DEFAULT) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(n)); } catch { /* private mode */ }
    applyUiScale(n);
}

export function applyUiScale(percent = getUiScale()) {
    const root = document.documentElement;
    if (percent === UI_SCALE_DEFAULT) root.style.removeProperty('zoom');
    else root.style.setProperty('zoom', String(percent / 100));
    root.style.setProperty('--ui-scale', String(percent / 100));
    window.dispatchEvent(new Event('resize'));
}

/** Every `zoom` from this element up to the root, multiplied (1 when there is none). */
export function effectiveZoom(el: Element | null = document.documentElement): number {
    let zoom = 1;
    for (let node: Element | null = el; node; node = node.parentElement) {
        const z = parseFloat(getComputedStyle(node).zoom);
        if (!Number.isNaN(z) && z > 0) zoom *= z;
    }
    return zoom;
}

/** A window-pixel number (pointer, getBoundingClientRect) as a CSS length under the zoom of `el`. */
export function cssPx(windowPx: number, el?: Element | null): number {
    return windowPx / effectiveZoom(el);
}

// before the first paint, so the page never jumps size
applyUiScale();
