// What a quick command shows in the palette (js/app/shell/QuickSearch.tsx):
// types as the site's type pills with their icons, move categories as the
// category badges, a damage calc as a card with HP bars, and a sum as a big
// answer. The data is js/features/commands-model.ts.

import { TYPE_ICON_FILES } from '../../features/custom-types.ts';
import type { CalcOut, Result, Row, TypeGroup } from '../../features/commands-model.ts';
import { CategoryBadge } from '../components/MoveCategory.tsx';
import { Icon } from '../components/Icon.tsx';

/** Each command's icon in the list under the box. */
export const COMMAND_ICONS: Record<string, string> = {
    ms: 'magnifying-glass', ds: 'book-open', dt: 'information-circle', weakness: 'shield-exclamation',
    coverage: 'bolt', learn: 'academic-cap', randpoke: 'sparkles', calc: 'calculator', bulk: 'scale'
};

/** A type pill with the type's symbol in it. */
export function QsType({ type }: { type: string }) {
    const key = type.toLowerCase();
    return (
        <span className={`type-pill type-${key} qs-type`}>
            {TYPE_ICON_FILES.has(key) && <img src={`assets/types/${key}.svg`} alt="" draggable={false} />}
            {type}
        </span>
    );
}

const Types = ({ types }: { types?: string[] }) => types?.length ? <span className="qs-types">{types.map(t => <QsType key={t} type={t} />)}</span> : null;

const STAT_KEYS = [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']] as const;

/** One result row: a move or a Pokémon with its pills, or plain text. */
export function CommandRow({ row }: { row: Row }) {
    if (row.kind === 'move' && row.types) {
        return (
            <span className="qs-row">
                <span className="qs-row-main"><span className="gs-title">{row.title}</span></span>
                <span className="qs-row-tags">
                    <QsType type={row.types[0]} />
                    <CategoryBadge category={row.category} iconOnly />
                    <span className="qs-num" title="Base power">{row.basePower || '—'}<small>BP</small></span>
                    <span className="qs-num" title="Accuracy">{row.accuracy === true || row.accuracy == null ? '—' : row.accuracy}<small>{row.accuracy === true || row.accuracy == null ? '' : '%'}</small></span>
                </span>
            </span>
        );
    }
    if (row.kind === 'mon' && row.stats) {
        const s = row.stats;
        const total = s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
        return (
            <span className="qs-row">
                <span className="qs-row-main">
                    <span className="gs-title">{row.title}</span>
                    <span className="qs-stats">{STAT_KEYS.map(([k, label]) => <span key={k}><small>{label}</small>{s[k]}</span>)}<span className="qs-bst"><small>BST</small>{total}</span></span>
                </span>
                <span className="qs-row-tags"><Types types={row.types} /></span>
            </span>
        );
    }
    return <span className="gs-text"><span className="gs-title">{row.title}</span>{row.sub && <span className="gs-sub">{row.sub}</span>}</span>;
}

function Groups({ groups }: { groups: TypeGroup[] }) {
    return (
        <div className="qs-groups">
            {groups.map(g => (
                <div key={g.label} className={`qs-group is-${g.tone || 'neutral'}`}>
                    <span className="qs-group-label">{g.label}</span>
                    <span className="qs-types">{g.types.length ? g.types.map(t => <QsType key={t} type={t} />) : <span className="qs-none">None</span>}</span>
                </div>
            ))}
        </div>
    );
}

const pct = (n: number) => (Math.round(n * 10) / 10).toString();

function CalcCard({ calc, note }: { calc: CalcOut; note?: string }) {
    return (
        <div className="qs-calc">
            <div className="qs-calc-sides">
                <div className="qs-calc-side">
                    <span className="qs-calc-label">{calc.attacker.label}</span>
                    <span className="qs-calc-name">{calc.attacker.name}</span>
                    <Types types={calc.attacker.types} />
                </div>
                <div className="qs-calc-move">
                    <span className="qs-calc-name">{calc.move.name}</span>
                    <span className="qs-types"><QsType type={calc.move.type} /><CategoryBadge category={calc.move.category} iconOnly /></span>
                    <span className="qs-calc-label">{calc.move.basePower} BP · ×{calc.eff}{calc.stab > 1 ? ` · STAB ×${calc.stab}` : ''}</span>
                </div>
                <div className="qs-calc-side is-defender">
                    {calc.defender.label && <span className="qs-calc-label">{calc.defender.label}</span>}
                    <span className="qs-calc-name">{calc.defender.name}</span>
                    <Types types={calc.defender.types} />
                </div>
            </div>
            {calc.immune
                ? <p className="qs-calc-immune"><Icon name="no-symbol" size={16} /> No effect: {calc.immune}.</p>
                : calc.rolls.map(r => (
                    <div key={r.label} className="qs-roll">
                        <div className="qs-roll-head">
                            <span className="qs-roll-label">{r.label}</span>
                            <span className={`qs-roll-ko${/OHKO/.test(r.ko) ? ' is-ko' : ''}`}>{r.ko}</span>
                        </div>
                        {/* the bar is the defender's HP: dark for the least a hit does, light up to the most */}
                        <div className="qs-hp" role="img" aria-label={`${pct(r.loPct)}% to ${pct(r.hiPct)}% of its HP`}>
                            <span className="qs-hp-max" style={{ width: `${Math.min(100, r.hiPct)}%` }} />
                            <span className="qs-hp-min" style={{ width: `${Math.min(100, r.loPct)}%` }} />
                        </div>
                        <div className="qs-roll-nums"><strong>{pct(r.loPct)}% – {pct(r.hiPct)}%</strong><span>{r.lo}–{r.hi} of {r.hp} HP</span></div>
                    </div>
                ))}
            {note && <p className="qs-note">{note}</p>}
        </div>
    );
}

/** Everything above the rows: a sum, a calc, type groups, or plain lines. */
export function CommandBody({ out }: { out: Result }) {
    if (out.math) {
        return (
            <div className="qs-math">
                <span className="qs-math-expr">{out.math.expr} =</span>
                <output className="qs-math-value">{out.math.value}</output>
            </div>
        );
    }
    if (out.calc) return <CalcCard calc={out.calc} note={out.note} />;
    if (out.typeGroups) return <Groups groups={out.typeGroups} />;
    return <>{(out.lines || []).map((l, i) => <p key={i} className="qs-cmd-line">{l}</p>)}</>;
}
