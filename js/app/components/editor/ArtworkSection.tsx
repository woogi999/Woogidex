// The editor's Artwork tab: every picture of the Fakémon, in sets (Official
// Artwork, Sprites, Icon, Concept Art) stacked one under the other, each with
// its actions on the right. Every image has its own credit and description.
// The cry is at the end. The data and actions are in js/editor/art-sets.ts.

import { useEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { api, state } from '../../../core/app.ts';
import {
    ART_ACCEPT, ART_KIND_ORDER, ART_KINDS, MAIN_ART_SET, MAX_CONCEPT_IMAGES, MAX_DESCRIPTION,
    addArtSet, addConceptFiles, artImage, artSetTitle, editorArtSets, fillArtSetCredits, makeMainArtSet, moveArtSet,
    removeArtImage, removeArtSet, renameArtSet, setArtImageFile, setArtImageText, setArtScaling, setScaling,
    type ArtImage, type ArtKind, type ArtSet
} from '../../../editor/art-sets.ts';
import { Icon } from '../Icon.tsx';
import { CommitInput } from '../CommitInput.tsx';
import { EmojiInput } from '../EmojiInput.tsx';
import { useClickAway } from './fields.tsx';
import { Presence } from '../Presence.tsx';
import { removeBackgroundThen } from '../../dialogs/removeBackground.tsx';

const KIND_ICON: Record<ArtKind, string> = { official: 'photo', sprites: 'squares-2x2', icon: 'face-smile', concept: 'pencil' };

/** A textarea that hands its text over on blur, as CommitInput does for one line. */
function CommitTextarea({ value, onCommit, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => { setDraft(value); }, [value]);
    return <textarea {...rest} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onCommit(draft); }} />;
}

/**
 * A credit: one line, with "@na" offering people to tag (EmojiInput's
 * mention list). Hands its text over when focus leaves it or on Enter. The
 * people tagged hear about it only when the Fakémon is published (a
 * database trigger on published_mons).
 */
function CreditInput({ value, onCommit, label, placeholder = 'Credit, e.g. Art by @name' }: { value: string; onCommit: (v: string) => void; label: string; placeholder?: string }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => { setDraft(value); }, [value]);
    const commit = () => { if (draft !== value) onCommit(draft); };
    return (
        <div className="art-credit-input" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit(); }}>
            <EmojiInput singleLine rows={1} value={draft} onChange={setDraft} onSubmit={commit} maxLength={200} placeholder={placeholder} ariaLabel={label} />
        </div>
    );
}

/** Handlers that make an element take a dropped image file. */
function useDrop(onFiles: (files: FileList) => void) {
    const [over, setOver] = useState(false);
    return {
        over,
        props: {
            onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); },
            onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); },
            onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files); }
        }
    };
}

