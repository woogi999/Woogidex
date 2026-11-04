// The custom move, ability and item editors, and the "Add Custom ..." chooser
// the editor opens first. Saving and its rules are js/editor/editor.ts.

import { useState, type ReactNode } from 'react';
import { api, state } from '../../core/app.ts';
import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { Icon } from '../components/Icon.tsx';
import { RegionAssign } from '../components/RegionAssign.tsx';
import { TypeDropdown, useClickAway } from '../components/editor/fields.tsx';
import { CategoryBadge } from '../components/MoveCategory.tsx';
import { FlagPicker } from '../components/editor/FlagPicker.tsx';
import { BattleEffect } from '../components/editor/BattleEffect.tsx';
import { NAME_MAX } from '../../core/data.ts';

/** The editor's header: title, "Add to region", close. */
function Head({ title, regionIds, setRegionIds, close }: { title: string; regionIds: string[]; setRegionIds: (ids: string[]) => void; close: () => void }) {
    return (
        <div className="modal-header">
            <h3>{title}</h3>
            <RegionAssign value={regionIds} onChange={setRegionIds} />
            <button className="modal-close" type="button" onClick={close} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
    );
}

/**
 * The block editor writes to a saved entry, so this saves the dialog first
 * (nothing typed is lost), then opens the blocks for it.
 *   find: the saved entry's id, looked up after the save
 */
function blocksOpener(save: () => string, find: () => string | undefined, open: (id: string) => void, close: () => void) {
    return () => {
        const problem = save();
        if (problem) { api.showToast(problem, 'error'); return; }
        const id = find();
        close();
        if (id) open(id);
    };
}

const byName = (list: any[] | undefined, name: string) =>
    (list || []).find(x => String(x?.name || '').trim().toLowerCase() === name.trim().toLowerCase())?.id;

function Actions({ close, save, label }: { close: () => void; save: () => void; label: string }) {
    return (
        <div className="library-editor-actions">
            <button className="btn btn-secondary" type="button" onClick={close}>Cancel</button>
            <button className="btn btn-primary" type="button" onClick={save}>{label}</button>
        </div>
    );
}

/** Runs a save; a problem is shown and keeps the editor open. */
function saving(run: () => string, close: () => void) {
    return () => {
        const problem = run();
        if (problem) api.showToast(problem, 'error');
        else close();
    };
}

// ---- abilities ----

function CustomAbilityDialog({ id, close }: DialogProps<{ id: string }>) {
    const entry = id ? (state.customAbilities || []).find(x => x.id === id) : null;
    const [name, setName] = useState(entry?.name || '');
    const [desc, setDesc] = useState(entry?.desc || '');
    const [code, setCode] = useState(entry?.rawCode || '');
    const [regionIds, setRegionIds] = useState<string[]>(() => entry ? api.entryRegionIds(entry) : [api.defaultRegionForNewFakemon?.()].filter(Boolean));
    const run = () => api.saveCustomAbility({ id, name, desc, rawCode: code, regionIds });
    const save = saving(run, close);
    const openBlocks = blocksOpener(run, () => id || byName(state.customAbilities, name), api.openAbilityBlockEditor, close);
    return (
        <Modal onClose={close} className="library-editor library-editor-ability">
            <Head title={entry ? 'Edit Custom Ability' : 'Create Custom Ability'} regionIds={regionIds} setRegionIds={setRegionIds} close={close} />
            <div className="form-group">
                <label htmlFor="custom-ability-name">Ability Name</label>
                <input type="text" id="custom-ability-name" maxLength={NAME_MAX} placeholder="e.g., Solar Heart" autoFocus value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
                <label htmlFor="custom-ability-desc">Description</label>
                <textarea id="custom-ability-desc" rows={4} placeholder="Describe what this ability does..." value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <BattleEffect kind="ability" blocks={entry?.blocks} code={code} setCode={setCode} openBlocks={openBlocks} />
            <Actions close={close} save={save} label="Save Ability" />
        </Modal>
    );
}

// ---- items ----

