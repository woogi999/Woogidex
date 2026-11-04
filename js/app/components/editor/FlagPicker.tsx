// The flags of a custom move (js/features/move-flags.ts): the game's and the
// ones people make up. Search, sort, a toggle with its meaning for each flag,
// and new, edit and delete for your own.

import { useState } from 'react';
import { useStore } from '../../store.ts';
import { Icon } from '../Icon.tsx';
import { confirmDialog } from '../../../core/confirm-dialog.ts';
import { FLAG_COLORS, allFlags, createCustomFlag, deleteCustomFlag, flagUsage, updateCustomFlag, type FlagDef } from '../../../features/move-flags.ts';

type Sort = 'builtin' | 'az' | 'used';
// only a status move can be bounced back or snatched
const STATUS_ONLY = new Set(['reflectable', 'snatch']);
// the move editor sets this one with its own Multi-hit field
const HIDDEN = new Set(['multihit']);

interface Props {
    value: Record<string, boolean>;
    onChange: (flags: Record<string, boolean>) => void;
    statusOnly: boolean;
}

export function FlagPicker({ value, onChange, statusOnly }: Props) {
    useStore();
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<Sort>('builtin');
    // the form: a new flag ('new'), a flag's key being edited, or closed
    const [form, setForm] = useState<string | null>(null);
    const usage = flagUsage();
    const q = query.trim().toLowerCase();

    const flags = (() => {
        const list = allFlags().filter(f => !HIDDEN.has(f.key) && (statusOnly || !STATUS_ONLY.has(f.key)))
            .filter(f => !q || f.label.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q) || f.key.includes(q));
        if (sort === 'az') list.sort((a, b) => a.label.localeCompare(b.label));
        else if (sort === 'used') list.sort((a, b) => (usage.get(b.key) || 0) - (usage.get(a.key) || 0) || a.label.localeCompare(b.label));
        return list;
    })();

    const toggle = (key: string) => onChange({ ...value, [key]: !value[key] });
    const on = Object.keys(value).filter(k => value[k] && !HIDDEN.has(k)).length;

    return (
        <div className="flag-picker">
            <div className="flag-picker-bar">
                <div className="flag-picker-search">
                    <Icon name="magnifying-glass" size={15} />
                    <input type="search" placeholder="Search flags" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search flags" />
                </div>
                <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort flags">
                    <option value="builtin">Game flags first</option>
                    <option value="az">A to Z</option>
                    <option value="used">Most used</option>
                </select>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(form === 'new' ? null : 'new')}>
                    <Icon name="plus" size={14} /> New flag
                </button>
            </div>
            {form === 'new' && (
                <FlagForm onCancel={() => setForm(null)} onSave={(label, desc, color) => {
                    const flag = createCustomFlag(label, desc, color);
                    if (!flag) return;
                    setForm(null);
                    onChange({ ...value, [flag.key]: true });
                }} />
            )}
            <p className="flag-picker-count">{on ? `${on} on` : 'None on'}{q && ` · ${flags.length} match${flags.length === 1 ? '' : 'es'}`}</p>
            <ul className="flag-list">
                {flags.map(f => form === f.key ? (
                    <li key={f.key}>
                        <FlagForm flag={f} onCancel={() => setForm(null)} onSave={(label, desc, color) => { updateCustomFlag(f.key, { label, desc, color }); setForm(null); }} />
                    </li>
                ) : (
                    <li key={f.key} className={`flag-row${value[f.key] ? ' is-on' : ''}`}>
                        <button type="button" className="flag-toggle" role="switch" aria-checked={!!value[f.key]} onClick={() => toggle(f.key)}>
                            <span className="flag-check" aria-hidden="true">{value[f.key] && <Icon name="check" size={13} />}</span>
                            <span className="flag-text">
                                <span className="flag-name">
                                    {f.custom && <span className="flag-dot" style={{ background: f.color }} aria-hidden="true" />}
                                    {f.label}
                                    {f.custom && <span className="flag-tag">yours</span>}
                                    {(usage.get(f.key) || 0) > 0 && <span className="flag-used">{usage.get(f.key)} move{usage.get(f.key) === 1 ? '' : 's'}</span>}
                                </span>
                                {f.desc && <span className="flag-desc">{f.desc}</span>}
                            </span>
                        </button>
                        {f.custom && (
                            <span className="flag-tools">
                                <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label={`Edit ${f.label}`} title="Edit" onClick={() => setForm(f.key)}><Icon name="pencil" size={14} /></button>
                                <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label={`Delete ${f.label}`} title="Delete" onClick={async () => {
                                    const n = usage.get(f.key) || 0;
                                    const yes = await confirmDialog({ title: `Delete "${f.label}"?`, message: n ? `It comes off the ${n} custom move${n === 1 ? '' : 's'} that ${n === 1 ? 'has' : 'have'} it.` : 'No move has it yet.' });
                                    if (!yes) return;
                                    deleteCustomFlag(f.key);
                                    if (value[f.key]) { const { [f.key]: _, ...rest } = value; onChange(rest); }
                                }}><Icon name="trash-2" size={14} /></button>
                            </span>
                        )}
                    </li>
                ))}
                {!flags.length && <li className="flag-empty">No flag matches &ldquo;{query.trim()}&rdquo;. Make it with New flag.</li>}
            </ul>
        </div>
    );
}

function FlagForm({ flag, onSave, onCancel }: { flag?: FlagDef; onSave: (label: string, desc: string, color: string) => void; onCancel: () => void }) {
    const [label, setLabel] = useState(flag?.label || '');
    const [desc, setDesc] = useState(flag?.desc || '');
    const [color, setColor] = useState(flag?.color || FLAG_COLORS[0]);
    const save = () => { if (label.trim()) onSave(label, desc, color); };
    return (
        <div className="flag-form" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
            <input type="text" placeholder="Flag name, like Lunar" maxLength={32} value={label} autoFocus aria-label="Flag name"
                onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
            <input type="text" placeholder="What it means (optional)" maxLength={140} value={desc} aria-label="What the flag means" onChange={e => setDesc(e.target.value)} />
            <div className="flag-colors" role="radiogroup" aria-label="Color">
                {FLAG_COLORS.map(c => (
                    <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c} className={`flag-color${c === color ? ' is-on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
                ))}
            </div>
            <div className="flag-form-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" disabled={!label.trim()} onClick={save}>{flag ? 'Save' : 'Add flag'}</button>
            </div>
        </div>
    );
}
