// /fun/tier-maker/edit: the tier maker, one of the Fun tab's tools, as a whole
// page (no window, no card around it). Rank Fakémon, Pokémon, pictures or
// words into any tiers you like, in five layouts (js/features/tier-lists.ts),
// with game modes (TierModes.tsx), your own look, a presentation mode for
// streams, and the exports. The board is js/app/components/tier/TierBoard.tsx.
//
// Where a list comes from: openTierMaker() in js/app/dialogs/tierMaker.tsx
// (the Toolbox, a group, a chat, a post). A list from someone else opens as
// a copy; what you add to it is marked yours only (temp) and stays out of
// what you send, post or save to a group (forSharing).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSlide } from '../hooks.ts';
import { api, state } from '../../core/app.ts';
import { useStore } from '../store.ts';
import { Icon } from '../components/Icon.tsx';
import { Link } from '../components/Link.tsx';
import { loadHtml2canvas } from '../../core/vendor.ts';
import { confirmDialog } from '../../core/confirm-dialog.ts';
import { BANNER_PRESETS } from '../components/profile.tsx';
import { TierBoard } from '../components/tier/TierBoard.tsx';
import { ModePanel } from '../components/tier/TierModes.tsx';
import { openContextMenu } from '../components/ContextMenu.tsx';
import { currentTierMakerStart, type GroupContext } from '../dialogs/tierMaker.tsx';
import { MODES, type ModeKey } from '../../features/tier-modes.ts';
import {
    BG_IMG_CHARS, LAYOUTS, LOOK_LIMITS, MAX_IMAGES, SD_TIERS, STARTS, UNRANKED, addColumn, addMons, addTier, applyPlacement, averageList,
    changelog, collectionMons, columnOf, convertLayout, exportFormatsData, exportText, forSharing, fromTemplate, importText,
    monChoices, monsFromSaveFile, moveMonTo, moveTier, newTierList, placementOf, removeColumn, removeMon, removeTier, rowCapacity,
    saveAsTemplate, saveTierList, savedTemplates, savedTierLists, sendTierList, snapshot, tierOf, unplace,
    type Layout, type Look, type TierList, type TierMon
} from '../../features/tier-lists.ts';

// ---------- pictures ----------

/** Shrinks a canvas to a data URI under `max` characters (WebP, else JPEG). */
function squeeze(canvas: HTMLCanvasElement, max: number): string {
    for (const q of [0.82, 0.65, 0.5, 0.38]) {
        const uri = canvas.toDataURL('image/webp', q);
        const out = uri.startsWith('data:image/webp') ? uri : canvas.toDataURL('image/jpeg', q);
        if (out.length <= max) return out;
    }
    throw new Error('That picture is too detailed to keep small.');
}

/** A picture for a picture item: 96px at most, small enough that a list still fits a post. */
async function smallPicture(file: File, side = 96, max = 11500): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return squeeze(canvas, max);
}

/** A word tile as a picture: the text, wrapped, on a coloured square. */
function textTile(text: string, color: string): string {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = text.trim().split(/\s+/);
    let font = 22;
    let lines: string[] = [];
    // the biggest size that fits in three lines
    for (; font >= 10; font -= 2) {
        ctx.font = `800 ${font}px "BDO Grotesk", system-ui, sans-serif`;
        lines = [];
        let line = '';
        for (const w of words) {
            const test = line ? `${line} ${w}` : w;
            if (ctx.measureText(test).width > size - 12 && line) { lines.push(line); line = w; } else line = test;
        }
        if (line) lines.push(line);
        if (lines.length <= 3 && lines.every(l => ctx.measureText(l).width <= size - 12)) break;
    }
    lines.slice(0, 3).forEach((l, i, all) => ctx.fillText(l, size / 2, size / 2 + (i - (all.length - 1) / 2) * font * 1.1));
    return squeeze(canvas, 11500);
}

