// The universal moves dialog: the global list, or one region's own list.
// A list is Woogidex's own, one generation's universal TMs, or moves you
// tick yourself (and a region can also follow the global list). The data
// and the rules are js/features/universal-moves.ts.

import { useMemo, useState } from 'react';
import { api, state } from '../../core/app.ts';
import { registerDialog, openDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { regionById } from '../../features/regions.ts';
import {
    GENS, UNIVERSAL_BY_GEN, WOOGIDEX_LIST, globalUniversal, movesOf, regionUniversal, saveUniversal, universalSummary,
    type UniversalMode, type UniversalSetting
} from '../../features/universal-moves.ts';

const MODE_LABEL: Record<UniversalMode, string> = { global: 'Global list', woogidex: "Woogidex's list", gen: 'A generation', custom: 'Choose' };

function UniversalMovesDialog({ regionId = null, close }: DialogProps<{ regionId?: string | null }>) {
    const region = regionId ? regionById(regionId) : null;
    const start = region ? regionUniversal(region.id) : globalUniversal();
    const [mode, setMode] = useState<UniversalMode>(start.mode);
    const [gen, setGen] = useState(start.gen || 9);
    // a new custom list starts from what the list gives now
    const [picked, setPicked] = useState(() => new Set(start.mode === 'custom' ? start.moves : movesOf(start)));
    const [query, setQuery] = useState('');
    const [onlyPicked, setOnlyPicked] = useState(false);
    const modes: UniversalMode[] = region ? ['global', 'gen', 'custom'] : ['woogidex', 'gen', 'custom'];
    const all = useMemo(() => Object.entries<any>(state.sdMoves || {})
        .filter(([, v]) => v && !v.isZ && !v.isMax && v.nonstandard !== 'CAP')
        .sort((a, b) => String(a[1].name).localeCompare(String(b[1].name))), []);
    const q = query.trim().toLowerCase();
    const shown = all.filter(([id, v]) => (!onlyPicked || picked.has(id)) && (!q || String(v.name).toLowerCase().includes(q) || id.includes(q)));
    const setting: UniversalSetting = { mode, gen, moves: [...picked] };
    const preview = mode === 'custom' ? [] : movesOf(setting).map(id => state.sdMoves?.[id]?.name || id);
    const toggle = (id: string, on: boolean) => setPicked(prev => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n; });
    const fill = (ids: string[]) => setPicked(new Set(ids));
    return (
        <Modal onClose={close} title={region ? `Universal moves in ${region.name}` : 'Universal moves'} className="region-picker-modal universal-modal" labelledBy="universal-title">
            <p className="region-details-help">
                {region
                    ? `The moves Browse Moves offers as universal for Fakémon in ${region.name}. They go in as TMs.`
                    : 'The moves Browse Moves offers as universal, for every Fakémon outside a region with its own list. They go in as TMs.'}
            </p>
            <div className="seg universal-modes" role="group" aria-label="Where the list comes from">
                {modes.map(m => <button key={m} type="button" className={`seg-btn${mode === m ? ' on' : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>)}
            </div>
            {mode === 'gen' && (
                <div className="form-group universal-gen">
                    <label htmlFor="universal-gen">Generation</label>
                    <select id="universal-gen" value={gen} onChange={e => setGen(Number(e.target.value))}>
                        {GENS.map(g => <option key={g} value={g}>Generation {g} ({UNIVERSAL_BY_GEN[g].length} moves)</option>)}
                    </select>
                </div>
            )}
            {mode !== 'custom' && (
                <p className="universal-preview">
                    {mode === 'global' && region ? <><strong>{universalSummary(globalUniversal())}:</strong> </> : null}
                    {preview.join(', ') || 'No moves.'}
                </p>
            )}
            {mode === 'custom' && (
                <>
                    <div className="region-picker-tools">
                        <input type="search" placeholder="Search moves..." aria-label="Search moves" value={query} autoFocus onChange={e => setQuery(e.target.value)} />
                        <label className="universal-only"><input type="checkbox" checked={onlyPicked} onChange={e => setOnlyPicked(e.target.checked)} /> Chosen only</label>
                        <select aria-label="Start from a list" value="" onChange={e => {
                            const v = e.target.value;
                            if (v === 'woogidex') fill(WOOGIDEX_LIST);
                            else if (v === 'global') fill(movesOf(globalUniversal()));
                            else if (v === 'none') fill([]);
                            else if (v) fill(UNIVERSAL_BY_GEN[Number(v)] || []);
                        }}>
                            <option value="">Start from...</option>
                            <option value="woogidex">Woogidex's list</option>
                            {region && <option value="global">The global list</option>}
                            {GENS.map(g => <option key={g} value={g}>Generation {g}</option>)}
                            <option value="none">Nothing</option>
                        </select>
                    </div>
                    <div className="region-picker-list">
                        {shown.length ? shown.map(([id, v]) => (
                            <label className="region-picker-row" key={id}>
                                <input type="checkbox" checked={picked.has(id)} onChange={e => toggle(id, e.target.checked)} />
                                <span>{v.name}</span><small>{v.type || ''} · {v.category || ''}</small>
                            </label>
                        )) : <p className="region-picker-empty">{all.length ? 'Nothing matches.' : 'The move list is still loading. Try again in a moment.'}</p>}
                    </div>
                </>
            )}
            <div className="region-modal-actions">
                {mode === 'custom' && <span className="region-picker-count">{picked.size} chosen</span>}
                {region && <button className="btn btn-secondary btn-sm" type="button" onClick={() => { close(); openDialog('universal-moves', { regionId: null }); }}>Edit the global list</button>}
                <span className="region-modal-spacer" />
                <button className="btn btn-secondary" type="button" onClick={close}>Cancel</button>
                <button className="btn btn-primary" type="button" onClick={() => { saveUniversal(region ? region.id : null, setting); api.renderCollection?.(); close(); }}>Save</button>
            </div>
        </Modal>
    );
}

registerDialog('universal-moves', UniversalMovesDialog);

/** Opens the dialog for a region's list, or the global one (null). */
export async function openUniversalMoves(regionId: string | null = null) {
    // the list of every move loads lazily (Showdown's data)
    await api.fetchShowdownData?.();
    openDialog('universal-moves', { regionId });
}
