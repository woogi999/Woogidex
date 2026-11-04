// The block editor: a dialog that slides down over the page you are on, to
// give a custom ability, move, item or condition its battle code out of
// Scratch-style blocks, with the Showdown and Essentials code it makes beside
// the board. The program, the drag system and the compilers stay in
// js/editor/ability-blocks.ts; this draws what it holds. Opening and closing
// (and the slide) are openAbilityBlockEditor / closeAbilityBlockEditor there.

import { useEffect, useRef, useState } from 'react';
import { abilityBlockView, allowWorkspaceDrop, closeAbilityBlockEditor, handleWorkspaceDrop, saveAbilityBlockEditor, setAbilityBlockPreviewTab } from '../../editor/ability-blocks.ts';
import { api } from '../../core/app.ts';
import { Icon } from '../components/Icon.tsx';
import { AbilityPalette } from '../components/blocks/AbilityPalette.tsx';
import { BlockBoard } from '../components/blocks/BlockBoard.tsx';
import { useStore } from '../store.ts';

const CODE_KEY = 'woogidex-block-editor-code';

/** Whether the code column shows, remembered in this browser. */
function useCodeColumn(): [boolean, () => void] {
    const [open, setOpen] = useState(() => {
        try { return localStorage.getItem(CODE_KEY) !== 'off'; } catch { return true; }
    });
    const toggle = () => setOpen(v => {
        try { localStorage.setItem(CODE_KEY, v ? 'off' : 'on'); } catch { /* storage blocked: the choice lasts this visit */ }
        return !v;
    });
    return [open, toggle];
}

export function AbilityBlockEditorPage() {
    useStore();
    const v = abilityBlockView();
    const [codeOpen, toggleCode] = useCodeColumn();
    const [copied, setCopied] = useState(false);
    const box = useRef<HTMLElement>(null);
    // the dialog takes the focus when it opens, so Esc and Tab start inside it
    const id = v ? `${v.kind}:${v.name}` : '';
    useEffect(() => { if (id) box.current?.focus({ preventScroll: true }); }, [id]);
    if (!v) return null;
    const code = v.previewTab === 'sd' ? v.sd : v.es;
    const copy = async () => {
        try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); }
        catch { api.showToast?.('Copy failed. Select the code and copy it yourself.', 'error'); }
    };
    const empty = !v.events.some((e: any) => (e.body || []).length) && !v.loose.length;

    return (
        <div className="ab-overlay" onPointerDown={e => { if (e.target === e.currentTarget) closeAbilityBlockEditor(); }}>
            <section ref={box} className={`ab-modal${codeOpen ? ' with-code' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ab-modal-title" tabIndex={-1}>
                <header className="ab-modal-head">
                    <div className="ab-modal-title">
                        <Icon name="puzzle-piece" size={18} />
                        <h2 id="ab-modal-title"><span className="ab-modal-noun">{v.Noun} battle code</span>{v.name}</h2>
                        {v.dirty && <span className="ab-unsaved">Not saved</span>}
                    </div>
                    <div className="ab-modal-actions">
                        <button type="button" className={`btn btn-secondary btn-sm ab-code-toggle${codeOpen ? ' is-on' : ''}`} aria-pressed={codeOpen} onClick={toggleCode}>
                            <Icon name="code-bracket" size={15} /><span>Code</span>
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => closeAbilityBlockEditor()}>Cancel</button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => saveAbilityBlockEditor()}>Save</button>
                    </div>
                </header>

                <div className="ab-modal-body">
                    <aside className="ab-palette" aria-label="Blocks"><AbilityPalette kind={v.kind} tables={v.tables} /></aside>

                    <div className="ab-board-scroll">
                        <div className="ab-workspace" id="ab-workspace" onDragOver={e => allowWorkspaceDrop(e)} onDrop={e => handleWorkspaceDrop(e)}>
                            <BlockBoard events={v.events} loose={v.loose} tables={v.tables} />
                        </div>
                        {empty && (
                            <p className="ab-board-hint">
                                <Icon name="cursor-arrow-rays" size={18} />
                                Drag a block from the left into the event's gap. A block snaps in when its top-left corner is near a gap.
                            </p>
                        )}
                    </div>

                    {codeOpen && (
                        <aside className="ab-code" aria-label="The code these blocks make">
                            <div className="ab-code-head">
                                <div className="segmented ab-code-tabs" role="tablist" aria-label="Code for">
                                    {([['sd', 'Showdown'], ['es', 'Essentials']] as const).map(([tab, label]) => (
                                        <button key={tab} type="button" role="tab" aria-selected={v.previewTab === tab} className={v.previewTab === tab ? 'active' : ''} onClick={() => setAbilityBlockPreviewTab(tab)}>{label}</button>
                                    ))}
                                </div>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
                                    <Icon name={copied ? 'check' : 'clipboard'} size={14} /><span>{copied ? 'Copied' : 'Copy'}</span>
                                </button>
                            </div>
                            <pre className="ab-code-text">{code}</pre>
                        </aside>
                    )}
                </div>
            </section>
        </div>
    );
}
