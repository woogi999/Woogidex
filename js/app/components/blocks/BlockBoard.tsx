// The ability block editor's board: a recursive drag-and-drop tree of blocks.
// The drag system and the edits live in js/editor/ability-blocks.ts; this
// draws the tree it holds. React reconciling the tree (rather than rebuilding
// it from strings) means a drag doesn't reset the board's scroll position.

import { type SyntheticEvent, type TextareaHTMLAttributes, type InputHTMLAttributes } from 'react';
import { Icon } from '../Icon.tsx';
import {
    ensureBlockPosition, isFreeContainer, blockCategory, categoryClass, splitParamTemplate
} from '../../../editor/ability-board-model.ts';
import { BLOCK_COLOURS, blockColour } from './colours.ts';
import {
    allowWorkspaceDrop, handleBlockConnectionDragEnd, handleBlockConnectionDragStart, handleConnectionDragLeave,
    handleConnectionDragOver, handleConnectionDrop, handleWorkspaceDrop, moveAbilityBlock, removeAbilityBlock,
    startAbilityBlockMove, updateAbilityBlockParam, updateAbilityEventParam, updateAbilityIfCondParam, updateAbilityIfCondition
} from '../../../editor/ability-blocks.ts';

/** The AST node types are the editor's own; loosely typed here. */
type Block = any;
type Tables = any;
type ParamDef = { key: string; type?: string; label?: string; options?: Array<{ value: string; label: string }>; placeholder?: string; min?: number; max?: number; step?: number };

const stop = (e: SyntheticEvent) => e.stopPropagation();

// ==================== parameter controls ====================
// These sit inline inside a block's sentence: "raise [attack] by [2]".

/**
 * Commits on blur, not on every keystroke -- committing per keystroke would
 * re-run the compiler and repaint the code preview per character. Keyed on
 * value so it remounts (rather than going stale) if the value changes elsewhere.
 */
