// The block colours, one for each palette group colour (BLOCK_GROUPS and
// EVENT_GROUP in js/editor/ability-blocks.ts). Blocks are content, like a
// type badge: flat and saturated with white text, the same in both themes.
// Each one keeps white text at 4.5:1 or better.

export const BLOCK_COLOURS: Record<string, string> = {
    gold: '#b45309',
    purple: '#7e3fd9',
    orange: '#c2410c',
    green: '#15803d',
    cyan: '#0e7490',
    blue: '#2563eb',
    gray: '#475569'
};

/** The colour of an action's palette group. */
export function blockColour(action: string, groups: Array<{ color: string; items: string[] }> = []): string {
    const group = groups.find(g => (g.items || []).includes(action));
    return BLOCK_COLOURS[group?.color || 'blue'] || BLOCK_COLOURS.blue;
}
