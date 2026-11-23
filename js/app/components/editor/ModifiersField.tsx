// The move editor's Modifiers: what the move does, picked from lists, with no
// blocks or code. Effects with a chance (30% freeze, 20% flinch, -1 Defense),
// drain, recoil, healing, critical hits, switch-outs and the rest, and
// "Behaves like" a main-game move (Pursuit, Sucker Punch...). The rules and
// the Showdown fields they become are js/features/move-modifiers.ts.

import { useEffect, useMemo, useState } from 'react';
import { api, state } from '../../../core/app.ts';
import { useStore } from '../../store.ts';
import { Icon } from '../Icon.tsx';
import {
    CRITS, STATS, STATUSES, TOGGLES, VOLATILES, modifierSummary, modifiersFromShowdown,
    type CritLevel, type ModEffect, type MoveModifiers, type StatId
} from '../../../features/move-modifiers.ts';

/** The quick picks people reach for most. */
const PRESETS: Array<[string, ModEffect]> = [
    ['10% burn', { kind: 'status', who: 'target', status: 'brn', chance: 10 }],
    ['10% freeze', { kind: 'status', who: 'target', status: 'frz', chance: 10 }],
    ['30% paralysis', { kind: 'status', who: 'target', status: 'par', chance: 30 }],
    ['30% poison', { kind: 'status', who: 'target', status: 'psn', chance: 30 }],
    ['30% flinch', { kind: 'volatile', who: 'target', volatile: 'flinch', chance: 30 }],
    ['10% confusion', { kind: 'volatile', who: 'target', volatile: 'confusion', chance: 10 }],
    ['-1 target Defense', { kind: 'boost', who: 'target', stat: 'def', stages: -1, chance: 100 }],
    ['+1 user Attack', { kind: 'boost', who: 'self', stat: 'atk', stages: 1, chance: 100 }]
];

type Choice = `status:${string}` | `volatile:${string}` | 'boost';
const choiceOf = (e: ModEffect): Choice => (e.kind === 'status' ? `status:${e.status}` : e.kind === 'volatile' ? `volatile:${e.volatile}` : 'boost');

