// The multi-hit part of the move editor, under Base Power: a check box, then
// the hit range, the style (normal, or rising power like Triple Axel) and
// whether each hit checks accuracy. The rules are js/features/multihit.ts.

import { MULTIHIT_MAX, multihitSummary, type MultihitSetting, type MultihitStyle } from '../../../features/multihit.ts';

const STYLES: Array<[MultihitStyle, string]> = [['same', 'Normal'], ['rising', 'Like Triple Axel']];

export function MultihitField({ value, basePower, onChange }: { value: MultihitSetting; basePower: unknown; onChange: (next: MultihitSetting) => void }) {
    const set = (patch: Partial<MultihitSetting>) => onChange({ ...value, ...patch });
    const clamp = (raw: unknown, low: number) => {
        const n = Math.trunc(Number(raw));
        return Number.isFinite(n) ? Math.min(MULTIHIT_MAX, Math.max(low, n)) : low;
    };
    // Triple Axel checks accuracy on each hit, so its style turns that on. It stays yours to change.
    const pickStyle = (style: MultihitStyle) => set(style === 'rising'
        ? { style, everyHit: true, ...(value.min === 2 && value.max === 5 ? { min: 3, max: 3 } : {}) }
        : { style, everyHit: false });
    return (
        <div className={`multihit-field${value.on ? ' is-on' : ''}`}>
            <label className="multihit-toggle">
                <input type="checkbox" checked={value.on} onChange={e => set({ on: e.target.checked })} />
                <span>Multi-hit</span>
            </label>
            {value.on && (
                <div className="multihit-panel">
                    <div className="multihit-row">
                        <fieldset className="multihit-range">
                            <legend>Hits</legend>
                            <input type="number" min={2} max={MULTIHIT_MAX} aria-label="Fewest hits" value={value.min}
                                onChange={e => set({ min: e.target.value as unknown as number })}
                                onBlur={e => { const min = clamp(e.target.value, 2); set({ min, max: Math.max(min, clamp(value.max, 2)) }); }} />
                            <span>to</span>
                            <input type="number" min={2} max={MULTIHIT_MAX} aria-label="Most hits" value={value.max}
                                onChange={e => set({ max: e.target.value as unknown as number })}
                                onBlur={e => { const max = clamp(e.target.value, 2); set({ max, min: Math.min(max, clamp(value.min, 2)) }); }} />
                        </fieldset>
                        <div className="multihit-style-wrap">
                            <span className="multihit-label" id="multihit-style-label">Power</span>
                            <div className="segmented multihit-style" role="radiogroup" aria-labelledby="multihit-style-label">
                                {STYLES.map(([id, label]) => (
                                    <button key={id} type="button" role="radio" aria-checked={value.style === id} className={value.style === id ? 'active' : ''} onClick={() => pickStyle(id)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <label className="multihit-toggle multihit-every">
                        <input type="checkbox" checked={value.everyHit} onChange={e => set({ everyHit: e.target.checked })} />
                        <span>Check accuracy on each hit</span>
                    </label>
                    <p className="multihit-summary" aria-live="polite">{multihitSummary({ ...value, min: clamp(value.min, 2), max: Math.max(clamp(value.min, 2), clamp(value.max, 2)) }, basePower)}</p>
                </div>
            )}
        </div>
    );
}
