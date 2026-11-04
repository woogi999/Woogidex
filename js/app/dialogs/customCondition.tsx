// The custom condition editor (a dialog, like the custom type one):
// a status condition, weather or terrain's name, colour, description and how
// long it lasts, plus its battle effect (blocks or code). It also edits a
// region's own version of a main-game one. Saving and the rules are
// js/features/custom-conditions.ts.

import { useState } from 'react';
import { api } from '../../core/app.ts';
import {
    CONDITION_COLORS, CONDITION_ICON, CONDITION_KINDS, canDeleteCondition, conditionDraft, deleteCondition, saveConditionDraft,
    type ConditionDraft, type ConditionKind
} from '../../features/custom-conditions.ts';
import { entryRegionIds } from '../../features/regions.ts';
import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { Icon } from '../components/Icon.tsx';
import { RegionAssign } from '../components/RegionAssign.tsx';
import { BattleEffect } from '../components/editor/BattleEffect.tsx';

const DURATION_HELP: Record<ConditionKind, string> = {
    status: 'Turns before it wears off by itself. 0 means it stays until something cures it, like Burn.',
    weather: 'Turns it lasts once a move or ability starts it. The main-game weather lasts 5.',
    terrain: 'Turns it lasts once a move or ability starts it. The main-game terrains last 5.'
};

function CustomConditionDialog({ entry, kind, close }: DialogProps<{ entry: any; kind: ConditionKind }>) {
    const [draft, setDraft] = useState<ConditionDraft>(() => conditionDraft(entry, kind));
    const [regionIds, setRegionIds] = useState<string[]>(() => entry ? entryRegionIds(entry) : [api.defaultRegionForNewFakemon?.()].filter(Boolean));
    const set = (patch: Partial<ConditionDraft>) => setDraft(d => ({ ...d, ...patch }));
    const noun = CONDITION_KINDS.find(k => k[0] === draft.kind)![2];
    const vanillaOf = draft.vanillaOf;
    const saved = canDeleteCondition(entry);
    const title = vanillaOf ? `${api.getActiveRegion?.()?.name || 'This region'}'s ${draft.name}` : entry ? `Edit ${noun}` : `New ${noun}`;

    const save = () => {
        const problem = saveConditionDraft(entry, draft, regionIds);
        if (problem) { api.showToast?.(problem, 'error'); return false; }
        return true;
    };
    const remove = async () => { if (await deleteCondition(entry)) close(); };
    // the block editor needs a saved entry to write its code to
    const code = () => {
        if (!save()) return;
        const id = entry?.id || api.getCustomConditions?.(draft.kind).find((c: any) => c.name === draft.name.trim())?.id
            || api.conditionOverride?.(draft.kind, vanillaOf, api.getActiveRegionId?.())?.id;
        close();
        if (id) api.openAbilityBlockEditor?.(id, 'condition');
    };

    return (
        <Modal onClose={close} className="custom-type-modal custom-condition-modal" labelledBy="custom-condition-title">
            <div className="modal-header">
                <h3 id="custom-condition-title">{title}</h3>
                {!vanillaOf && <RegionAssign value={regionIds} onChange={setRegionIds} />}
                <button className="modal-close" type="button" onClick={close} aria-label="Close"><Icon name="x" size={20} /></button>
            </div>
            {!entry && (
                <div className="form-group">
                    <label>What it is</label>
                    <div className="segmented cond-kind" role="radiogroup" aria-label="What it is">
                        {CONDITION_KINDS.map(([k, , one]) => (
                            <button key={k} type="button" role="radio" aria-checked={draft.kind === k} className={draft.kind === k ? 'active' : ''}
                                onClick={() => set({ kind: k, duration: k === 'status' ? 0 : 5 })}>
                                <Icon name={CONDITION_ICON[k]} size={15} />{one.charAt(0).toUpperCase() + one.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className="custom-type-top">
                <div className="form-group">
                    <label htmlFor="custom-condition-name">Name</label>
                    <input type="text" id="custom-condition-name" maxLength={24} placeholder={draft.kind === 'status' ? 'e.g., Frostbite' : draft.kind === 'weather' ? 'e.g., Ashfall' : 'e.g., Haunted Terrain'}
                        value={draft.name} disabled={!!vanillaOf} autoFocus={!vanillaOf} onChange={e => set({ name: e.target.value })} />
                </div>
                <div className="custom-type-preview-cell">
                    <span className="custom-type-preview-label">Preview</span>
                    <div className="custom-type-preview-slot"><span className="cond-preview" style={{ background: draft.color }}><Icon name={CONDITION_ICON[draft.kind]} size={14} />{draft.name.trim() || noun.charAt(0).toUpperCase() + noun.slice(1)}</span></div>
                </div>
            </div>
            <div className="form-group">
                <label>Colour</label>
                <div className="type-color-row">
                    {CONDITION_COLORS.map(hex => (
                        <button key={hex} type="button" className={`color-option${hex === draft.color ? ' selected' : ''}`} style={{ backgroundColor: hex }} aria-label={`Colour ${hex}`} onClick={() => set({ color: hex })} />
                    ))}
                    <label className={`color-option color-option-custom${CONDITION_COLORS.includes(draft.color) ? '' : ' selected'}`} title="Pick any colour"
                        style={{ backgroundColor: CONDITION_COLORS.includes(draft.color) ? 'transparent' : draft.color }}>
                        <Icon name="pipette" />
                        <input type="color" value={draft.color} onChange={e => set({ color: e.target.value })} />
                    </label>
                </div>
            </div>
            <div className="form-group">
                <label htmlFor="custom-condition-desc">What it does</label>
                <textarea id="custom-condition-desc" rows={3} maxLength={300} placeholder="Players read this on the move, ability or post that uses it."
                    value={draft.desc} onChange={e => set({ desc: e.target.value })} />
            </div>
            <div className="form-group">
                <label htmlFor="custom-condition-duration">How long it lasts</label>
                <div className="cond-duration">
                    <input type="number" id="custom-condition-duration" min={0} max={20} value={draft.duration} onChange={e => set({ duration: Number(e.target.value) })} />
                    <span>turns</span>
                </div>
                <p className="custom-type-help">{DURATION_HELP[draft.kind]}</p>
            </div>
            <BattleEffect kind="condition" blocks={saved ? entry.blocks : null} code={draft.rawCode} setCode={rawCode => set({ rawCode })} openBlocks={code} />
            <div className="region-modal-actions custom-type-actions">
                {saved && (
                    <button className="btn btn-secondary region-delete-btn" type="button" onClick={remove}>
                        <Icon name={vanillaOf ? 'rotate-ccw' : 'trash-2'} /><span>{vanillaOf ? 'Use the original' : 'Delete'}</span>
                    </button>
                )}
                <span className="region-modal-spacer" />
                <button className="btn btn-secondary" type="button" onClick={close}>Cancel</button>
                <button className="btn btn-primary" type="button" onClick={() => { if (save()) close(); }}>Save</button>
            </div>
        </Modal>
    );
}

registerDialog('custom-condition', CustomConditionDialog);
