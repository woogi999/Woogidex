// Drawing on the notes themselves, as Quick Notes does on a phone: a clear
// canvas sits over the note text. In Type mode the text takes the pointer;
// in a drawing mode the canvas does. The ink saves as one PNG (the doodle
// with the id INK_ID) a moment after a stroke ends. Only the part with ink
// on it is kept, from the top-left corner, so it lines up with the text.
// Dark mode shows the ink inverted (css/editor.css), so dark ink stays readable.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icon.tsx';
import { INK_ID, MAX_DOODLE_CHARS, type Doodle } from '../../../features/notebook.ts';
import { effectiveZoom } from '../../../core/ui-scale.ts';

// the canvas keeps 2 pixels for each CSS pixel, so ink is sharp on any screen
const SCALE = 2;
const COLORS = ['#1d2433', '#7c5cff', '#e2574c', '#f09a36', '#3fae5a', '#3b82f6'];
type Tool = 'type' | 'pen' | 'marker' | 'eraser';
const TOOLS: Array<[Tool, string, string]> = [['type', 'bars-3-bottom-left', 'Type'], ['pen', 'pencil', 'Pen'], ['marker', 'paint-brush', 'Marker'], ['eraser', 'backspace', 'Eraser']];
const WIDTH: Record<Tool, number> = { type: 0, pen: 2.5, marker: 9, eraser: 18 };
const HISTORY = 20;
// blank room under the text and the ink while drawing
const ROOM = 160;

/** The smallest box from the top-left corner that holds every inked pixel, in canvas pixels. */
function inkBox(c: HTMLCanvasElement): { w: number; h: number } {
    const data = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
    let w = 0, h = 0;
    for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
            if (data[(y * c.width + x) * 4 + 3]) { if (x + 1 > w) w = x + 1; h = y + 1; }
        }
    }
    return { w, h };
}

/** The ink as a PNG that fits a notepad's limit, or '' for no ink, or null when it is too big. */
function exportInk(c: HTMLCanvasElement): { src: string; w: number } | null | '' {
    const box = inkBox(c);
    if (!box.w || !box.h) return '';
    for (let scale = 1; scale > 0.2; scale -= 0.2) {
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(box.w * scale)); out.height = Math.max(1, Math.round(box.h * scale));
        out.getContext('2d')!.drawImage(c, 0, 0, box.w, box.h, 0, 0, out.width, out.height);
        const src = out.toDataURL('image/png');
        if (src.length <= MAX_DOODLE_CHARS) return { src, w: box.w / SCALE };
    }
    return null;
}

/**
 * The page: the toolbar, then `children` (the note text) with the ink over it.
 * `onInk` gets the new ink doodle, or null when the ink was cleared.
 */
