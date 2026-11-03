// The way into the staff tools from the normal site: a small shield button,
// and a right-click, on a post, a comment, a Fakémon or a profile.
//
// This file is all the public bundle has of it. Nothing renders unless
// my_permissions() said the viewer is staff, and the tools themselves
// (js/mod/tools.tsx) are a separate chunk only fetched when a staff member
// opens the menu.
//
// None of that is what keeps anyone out. Every action is an admin_* function
// in the database that checks the caller's permission and rank itself
// (mod_assert) and is closed to signed-out callers, so calling one by hand
// without the permission gets an error, whatever the page shows.

import type { MouseEvent as ReactMouseEvent } from 'react';
import { api, state } from '../../core/app.ts';
import { Icon } from './Icon.tsx';

export interface ModTarget {
    /** whose content or profile this is */
    userId: string;
    userName?: string;
    /** the thing itself, when the menu is on a piece of content and not a profile */
    content?: { kind: 'post' | 'mon' | 'comment'; id: string; commentKind?: string; label?: string };
    /** after the content is removed, so the page can drop it */
    onRemoved?: () => void;
}

const staff = () => !!state.user && !!api.isStaff?.();
const usable = (t: ModTarget) => staff() && !!t.userId && t.userId !== state.user?.id;

function open(target: ModTarget, at: { x: number; y: number }) {
    import('../../mod/tools.tsx').then(m => m.openModMenu(target, at)).catch(() => api.showToast?.('The staff tools could not be loaded.', 'error'));
}

/** The shield button. Draws nothing for anyone who isn't staff, or on your own things. */
export function ModButton({ target, className = '' }: { target: ModTarget; className?: string }) {
    if (!usable(target)) return null;
    return (
        <button type="button" className={`mod-btn ${className}`.trim()} aria-label="Staff tools" title="Staff tools" aria-haspopup="menu"
            onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); open(target, { x: r.right, y: r.bottom + 4 }); }}>
            <Icon name="shield-check" size={15} />
        </button>
    );
}

/**
 * Props for the element a right-click should open the staff tools on. Empty
 * for everyone else. The browser's own menu still shows over a link, a
 * picture, a field or selected text, and whenever Shift or Ctrl is held.
 */
export function modContext(target: ModTarget): { onContextMenu?: (e: ReactMouseEvent) => void } {
    if (!usable(target)) return {};
    return {
        onContextMenu(e) {
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
            if ((e.target as HTMLElement).closest('a, img, canvas, input, textarea, [contenteditable]')) return;
            if (String(window.getSelection?.() || '').trim()) return;
            e.preventDefault();
            e.stopPropagation();
            open(target, { x: e.clientX, y: e.clientY });
        }
    };
}
