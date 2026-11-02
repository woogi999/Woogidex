// A table's column headers that sort it: click a header to sort by that
// column, again to flip the order, a third time to go back to the table's
// own order. Used by every table on the site (the learnset, My Collection's
// table, the Community Hub's table, the dex tables).

import { Icon } from './Icon.tsx';

export type SortState = { key: string; order: 'asc' | 'desc' };

/** One header cell. `as` is the element (th for a <table>, div for a grid). */
export function SortTh({ label, sortKey, sort, onSort, className = '', as = 'th', title, align }: {
    label: React.ReactNode; sortKey?: string; sort: SortState | null; onSort?: (key: string) => void;
    className?: string; as?: 'th' | 'div'; title?: string; align?: 'left' | 'right' | 'center';
}) {
    const Tag = as as any;
    const on = !!sortKey && sort?.key === sortKey;
    const aria = on ? (sort!.order === 'asc' ? 'ascending' : 'descending') : 'none';
    const style = align ? { textAlign: align } : undefined;
    if (!sortKey || !onSort) return <Tag className={`sort-th ${className}`.trim()} style={style} role={as === 'div' ? 'columnheader' : undefined}>{label}</Tag>;
    return (
        <Tag className={`sort-th is-sortable${on ? ' is-sorted' : ''} ${className}`.trim()} aria-sort={aria} style={style} role={as === 'div' ? 'columnheader' : undefined}>
            <button type="button" className="sort-th-btn" onClick={() => onSort(sortKey)} title={title || `Sort by ${typeof label === 'string' ? label.toLowerCase() : 'this column'}`}>
                <span>{label}</span>
                <Icon name={on ? (sort!.order === 'asc' ? 'chevron-up' : 'chevron-down') : 'arrows-up-down'} size={11} className="sort-th-icon" />
            </button>
        </Tag>
    );
}

/**
 * The usual three-step cycle for a header click. `firstOrder` is the order a
 * column starts in (names A to Z, numbers biggest first).
 */
export function nextSort(current: SortState | null, key: string, firstOrder: 'asc' | 'desc' = 'asc'): SortState | null {
    if (!current || current.key !== key) return { key, order: firstOrder };
    if (current.order === firstOrder) return { key, order: firstOrder === 'asc' ? 'desc' : 'asc' };
    return null;
}

/** Sorts rows by a column; `value` reads the column off a row. Ties keep their order. */
export function sortRows<T>(rows: T[], sort: SortState | null, value: (row: T, key: string) => any): T[] {
    if (!sort) return rows;
    const dir = sort.order === 'asc' ? 1 : -1;
    return rows.map((r, i) => ({ r, i })).sort((a, b) => {
        const x = value(a.r, sort.key), y = value(b.r, sort.key);
        const empty = (v: any) => v === null || v === undefined || v === '';
        if (empty(x) !== empty(y)) return empty(x) ? 1 : -1;
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true, sensitivity: 'base' });
        return c * dir || a.i - b.i;
    }).map(x => x.r);
}
