// The tier maker, the first app of the Toolbox: rank Fakémon, Pokémon,
// pictures or plain words into tiers, write why, see what moved since the
// version you opened, save the board as a picture, post it, and export
// Showdown's formats-data.ts. Open it from the Toolbox page (/toolbox), a
// group's Toolbox tab, a chat (the trophy button, or a list someone sent),
// or a post. The model is js/features/tier-lists.ts.
//
// Moving a mon: drag it (mouse or finger) onto a tier, or tap it and pick a
// tier in its panel (keyboard and screen readers use the panel too).

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, state } from '../../core/app.ts';
import { registerDialog, openDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { Icon } from '../components/Icon.tsx';
import { useStore } from '../store.ts';
import { effectiveZoom } from '../../core/ui-scale.ts';
import { loadHtml2canvas } from '../../core/vendor.ts';
import { ShieldedArt } from '../components/ShieldedArt.tsx';
import {
    MAX_IMAGES, SD_TIERS, UNRANKED, addMons, addTier, applyPlacement, averageList, changelog, cleanTierList, collectionMons, deleteTierList,
    exportFormatsData, exportText, importText, monChoices, monsFromSaveFile, moveMon, moveTier, newTierList, placementOf, removeMon, removeTier,
    saveTierList, savedTierLists, sendTierList, snapshot, tierOf, type TierList, type TierMon
} from '../../features/tier-lists.ts';

/** A picture for a picture item: 96px at most, small enough that a list still fits a post. */
async function smallPicture(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 96 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (const q of [0.8, 0.6, 0.45]) {
        const uri = canvas.toDataURL('image/webp', q);
        const out = uri.startsWith('data:image/webp') ? uri : canvas.toDataURL('image/jpeg', q);
        if (out.length <= 11500) return out;
    }
    throw new Error('That picture is too detailed to keep small.');
}

function download(name: string, text: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** One mon on the board. */
function Chip({ list, id, onPick, onDragStart }: { list: TierList; id: string; onPick: () => void; onDragStart: (e: React.PointerEvent) => void }) {
    const m = list.mons[id];
    const before = list.baseline?.[id];
    const now = tierOf(list, id);
    const order = list.tiers.map(t => t.name);
    const rank = (n?: string) => (n ? order.indexOf(n) : order.length);
    const moved = before !== undefined && before !== now;
    const up = moved && rank(now) < rank(before);
    return (
        <button type="button" className={`tm-chip${m.from === 'fakemon' ? ' is-fakemon' : ''}${m.img ? ' has-img' : ''}${moved ? (up ? ' is-up' : ' is-down') : ''}`} data-mon={id}
            onClick={onPick} onPointerDown={onDragStart} title={[m.name, m.note, moved ? `Was ${before || 'Unranked'}` : ''].filter(Boolean).join(' · ')}>
            {/* people's pictures go through the art shield, as every shared picture does */}
            {m.img && <ShieldedArt src={m.img} alt={m.name} className="tm-chip-img" />}
            <span className="tm-chip-name">{m.name}</span>
            {moved && <Icon name={up ? 'arrow-up' : 'arrow-down'} size={12} className="tm-chip-move" aria-label={up ? 'Rose' : 'Dropped'} />}
            {m.note && <Icon name="chat-bubble-left" size={12} className="tm-chip-note" aria-label="Has a note" />}
        </button>
    );
}

/**
 * A tier list opened from a group's Toolbox (js/features/groups.ts). In
 * "everyone" mode each member also saves an own ranking, and anyone can see
 * the group's average.
 */
export interface GroupContext { id: string; name: string; rowId: string | null; canEdit: boolean; mode?: 'curated' | 'everyone' }

function TierMakerDialog({ close, list: start, conversationId = null, group = null }: DialogProps<{ list?: TierList; conversationId?: string | null; group?: GroupContext | null }>) {
    useStore();
    const [list, setList] = useState<TierList>(() => start ? (cleanTierList(start) || newTierList()) : newTierList());
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState<string | null>(null);
    const [showChanges, setShowChanges] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importBox, setImportBox] = useState('');
    const [sendTo, setSendTo] = useState(conversationId || '');
    const [dirty, setDirty] = useState(false);
    const board = useRef<HTMLDivElement>(null);
    const change = (next: TierList) => { setList(next); setDirty(true); };
    const results = useMemo(() => monChoices(query, 20), [query]);
    const changes = changelog(list);
    const chats = (api.messagingState?.().conversations || []) as any[];

    // ---- drag a chip to a tier ----
    const drag = useRef<{ id: string; x: number; y: number; ghost: HTMLElement | null; moved: boolean } | null>(null);
    useEffect(() => () => { drag.current?.ghost?.remove(); }, []);
    const startDrag = (id: string) => (e: React.PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        drag.current = { id, x: e.clientX, y: e.clientY, ghost: null, moved: false };
        const move = (ev: PointerEvent) => {
            const d = drag.current;
            if (!d) return;
            if (!d.moved) {
                if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return;
                d.moved = true;
                const g = document.createElement('div');
                g.className = 'tm-ghost';
                g.textContent = list.mons[id]?.name || id;
                document.body.appendChild(g);
                d.ghost = g;
            }
            ev.preventDefault();
            // near the board's top or bottom edge, the board scrolls
            const edge = board.current?.getBoundingClientRect();
            if (edge && board.current) {
                if (ev.clientY < edge.top + 40) board.current.scrollTop -= 14;
                else if (ev.clientY > edge.bottom - 40) board.current.scrollTop += 14;
            }
            // pointer numbers are window pixels; the transform is CSS pixels (js/core/ui-scale.ts)
            const z = effectiveZoom(document.documentElement);
            d.ghost!.style.transform = `translate(${(ev.clientX + 8) / z}px, ${(ev.clientY + 8) / z}px)`;
            board.current?.querySelectorAll('.tm-row.is-over').forEach(el => el.classList.remove('is-over'));
            (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tm-row') as HTMLElement | null)?.classList.add('is-over');
        };
        const up = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            const d = drag.current;
            drag.current = null;
            board.current?.querySelectorAll('.tm-row.is-over').forEach(el => el.classList.remove('is-over'));
            if (!d?.moved) return;
            d.ghost?.remove();
            const at = document.elementFromPoint(ev.clientX, ev.clientY);
            const row = at?.closest<HTMLElement>('[data-tier]');
            if (!row) return;
            const before = at?.closest<HTMLElement>('[data-mon]')?.dataset.mon || null;
            change(moveMon(list, id, row.dataset.tier!, before && before !== id ? before : null));
            // the click that ends a drag must not open the panel
            const stop = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
            window.addEventListener('click', stop, { capture: true, once: true });
            setTimeout(() => window.removeEventListener('click', stop, true), 0);
        };
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    };

    const save = () => { saveTierList(list); setDirty(false); api.showToast?.('Tier list saved on this device.', 'success'); };
    // a group list: the version saved now is the next version's baseline, as with a chat
    const [rowId, setRowId] = useState(group?.rowId || null);
    const saveToGroup = async () => {
        if (!group) return;
        const id = await api.saveToolboxItem(group.id, list, rowId, group.mode || 'curated');
        if (id) { setRowId(id); setList({ ...list, baseline: snapshot(list) }); setDirty(false); }
    };
    // "everyone" mode: your own ranking, and the group's average
    const everyone = group?.mode === 'everyone' && !!rowId;
    const [viewing, setViewing] = useState<'mine' | 'average'>('mine');
    const [base] = useState(list);
    useEffect(() => {
        if (!everyone || !state.user) return;
        api.loadRankings(rowId).then((rows: any[]) => {
            const mine = rows.find(r => r.user_id === state.user?.id);
            if (mine) setList(l => applyPlacement(l, mine.placed));
        });
    }, [everyone, rowId]);
    const showAverage = async () => {
        const rows = await api.loadRankings(rowId);
        if (!rows.length) { api.showToast?.('Nobody has ranked it yet.', 'info'); return; }
        setViewing('average');
        setList(averageList(base, rows));
    };
    /** The board as a PNG, as TierMaker's "save image". */
    const saveImage = async () => {
        const el = board.current;
        if (!el) return;
        try {
            const html2canvas = await loadHtml2canvas();
            const canvas = await html2canvas(el, { backgroundColor: getComputedStyle(document.body).backgroundColor, scale: 2 });
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `${(list.title || 'tier-list').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.png`;
            a.click();
        } catch { api.showToast?.('Couldn’t make the picture.', 'error'); }
    };
    const pictures = useRef<HTMLInputElement>(null);
    const saveFile = useRef<HTMLInputElement>(null);
    const addPictures = async (files: FileList | null) => {
        const added: TierMon[] = [];
        for (const f of Array.from(files || []).filter(f => f.type.startsWith('image/')).slice(0, MAX_IMAGES)) {
            try { added.push({ id: '', name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40), from: 'image', img: await smallPicture(f) }); }
            catch (e: any) { api.showToast?.(`${f.name}: ${e?.message || 'could not read it'}`, 'warning'); }
        }
        if (added.length) change(addMons(list, added));
    };
    const addFromSave = async (file: File | undefined) => {
        if (!file) return;
        try {
            const mons = monsFromSaveFile(await file.text());
            if (!mons.length) { api.showToast?.('No Fakémon in that file.', 'warning'); return; }
            change(addMons(list, mons));
            api.showToast?.(`Added ${mons.length} Fakémon from ${file.name}.`, 'success');
        } catch { api.showToast?.('That file is not a Woogidex save.', 'error'); }
    };
    const send = async () => {
        if (!sendTo) { api.showToast?.('Pick a chat first.', 'warning'); return; }
        if (await sendTierList(sendTo, list)) {
            api.showToast?.('Tier list sent.', 'success');
            // what was sent is the start of the next version
            setList({ ...list, baseline: snapshot(list) });
            setDirty(false);
        }
    };
    const copy = async (text: string, what: string) => {
        try { await navigator.clipboard.writeText(text); api.showToast?.(`${what} copied.`, 'success'); }
        catch { download('tiers.txt', text); }
    };

    // the pool of unranked mons leads, and stays in view while the tiers scroll (css/tier-maker.css)
    const rows = [{ id: UNRANKED, name: 'Unranked', sd: '', color: 'transparent', unranked: true }, ...list.tiers.map(t => ({ ...t, unranked: false }))];
    const pickedMon = picked ? list.mons[picked] : null;

    return (
        <Modal onClose={close} className="tier-maker" labelledBy="tier-maker-title">
            <div className="tm-head">
                <input id="tier-maker-title" className="tm-title" value={list.title} maxLength={80} aria-label="Tier list name" onChange={e => change({ ...list, title: e.target.value })} />
                <input className="tm-format" value={list.format} maxLength={40} placeholder="Format, like gen9pokeathlon" aria-label="Showdown format or mod"
                    onChange={e => change({ ...list, format: e.target.value.replace(/[^a-z0-9]/gi, '').toLowerCase() })} />
                <button type="button" className="modal-close" onClick={close} aria-label="Close"><Icon name="x" size={20} /></button>
            </div>

            <div className="tm-tools">
                <div className="tm-add">
                    <Icon name="search" size={15} />
                    <input type="search" value={query} placeholder="Add a Fakémon or Pokémon..." aria-label="Add a Fakémon or Pokémon" onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && query.trim()) { change(addMons(list, results.length ? [results[0]] : [{ id: '', name: query.trim(), from: 'custom' }])); setQuery(''); } }} />
                    {query.trim() && (
                        <div className="tm-results" role="listbox">
                            {results.map(m => (
                                <button key={m.id} type="button" role="option" aria-selected={false} disabled={!!list.mons[m.id]} onClick={() => { change(addMons(list, [m])); setQuery(''); }}>
                                    <span>{m.name}</span><small>{m.from === 'fakemon' ? 'Your Fakémon' : 'Main games'}{list.mons[m.id] ? ' · in the list' : ''}</small>
                                </button>
                            ))}
                            <button type="button" onClick={() => { change(addMons(list, [{ id: '', name: query.trim(), from: 'custom' }])); setQuery(''); }}>
                                <span>Add “{query.trim()}”</span><small>By name only</small>
                            </button>
                        </div>
                    )}
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => change(addMons(list, collectionMons(api.getActiveRegion?.()?.id || null)))}>
                    <Icon name="sparkles" size={14} /><span>Add my Fakémon</span>
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveFile.current?.click()} title="Every Fakémon in a Woogidex save file (.json)">
                    <Icon name="arrow-up-tray" size={14} /><span>Add from a save</span>
                </button>
                <input ref={saveFile} type="file" accept=".json,application/json" hidden onChange={e => { addFromSave(e.target.files?.[0]); e.target.value = ''; }} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => pictures.current?.click()} title={`Rank pictures too, up to ${MAX_IMAGES}`}>
                    <Icon name="photo" size={14} /><span>Pictures</span>
                </button>
                <input ref={pictures} type="file" accept="image/*" multiple hidden onChange={e => { addPictures(e.target.files); e.target.value = ''; }} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => change(addTier(list))}><Icon name="plus" size={14} /><span>Tier</span></button>
                <button type="button" className={`btn btn-secondary btn-sm${showChanges ? ' active' : ''}`} onClick={() => setShowChanges(v => !v)} aria-pressed={showChanges}>
                    <Icon name="arrows-up-down" size={14} /><span>Changes ({changes.length})</span>
                </button>
            </div>

            <div className="tm-body">
                <div className="tm-board" ref={board} data-mode={viewing}>
                    {rows.map((t, i) => (
                        <div key={t.id} className={`tm-row${t.unranked ? ' is-unranked' : ''}`} data-tier={t.id}>
                            <div className="tm-label" style={t.unranked ? undefined : { background: t.color }}>
                                {t.unranked ? <strong>Unranked</strong> : (
                                    <>
                                        <input value={t.name} maxLength={24} aria-label="Tier name" onChange={e => change({ ...list, tiers: list.tiers.map(x => x.id === t.id ? { ...x, name: e.target.value } : x) })} />
                                        <select value={t.sd} aria-label={`${t.name} on Showdown`} title="The Showdown tier it exports as"
                                            onChange={e => change({ ...list, tiers: list.tiers.map(x => x.id === t.id ? { ...x, sd: e.target.value } : x) })}>
                                            {SD_TIERS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                        <span className="tm-label-tools">
                                            <button type="button" aria-label="Move tier up" disabled={i === 1} onClick={() => change(moveTier(list, t.id, -1))}><Icon name="chevron-up" size={12} /></button>
                                            <button type="button" aria-label="Move tier down" disabled={i === list.tiers.length} onClick={() => change(moveTier(list, t.id, 1))}><Icon name="chevron-down" size={12} /></button>
                                            <input type="color" aria-label="Tier colour" value={t.color} onChange={e => change({ ...list, tiers: list.tiers.map(x => x.id === t.id ? { ...x, color: e.target.value } : x) })} />
                                            <button type="button" aria-label="Delete tier" onClick={() => change(removeTier(list, t.id))}><Icon name="x" size={12} /></button>
                                        </span>
                                    </>
                                )}
                                <small className="tm-count">{(list.placed[t.id] || []).length}</small>
                            </div>
                            <div className="tm-drop">
                                {(list.placed[t.id] || []).map(id => list.mons[id] && <Chip key={id} list={list} id={id} onPick={() => setPicked(id)} onDragStart={startDrag(id)} />)}
                                {!(list.placed[t.id] || []).length && <span className="tm-empty">{t.unranked ? 'Add Fakémon above, then drag them into a tier, or tap one to pick its tier.' : 'Drop here'}</span>}
                            </div>
                        </div>
                    ))}
                </div>

                {(pickedMon || showChanges) && (
                    <aside className="tm-side">
                        {pickedMon && (
                            <section className="tm-panel" aria-label={pickedMon.name}>
                                <header><strong>{pickedMon.name}</strong><button type="button" aria-label="Close" onClick={() => setPicked(null)}><Icon name="x" size={14} /></button></header>
                                <small>{pickedMon.from === 'fakemon' ? 'Your Fakémon' : pickedMon.from === 'pokemon' ? 'Main games' : 'By name'}{pickedMon.types?.length ? ` · ${pickedMon.types.join(' / ')}` : ''}
                                    {list.baseline?.[pickedMon.id] !== undefined ? ` · was ${list.baseline[pickedMon.id] || 'Unranked'}` : ''}</small>
                                <div className="tm-move" role="group" aria-label="Move to">
                                    {rows.map(t => (
                                        <button key={t.id} type="button" className={tierOf(list, pickedMon.id) === (t.unranked ? '' : t.name) ? 'is-on' : ''}
                                            onClick={() => change(moveMon(list, pickedMon.id, t.id))}>{t.unranked ? 'Unranked' : t.name}</button>
                                    ))}
                                </div>
                                <label className="tm-note">Why
                                    <textarea rows={3} maxLength={400} value={pickedMon.note || ''} placeholder="Too strong in OU because..."
                                        onChange={e => change({ ...list, mons: { ...list.mons, [pickedMon.id]: { ...pickedMon, note: e.target.value } } })} />
                                </label>
                                <button type="button" className="btn btn-secondary btn-sm tm-remove" onClick={() => { change(removeMon(list, pickedMon.id)); setPicked(null); }}><Icon name="trash-2" size={14} /> Take out of the list</button>
                            </section>
                        )}
                        {showChanges && (
                            <section className="tm-panel">
                                <header><strong>Changes</strong></header>
                                {!list.baseline ? <small>Changes show once you open a list someone sent, or send one yourself.</small>
                                    : changes.length ? <ul className="tm-changes">{changes.map((l, i) => <li key={i}>{l}</li>)}</ul>
                                        : <small>Nothing moved yet.</small>}
                            </section>
                        )}
                    </aside>
                )}
            </div>

            {importing && (
                <div className="tm-import">
                    <textarea rows={6} value={importBox} onChange={e => setImportBox(e.target.value)} placeholder={'OU:\n- Garchomp\n- Woogi\nUU:\n- ...'} aria-label="Tier text to import" />
                    <div className="tm-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImporting(false)}>Cancel</button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => { change(importText(list, importBox)); setImporting(false); setImportBox(''); }}>Import</button>
                    </div>
                </div>
            )}

            <div className="tm-foot">
                <div className="tm-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(`${list.format || 'formats'}-data.ts`, exportFormatsData(list))}><Icon name="arrow-down-tray" size={14} /><span>formats-data.ts</span></button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(exportFormatsData(list), 'Showdown code')}><Icon name="clipboard-document" size={14} /><span>Copy code</span></button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(exportText(list), 'Tier text')}><Icon name="document-text" size={14} /><span>Copy text</span></button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImporting(v => !v)}><Icon name="arrow-up-tray" size={14} /><span>Import text</span></button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={saveImage}><Icon name="photo" size={14} /><span>Save as image</span></button>
                    {!group && !conversationId && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { if (await api.postTierList?.(list)) close(); }} title="Post it on the Community Hub, where others can rank their own copy">
                            <Icon name="megaphone" size={14} /><span>Post</span>
                        </button>
                    )}
                </div>
                <span className="tm-spacer" />
                <div className="tm-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={save}><span>{dirty && !group ? 'Save on this device' : group ? 'Save a copy on this device' : 'Saved'}</span></button>
                    {everyone && (
                        <>
                            <button type="button" className={`btn btn-secondary btn-sm${viewing === 'average' ? ' active' : ''}`} onClick={() => viewing === 'average' ? (setViewing('mine'), setList(base)) : showAverage()}>
                                <Icon name="chart-bar" size={14} /><span>{viewing === 'average' ? 'Back to mine' : 'Group average'}</span>
                            </button>
                            <button type="button" className="btn btn-primary btn-sm" disabled={viewing === 'average'} onClick={() => api.saveMyRanking(rowId, placementOf(list))}>
                                <Icon name="check" size={14} /><span>Save my ranking</span>
                            </button>
                        </>
                    )}
                    {group && (
                        <button type="button" className="btn btn-primary btn-sm" disabled={!group.canEdit} onClick={saveToGroup}
                            title={group.canEdit ? `Save to ${group.name}` : 'Only the owner, the moderators and the tier leaders can save to the group'}>
                            <Icon name="users" size={14} /><span>{rowId ? 'Save to the group' : `Add to ${group.name}`}</span>
                        </button>
                    )}
                    {!group && chats.length > 0 && (
                        <>
                            <select value={sendTo} onChange={e => setSendTo(e.target.value)} aria-label="Chat to send to" className="tm-chat">
                                <option value="">Send to a chat...</option>
                                {chats.map(c => <option key={c.id} value={c.id}>{api.conversationTitle?.(c) || 'Chat'}</option>)}
                            </select>
                            <button type="button" className="btn btn-primary btn-sm" disabled={!sendTo} onClick={send}><Icon name="paper-airplane" size={14} /><span>Send</span></button>
                        </>
                    )}
                </div>
            </div>
        </Modal>
    );
}

