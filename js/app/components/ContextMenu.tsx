// The site's own right-click menu. One menu at a time, drawn by
// <ContextMenuHost> (mounted once at boot). A card or row opens it with the
// actions for itself (openContextMenu); anywhere else, a right-click gets a
// menu for what is under the pointer: a link, selected text, or the page.
//
// The browser's own menu still shows over a text field, a picture, a canvas,
// and whenever Shift is held. Protected artwork keeps its notice
// (js/core/protect.ts): a handler that already called preventDefault wins.

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { Icon } from './Icon.tsx';
import { reducedMotion } from '../../core/motion.ts';
import { effectiveZoom } from '../../core/ui-scale.ts';
import { isPhone } from '../hooks.ts';

export type MenuAction = { label: string; icon?: string; hint?: string; run: () => void; danger?: boolean; disabled?: boolean };
export type MenuGroup = { label: string; icon?: string; items: MenuAction[] };
export type MenuItem = MenuAction | MenuGroup | 'sep';
export interface MenuSpec {
    /** what the menu is for: a name, and a line under it */
    title?: string; subtitle?: string;
    items: MenuItem[];
}

type Open = MenuSpec & { x: number; y: number; opener: Element | null; key: number };

let current: Open | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

/**
 * Opens the menu. `at` is the pointer event (the menu opens where it was
 * clicked) or an element (the menu opens under it, for the keyboard).
 */
export function openContextMenu(at: { clientX: number; clientY: number; detail?: number; currentTarget?: EventTarget | null } | Element, spec: MenuSpec) {
    let x: number, y: number, opener: Element | null;
    // a keyboard "click" (detail 0) has no pointer position worth using
    if (at instanceof Element || (!at.detail && at.clientX === 0 && at.clientY === 0)) {
        const el = at instanceof Element ? at : (at.currentTarget as Element | null);
        const r = el?.getBoundingClientRect();
        x = r ? r.left + Math.min(24, r.width / 2) : 16;
        y = r ? r.top + Math.min(r.height, 40) : 16;
        opener = el || null;
    } else {
        x = at.clientX; y = at.clientY;
        opener = (at.currentTarget as Element | null) || null;
    }
    current = { ...spec, x, y, opener, key: ++seq };
    emit();
}

export function closeContextMenu(restoreFocus = false) {
    if (!current) return;
    const opener = current.opener;
    current = null;
    emit();
    if (restoreFocus && opener instanceof HTMLElement) opener.focus({ preventScroll: true });
}

/**
 * A stand-in for the click event the old card buttons passed on: the actions
 * call stopPropagation or preventDefault on it, and a few read the element.
 */
export function menuEvent(el?: Element | null): any {
    return { stopPropagation() { /* nothing to stop */ }, preventDefault() { /* nothing to prevent */ }, currentTarget: el || null, target: el || null };
}

const isGroup = (i: MenuItem): i is MenuGroup => typeof i === 'object' && 'items' in i;

// ==================== the menu ====================

export function ContextMenuHost() {
    const open = useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => current);
    if (!open) return null;
    return <Menu key={open.key} spec={open} />;
}

