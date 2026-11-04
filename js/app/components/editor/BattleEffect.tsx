// The "Battle effect" part of the move, ability, item and condition editors:
// what it does in a battle, made with blocks (the block editor page,
// js/editor/ability-blocks.ts) or written by hand as Showdown hook code.
// One switch picks which of the two you look at. Both can hold something:
// the export writes the blocks first, then the hand-written hooks.

import { useState } from 'react';
import { api } from '../../../core/app.ts';
import { Icon } from '../Icon.tsx';

export type BattleKind = 'move' | 'ability' | 'item' | 'condition';

type Trigger = { label: string; icon: string; blocks: number };

const PLACEHOLDER: Record<BattleKind, string> = {
    move: 'basePowerCallback(pokemon, target, move) {\n    return 40 + Math.floor(pokemon.hp * 60 / pokemon.maxhp);\n},\nsecondaries: [{ chance: 30, boosts: { spe: -1 } }],\nonHit(target, source, move) {\n    this.boost({ atk: 1 }, source);\n}',
    item: 'onModifySpe(spe, pokemon) {\n    return this.chainModify(2);\n},\nonDamage(damage, target, source, effect) {\n    if (damage >= target.hp) return target.hp - 1;\n}',
    ability: 'onModifyMove(move, pokemon) {\n    if (move.secondaries) {\n        for (const s of move.secondaries) s.chance *= 2;\n    }\n},\nonResidual(pokemon) {\n    this.heal(pokemon.maxhp / 8, pokemon);\n}',
    condition: 'onStart(pokemon) {\n    this.add(\'-start\', pokemon, \'Frostbite\');\n},\nonResidualOrder: 10,\nonResidual(pokemon) {\n    this.damage(pokemon.baseMaxhp / 16);\n}'
};

const BLOCKS_HELP: Record<BattleKind, string> = {
    move: 'Snap blocks together for what happens when the move is used. It exports to Showdown and Essentials.',
    ability: 'Snap blocks together: pick when the ability acts, then what it does. It exports to Showdown and Essentials.',
    item: 'Snap blocks together: pick when the item acts, then what it does. It exports to Showdown and Essentials.',
    condition: 'Snap blocks together: when it starts, each turn, when it ends, and how it changes damage. It goes in the Showdown export as conditions.ts.'
};

/**
 *   blocks: the saved block program (entry.blocks), for the summary
 *   openBlocks: saves the entry if it needs to, then opens the block editor
 */
export function BattleEffect({ kind, blocks, code, setCode, openBlocks }: {
    kind: BattleKind; blocks: unknown; code: string; setCode: (code: string) => void; openBlocks: () => void;
}) {
    const triggers: Trigger[] = api.describeBlockTriggers?.(blocks) || [];
    const hasBlocks = triggers.some(t => t.blocks > 0);
    const hasCode = !!code.trim();
    const [tab, setTab] = useState<'blocks' | 'code'>(() => hasCode && !hasBlocks ? 'code' : 'blocks');
    // a condition's code goes into conditions.ts as written, so its hooks are checked like an ability's
    const checkAs = kind === 'condition' ? 'ability' : kind;
    const report = tab === 'code' ? api.rawCodeReport(code, checkAs) : null;
    const tabs: Array<['blocks' | 'code', string, string, boolean]> = [
        ['blocks', 'Blocks', 'puzzle-piece', hasBlocks],
        ['code', 'Code', 'code-bracket', hasCode]
    ];

    return (
        <section className="battle-effect" aria-labelledby={`battle-effect-${kind}`}>
            <div className="battle-effect-head">
                <h4 id={`battle-effect-${kind}`}>Battle effect</h4>
                <div className="segmented battle-effect-tabs" role="tablist" aria-label="How to make it">
                    {tabs.map(([id, label, icon, filled]) => (
                        <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                            <Icon name={icon} size={15} />{label}
                            {filled && <span className="battle-effect-dot" aria-label="(has something)" />}
                        </button>
                    ))}
                </div>
            </div>

            {tab === 'blocks' ? (
                <div className="battle-effect-pane" role="tabpanel">
                    {hasBlocks ? (
                        <ul className="battle-effect-triggers">
                            {triggers.map((t, i) => (
                                <li key={i}>
                                    <Icon name={t.icon || 'bolt'} size={15} />
                                    <span>{t.label}</span>
                                    <span className="battle-effect-count">{t.blocks} {t.blocks === 1 ? 'block' : 'blocks'}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="battle-effect-help">{BLOCKS_HELP[kind]}</p>
                    )}
                    <button type="button" className="btn btn-secondary battle-effect-open" onClick={openBlocks}>
                        <Icon name="puzzle-piece" size={16} />{hasBlocks ? 'Edit the blocks' : 'Build with blocks'}
                        <Icon name="arrow-right" size={14} className="battle-effect-arrow" />
                    </button>
                </div>
            ) : (
                <div className="battle-effect-pane" role="tabpanel">
                    <p className="battle-effect-help">
                        Paste Showdown hook code: the bare hooks, a whole <code>{'{ ... }'}</code> entry, an <code>export const</code> off GitHub or one entry out of a dex table. TypeScript annotations are fine.
                        {kind === 'condition'
                            ? ' It goes into conditions.ts as written.'
                            : ' It runs in battles against the bot. A battle against another player skips it on both sides.'}
                    </p>
                    <textarea className="battle-effect-code" rows={10} spellCheck={false} value={code} aria-label="Battle code"
                        placeholder={PLACEHOLDER[kind]}
                        onChange={e => setCode(e.target.value)}
                        onBlur={() => { const fixed = api.rawCodeReport(code, checkAs, true).fixed; if (fixed) setCode(fixed); }} />
                    <div className={`battle-effect-status ${report?.tone || ''}`.trim()} aria-live="polite">{report?.text}</div>
                    <details className="battle-effect-ref">
                        <summary>Hooks this engine can run</summary>
                        {kind === 'move' && <p className="battle-effect-help">A move also gets the move pipeline: <code>basePowerCallback</code>, <code>onModifyMove</code>, <code>onBasePower</code>, <code>onTry</code>, <code>onHit</code>, and data fields like <code>secondaries</code>, <code>drain</code> and <code>multihit</code>.</p>}
                        <div className="battle-effect-hooks">{(api.rawCodeHooks(checkAs) as string[]).map(h => <code key={h}>{h}</code>)}</div>
                    </details>
                </div>
            )}
        </section>
    );
}