export function InkLayer({ ink, onInk, onTooBig, children }: {
    ink: Doodle | undefined; onInk: (d: Doodle | null) => void; onTooBig: () => void; children: ReactNode;
}) {
    const page = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [tool, setTool] = useState<Tool>('type');
    const [color, setColor] = useState(COLORS[0]);
    // the page's height in CSS pixels: the ink's own height keeps its room
    const [inkHeight, setInkHeight] = useState(0);
    const undo = useRef<ImageData[]>([]);
    const [, bump] = useState(0);
    const drawing = tool !== 'type';
    const ctx = () => canvas.current!.getContext('2d', { willReadFrequently: true })!;

    /** Makes the canvas at least w by h CSS pixels, keeping what is on it. */
    const grow = (w: number, h: number) => {
        const c = canvas.current;
        if (!c) return;
        const W = Math.ceil(w * SCALE), H = Math.ceil(h * SCALE);
        if (W <= c.width && H <= c.height) return;
        const keep = c.width && c.height ? ctx().getImageData(0, 0, c.width, c.height) : null;
        c.width = Math.max(W, c.width); c.height = Math.max(H, c.height);
        c.style.width = `${c.width / SCALE}px`; c.style.height = `${c.height / SCALE}px`;
        if (keep) ctx().putImageData(keep, 0, 0);
    };

    // the canvas follows the page as it grows (more text, a wider window, room to draw)
    useLayoutEffect(() => {
        const el = page.current;
        if (!el) return;
        const fit = () => grow(el.clientWidth, el.clientHeight);
        fit();
        const watch = new ResizeObserver(fit);
        watch.observe(el);
        return () => watch.disconnect();
    }, []);

    // the saved ink, drawn back at its width on the page
    const shown = useRef<string | null>(null);
    useEffect(() => {
        if (!ink) { setInkHeight(0); return; }
        if (shown.current === ink.src) return;
        shown.current = ink.src;
        const img = new Image();
        img.onload = () => {
            const w = ink.w || img.naturalWidth / SCALE;
            const h = w * img.naturalHeight / img.naturalWidth;
            setInkHeight(h);
            grow(w, h);
            const c = ctx();
            c.clearRect(0, 0, canvas.current!.width, canvas.current!.height);
            c.drawImage(img, 0, 0, w * SCALE, h * SCALE);
        };
        img.src = ink.src;
    }, [ink?.src]);

    // ---- saving, a moment after the last stroke ----
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const save = () => {
        saveTimer.current = null;
        const c = canvas.current;
        if (!c) return;
        const out = exportInk(c);
        if (out === null) { onTooBig(); return; }
        if (out === '') { shown.current = null; setInkHeight(0); onInk(null); return; }
        shown.current = out.src;
        setInkHeight(inkBox(c).h / SCALE);
        onInk({ id: INK_ID, src: out.src, w: out.w });
    };
    const saveSoon = () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(save, 600);
    };
    // a notepad closed mid-drawing keeps the drawing
    const latestSave = useRef(save);
    latestSave.current = save;
    useEffect(() => () => { if (saveTimer.current) { clearTimeout(saveTimer.current); latestSave.current(); } }, []);

    const remember = () => {
        const c = canvas.current!;
        undo.current.push(ctx().getImageData(0, 0, c.width, c.height));
        if (undo.current.length > HISTORY) undo.current.shift();
        bump(n => n + 1);
    };
    const stepBack = () => {
        const img = undo.current.pop();
        if (!img) return;
        const c = canvas.current!;
        ctx().clearRect(0, 0, c.width, c.height);
        ctx().putImageData(img, 0, 0);
        bump(n => n + 1);
        saveSoon();
    };
    const clear = () => {
        const c = canvas.current!;
        remember();
        ctx().clearRect(0, 0, c.width, c.height);
        saveSoon();
    };

    // Ctrl+Z takes back a stroke while a drawing tool is on
    useEffect(() => {
        if (!drawing) return;
        const keys = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
            if ((e.target as Element | null)?.closest?.('input, textarea, [contenteditable]')) return;
            e.preventDefault();
            stepBack();
        };
        document.addEventListener('keydown', keys);
        return () => document.removeEventListener('keydown', keys);
    }, [drawing]);

    // ---- strokes: a smoothed line through the pointer's points ----
    const last = useRef<{ x: number; y: number; w: number } | null>(null);
    const at = (x: number, y: number, pressure: number, pointerType: string) => {
        const r = canvas.current!.getBoundingClientRect();
        // window pixels to the canvas's CSS pixels (js/core/ui-scale.ts)
        const z = effectiveZoom(canvas.current);
        // a mouse reports no pressure; a pen goes from thin to thick
        const p = pointerType === 'pen' ? Math.max(0.15, pressure || 0.5) * 2 : 1;
        return { x: (x - r.left) / z * SCALE, y: (y - r.top) / z * SCALE, w: WIDTH[tool] * SCALE * p };
    };
    const style = (c: CanvasRenderingContext2D) => {
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        c.strokeStyle = tool === 'eraser' ? '#000' : color;
        c.fillStyle = c.strokeStyle;
        c.globalAlpha = tool === 'marker' ? 0.4 : 1;
    };
    const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        remember();
        const p = at(e.clientX, e.clientY, e.pressure, e.pointerType);
        last.current = p;
        const c = ctx();
        style(c);
        c.beginPath();
        c.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
        c.fill();
    };
    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const from = last.current;
        if (!from) return;
        const c = ctx();
        style(c);
        // every coalesced point, so a fast stroke stays a curve, not a polygon
        const events = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
        let prev = from;
        for (const ev of events) {
            const p = at(ev.clientX, ev.clientY, ev.pressure, ev.pointerType);
            c.lineWidth = (prev.w + p.w) / 2;
            c.beginPath();
            c.moveTo(prev.x, prev.y);
            c.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
            c.lineTo(p.x, p.y);
            c.stroke();
            prev = p;
        }
        last.current = prev;
    };
    const up = () => { if (!last.current) return; last.current = null; saveSoon(); };

    return (
        <>
            <div className="notes-toolbar" role="toolbar" aria-label="Notes tools">
                <div className="segmented" role="group" aria-label="Tool">
                    {TOOLS.map(([key, icon, label]) => (
                        <button key={key} type="button" className={tool === key ? 'active' : ''} aria-pressed={tool === key} title={label} aria-label={label} onClick={() => setTool(key)}>
                            <Icon name={icon} size={16} />
                        </button>
                    ))}
                </div>
                {drawing && tool !== 'eraser' && (
                    <div className="doodle-colors" role="group" aria-label="Colour">
                        {COLORS.map(c => (
                            <button key={c} type="button" className={`doodle-color${color === c ? ' active' : ''}`} style={{ background: c }}
                                aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
                        ))}
                    </div>
                )}
                {drawing && (
                    <div className="doodle-history">
                        <button type="button" className="btn btn-secondary btn-icon btn-sm" disabled={!undo.current.length} onClick={stepBack} title="Undo (Ctrl+Z)" aria-label="Undo"><Icon name="arrow-uturn-left" size={16} /></button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>Clear ink</button>
                    </div>
                )}
            </div>
            <div ref={page} className={`notes-page${drawing ? ' is-drawing' : ''}`}
                style={{ minHeight: Math.ceil(inkHeight) + (drawing ? ROOM : 0) || undefined }}>
                {children}
                <canvas ref={canvas} className={`notes-ink tool-${tool}`} aria-label="Drawing on the notes"
                    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} />
            </div>
        </>
    );
}