function Menu({ spec }: { spec: Open }) {
    const box = useRef<HTMLDivElement>(null);
    const [group, setGroup] = useState<string | null>(null);
    // on a phone the menu is a sheet along the bottom (css/phone.css), in reach of the thumb
    const [sheet] = useState(isPhone);

    // place it inside the window (flipped to the other side of the pointer if
    // it would run off), then play the entrance from that corner
    useLayoutEffect(() => {
        const el = box.current;
        if (!el) return;
        if (sheet) {
            if (reducedMotion()) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12 });
            else gsap.fromTo(el, { yPercent: 100 }, { yPercent: 0, duration: 0.32, ease: 'expo.out' });
            return;
        }
        // the pointer is in the window's pixels; the box's own (and left/top) are
        // scaled by the interface size (js/core/ui-scale.ts)
        const z = effectiveZoom(el);
        const pad = 8, w = el.offsetWidth * z, h = el.offsetHeight * z;
        const vw = window.innerWidth, vh = window.innerHeight;
        const flipX = spec.x + w + pad > vw, flipY = spec.y + h + pad > vh;
        const left = Math.max(pad, Math.min(flipX ? spec.x - w : spec.x, vw - w - pad));
        const top = Math.max(pad, Math.min(flipY ? spec.y - h : spec.y, vh - h - pad));
        el.style.left = `${left / z}px`;
        el.style.top = `${top / z}px`;
        el.style.transformOrigin = `${flipX ? 'right' : 'left'} ${flipY ? 'bottom' : 'top'}`;
        (el.querySelector('[role="menuitem"]:not(:disabled)') as HTMLElement | null)?.focus({ preventScroll: true });
        if (reducedMotion()) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12 });
        else gsap.fromTo(el, { opacity: 0, scale: 0.94, y: flipY ? 6 : -6 }, { opacity: 1, scale: 1, y: 0, duration: 0.24, ease: 'expo.out' });
    }, []);

    // anything else the person does closes it
    useLayoutEffect(() => {
        const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) closeContextMenu(); };
        const close = () => closeContextMenu();
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('scroll', away, true);
        window.addEventListener('resize', close);
        window.addEventListener('blur', close);
        window.addEventListener('popstate', close);
        return () => {
            document.removeEventListener('pointerdown', away, true);
            document.removeEventListener('scroll', away, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('blur', close);
            window.removeEventListener('popstate', close);
        };
    }, []);

    const items = () => Array.from(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') || []);
    const onKey = (e: React.KeyboardEvent) => {
        const list = items();
        const at = list.indexOf(document.activeElement as HTMLElement);
        const go = (i: number) => { e.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
        if (e.key === 'ArrowDown') go(at + 1);
        else if (e.key === 'ArrowUp') go(at - 1);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(list.length - 1);
        else if (e.key === 'Escape') { e.preventDefault(); if (group) setGroup(null); else closeContextMenu(true); }
        else if (e.key === 'Tab') closeContextMenu();
        else if (e.key === 'ArrowRight') { const g = (document.activeElement as HTMLElement)?.dataset.group; if (g) { e.preventDefault(); setGroup(g); } }
        else if (e.key === 'ArrowLeft' && group) { e.preventDefault(); setGroup(null); }
    };

    const run = (a: MenuAction) => { closeContextMenu(true); a.run(); };

    return (
        <>
        {/* a tap on the dimmed page closes the sheet (the pointerdown above) */}
        {sheet && <div className="ctx-backdrop" aria-hidden="true" />}
        <div ref={box} className={`ctx-menu${sheet ? ' is-sheet' : ''}`} role="menu" aria-label={spec.title || 'Actions'} onKeyDown={onKey}
            onContextMenu={e => e.preventDefault()}>
            {sheet && <span className="ctx-grip" aria-hidden="true" />}
            {spec.title && (
                <div className="ctx-head">
                    <strong>{spec.title}</strong>
                    {spec.subtitle && <span>{spec.subtitle}</span>}
                </div>
            )}
            {spec.items.map((item, i) => {
                if (item === 'sep') return <div key={`sep${i}`} className="ctx-sep" role="separator" />;
                if (isGroup(item)) {
                    const on = group === item.label;
                    return (
                        <div key={item.label} className={`ctx-group${on ? ' open' : ''}`}>
                            <button type="button" role="menuitem" className="ctx-item" aria-haspopup="menu" aria-expanded={on} data-group={item.label}
                                onClick={() => setGroup(on ? null : item.label)}>
                                <ItemIcon name={item.icon} /><span className="ctx-label">{item.label}</span>
                                <Icon name="chevron-right" size={14} className="ctx-caret" />
                            </button>
                            {on && <Submenu items={item.items} run={run} />}
                        </div>
                    );
                }
                return <Action key={item.label} a={item} run={run} />;
            })}
        </div>
        </>
    );
}

/** A group's actions, unfolded in place under it (works the same with a finger). */
function Submenu({ items, run }: { items: MenuAction[]; run: (a: MenuAction) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        (el.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus({ preventScroll: true });
        if (!reducedMotion()) gsap.from(el, { height: 0, opacity: 0, duration: 0.22, ease: 'expo.out', clearProps: 'height,opacity' });
    }, []);
    return <div ref={ref} className="ctx-sub" role="group">{items.map(a => <Action key={a.label} a={a} run={run} />)}</div>;
}

function Action({ a, run }: { a: MenuAction; run: (a: MenuAction) => void }) {
    return (
        <button type="button" role="menuitem" className={`ctx-item${a.danger ? ' danger' : ''}`} disabled={a.disabled} onClick={() => run(a)}>
            <ItemIcon name={a.icon} /><span className="ctx-label">{a.label}</span>
            {a.hint && <kbd className="ctx-hint">{a.hint}</kbd>}
        </button>
    );
}

const ItemIcon = ({ name }: { name?: string }): ReactNode => <span className="ctx-icon">{name && <Icon name={name} size={15} />}</span>;

// ==================== a right-click anywhere else ====================

const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
export const MOD_KEY = mac ? '⌘' : 'Ctrl';

let pageItems: () => MenuItem[] = () => [];
let quickSearch: ((text?: string) => void) | null = null;
/** The host's quick search (Ctrl+K), if it has one; the menu offers it then. */
export function setQuickSearch(fn: ((text?: string) => void) | null) { quickSearch = fn; }
/** Opens quick search with this text typed in. False when there is no quick search (Core alone). */
export function openQuickSearch(text = ''): boolean { if (!quickSearch) return false; quickSearch(text); return true; }
/** What the page menu offers besides the browser basics; the app sets it at boot. */
export function setPageMenuItems(fn: () => MenuItem[]) { pageItems = fn; }

const copy = (text: string) => { navigator.clipboard?.writeText(text).catch(() => window.prompt('Copy this:', text)); };

/** The menu for whatever was right-clicked, or null for the browser's own. */
function menuFor(target: Element): MenuSpec | null {
    if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], img, canvas, video, audio, iframe, .ctx-menu')) return null;
    const selected = String(window.getSelection?.() || '').trim();
    const link = target.closest('a[href]') as HTMLAnchorElement | null;
    if (link) {
        const href = link.href;
        return {
            title: (link.textContent || '').trim().slice(0, 60) || 'Link', subtitle: href.replace(/^https?:\/\//, '').slice(0, 60),
            items: [
                { label: 'Open link', icon: 'arrow-right', run: () => link.click() },
                { label: 'Open in a new tab', icon: 'arrow-top-right-on-square', run: () => window.open(href, '_blank', 'noopener') },
                { label: 'Copy link address', icon: 'link', run: () => copy(href) }
            ]
        };
    }
    if (selected) {
        const short = selected.length > 28 ? `${selected.slice(0, 28)}…` : selected;
        return {
            items: [
                { label: 'Copy', icon: 'clipboard-document', hint: `${MOD_KEY}+C`, run: () => copy(selected) },
                ...(quickSearch ? [{ label: `Search for “${short}”`, icon: 'magnifying-glass', run: () => quickSearch?.(selected) }] : [])
            ]
        };
    }
    const extra = pageItems();
    return {
        items: [
            { label: 'Back', icon: 'arrow-left', disabled: history.length <= 1, run: () => history.back() },
            { label: 'Forward', icon: 'arrow-right', run: () => history.forward() },
            { label: 'Reload', icon: 'arrow-path', run: () => location.reload() },
            'sep',
            ...(quickSearch ? [{ label: 'Quick search', icon: 'magnifying-glass', hint: `${MOD_KEY}+K`, run: () => quickSearch?.() },
                { label: 'Quick commands', icon: 'command-line', hint: '/', run: () => quickSearch?.('/') }] : []),
            ...extra,
            { label: 'Copy page link', icon: 'link', run: () => copy(location.href) }
        ]
    };
}

// ==================== long-press on a touch screen ====================
// A finger held still for a moment opens the same menu a right-click does,
// like holding a post on Instagram. Android fires its own contextmenu for a
// long-press and iOS Safari fires none, so the timer below makes one either
// way (and steps aside if the browser's arrives first). The tap that ends a
// long-press doesn't count as a click.

const LONG_PRESS_MS = 480;
const MOVE_SLOP = 10;
let press: { timer: any; x: number; y: number; target: Element; fired: boolean } | null = null;
let swallowClickUntil = 0;

function cancelPress() {
    if (press) clearTimeout(press.timer);
    press = null;
}

/** Whether a long-press here should open our menu rather than do the browser's thing (text fields, selecting text). */
function pressable(target: Element): boolean {
    if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .ctx-menu, [data-no-long-press]')) return false;
    return true;
}

function initLongPress() {
    document.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { cancelPress(); return; }
        const t = e.touches[0];
        const target = e.target as Element | null;
        if (!target?.closest || !pressable(target)) return;
        cancelPress();
        const p = { timer: 0 as any, x: t.clientX, y: t.clientY, target, fired: false };
        p.timer = setTimeout(() => {
            if (press !== p) return;
            p.fired = true;
            swallowClickUntil = Date.now() + 700;
            try { navigator.vibrate?.(12); } catch { /* not on this device */ }
            // a real contextmenu, so a card's own onContextMenu (React) answers it
            // just as it would a right-click; nothing handled it, the page menu does
            const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, view: window });
            (ev as any).fromLongPress = true;
            p.target.dispatchEvent(ev);
        }, LONG_PRESS_MS);
        press = p;
    }, { passive: true });
    document.addEventListener('touchmove', e => {
        if (!press) return;
        const t = e.touches[0];
        if (!t || Math.abs(t.clientX - press.x) > MOVE_SLOP || Math.abs(t.clientY - press.y) > MOVE_SLOP) cancelPress();
    }, { passive: true });
    document.addEventListener('touchend', e => {
        if (press?.fired) e.preventDefault();
        cancelPress();
    }, { passive: false });
    document.addEventListener('touchcancel', cancelPress, { passive: true });
    document.addEventListener('scroll', cancelPress, { passive: true, capture: true });
    // the click a finger lifting makes, after the menu opened
    document.addEventListener('click', e => {
        if (Date.now() < swallowClickUntil && !(e.target as Element)?.closest?.('.ctx-menu')) {
            e.preventDefault();
            e.stopPropagation();
            swallowClickUntil = 0;
        }
    }, true);
    // the browser's own long-press menu came first (Android): ours stands down
    document.addEventListener('contextmenu', e => {
        if (!(e as any).fromLongPress && press && !press.fired) {
            cancelPress();
            swallowClickUntil = Date.now() + 700;
        }
    }, true);
}

let wired = false;
/** Turns on the site menu for right-clicks no card or row handled, and long-presses on touch screens. */
export function initContextMenu() {
    if (wired) return;
    wired = true;
    initLongPress();
    // on window, so it runs after every document and React handler
    window.addEventListener('contextmenu', e => {
        if (e.defaultPrevented || e.shiftKey) return;
        const target = e.target as Element | null;
        if (!target?.closest) return;
        const spec = menuFor(target);
        if (!spec) return;
        e.preventDefault();
        openContextMenu(e, spec);
    });
}