function ItemArtwork({ value, onChange }: { value: string; onChange: (url: string) => void }) {
    const [over, setOver] = useState(false);
    const read = (file?: File | null) => {
        if (!file) return;
        if (!file.type?.startsWith('image/')) { api.showToast('Please use an image file for item artwork.', 'error'); return; }
        const reader = new FileReader();
        reader.onload = () => onChange(String(reader.result));
        reader.readAsDataURL(file);
    };
    let input: HTMLInputElement | null = null;
    return (
        <div className={`artwork-upload-combined custom-item-artwork-zone${over ? ' artwork-drag-over' : ''}`}
            onClick={() => input?.click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
            onDragLeave={e => { e.preventDefault(); setOver(false); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); read(e.dataTransfer.files?.[0]); }}>
            <div className="artwork-preview">{value ? <img src={value} alt="Item artwork" /> : <span className="placeholder">Item</span>}</div>
            <input ref={el => { input = el; }} type="file" accept="image/*" onClick={e => e.stopPropagation()} onChange={e => { read(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="artwork-upload-overlay"><Icon name="upload" size={16} /><span>Click or drag item artwork here</span></div>
        </div>
    );
}

function CustomItemDialog({ id, sampleSetTarget, close }: DialogProps<{ id: string; sampleSetTarget?: { setIndex: number } | null }>) {
    const entry = id ? (state.customItems || []).find(x => x.id === id) : null;
    const [name, setName] = useState(entry?.name || '');
    const [desc, setDesc] = useState(entry?.desc || '');
    const [art, setArt] = useState(entry?.artwork || '');
    const [mega, setMega] = useState(entry?.isMegaStone === true);
    const [code, setCode] = useState(entry?.rawCode || '');
    const [regionIds, setRegionIds] = useState<string[]>(() => entry ? api.entryRegionIds(entry) : [api.defaultRegionForNewFakemon?.()].filter(Boolean));
    const run = () => api.saveCustomItem({ id, name, desc, artwork: art, isMegaStone: mega, rawCode: code, regionIds, sampleSetTarget });
    const save = saving(run, close);
    const openBlocks = blocksOpener(run, () => id || byName(state.customItems, name), api.openItemBlockEditor, close);
    return (
        <Modal onClose={close} className="library-editor library-editor-item">
            <Head title={entry ? 'Edit Custom Item' : 'Create Custom Item'} regionIds={regionIds} setRegionIds={setRegionIds} close={close} />
            <div className="form-group">
                <label htmlFor="custom-item-name">Item Name</label>
                <input type="text" id="custom-item-name" maxLength={NAME_MAX} placeholder="e.g., Moonlit Charm" autoFocus value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
                <label>Artwork</label>
                <ItemArtwork value={art} onChange={setArt} />
            </div>
            <div className="form-group">
                <label htmlFor="custom-item-desc">Description</label>
                <textarea id="custom-item-desc" rows={4} placeholder="Describe what this item does..." value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <label className="custom-item-mega-toggle">
                <input type="checkbox" checked={mega} onChange={e => setMega(e.target.checked)} />
                <span className="custom-item-mega-toggle-copy">
                    <strong>Mega Stone</strong>
                    <span>Mark this item as a Mega Stone for evolution and item pickers.</span>
                </span>
            </label>
            <BattleEffect kind="item" blocks={entry?.blocks} code={code} setCode={setCode} openBlocks={openBlocks} />
            <Actions close={close} save={save} label="Save Item" />
        </Modal>
    );
}

// ---- moves ----

const CATEGORIES = ['Physical', 'Special', 'Status'];

function CategoryPicker({ value, onPick }: { value: string; onPick: (c: string) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useClickAway(open, () => setOpen(false));
    const pill = (c: string) => <CategoryBadge category={c} />;
    return (
        <div className={`cat-dropdown${open ? ' open' : ''}`} ref={ref}>
            <button className="cat-dropdown-trigger" type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}>
                <span className="cat-dropdown-value">{pill(value)}</span>
                <span className="type-dropdown-arrow"><Icon name="chevron-down" size={12} /></span>
            </button>
            <div className="cat-dropdown-menu">
                {CATEGORIES.map(c => <div key={c} className="cat-dropdown-option" onClick={() => { setOpen(false); onPick(c); }}>{pill(c)}</div>)}
            </div>
        </div>
    );
}

function CustomMoveDialog({ index, libraryId, close }: DialogProps<{ index: number | null; libraryId: string }>) {
    const [draft, setDraft] = useState(() => api.customMoveDraft(index, libraryId));
    const set = (patch: object) => setDraft((d: any) => ({ ...d, ...patch }));
    const editing = !!libraryId || index != null;
    const statusOnly = draft.category === 'Status';
    const run = () => api.saveCustomMoveEntry({ index, libraryId, draft });
    const save = saving(run, close);
    const openBlocks = blocksOpener(run, () => libraryId || byName(state.customMoves, draft.name), api.openMoveBlockEditor, close);
    const blocks = libraryId ? (state.customMoves || []).find((m: any) => m.id === libraryId)?.blocks : null;
    const num = (key: string, label: string, min: number, max: number) => (
        <div className="form-group">
            <label>{label}</label>
            <input type="number" min={min} max={max} value={draft[key]} onChange={e => set({ [key]: e.target.value })} />
        </div>
    );
    return (
        <Modal onClose={close} className="library-editor library-editor-move">
            <Head title={editing ? 'Edit Custom Move' : 'Create Custom Move'} regionIds={draft.regionIds} setRegionIds={regionIds => set({ regionIds })} close={close} />
            <div className="form-group">
                <label htmlFor="custom-move-name">Move Name</label>
                <input type="text" id="custom-move-name" maxLength={NAME_MAX} placeholder="e.g., Ember Fang" autoFocus value={draft.name} onChange={e => set({ name: e.target.value })} />
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Type</label>
                    <TypeDropdown id="custom-move-type" value={draft.type} placeholder="Select Type" allowNone={false} onPick={type => set({ type })} />
                </div>
                <div className="form-group">
                    <label>Category</label>
                    <CategoryPicker value={draft.category} onPick={category => set({ category })} />
                </div>
            </div>
            <div className="form-row-3">
                {num('basePower', 'Base Power', 0, 250)}
                {num('accuracy', 'Accuracy', 0, 100)}
                {num('pp', 'PP', 1, 64)}
            </div>
            {num('priority', 'Priority', -7, 5)}
            <div className="form-group">
                <label>Flags</label>
                <FlagPicker value={draft.flags} onChange={flags => set({ flags })} statusOnly={statusOnly} />
            </div>
            <div className="form-group">
                <label htmlFor="custom-move-desc">Description</label>
                <textarea id="custom-move-desc" rows={3} placeholder="Describe what this move does..." value={draft.desc} onChange={e => set({ desc: e.target.value })} />
            </div>
            <BattleEffect kind="move" blocks={blocks} code={draft.rawCode || ''} setCode={rawCode => set({ rawCode })} openBlocks={openBlocks} />
            <Actions close={close} save={save} label="Save Move" />
        </Modal>
    );
}

// ---- "Add Custom Ability / Move": pick one from your library ----

function ChooserDialog({ kind, close }: DialogProps<{ kind: 'ability' | 'move' }>) {
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('name-asc');
    const isAbility = kind === 'ability';
    const items: any[] = api.customEntityChoices(kind, query, sort);
    const make = () => { close(); if (isAbility) api.openCustomAbilityLibraryModal(); else api.openCustomMoveModal(); };
    const empty: ReactNode = query ? 'No custom entries match your search.' : (isAbility ? 'No custom abilities yet.' : 'No custom moves yet.');
    return (
        <Modal onClose={close} title={isAbility ? 'Add Custom Ability' : 'Add Custom Move'} className="custom-entity-chooser" labelledBy="custom-entity-chooser-title">
            <button className="btn btn-primary custom-entity-make" type="button" onClick={make}><Icon name="plus" size={16} />{isAbility ? 'Make a New Ability' : 'Make a New Move'}</button>
            <div className="custom-entity-library-controls">
                <input className="custom-entity-search" type="text" placeholder={isAbility ? 'Search your custom abilities...' : 'Search your custom moves...'} value={query} onChange={e => setQuery(e.target.value)} aria-label="Search" />
                <select className="custom-entity-sort" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
                    <option value="name-asc">Name (A-Z)</option>
                    <option value="name-desc">Name (Z-A)</option>
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                </select>
            </div>
            <div className="custom-entity-chooser-list">
                {items.length ? items.map(item => (
                    <div key={item.id} className="chooser-option" role="button" tabIndex={0}
                        onClick={() => (isAbility ? api.addExistingCustomAbility(item.id) : api.addExistingCustomMove(item.id))}>
                        <div>
                            <strong>{item.name || 'Unnamed'}</strong>
                            {isAbility && item.blocks?.trigger && <> <span className="ability-code-badge" title="Has battle code from the block editor"><Icon name="puzzle" /> Coded</span></>}
                            <span>{isAbility ? (item.desc || 'No description') : `${item.category || 'Status'} · ${item.type || 'Normal'} · ${item.basePower || '-'} BP · ${item.pp || '-'} PP`}</span>
                        </div>
                        <Icon name="plus-circle" />
                    </div>
                )) : <div className="custom-entity-empty">{empty}</div>}
            </div>
        </Modal>
    );
}

registerDialog('custom-ability', CustomAbilityDialog);
registerDialog('custom-item', CustomItemDialog);
registerDialog('custom-move', CustomMoveDialog);
registerDialog('custom-entity-chooser', ChooserDialog);
