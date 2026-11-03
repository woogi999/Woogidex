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
