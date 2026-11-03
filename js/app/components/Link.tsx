// A link to one of the app's own pages. It is a real <a href>, so hovering
// shows the address, and Ctrl+click, middle click and "Copy link address"
// work. A plain click is routed in the page by the click handler in
// js/core/app.ts, which runs the same opener as a direct visit.
//
// Keep <button> for actions that do not go to an address (open a dialog,
// like, follow).

import type { AnchorHTMLAttributes } from 'react';
import { routeHref } from '../../core/router.ts';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    /** the route path, e.g. 'community/12' or 'search?q=x' (no leading slash) */
    to: string;
};

export function Link({ to, children, ...rest }: Props) {
    return <a href={routeHref(to)} {...rest}>{children}</a>;
}

/** Path segment for a route, encoded: profilePath('ana') is 'profile/ana'. */
export const profilePath = (username: string) => `profile/${encodeURIComponent(username)}`;
/** Path for a published Fakémon's page. */
export const monPath = (id: string) => `community/${encodeURIComponent(id)}`;

/**
 * Whether a click on a clickable card landed on a link or control inside it,
 * which then does its own thing instead of opening the card.
 */
export function insideControl(e: { target: EventTarget | null; currentTarget: EventTarget | null }): boolean {
    const hit = (e.target as Element | null)?.closest?.('a, button, input, textarea, select, label');
    return !!hit && hit !== e.currentTarget;
}

/** A plain left click, with no key held: the kind a link may handle in the page. */
export function isPlainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
    return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
