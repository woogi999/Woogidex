// A move's category, drawn one way everywhere: Physical, Special or Status as
// a flat badge the size of a type pill (css/controls.css, "category badge"),
// or just its icon. The icons are drawn here (inline SVG), so they work
// offline and in PNG exports, where the old pokemondb.net pictures didn't.

export type MoveCategoryName = 'Physical' | 'Special' | 'Status';

export const normalCategory = (c?: string | null): MoveCategoryName => (c === 'Physical' || c === 'Special' ? c : 'Status');

/** The category's icon: Physical a burst, Special rings, Status a half-filled circle. `size` is pixels, or a share of the box it sits in ("55%"). */
export function CategoryIcon({ category, size = 16, className = '' }: { category?: string | null; size?: number | string; className?: string }) {
    const c = normalCategory(category);
    const style = { width: size, height: size };
    const common = { className: `cat-icon cat-icon-${c.toLowerCase()} ${className}`.trim(), viewBox: '0 0 24 24', style, role: 'img', 'aria-label': c } as const;
    if (c === 'Physical') {
        return (
            <svg {...common}>
                <path fill="currentColor" d="M12 1.5l2.1 5.3 5.3-2.6-2.1 5.4 5.2 2.4-5.2 2.4 2.1 5.4-5.3-2.6L12 22.5l-2.1-5.3-5.3 2.6 2.1-5.4-5.2-2.4 5.2-2.4-2.1-5.4 5.3 2.6z" />
            </svg>
        );
    }
    if (c === 'Special') {
        return (
            <svg {...common}>
                <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
                <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2.4" />
                <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            </svg>
        );
    }
    return (
        <svg {...common}>
            <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <path fill="currentColor" d="M12 2.5a9.5 9.5 0 0 1 0 19z" />
        </svg>
    );
}

/** The badge: icon and name (or the icon alone, `iconOnly`), sized like a type pill or a type badge. */
export function CategoryBadge({ category, size = 'pill', iconOnly = false, className = '' }: {
    category?: string | null; size?: 'pill' | 'badge'; iconOnly?: boolean; className?: string;
}) {
    const c = normalCategory(category);
    return (
        <span className={`cat-badge cat-${c.toLowerCase()} is-${size}${iconOnly ? ' is-icon' : ''} ${className}`.trim()} title={c}>
            <CategoryIcon category={c} size={size === 'badge' ? 14 : 11} />
            {!iconOnly && <span>{c}</span>}
        </span>
    );
}

/** The same icon as an HTML string, for code that builds markup by hand. */
export function categoryIconHtml(category?: string | null, size = 16): string {
    const c = normalCategory(category);
    const body = c === 'Physical'
        ? '<path fill="currentColor" d="M12 1.5l2.1 5.3 5.3-2.6-2.1 5.4 5.2 2.4-5.2 2.4 2.1 5.4-5.3-2.6L12 22.5l-2.1-5.3-5.3 2.6 2.1-5.4-5.2-2.4 5.2-2.4-2.1-5.4 5.3 2.6z"/>'
        : c === 'Special'
            ? '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'
            : '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path fill="currentColor" d="M12 2.5a9.5 9.5 0 0 1 0 19z"/>';
    return `<svg class="cat-icon cat-icon-${c.toLowerCase()}" viewBox="0 0 24 24" width="${size}" height="${size}" role="img" aria-label="${c}" style="vertical-align:middle">${body}</svg>`;
}
