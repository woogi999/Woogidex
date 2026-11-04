// The block palette beside the board: each entry looks like the block it
// makes. Drag one onto the board or into a gap, or click it to add it (an
// event goes on the board, any other block parks there until you move it
// into an event). Which entries show: ability-palette-model.ts.

import { useState, type CSSProperties, type DragEvent } from 'react';
import { buildPaletteModel } from '../../../editor/ability-palette-model.ts';
import {
    addAbilityBlock, addAbilityEvent, handlePaletteDragStart, handlePaletteEventDragStart
} from '../../../editor/ability-blocks.ts';
import { Icon } from '../Icon.tsx';
import { BLOCK_COLOURS } from './colours.ts';

function Entry({ label, colour, hat, onDragStart, onAdd }: {
    label: string; colour: string; hat?: boolean; onDragStart: (e: DragEvent) => void; onAdd: () => void;
}) {
    return (
        <button type="button" draggable className={`ab-pal-block${hat ? ' is-hat' : ''}`} style={{ '--blk': colour } as CSSProperties}
            title={`${label}: drag it, or click to add it`} onDragStart={onDragStart} onClick={onAdd}>
            {label}
        </button>
    );
}

/** tables carries TRIGGERS / ACTIONS / BLOCK_GROUPS / EVENT_GROUP. */
export function AbilityPalette({ kind, tables }: { kind: 'ability' | 'move' | 'item' | 'condition'; tables: any }) {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const { events, groups } = buildPaletteModel(tables, kind);
    const match = (label: string) => !q || label.toLowerCase().includes(q);
    const shownEvents = events.filter(e => match(e.label));
    const shownGroups = groups.map(g => ({ ...g, items: g.items.filter(i => match(i.label)) })).filter(g => g.items.length);

    return (
        <>
            <label className="ab-pal-search">
                <Icon name="magnifying-glass" size={15} />
                <input type="search" placeholder="Find a block" value={query} onChange={e => setQuery(e.target.value)} aria-label="Find a block" />
            </label>
            <div className="ab-pal-list">
                {shownEvents.length > 0 && (
                    <section className="ab-pal-group">
                        <h3><span className="ab-pal-swatch" style={{ background: BLOCK_COLOURS.gold }} />When</h3>
                        {shownEvents.map(({ key, label }) => (
                            <Entry key={key} hat label={label} colour={BLOCK_COLOURS.gold}
                                onDragStart={e => handlePaletteEventDragStart(e, key)} onAdd={() => addAbilityEvent(key)} />
                        ))}
                    </section>
                )}
                {shownGroups.map(group => (
                    <section className="ab-pal-group" key={group.label}>
                        <h3><span className="ab-pal-swatch" style={{ background: BLOCK_COLOURS[group.color] || BLOCK_COLOURS.blue }} />{group.label}</h3>
                        {group.items.map(({ type, label }) => (
                            <Entry key={type} label={label} colour={BLOCK_COLOURS[group.color] || BLOCK_COLOURS.blue}
                                onDragStart={e => handlePaletteDragStart(e, type)} onAdd={() => addAbilityBlock('root', type)} />
                        ))}
                    </section>
                ))}
                {!shownEvents.length && !shownGroups.length && <p className="ab-pal-empty">No block matches “{query}”.</p>}
            </div>
        </>
    );
}
