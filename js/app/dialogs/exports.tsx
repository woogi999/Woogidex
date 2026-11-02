// Import Collection and Export as Plain Text. The file handling and the text
// itself are js/export/export.ts.

import { useState } from 'react';
import { api } from '../../core/app.ts';
import { registerDialog, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';

const selectStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-sans)', fontSize: 13 };

function CollectionImportDialog({ close }: DialogProps) {
    const [file, setFile] = useState<File | null>(null);
    const [mode, setMode] = useState<'file' | 'paste'>('file');
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    // a paste goes through the same path as a file: JSON if it looks like JSON, else plain text
    const source = (): File | null => {
        if (mode === 'file') return file;
        const t = text.trim();
        if (!t) return null;
        const json = /^[[{]/.test(t);
        return new File([t], json ? 'pasted.json' : 'pasted.txt', { type: json ? 'application/json' : 'text/plain' });
    };
    const ready = mode === 'file' ? !!file : !!text.trim();
    const run = async (how: 'add' | 'replace') => {
        setBusy(true);
        const ok = await api.importCollection(source(), how);
        setBusy(false);
        if (ok) close();
        else if (mode === 'file') setFile(null);
    };
    return (
        <Modal onClose={close} title="Import Collection" className="collection-import-dialog" labelledBy="collection-import-title">
            <p className="collection-import-lead">Import a collection or a Fakémon export, from a file or pasted text. Add it to your collection, or replace the current one.</p>
            <div className="segmented collection-import-mode" role="tablist" aria-label="Import from">
                <button type="button" role="tab" aria-selected={mode === 'file'} className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>File</button>
                <button type="button" role="tab" aria-selected={mode === 'paste'} className={mode === 'paste' ? 'active' : ''} onClick={() => setMode('paste')}>Paste text</button>
            </div>
            {mode === 'file' ? (
                <>
                    <label className="file-upload-btn collection-import-pick">
                        <input type="file" accept=".json,.txt,application/json,text/plain" onChange={e => setFile(e.target.files?.[0] || null)} />
                        Choose JSON / TXT File
                    </label>
                    <div className="collection-import-status">
                        {file ? `Selected: ${file.name}` : 'Choose a collection, Fakémon, custom move, custom ability, or custom item JSON/TXT file.'}
                    </div>
                </>
            ) : (
                <>
                    <textarea className="collection-import-text" spellCheck={false} autoFocus value={text} onChange={e => setText(e.target.value)}
                        placeholder={'Paste a plain text export (Name: …, Types: …, Stats: …)\nor JSON. Several Fakémon at once work too.'} />
                    <div className="collection-import-status">
                        {text.trim() ? (/^[[{]/.test(text.trim()) ? 'Looks like JSON.' : `Plain text, ${Math.max(1, (text.match(/^\s*Name:/gim) || []).length)} Fakémon.`) : 'Plain text exports and JSON both work.'}
                    </div>
                </>
            )}
            <div className="collection-import-actions">
                <button className="btn btn-secondary" type="button" disabled={!ready || busy} onClick={() => run('add')}>Add to Collection</button>
                <button className="btn btn-danger" type="button" disabled={!ready || busy} onClick={() => run('replace')}>Replace Collection</button>
            </div>
        </Modal>
    );
}

function PlainTextExportDialog({ close }: DialogProps) {
    const [sort, setSort] = useState('name');
    const [order, setOrder] = useState('asc');
    // built once for the Fakémon open now, and again when the order changes
    const [text, setText] = useState(() => {
        try { return api.buildPlainTextExport('name', 'asc'); }
        catch { api.showToast('Plain text export failed!', 'error'); return ''; }
    });
    const rebuild = (s: string, o: string) => setText(api.buildPlainTextExport(s, o));
    return (
        <Modal onClose={close} title="Export as Plain Text" className="plain-text-export-dialog" labelledBy="plain-text-title">
            <p className="dialog-hint">Choose the learnset order, then copy the text below or download it as a .txt file.</p>
            <div className="dialog-sort-row">
                <label>Learnset sort</label>
                <select style={{ ...selectStyle, width: 145 }} value={sort} onChange={e => { setSort(e.target.value); rebuild(e.target.value, order); }}>
                    <option value="name">Alphabetical</option>
                    <option value="type">Type</option>
                    <option value="power">Power</option>
                    <option value="category">Category</option>
                    <option value="default">Default</option>
                </select>
                <select style={{ ...selectStyle, width: 105 }} value={order} onChange={e => { setOrder(e.target.value); rebuild(sort, e.target.value); }} aria-label="Order">
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                </select>
            </div>
            <textarea className="plain-text-export-text" spellCheck={false} value={text} onChange={e => setText(e.target.value)}
                autoFocus onFocus={e => e.currentTarget.select()} />
            <div className="dialog-actions">
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => api.copyPlainTextExport(text)}>Copy Text</button>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => api.downloadPlainTextExport(text)}>Download .txt</button>
                <button className="btn btn-secondary btn-sm" type="button" onClick={close}>Close</button>
            </div>
        </Modal>
    );
}

registerDialog('collection-import', CollectionImportDialog);
registerDialog('plain-text-export', PlainTextExportDialog);
