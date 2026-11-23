// The tier maker: rank Fakémon and Pokémon into tiers, write why, see what
// moved since the version you opened, and export Showdown's formats-data.ts.
// Open it from a chat or group (the composer's tier button, or a tier list
// someone sent), or from Settings. The model is js/features/tier-lists.ts.
//
// Moving a mon: drag it (mouse or finger) onto a tier, or tap it and pick a
// tier in its panel (keyboard and screen readers use the panel too).

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../core/app.ts';
import { registerDialog, openDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { Icon } from '../components/Icon.tsx';
import { useStore } from '../store.ts';
import { effectiveZoom } from '../../core/ui-scale.ts';
import {
    SD_TIERS, UNRANKED, addMons, addTier, changelog, cleanTierList, collectionMons, deleteTierList, exportFormatsData, exportText,
    importText, monChoices, moveMon, moveTier, newTierList, removeMon, removeTier, saveTierList, savedTierLists, sendTierList, snapshot,
    tierOf, type TierList, type TierMon
} from '../../features/tier-lists.ts';

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
        <button type="button" className={`tm-chip${m.from === 'fakemon' ? ' is-fakemon' : ''}${moved ? (up ? ' is-up' : ' is-down') : ''}`} data-mon={id}
            onClick={onPick} onPointerDown={onDragStart} title={[m.note, moved ? `Was ${before || 'Unranked'}` : ''].filter(Boolean).join(' · ') || m.name}>
            <span className="tm-chip-name">{m.name}</span>
            {moved && <Icon name={up ? 'arrow-up' : 'arrow-down'} size={12} className="tm-chip-move" aria-label={up ? 'Rose' : 'Dropped'} />}
            {m.note && <Icon name="chat-bubble-left" size={12} className="tm-chip-note" aria-label="Has a note" />}
        </button>
    );
}

function TierMakerDialog({ close, list: start, conversationId = null }: DialogProps<{ list?: TierList; conversationId?: string | null }>) {
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

    const rows = [...list.tiers.map(t => ({ ...t, unranked: false })), { id: UNRANKED, name: 'Unranked', sd: '', color: 'transparent', unranked: true }];
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
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => change(addTier(list))}><Icon name="plus" size={14} /><span>Tier</span></button>
                <button type="button" className={`btn btn-secondary btn-sm${showChanges ? ' active' : ''}`} onClick={() => setShowChanges(v => !v)} aria-pressed={showChanges}>
                    <Icon name="arrows-up-down" size={14} /><span>Changes ({changes.length})</span>
                </button>
            </div>

            <div className="tm-body">
                <div className="tm-board" ref={board}>
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
                                            <button type="button" aria-label="Move tier up" disabled={i === 0} onClick={() => change(moveTier(list, t.id, -1))}><Icon name="chevron-up" size={12} /></button>
                                            <button type="button" aria-label="Move tier down" disabled={i === list.tiers.length - 1} onClick={() => change(moveTier(list, t.id, 1))}><Icon name="chevron-down" size={12} /></button>
                                            <input type="color" aria-label="Tier colour" value={t.color} onChange={e => change({ ...list, tiers: list.tiers.map(x => x.id === t.id ? { ...x, color: e.target.value } : x) })} />
                                            <button type="button" aria-label="Delete tier" onClick={() => change(removeTier(list, t.id))}><Icon name="x" size={12} /></button>
                                        </span>
                                    </>
                                )}
                                <small className="tm-count">{(list.placed[t.id] || []).length}</small>
                            </div>
                            <div className="tm-drop">
                                {(list.placed[t.id] || []).map(id => list.mons[id] && <Chip key={id} list={list} id={id} onPick={() => setPicked(id)} onDragStart={startDrag(id)} />)}
                                {!(list.placed[t.id] || []).length && <span className="tm-empty">{t.unranked ? 'Add Fakémon above, then drag them up into a tier.' : 'Drop here'}</span>}
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
                </div>
                <span className="tm-spacer" />
                <div className="tm-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={save}><span>{dirty ? 'Save on this device' : 'Saved'}</span></button>
                    {chats.length > 0 && (
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
export async function openTierMaker(list?: TierList | null, conversationId: string | null = null, fromChat = false) {
    // the main-game Pokémon in the Add box load lazily (Showdown's data)
    api.fetchShowdownData?.();
    const start = list ? cleanTierList(list) : null;
    openDialog('tier-maker', { list: start && fromChat ? { ...start, baseline: snapshot(start) } : start || undefined, conversationId });
}

export function openTierLists() { openDialog('tier-lists', {}); }