function BlurField({ multiline, value, onCommit, ...rest }: {
    multiline?: boolean; value: unknown; onCommit: (v: string) => void
} & Omit<InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'>) {
    const shared = {
        ...rest,
        defaultValue: String(value ?? ''),
        onBlur: (e: { target: { value: string } }) => onCommit(e.target.value),
        onClick: stop,
        onPointerDown: stop
    };
    return multiline
        ? <textarea key={String(value ?? '')} {...(shared as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
        : <input key={String(value ?? '')} {...(shared as InputHTMLAttributes<HTMLInputElement>)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

function ParamControl({ pdef, value, values, onCommit, resolveOptions }: {
    pdef: ParamDef; value: unknown; values: Record<string, unknown> | undefined; onCommit: (v: string) => void;
    resolveOptions?: (pdef: ParamDef, values: Record<string, unknown>) => Array<{ value: string; label: string }>;
}) {
    if (pdef.type === 'select' || pdef.type === 'dynamic-select') {
        // dynamic-select's choices depend on a sibling parameter's value.
        const options = (pdef.type === 'dynamic-select' && resolveOptions) ? resolveOptions(pdef, values || {}) : (pdef.options || []);
        return (
            <select className="ab-inline-input" value={String(value ?? '')} onChange={e => onCommit(e.target.value)} onClick={stop} onPointerDown={stop}>
                {options.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
            </select>
        );
    }
    if (pdef.type === 'code') {
        return <BlurField multiline className="ab-inline-code" rows={3} spellCheck={false} placeholder={pdef.placeholder || ''} value={value} onCommit={onCommit} />;
    }
    if (pdef.type === 'number') {
        return <BlurField type="number" className="ab-inline-input ab-inline-number" min={pdef.min} max={pdef.max} step={pdef.step} value={value} onCommit={onCommit} />;
    }
    return <BlurField type="text" className="ab-inline-input ab-inline-text" value={value} onCommit={onCommit} />;
}

/** An action's label with its parameter slots filled in, as one sentence. */
function ParamLabel({ template, paramDefs, values, onCommit, resolveOptions }: {
    template: string; paramDefs: ParamDef[]; values: Record<string, unknown>; onCommit: (key: string, v: string) => void; resolveOptions: Tables['resolveOptions'];
}) {
    return <>{splitParamTemplate(template, paramDefs).map((seg: { text: string; param: any }, i: number) => (
        <span key={i}>
            {seg.text}
            {seg.param && (
                <ParamControl pdef={seg.param} value={(values || {})[seg.param.key]} values={values}
                    resolveOptions={resolveOptions} onCommit={v => onCommit(seg.param.key, v)} />
            )}
        </span>
    ))}</>;
}

// ==================== structure ====================
// Every statement block has the same notch at its top-left and the same tab
// under it (css/ability-blocks.css, --ab-notch-*), so a block that follows
// another in a stack fits it exactly. Event and If blocks are C-shapes: their
// arms hold a stack. A stack ends in a gap to drop the next block into; a
// dragged block also snaps into any gap near its notch (nearestSnap in
// js/editor/ability-blocks.ts finds stacks by .ab-stack).

function ConnectionSlot({ containerId, empty }: { containerId: string; empty: boolean }) {
    return (
        <div className={`ab-connection-slot${empty ? ' is-empty' : ''}`} data-container-id={containerId} data-accept="statement"
            onDragOver={e => handleConnectionDragOver(e, containerId)}
            onDragLeave={e => handleConnectionDragLeave(e)}
            onDrop={e => handleConnectionDrop(e, containerId)}>
            {empty ? 'Drop a block here' : <span className="ab-sr">Drop a block here</span>}
        </div>
    );
}

/** A stack inside an event or an If: its blocks one under the other, then the gap for the next one. */
function Stack({ list, containerId, depth, tables }: { list: Block[]; containerId: string; depth: number; tables: Tables }) {
    list.forEach((b, i) => ensureBlockPosition(b, i, depth));
    return (
        <div className="ab-stack" data-container-id={containerId} data-depth={depth}>
            {list.map((block, i) => (
                <AnyBlock key={block.id} block={block} containerId={containerId} index={i} depth={depth} tables={tables} />
            ))}
            <ConnectionSlot containerId={containerId} empty={!list.length} />
        </div>
    );
}

/** Attributes every block shares: pointer-drag, drop target, and its place when it sits on the board itself. */
function blockFrameProps(block: Block, containerId: string, colour: string) {
    return {
        'data-id': block.id,
        draggable: false,
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => startAbilityBlockMove(e, block.id, containerId),
        onDragStart: (e: React.DragEvent<HTMLDivElement>) => handleBlockConnectionDragStart(e, block.id),
        onDragEnd: (e: React.DragEvent<HTMLDivElement>) => handleBlockConnectionDragEnd(e),
        onDragOver: (e: React.DragEvent<HTMLDivElement>) => allowWorkspaceDrop(e),
        onDrop: (e: React.DragEvent<HTMLDivElement>) => handleWorkspaceDrop(e),
        style: { '--blk': colour, ...(isFreeContainer(containerId) ? { left: block.pos.x, top: block.pos.y } : {}) } as React.CSSProperties
    };
}

function BlockControls({ id, canReorder = true }: { id: string; canReorder?: boolean }) {
    return (
        <span className="ab-block-controls">
            {canReorder && (
                <>
                    <button type="button" title="Move up" aria-label="Move up" onClick={e => { stop(e); moveAbilityBlock(id, -1); }}><Icon name="chevron-up" /></button>
                    <button type="button" title="Move down" aria-label="Move down" onClick={e => { stop(e); moveAbilityBlock(id, 1); }}><Icon name="chevron-down" /></button>
                </>
            )}
            <button type="button" title="Delete" aria-label="Delete" onClick={e => { stop(e); removeAbilityBlock(id); }}><Icon name="trash-2" /></button>
        </span>
    );
}

function EventBlock({ block, index, tables }: { block: Block; index: number; tables: Tables }) {
    const def = tables.TRIGGERS?.[block.trigger];
    if (!def) return null;
    ensureBlockPosition(block, index, 0);
    const defs: ParamDef[] = def.params || [];
    return (
        <div className="ab-block ab-c-block ab-event-block" {...blockFrameProps(block, 'root-events', BLOCK_COLOURS.gold)}>
            <div className="ab-c-head ab-hat">
                <Icon name={def.icon || 'bolt'} size={16} />
                <span className="ab-block-text">
                    <strong>When</strong> {String(def.label).charAt(0).toLowerCase() + String(def.label).slice(1)}
                    {defs.map(p => (
                        <span key={p.key} className="ab-param">
                            {/* only labelled when there is more than one, so two bare dropdowns are told apart */}
                            {defs.length > 1 && p.label && <span className="ab-param-label">{p.label}</span>}
                            <ParamControl pdef={p} value={(block.triggerParams || {})[p.key]} values={block.triggerParams}
                                resolveOptions={tables.resolveOptions} onCommit={v => updateAbilityEventParam(block.id, p.key, v)} />
                        </span>
                    ))}
                </span>
                <BlockControls id={block.id} canReorder={false} />
            </div>
            <div className="ab-c-arm"><Stack list={block.body || []} containerId={block.id + ':body'} depth={1} tables={tables} /></div>
            <div className="ab-c-foot" />
        </div>
    );
}

function ActionBlock({ block, containerId, index, tables }: { block: Block; containerId: string; index: number; tables: Tables }) {
    const def = tables.ACTIONS?.[block.action];
    if (!def) return null;
    ensureBlockPosition(block, index, containerId === 'root' ? 0 : 1);
    const category = blockCategory(block.action, tables);
    return (
        <div className={`ab-block ab-stmt ab-action-block ${categoryClass(category)}`} title={category} {...blockFrameProps(block, containerId, blockColour(block.action, tables.BLOCK_GROUPS))}>
            <span className="ab-block-text">
                <ParamLabel template={def.label} paramDefs={def.params} values={block.params} resolveOptions={tables.resolveOptions}
                    onCommit={(key, v) => updateAbilityBlockParam(block.id, key, v)} />
            </span>
            <BlockControls id={block.id} />
        </div>
    );
}

function IfBlock({ block, containerId, index, depth, tables }: { block: Block; containerId: string; index: number; depth: number; tables: Tables }) {
    const CONDITIONS: Record<string, any> = tables.CONDITIONS || {};
    const def = CONDITIONS[block.condition] || CONDITIONS[Object.keys(CONDITIONS)[0]] || {};
    ensureBlockPosition(block, index, containerId === 'root' ? 0 : 1);
    return (
        <div className="ab-block ab-c-block ab-if-block" {...blockFrameProps(block, containerId, BLOCK_COLOURS.purple)}>
            <div className="ab-c-head ab-stmt-top">
                <span className="ab-block-text">
                    <strong>If</strong>{' '}
                    <select className="ab-inline-input" value={block.condition ?? ''} onChange={e => updateAbilityIfCondition(block.id, e.target.value)}
                        onClick={stop} onPointerDown={stop} aria-label="Condition">
                        {Object.entries(CONDITIONS).map(([key, c]) => (
                            <option key={key} value={key}>{String(c.label || key).replace(/__/g, '…')}</option>
                        ))}
                    </select>{' '}
                    {((def.params || []) as ParamDef[]).map(p => (
                        <ParamControl key={p.key} pdef={p} value={(block.condParams || {})[p.key]} values={block.condParams}
                            resolveOptions={tables.resolveOptions} onCommit={v => updateAbilityIfCondParam(block.id, p.key, v)} />
                    ))}
                </span>
                <BlockControls id={block.id} />
            </div>
            <div className="ab-c-arm"><Stack list={block.then || []} containerId={block.id + ':then'} depth={depth + 1} tables={tables} /></div>
            <div className="ab-c-mid"><strong>Otherwise</strong></div>
            <div className="ab-c-arm"><Stack list={block.else || []} containerId={block.id + ':else'} depth={depth + 1} tables={tables} /></div>
            <div className="ab-c-foot ab-stmt-bottom" />
        </div>
    );
}

function AnyBlock({ block, containerId, index, depth, tables }: { block: Block; containerId: string; index: number; depth: number; tables: Tables }) {
    if (block.kind === 'event') return <EventBlock block={block} index={index} tables={tables} />;
    if (block.kind === 'action') return <ActionBlock block={block} containerId={containerId} index={index} tables={tables} />;
    if (block.kind === 'if') return <IfBlock block={block} containerId={containerId} index={index} depth={depth} tables={tables} />;
    return null;
}

// ==================== the board ====================

/**
 * events: the event blocks, each with its own stack (a program can react to
 * many events); loose: blocks parked on the board outside any event, which
 * do nothing until they join one; tables: TRIGGERS / ACTIONS / CONDITIONS /
 * BLOCK_GROUPS, plus resolveOptions() for dynamic selects.
 */
export function BlockBoard({ events, loose, tables }: { events: Block[]; loose: Block[]; tables: Tables }) {
    return (
        <>
            <div className="ab-free" data-container-id="root-events">
                {events.map((block, i) => <AnyBlock key={block.id} block={block} containerId="root-events" index={i} depth={0} tables={tables} />)}
            </div>
            <div className="ab-free" data-container-id="loose">
                {loose.map((block, i) => <AnyBlock key={block.id} block={block} containerId="loose" index={i} depth={0} tables={tables} />)}
            </div>
        </>
    );
}