/** One image place in a set: the picture (or a drop target), its size, remove, credit and description. */
function SlotTile({ set, label, slot, image, index, pixel, size }: {
    set: ArtSet; label: string; slot: string; image?: ArtImage; index?: number; pixel?: boolean; size?: [number, number];
}) {
    const input = useRef<HTMLInputElement>(null);
    const [dims, setDims] = useState<[number, number] | null>(null);
    const drop = useDrop(files => setArtImageFile(set.id, slot, files[0], index));
    const off = !!(size && dims && (dims[0] !== size[0] || dims[1] !== size[1]));
    return (
        <div className={`art-slot${image ? ' filled' : ''}${drop.over ? ' drag-over' : ''}${pixel ? ' pixel' : ''}`}
            data-scaling={setScaling(set)}>
            <button type="button" className="art-slot-drop" {...drop.props} onClick={() => input.current?.click()}
                aria-label={image ? `Replace ${label}` : `Upload ${label}`} title={image ? 'Click or drop to replace' : 'Click or drop an image'}>
                {image
                    ? <img key={image.src.length} src={image.src} alt="" onLoad={e => setDims([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
                    : <span className="art-slot-empty"><Icon name="upload" size={16} /><span>Drop or click</span></span>}
            </button>
            <input ref={input} type="file" hidden accept={set.id === MAIN_ART_SET ? 'image/*' : ART_ACCEPT}
                onChange={e => { setArtImageFile(set.id, slot, e.target.files?.[0], index); e.target.value = ''; }} />
            <div className="art-slot-meta">
                <span className="art-slot-label">{label}</span>
                {image && dims && <span className={`art-slot-size${off ? ' off' : ''}`} title={off ? `${size![0]} × ${size![1]} recommended` : undefined}>{dims[0]} × {dims[1]}</span>}
                <Presence show={!!image} inline className="art-slot-remove-wrap">
                    {/* on the device, no upload: js/editor/bg-remove.ts */}
                    <button type="button" className="art-slot-remove" aria-label={`Remove the background of ${label}`} title="Remove background"
                        onClick={() => image && removeBackgroundThen(image.src, file => setArtImageFile(set.id, slot, file, index))}>
                        <Icon name="scissors" size={14} />
                    </button>
                    <button type="button" className="art-slot-remove" onClick={() => removeArtImage(set.id, slot, index)} aria-label={`Remove ${label}`} title="Remove">
                        <Icon name="trash" size={14} />
                    </button>
                </Presence>
            </div>
            <Presence show={!!image}>
                {image && <div className="art-slot-fields">
                    <CreditInput label={`${label} credit`} value={image.credit || ''} onCommit={v => setArtImageText(set.id, slot, 'credit', v, index)} />
                    <CommitTextarea className="art-slot-description" rows={2} maxLength={MAX_DESCRIPTION} placeholder="Description (optional)"
                        aria-label={`${label} description`} value={image.description || ''} onCommit={v => setArtImageText(set.id, slot, 'description', v, index)} />
                </div>}
            </Presence>
        </div>
    );
}

/** Concept art: any number of images, plus a tile to add more. */
function ConceptSlots({ set }: { set: ArtSet }) {
    const input = useRef<HTMLInputElement>(null);
    const drop = useDrop(files => addConceptFiles(set.id, files));
    return (
        <div className="art-slots art-slots-concept">
            {set.images.map((img, i) => <SlotTile key={i} set={set} label={`Image ${i + 1}`} slot="concept" image={img} index={i} />)}
            {set.images.length < MAX_CONCEPT_IMAGES && (
                <div className={`art-slot art-slot-add${drop.over ? ' drag-over' : ''}`}>
                    <button type="button" className="art-slot-drop" {...drop.props} onClick={() => input.current?.click()} aria-label="Add concept art">
                        <span className="art-slot-empty"><Icon name="plus" size={16} /><span>Add images</span></span>
                    </button>
                    <input ref={input} type="file" hidden multiple accept={ART_ACCEPT} onChange={e => { addConceptFiles(set.id, e.target.files); e.target.value = ''; }} />
                </div>
            )}
        </div>
    );
}

function AddSetMenu({ wide }: { wide?: boolean }) {
    const [open, setOpen] = useState(false);
    const ref = useClickAway(open, () => setOpen(false));
    return (
        <div className={`export-as-wrap art-add${wide ? ' wide' : ''}`} ref={ref}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu">
                <Icon name="plus" /><span>Add artwork set</span>
            </button>
            {open && (
                <div className="export-as-menu art-add-menu" role="menu" style={{ display: 'block' }}>
                    {ART_KIND_ORDER.map(kind => (
                        <button key={kind} className="export-as-menu-item" type="button" role="menuitem" onClick={() => { setOpen(false); addArtSet(kind); }}>
                            <Icon name={KIND_ICON[kind]} size={15} /><span>{ART_KINDS[kind].title}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/** One credit for every image in the set that has none yet. */
function CreditAll({ set }: { set: ArtSet }) {
    const [text, setText] = useState('');
    const missing = set.images.filter(i => !i.credit).length;
    const apply = () => { fillArtSetCredits(set.id, text); setText(''); };
    return (
        <Presence show={set.images.length >= 2 && missing > 0} className="art-credit-all-wrap">
        <div className="art-credit-all">
            <span className="art-credit-all-label">Credit all {missing} uncredited</span>
            <div>
                <div className="art-credit-input">
                    <EmojiInput singleLine rows={1} value={text} onChange={setText} onSubmit={() => { if (text.trim()) apply(); }} maxLength={200}
                        placeholder="Art by @name" ariaLabel={`Credit all ${missing} uncredited`} />
                </div>
                <button className="btn btn-secondary btn-sm" type="button" disabled={!text.trim()} onClick={apply}>Apply</button>
            </div>
        </div>
        </Presence>
    );
}

function SetBlock({ set, sets }: { set: ArtSet; sets: ArtSet[] }) {
    const info = ART_KINDS[set.kind];
    const main = set.id === MAIN_ART_SET;
    const extras = sets.slice(1);
    const at = extras.findIndex(s => s.id === set.id);
    const title = artSetTitle(set, sets);
    return (
        <section className={`art-set art-set-${set.kind}`} aria-label={title}>
            <div className="art-set-body">
                {set.kind === 'concept'
                    ? <ConceptSlots set={set} />
                    : (
                        <div className={`art-slots art-slots-${set.kind}`}>
                            {info.slots.map(([slot, label]) => <SlotTile key={slot} set={set} slot={slot} label={label} image={artImage(set, slot)} pixel={info.pixel} size={info.size} />)}
                        </div>
                    )}
            </div>
            <aside className="art-set-side">
                {main
                    ? <div className="art-set-name">Official Artwork</div>
                    : <CommitInput type="text" className="art-set-label" maxLength={40} aria-label="Set name"
                        placeholder={artSetTitle({ ...set, label: '' }, sets)} value={set.label || ''} onCommit={v => renameArtSet(set.id, v)} />}
                <p className="art-set-hint">{main ? 'Shows on your cards, the Pokédex board and in battles. ' : ''}{info.hint}</p>
                <ScalingSwitch set={set} />
                {!main && (
                    <div className="art-set-actions">
                        {set.kind === 'official' && (
                            <button className="btn btn-secondary btn-sm" type="button" onClick={() => makeMainArtSet(set.id)} title="Show this set on cards and the Pokédex board">
                                <Icon name="star" /><span>Make main</span>
                            </button>
                        )}
                        {extras.length > 1 && (
                            <span className="art-set-move">
                                <button className="btn btn-secondary btn-icon btn-sm" type="button" disabled={at <= 0} onClick={() => moveArtSet(set.id, -1)} aria-label="Move set up" title="Move up"><Icon name="chevron-up" /></button>
                                <button className="btn btn-secondary btn-icon btn-sm" type="button" disabled={at >= extras.length - 1} onClick={() => moveArtSet(set.id, 1)} aria-label="Move set down" title="Move down"><Icon name="chevron-down" /></button>
                            </span>
                        )}
                        <button className="btn btn-secondary btn-icon btn-sm art-set-delete" type="button" onClick={() => removeArtSet(set.id)} aria-label={`Delete ${title}`} title="Delete set"><Icon name="trash" /></button>
                    </div>
                )}
                <CreditAll set={set} />
            </aside>
        </section>
    );
}

function CryField() {
    const input = useRef<HTMLInputElement>(null);
    const has = !!state.cryData;
    return (
        <div className="cry-row">
            <Icon name="volume-2" size={18} />
            <div className="cry-row-text">
                <strong>{has ? 'Cry uploaded' : 'No cry yet'}</strong>
                <small>Audio, up to 2 MB</small>
            </div>
            <input ref={input} type="file" id="cry-upload" hidden accept="audio/*" onChange={e => { api.processPokemonCryFile(e.target.files?.[0]); e.target.value = ''; }} />
            {has && <button className="btn btn-secondary btn-sm" type="button" onClick={e => api.playPokemonCry(e)}><Icon name="play" /><span>Play</span></button>}
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => input.current?.click()}><Icon name="upload" /><span>{has ? 'Replace' : 'Upload'}</span></button>
            {has && <button className="btn btn-secondary btn-icon btn-sm" type="button" onClick={e => api.removePokemonCry(e)} aria-label="Remove cry" title="Remove cry"><Icon name="trash" /></button>}
        </div>
    );
}

/**
 * One set's scaling: Sharp (nearest neighbour, keeps pixel art crisp, the
 * default) or Smooth (anti-aliased, like most sites). Two equal halves that
 * fill the side column, so it stays easy to tap on a phone.
 */
function ScalingSwitch({ set }: { set: ArtSet }) {
    const value = setScaling(set);
    return (
        <div className="art-scaling" role="radiogroup" aria-label={`Scaling for ${set.label || 'this set'}`}>
            <span className="art-scaling-label">Scaling</span>
            <div className="art-scaling-options">
                {([['pixel', 'Sharp', 'Best for pixel art'], ['smooth', 'Smooth', 'Best for painted art']] as const).map(([key, label, hint]) => (
                    <button key={key} type="button" role="radio" aria-checked={value === key} className={value === key ? 'active' : ''}
                        onClick={() => setArtScaling(set.id, key)}>
                        <strong>{label}</strong>
                        <small>{hint}</small>
                    </button>
                ))}
            </div>
        </div>
    );
}

export function ArtworkSection() {
    const sets = editorArtSets();
    return (
        <div className="art-tab">
            <div className="art-tab-head">
                <p className="field-hint art-rule">Every image must be drawn by a person. AI-generated images are not allowed on Woogidex.</p>
                <AddSetMenu />
            </div>
            <div className="art-sets-stack">
                {sets.map(set => <SetBlock key={set.id} set={set} sets={sets} />)}
            </div>
            <AddSetMenu wide />
            <h3 className="art-section-title">Cry</h3>
            <CryField />
        </div>
    );
}