function EffectRow({ effect, statusMove, onChange, onRemove }: { effect: ModEffect; statusMove: boolean; onChange: (e: ModEffect) => void; onRemove: () => void }) {
    const pick = (value: string) => {
        if (value === 'boost') onChange({ kind: 'boost', who: effect.who, stat: effect.stat || 'atk', stages: effect.stages || -1, chance: effect.chance });
        else if (value.startsWith('status:')) onChange({ kind: 'status', who: 'target', status: value.slice(7) as any, chance: effect.chance });
        else onChange({ kind: 'volatile', who: 'target', volatile: value.slice(9) as any, chance: effect.chance });
    };
    return (
        <div className="mod-effect">
            {!statusMove && (
                <label className="mod-chance" title="The chance it happens on a hit">
                    <input type="number" min={1} max={100} value={effect.chance} aria-label="Chance in percent"
                        onChange={e => onChange({ ...effect, chance: Math.min(100, Math.max(1, Math.round(Number(e.target.value)) || 1)) })} />
                    <span>%</span>
                </label>
            )}
            <select value={choiceOf(effect)} aria-label="Effect" onChange={e => pick(e.target.value)}>
                <optgroup label="Status">{STATUSES.map(([id, label]) => <option key={id} value={`status:${id}`}>{label}</option>)}</optgroup>
                <optgroup label="Other conditions">{VOLATILES.map(([id, label]) => <option key={id} value={`volatile:${id}`}>{label}</option>)}</optgroup>
                <option value="boost">Stat change</option>
            </select>
            {effect.kind === 'boost' && (
                <>
                    <select value={effect.who} aria-label="Whose stat" onChange={e => onChange({ ...effect, who: e.target.value as any })}>
                        <option value="target">Target's</option>
                        <option value="self">User's</option>
                    </select>
                    <select value={effect.stat} aria-label="Stat" onChange={e => onChange({ ...effect, stat: e.target.value as StatId })}>
                        {STATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                    <select value={effect.stages} aria-label="Stages" onChange={e => onChange({ ...effect, stages: Number(e.target.value) })}>
                        {[-3, -2, -1, 1, 2, 3, 6].map(n => <option key={n} value={n}>{n > 0 ? `+${n}` : n}</option>)}
                    </select>
                </>
            )}
            <button type="button" className="mod-remove" aria-label="Remove this effect" onClick={onRemove}><Icon name="x" size={14} /></button>
        </div>
    );
}

export function ModifiersField({ value, category, onChange }: { value: MoveModifiers; category: string; onChange: (next: MoveModifiers) => void }) {
    useStore();
    // the main-game moves for "Behaves like" load lazily (Showdown's data)
    useEffect(() => { api.fetchShowdownData?.(); }, []);
    const set = (patch: Partial<MoveModifiers>) => onChange({ ...value, ...patch });
    const statusMove = category === 'Status';
    const [likeQuery, setLikeQuery] = useState('');
    const sdMoves = (state.sdMoves || {}) as Record<string, any>;
    const likeName = value.behavesLike ? sdMoves[value.behavesLike]?.name || value.behavesLike : '';
    const matches = useMemo(() => {
        const q = likeQuery.trim().toLowerCase();
        if (!q) return [];
        return Object.entries(sdMoves).filter(([, m]) => String(m?.name || '').toLowerCase().includes(q)).slice(0, 8);
    }, [likeQuery, sdMoves]);
    const summary = modifierSummary(value, category, likeName);
    const count = summary.length;
    const setEffect = (i: number, e: ModEffect) => set({ effects: value.effects.map((x, j) => (j === i ? e : x)) });
    const pct = (key: 'drain' | 'recoil' | 'heal', label: string, hint: string) => (
        <label className="mod-pct" title={hint}>
            <span>{label}</span>
            <span className="mod-pct-input">
                <input type="number" min={0} max={100} value={value[key] || ''} placeholder="0" aria-label={`${label} in percent`}
                    onChange={e => set({ [key]: Math.min(100, Math.max(0, Math.round(Number(e.target.value)) || 0)) } as any)} />
                <span>%</span>
            </span>
        </label>
    );
    return (
        <details className="lib-details mod-details" open={count > 0 ? true : undefined}>
            <summary><Icon name="chevron-right" size={14} className="lib-details-mark" />Modifiers<span className="lib-details-count">{count || 'None'}</span></summary>
            <div className="mod-panel">
                <p className="lib-hint">What the move does, with no blocks or code. Blocks and code still run on top.</p>

                <section className="mod-section" aria-label="Effects">
                    <h5>Effects{statusMove ? '' : ' on a hit'}</h5>
                    {value.effects.map((e, i) => (
                        <EffectRow key={i} effect={e} statusMove={statusMove} onChange={next => setEffect(i, next)}
                            onRemove={() => set({ effects: value.effects.filter((_, j) => j !== i) })} />
                    ))}
                    {value.effects.length < 8 && (
                        <div className="mod-presets">
                            {PRESETS.map(([label, e]) => (
                                <button key={label} type="button" className="mod-preset" onClick={() => set({ effects: [...value.effects, { ...e, chance: statusMove ? 100 : e.chance }] })}>
                                    <Icon name="plus" size={12} />{label}
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                <section className="mod-section mod-grid" aria-label="Damage and healing">
                    {statusMove
                        ? pct('heal', 'Heals the user', 'Percent of the user\'s max HP, like Recover (50)')
                        : <>
                            {pct('drain', 'Drains', 'Percent of the damage the user heals, like Giga Drain (50)')}
                            {pct('recoil', 'Recoil', 'Percent of the damage the user takes, like Double-Edge (33)')}
                            <label className="mod-pct">
                                <span>Critical hits</span>
                                <select value={value.crit} onChange={e => set({ crit: e.target.value as CritLevel })}>
                                    {CRITS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                                </select>
                            </label>
                        </>}
                </section>

                <section className="mod-section mod-toggles" aria-label="More">
                    {TOGGLES.filter(([key]) => !statusMove || !['ohko', 'ignoreDefensive', 'ignoreEvasion', 'thawsTarget'].includes(key)).map(([key, label, hint]) => (
                        <label key={key} className="mod-toggle" title={hint}>
                            <input type="checkbox" checked={!!value[key]} onChange={e => set({ [key]: e.target.checked } as any)} />
                            <span>{label}<small>{hint}</small></span>
                        </label>
                    ))}
                </section>

                <section className="mod-section" aria-label="Behaves like">
                    <h5>Behaves like</h5>
                    <p className="lib-hint">Runs a main-game move's own code too, like Pursuit, Sucker Punch or Knock Off. Your numbers and modifiers stay yours.</p>
                    {value.behavesLike ? (
                        <div className="mod-like">
                            <strong>{likeName}</strong>
                            <button type="button" className="btn btn-secondary btn-sm" title="Fill the modifiers from this move's own effects"
                                onClick={() => set({ ...modifiersFromShowdown(sdMoves[value.behavesLike]), behavesLike: value.behavesLike })}>Copy its effects</button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ behavesLike: '' })}>Remove</button>
                        </div>
                    ) : (
                        <div className="mod-like-search">
                            <Icon name="search" size={14} />
                            <input type="search" value={likeQuery} placeholder={Object.keys(sdMoves).length ? 'Search the main-game moves...' : 'The main-game moves are loading...'}
                                aria-label="Search the main-game moves" onChange={e => setLikeQuery(e.target.value)} />
                            {matches.length > 0 && (
                                <div className="mod-like-results" role="listbox">
                                    {matches.map(([id, m]) => (
                                        <button key={id} type="button" role="option" aria-selected={false} onClick={() => { set({ behavesLike: id }); setLikeQuery(''); }}>
                                            <span>{m.name}</span><small>{m.category} · {m.type}</small>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {count > 0 && (
                    <ul className="mod-summary" aria-live="polite">{summary.map((line, i) => <li key={i}>{line}</li>)}</ul>
                )}
            </div>
        </details>
    );
}