function download(name: string, text: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A file name from the list's title. */
const fileBase = (list: TierList) => (list.title || 'tier-list').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'tier-list';

const TILE_COLORS =['#7c5cff', '#e05252', '#3aa0c0', '#3ab07a', '#e0a83a', '#b05ac0', '#1d2433'];

type Side = 'item' | 'rows' | 'look' | 'changes' | 'templates' | null;

// ---------- the page ----------

export function TierMakerPage() {
    useStore();
    return <TierMaker />;
}

const LAYOUT_ORDER = LAYOUTS.map(([k]) => k);

function TierMaker() {
    const [start, setStart] = useState(() => currentTierMakerStart());
    const [list, setList] = useState<TierList>(() => start?.list || newTierList());
    const conversationId = start?.conversationId || null;
    const group: GroupContext | null = start?.group || null;
    const shared = !!start?.shared;
    // a new start while the page is open (openTierMaker from a chat, say)
    const seen = useRef(start?.seq || 0);
    useEffect(() => {
        const take = () => {
            const next = currentTierMakerStart();
            if (!next || next.seq === seen.current) return;
            seen.current = next.seq;
            setStart(next);
            setList(next.list || newTierList());
            setHistory([]); setFuture([]); setPicked(null); setMode(null); setDirty(false);
        };
        window.addEventListener('woogidex:tier-maker-start', take);
        return () => window.removeEventListener('woogidex:tier-maker-start', take);
    }, []);

    // ---- undo and redo ----
    const [history, setHistory] = useState<TierList[]>([]);
    const [future, setFuture] = useState<TierList[]>([]);
    const [dirty, setDirty] = useState(false);
    const change = (next: TierList) => {
        setHistory(h => [...h.slice(-49), list]);
        setFuture([]);
        setList(next);
        setDirty(true);
    };
    const undo = () => { const prev = history[history.length - 1]; if (!prev) return; setFuture(f => [list, ...f]); setHistory(h => h.slice(0, -1)); setList(prev); };
    const redo = () => { const next = future[0]; if (!next) return; setHistory(h => [...h, list]); setFuture(f => f.slice(1)); setList(next); };
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.closest('input, textarea, select')) return;
            if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    });

    // a list already saved on this device keeps saving itself
    const savedHere = savedTierLists().some(l => l.id === list.id);
    useEffect(() => {
        if (!dirty || !savedHere || list.singleUse || shared) return;
        const t = setTimeout(() => { saveTierList(list); setDirty(false); }, 800);
        return () => clearTimeout(t);
    }, [list, dirty, savedHere]);

    const [picked, setPicked] = useState<string | null>(null);
    const [side, setSide] = useState<Side>(null);
    const [mode, setMode] = useState<ModeKey | null>(null);
    const [present, setPresent] = useState(false);
    const [query, setQuery] = useState('');
    const [tileText, setTileText] = useState('');
    const [tileColor, setTileColor] = useState(TILE_COLORS[0]);
    const [importing, setImporting] = useState(false);
    const [importBox, setImportBox] = useState('');
    const [sendTo, setSendTo] = useState(conversationId || '');
    const page = useRef<HTMLDivElement>(null);
    const board = useRef<HTMLDivElement>(null);
    const pictures = useRef<HTMLInputElement>(null);
    const saveFile = useRef<HTMLInputElement>(null);
    const bgFile = useRef<HTMLInputElement>(null);
    const results = useMemo(() => monChoices(query, 20), [query]);
    const changes = changelog(list);
    const chats = (api.messagingState?.().conversations || []) as any[];
    const showdown = list.kind === 'showdown';
    const layout = list.layout || 'tiers';
    // a new layout slides in from the side of its button (left or right in the row)
    const mainArea = useSlide(layout, LAYOUT_ORDER);

    // anything you add to someone else's list is yours only
    const add = (mons: TierMon[]) => change(addMons(list, shared ? mons.map(m => ({ ...m, temp: true })) : mons));

    // ---- presentation mode: the board alone, full screen ----
    useEffect(() => {
        const left = () => { if (!document.fullscreenElement) setPresent(false); };
        document.addEventListener('fullscreenchange', left);
        return () => document.removeEventListener('fullscreenchange', left);
    }, []);
    const togglePresent = async () => {
        if (present) { setPresent(false); if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); return; }
        setPresent(true);
        setPicked(null);
        await page.current?.requestFullscreen?.().catch(() => {});
    };

    // ---- adding ----
    const addPictures = async (files: FileList | null) => {
        const added: TierMon[] = [];
        for (const f of Array.from(files || []).filter(f => f.type.startsWith('image/')).slice(0, MAX_IMAGES)) {
            try { added.push({ id: '', name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40), from: 'image', img: await smallPicture(f) }); }
            catch (e: any) { api.showToast?.(`${f.name}: ${e?.message || 'could not read it'}`, 'warning'); }
        }
        if (added.length) add(added);
    };
    const addFromSave = async (file: File | undefined) => {
        if (!file) return;
        try {
            const mons = monsFromSaveFile(await file.text());
            if (!mons.length) { api.showToast?.('No Fakémon in that file.', 'warning'); return; }
            add(mons);
            api.showToast?.(`Added ${mons.length} Fakémon from ${file.name}.`, 'success');
        } catch { api.showToast?.('That file is not a Woogidex save.', 'error'); }
    };
    const addTile = () => {
        const text = tileText.trim();
        if (!text) return;
        try { add([{ id: '', name: text.slice(0, 40), from: 'image', img: textTile(text, tileColor) }]); setTileText(''); }
        catch { api.showToast?.('Could not make that tile.', 'error'); }
    };
    const setBackgroundPicture = async (file: File | undefined) => {
        if (!file) return;
        try { setLook({ bgImg: await smallPicture(file, 1280, BG_IMG_CHARS) }); }
        catch (e: any) { api.showToast?.(e?.message || 'Could not use that picture.', 'warning'); }
    };
    const setLook = (patch: Partial<Look>) => change({ ...list, look: { ...(list.look || {}), ...patch } });

    // ---- saving and sharing ----
    const save = () => { saveTierList(list); setDirty(false); api.showToast?.('Tier list saved on this device.', 'success'); };
    const [rowId, setRowId] = useState(group?.rowId || null);
    const saveToGroup = async () => {
        if (!group) return;
        const id = await api.saveToolboxItem(group.id, forSharing(list), rowId, group.mode || 'curated');
        if (id) { setRowId(id); setList({ ...list, baseline: snapshot(list) }); setDirty(false); }
    };
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
            const canvas = await html2canvas(el, { backgroundColor: getComputedStyle(document.body).backgroundColor, scale: 2, useCORS: true });
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `${(list.title || 'tier-list').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.png`;
            a.click();
        } catch { api.showToast?.('Couldn’t make the picture.', 'error'); }
    };
    const send = async () => {
        if (!sendTo) { api.showToast?.('Pick a chat first.', 'warning'); return; }
        if (await sendTierList(sendTo, list)) {
            api.showToast?.('Tier list sent.', 'success');
            setList({ ...list, baseline: snapshot(list) });
            setDirty(false);
        }
    };
    const copy = async (text: string, what: string) => {
        try { await navigator.clipboard.writeText(text); api.showToast?.(`${what} copied.`, 'success'); }
        catch { download('tiers.txt', text); }
    };
    const startFresh = async (key: string) => {
        if (Object.keys(list.mons).length && dirty && !(await confirmDialog({ title: 'Start a new list?', message: 'This one has changes that are not saved.', confirmLabel: 'Start new', danger: false }))) return;
        setList(newTierList('', key)); setHistory([]); setFuture([]); setDirty(false); setPicked(null); setSide(null);
    };
    const switchLayout = (to: Layout) => {
        if (to === layout) return;
        change(convertLayout(list, to));
        setPicked(null);
    };

    // ---- the side panel ----
    const pickedMon = picked ? list.mons[picked] : null;
    useEffect(() => { if (picked) setSide('item'); }, [picked]);
    const cols = list.columns?.length ? list.columns : null;
    const spots = layout === 'quadrant' ? [] : list.tiers.flatMap((t, i) => (cols ? cols.map(c => ({ t, c, i })) : [{ t, c: null as any, i }]));

    const sidePanel = (() => {
        if (side === 'item' && pickedMon) {
            const where = tierOf(list, pickedMon.id);
            return (
                <section className="tm-side-section" aria-label={pickedMon.name}>
                    <header><h3>{pickedMon.name}</h3><button type="button" className="tm-x" aria-label="Close" onClick={() => { setPicked(null); setSide(null); }}><Icon name="x" size={16} /></button></header>
                    <small className="tm-side-help">
                        {pickedMon.from === 'fakemon' ? 'Your Fakémon' : pickedMon.from === 'pokemon' ? 'Main games' : pickedMon.from === 'image' ? 'A picture' : 'A word'}
                        {pickedMon.types?.length ? ` · ${pickedMon.types.join(' / ')}` : ''}
                        {pickedMon.temp ? ' · only in your copy' : ''}
                        {list.baseline?.[pickedMon.id] !== undefined ? ` · was ${list.baseline[pickedMon.id] || 'Unranked'}` : ''}
                    </small>
                    {layout === 'quadrant' ? (
                        <p className="tm-side-help">{list.pos?.[pickedMon.id] ? 'Drag it to move it on the chart.' : 'Drag it onto the chart.'}
                            {list.pos?.[pickedMon.id] && <button type="button" className="btn btn-secondary btn-sm" onClick={() => change(unplace(list, pickedMon.id))}>Back to Unranked</button>}</p>
                    ) : (
                        <div className="tm-move" role="group" aria-label="Move to">
                            <button type="button" className={!where ? 'is-on' : ''} onClick={() => change(moveMonTo(list, pickedMon.id, UNRANKED, null))}>Unranked</button>
                            {spots.map(({ t, c, i }) => {
                                const on = where === t.name && (!c || columnOf(list, pickedMon.id) === c.id);
                                const full = !on && (list.placed[t.id] || []).length >= rowCapacity(list, i);
                                return <button key={t.id + (c?.id || '')} type="button" className={on ? 'is-on' : ''} disabled={full} style={{ ['--c' as any]: t.color }}
                                    onClick={() => change(moveMonTo(list, pickedMon.id, t.id, c?.id || null))}>{t.name}{c ? ` · ${c.name}` : ''}</button>;
                            })}
                        </div>
                    )}
                    <label className="tm-note">Why
                        <textarea rows={3} maxLength={400} value={pickedMon.note || ''} placeholder={showdown ? 'Too strong in OU because...' : 'Because...'}
                            onChange={e => change({ ...list, mons: { ...list.mons, [pickedMon.id]: { ...pickedMon, note: e.target.value } } })} />
                    </label>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { change(removeMon(list, pickedMon.id)); setPicked(null); setSide(null); }}><Icon name="trash-2" size={14} />Take it out</button>
                </section>
            );
        }
        if (side === 'rows') {
            return (
                <section className="tm-side-section" aria-label="Rows and columns">
                    <header><h3>{layout === 'quadrant' ? 'Axes' : 'Rows and columns'}</h3><button type="button" className="tm-x" aria-label="Close" onClick={() => setSide(null)}><Icon name="x" size={16} /></button></header>
                    {layout === 'quadrant' ? (
                        (['top', 'bottom', 'left', 'right'] as const).map(k => (
                            <label key={k} className="tm-field">{k[0].toUpperCase() + k.slice(1)}
                                <input value={list.axes?.[k] || ''} maxLength={24} onChange={e => change({ ...list, axes: { top: '', bottom: '', left: '', right: '', ...(list.axes || {}), [k]: e.target.value } })} />
                            </label>
                        ))
                    ) : (
                        <>
                            <label className="tm-check"><input type="checkbox" checked={showdown} onChange={e => change({ ...list, kind: e.target.checked ? 'showdown' : 'fun' })} />
                                <span>Showdown tiers<small>Each row maps to a Showdown tier, for formats-data.ts</small></span></label>
                            {list.tiers.map((t, i) => (
                                <div key={t.id} className="tm-row-edit">
                                    <input type="color" aria-label={`${t.name} colour`} value={t.color} onChange={e => change({ ...list, tiers: list.tiers.map(x => x.id === t.id ? { ...x, color: e.target.value } : x) })} />
                                    <input value={t.name} maxLength={24} aria-label="Row name" onChange={e => change({ ...list, tiers: list.tiers.map(x => x.id === t.id ? { ...x, name: e.target.value } : x) })} />
                                    {showdown && (
                                        <select value={t.sd} aria-label={`${t.name} on Showdown`} onChange={e => change({ ...list, tiers: list.tiers.map(x => x.id === t.id ? { ...x, sd: e.target.value } : x) })}>
                                            {SD_TIERS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    )}
                                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => change(moveTier(list, t.id, -1))}><Icon name="chevron-up" size={14} /></button>
                                    <button type="button" aria-label="Move down" disabled={i === list.tiers.length - 1} onClick={() => change(moveTier(list, t.id, 1))}><Icon name="chevron-down" size={14} /></button>
                                    <button type="button" aria-label={`Delete ${t.name}`} disabled={list.tiers.length <= 1} onClick={() => change(removeTier(list, t.id))}><Icon name="x" size={14} /></button>
                                </div>
                            ))}
                            {layout !== 'grid' && (
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => change(addTier(list, layout === 'pyramid' ? String(list.tiers.length + 1) : 'New tier'))}><Icon name="plus" size={14} />{layout === 'pyramid' ? 'Level' : 'Row'}</button>
                            )}
                            {(layout === 'tiers' || layout === 'alignment') && (
                                <>
                                    <h4>Columns</h4>
                                    {(list.columns || []).map(c => (
                                        <div key={c.id} className="tm-row-edit">
                                            <input value={c.name} maxLength={24} aria-label="Column name" onChange={e => change({ ...list, columns: list.columns!.map(x => x.id === c.id ? { ...x, name: e.target.value } : x) })} />
                                            <button type="button" aria-label={`Delete ${c.name}`} onClick={() => change(removeColumn(list, c.id))}><Icon name="x" size={14} /></button>
                                        </div>
                                    ))}
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => change(addColumn(list, `Column ${(list.columns?.length || 0) + 1}`))}><Icon name="plus" size={14} />Column</button>
                                </>
                            )}
                        </>
                    )}
                </section>
            );
        }
        if (side === 'look') {
            const look = list.look || {};
            const slider = (key: 'width' | 'itemSize' | 'labelWidth', label: string, fallback: number) => (
                <label className="tm-field">{label}
                    <input type="range" min={LOOK_LIMITS[key][0]} max={LOOK_LIMITS[key][1]} value={look[key] || fallback} onChange={e => setLook({ [key]: Number(e.target.value) })} />
                </label>
            );
            return (
                <section className="tm-side-section" aria-label="Look">
                    <header><h3>Look</h3><button type="button" className="tm-x" aria-label="Close" onClick={() => setSide(null)}><Icon name="x" size={16} /></button></header>
                    <h4>Background</h4>
                    <div className="tm-bg-swatches">
                        <button type="button" className={`tm-bg-swatch is-none${!look.bg && !look.bgImg ? ' is-on' : ''}`} aria-label="No background" onClick={() => setLook({ bg: undefined, bgImg: undefined })} />
                        {Object.entries(BANNER_PRESETS).map(([k, bg]) => (
                            <button key={k} type="button" className={`tm-bg-swatch${look.bg === `preset:${k}` ? ' is-on' : ''}`} style={{ background: bg }} aria-label={k} onClick={() => setLook({ bg: `preset:${k}`, bgImg: undefined })} />
                        ))}
                        <input type="color" aria-label="A colour" value={look.bg?.startsWith('#') ? look.bg : '#1d2433'} onChange={e => setLook({ bg: e.target.value, bgImg: undefined })} />
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => bgFile.current?.click()}><Icon name="photo" size={14} />A picture</button>
                    <input ref={bgFile} type="file" accept="image/*" hidden onChange={e => { setBackgroundPicture(e.target.files?.[0]); e.target.value = ''; }} />
                    <h4>Size</h4>
                    {slider('width', 'Board width', 1100)}
                    {slider('itemSize', 'Item size', 84)}
                    {layout !== 'quadrant' && slider('labelWidth', 'Label width', 140)}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => change({ ...list, look: undefined })}>Reset the look</button>
                </section>
            );
        }
        if (side === 'changes') {
            return (
                <section className="tm-side-section" aria-label="Changes">
                    <header><h3>Changes</h3><button type="button" className="tm-x" aria-label="Close" onClick={() => setSide(null)}><Icon name="x" size={16} /></button></header>
                    {!list.baseline ? <small className="tm-side-help">Changes show once you open a list someone sent, or send one yourself.</small>
                        : changes.length ? <ul className="tm-changes">{changes.map((l, i) => <li key={i}>{l}</li>)}</ul>
                            : <small className="tm-side-help">Nothing moved yet.</small>}
                </section>
            );
        }
        if (side === 'templates') {
            const templates = savedTemplates();
            return (
                <section className="tm-side-section" aria-label="Templates">
                    <header><h3>Start from</h3><button type="button" className="tm-x" aria-label="Close" onClick={() => setSide(null)}><Icon name="x" size={16} /></button></header>
                    <div className="tm-starts">
                        {STARTS.map(s => <button key={s.key} type="button" onClick={() => startFresh(s.key)}><strong>{s.label}</strong><small>{s.hint}</small></button>)}
                    </div>
                    <h4>Your templates</h4>
                    <small className="tm-side-help">Private, on this device. A template keeps the rows and the items, with nothing placed.</small>
                    {templates.map(t => (
                        <div key={t.id} className="tm-template">
                            <button type="button" onClick={() => { setList(fromTemplate(t)); setHistory([]); setDirty(false); }}><strong>{t.title}</strong><small>{Object.keys(t.mons).length} items</small></button>
                            <button type="button" title="A one-off list: nothing saves, for a picture to download" onClick={() => { setList(fromTemplate(t, true)); setHistory([]); setDirty(false); }}>Single-use</button>
                        </div>
                    ))}
                    {!templates.length && <small className="tm-side-help">None yet.</small>}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { saveAsTemplate(list); api.showToast?.('Saved as a template on this device.', 'success'); }}><Icon name="document-duplicate" size={14} />Save this as a template</button>
                </section>
            );
        }
        return null;
    })();

    return (
        <div className={`tier-maker-page${present ? ' is-presenting' : ''}`} ref={page}>
            <header className="tmp-head">
                <Link to="fun/tier-maker" className="tmp-back" aria-label="Back to Fun"><Icon name="arrow-left" size={18} /></Link>
                <input className="tmp-title" value={list.title} maxLength={80} aria-label="Tier list name" onChange={e => change({ ...list, title: e.target.value })} />
                {showdown && <input className="tm-format" value={list.format} maxLength={40} placeholder="Format, like gen9pokeathlon" aria-label="Showdown format or mod"
                    onChange={e => change({ ...list, format: e.target.value.replace(/[^a-z0-9]/gi, '').toLowerCase() })} />}
                <span className="tmp-spacer" />
                {list.singleUse && <span className="tmp-flag" title="Nothing saves. Download a picture when you are done."><Icon name="sparkles" size={14} />Single-use</span>}
                <button type="button" className="tmp-icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.length} onClick={undo}><Icon name="arrow-uturn-left" size={18} /></button>
                <button type="button" className="tmp-icon" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!future.length} onClick={redo}><Icon name="arrow-uturn-right" size={18} /></button>
                <button type="button" className={`tmp-icon${present ? ' is-on' : ''}`} aria-pressed={present} title="Presentation mode: the board alone, for streams and screen sharing" aria-label="Presentation mode" onClick={togglePresent}><Icon name={present ? 'arrows-pointing-in' : 'arrows-pointing-out'} size={18} /></button>
            </header>

            {!present && (
                <div className="tmp-bar">
                    <div className="tmp-layouts" role="radiogroup" aria-label="Layout">
                        {LAYOUTS.map(([key, label, hint]) => (
                            <button key={key} type="button" role="radio" aria-checked={layout === key} className={layout === key ? 'is-on' : ''} title={hint} onClick={() => switchLayout(key)}>{label}</button>
                        ))}
                    </div>
                    <span className="tmp-spacer" />
                    <button type="button" className={`tmp-tool${side === 'templates' ? ' is-on' : ''}`} onClick={() => setSide(side === 'templates' ? null : 'templates')}><Icon name="squares-plus" size={16} />New and templates</button>
                    <button type="button" className={`tmp-tool${side === 'rows' ? ' is-on' : ''}`} onClick={() => setSide(side === 'rows' ? null : 'rows')}><Icon name="bars-3" size={16} />{layout === 'quadrant' ? 'Axes' : 'Rows and columns'}</button>
                    <button type="button" className={`tmp-tool${side === 'look' ? ' is-on' : ''}`} onClick={() => setSide(side === 'look' ? null : 'look')}><Icon name="swatch" size={16} />Look</button>
                    <button type="button" className={`tmp-tool${side === 'changes' ? ' is-on' : ''}`} onClick={() => setSide(side === 'changes' ? null : 'changes')}><Icon name="arrows-up-down" size={16} />Changes ({changes.length})</button>
                </div>
            )}

            {!present && (
                <div className="tmp-add">
                    <div className="tm-add">
                        <Icon name="search" size={15} />
                        <input type="search" value={query} placeholder="Add a Fakémon, a Pokémon, or any word..." aria-label="Add an item" onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && query.trim()) { add(results.length ? [results[0]] : [{ id: '', name: query.trim(), from: 'custom' }]); setQuery(''); } }} />
                        {query.trim() && (
                            <div className="tm-results" role="listbox">
                                {results.map(m => (
                                    <button key={m.id} type="button" role="option" aria-selected={false} disabled={!!list.mons[m.id]} onClick={() => { add([m]); setQuery(''); }}>
                                        <span>{m.name}</span><small>{m.from === 'fakemon' ? 'Your Fakémon' : 'Main games'}{list.mons[m.id] ? ' · in the list' : ''}</small>
                                    </button>
                                ))}
                                <button type="button" onClick={() => { add([{ id: '', name: query.trim(), from: 'custom' }]); setQuery(''); }}>
                                    <span>Add “{query.trim()}”</span><small>As a word</small>
                                </button>
                            </div>
                        )}
                    </div>
                    <button type="button" className="tmp-tool" onClick={() => add(collectionMons(api.getActiveRegion?.()?.id || null))}><Icon name="sparkles" size={16} />My Fakémon</button>
                    <button type="button" className="tmp-tool" onClick={() => saveFile.current?.click()} title="Every Fakémon in a Woogidex save file (.json)"><Icon name="arrow-up-tray" size={16} />From a save</button>
                    <input ref={saveFile} type="file" accept=".json,application/json" hidden onChange={e => { addFromSave(e.target.files?.[0]); e.target.value = ''; }} />
                    <button type="button" className="tmp-tool" onClick={() => pictures.current?.click()} title={`Pictures from your device, up to ${MAX_IMAGES}`}><Icon name="photo" size={16} />Pictures</button>
                    <input ref={pictures} type="file" accept="image/*" multiple hidden onChange={e => { addPictures(e.target.files); e.target.value = ''; }} />
                    <span className="tmp-tile">
                        <input value={tileText} maxLength={40} placeholder="Text tile" aria-label="Text for a picture tile" onChange={e => setTileText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTile(); }} />
                        <span className="tmp-tile-colors">{TILE_COLORS.map(c => <button key={c} type="button" className={tileColor === c ? 'is-on' : ''} style={{ background: c }} aria-label={`Tile colour ${c}`} onClick={() => setTileColor(c)} />)}</span>
                        <button type="button" className="tmp-tool" disabled={!tileText.trim()} onClick={addTile}><Icon name="plus" size={14} />Tile</button>
                    </span>
                </div>
            )}
            {!present && shared && <p className="tmp-note"><Icon name="information-circle" size={14} />This is your copy. What you add stays in your copy (dashed) and is left out when you send or post it.</p>}

            {!present && (
                <div className="tmp-modes" role="group" aria-label="Game modes">
                    <span>Play:</span>
                    {MODES.map(([key, label, hint]) => <button key={key} type="button" className={mode === key ? 'is-on' : ''} title={hint} onClick={() => { setMode(mode === key ? null : key); setPicked(null); }}>{label}</button>)}
                </div>
            )}

            <div className="tmp-body">
                <div className="tmp-main" ref={mainArea}>
                    {mode && !present && (
                        <ModePanel list={list} mode={mode} onChange={change} onClose={() => setMode(null)}
                            onApply={next => { change(next); setMode(null); api.showToast?.('Done. It is in the list now.', 'success'); }} />
                    )}
                    {(!mode || mode === 'blind') && (
                        <TierBoard list={list} onChange={change} picked={present ? null : picked} onPick={present ? () => {} : setPicked}
                            locked={mode === 'blind'} boardRef={board} hideUnranked={present} />
                    )}
                </div>
                {/* a fresh key for each panel, so each one slides in when it opens (css .tmp-side) */}
                {!present && sidePanel && <aside key={side || 'none'} className="tmp-side">{sidePanel}</aside>}
            </div>

            {!present && importing && (
                <div className="tm-import">
                    <textarea rows={6} value={importBox} onChange={e => setImportBox(e.target.value)} placeholder={'S:\n- Woogi\nA:\n- ...'} aria-label="Tier text to import" />
                    <div className="tm-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImporting(false)}>Cancel</button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => { change(importText(list, importBox)); setImporting(false); setImportBox(''); }}>Import</button>
                    </div>
                </div>
            )}

            {!present && (
                <footer className="tmp-foot">
                    <div className="tm-actions">
                        <button type="button" className="btn btn-secondary btn-sm" aria-haspopup="menu" onClick={e => openContextMenu(e, {
                            title: 'Export as',
                            items: [
                                { label: 'Image (PNG)', icon: 'photo', run: saveImage },
                                { label: 'Text file (.txt)', icon: 'document-text', run: () => download(`${fileBase(list)}.txt`, exportText(list)) },
                                { label: 'Copy as text', icon: 'clipboard-document', run: () => copy(exportText(list), 'Tier text') },
                                ...(showdown ? [
                                    'sep' as const,
                                    { label: 'Showdown formats-data.ts', icon: 'arrow-down-tray', run: () => download(`${list.format || 'formats'}-data.ts`, exportFormatsData(forSharing(list))) },
                                    { label: 'Copy Showdown code', icon: 'code-bracket', run: () => copy(exportFormatsData(forSharing(list)), 'Showdown code') }
                                ] : [])
                            ]
                        })}><Icon name="arrow-down-tray" size={14} /><span>Export as</span><Icon name="chevron-down" size={12} /></button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImporting(v => !v)}><Icon name="arrow-up-tray" size={14} /><span>Import text</span></button>
                        {!group && !conversationId && !list.singleUse && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.postTierList?.(forSharing(list))} title="Post it on the Community Hub, where others can rank their own copy">
                                <Icon name="megaphone" size={14} /><span>Post</span>
                            </button>
                        )}
                    </div>
                    <span className="tm-spacer" />
                    <div className="tm-actions">
                        {!list.singleUse && <button type="button" className="btn btn-secondary btn-sm" onClick={save}><span>{savedHere && !shared ? (dirty ? 'Saving...' : 'Saved on this device') : group ? 'Save a copy on this device' : 'Save on this device'}</span></button>}
                        <label className="tm-check tm-single" title="A one-off list: nothing saves on this device, for a picture to download">
                            <input type="checkbox" checked={!!list.singleUse} onChange={e => change({ ...list, singleUse: e.target.checked || undefined })} /><span>Single-use</span>
                        </label>
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
                                title={group.canEdit ? `Save to ${group.name}` : 'Only people with the tier list permission can save to the group'}>
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
                </footer>
            )}
        </div>
    );
}