/** The saved tier lists, to open or delete, and a new one. */
function TierListsDialog({ close }: DialogProps) {
    useStore();
    const lists = savedTierLists();
    return (
        <Modal onClose={close} title="Tier lists" className="tier-lists-modal" labelledBy="tier-lists-title">
            <p className="region-details-help">Rank Fakémon into tiers with your team, then export the tiers as Showdown code. Send a list in a chat or group so others can change it.</p>
            <div className="tm-saved">
                {lists.map(l => (
                    <div key={l.id} className="tm-saved-row">
                        <button type="button" className="tm-saved-open" onClick={() => { close(); openTierMaker(l); }}>
                            <strong>{l.title}</strong><small>{Object.keys(l.mons).length} in the list · {new Date(l.updatedAt).toLocaleDateString()}</small>
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" aria-label={`Delete ${l.title}`} onClick={() => deleteTierList(l.id)}><Icon name="trash-2" size={14} /></button>
                    </div>
                ))}
                {!lists.length && <p className="region-picker-empty">No tier lists on this device yet.</p>}
            </div>
            <div className="region-modal-actions">
                <span className="region-modal-spacer" />
                <button type="button" className="btn btn-primary" onClick={() => { close(); openTierMaker(); }}><Icon name="plus" size={14} /> New tier list</button>
            </div>
        </Modal>
    );
}

registerDialog('tier-maker', TierMakerDialog);
registerDialog('tier-lists', TierListsDialog);

/**
 * Opens the tier maker. A list from a chat opens as a copy whose baseline is
 * what it holds now, so the Changes panel shows what you move.
 */
export async function openTierMaker(list?: TierList | null, conversationId: string | null = null, fromChat = false, group: GroupContext | null = null) {
    // the main-game Pokémon in the Add box load lazily (Showdown's data)
    api.fetchShowdownData?.();
    const start = list ? cleanTierList(list) : null;
    // a list from a chat or a group: what it holds now is the baseline the Changes panel compares with
    const shared = fromChat || !!group;
    openDialog('tier-maker', { list: start && shared ? { ...start, baseline: snapshot(start) } : start || undefined, conversationId, group });
}

export function openTierLists() { openDialog('tier-lists', {}); }
