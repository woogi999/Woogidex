// /downloads: files staff put up for everyone (js/features/downloads.ts).
// Staff with the manage downloads permission see an upload form on top.

import { useEffect, useState } from 'react';
import { useStore } from '../store.ts';
import { Icon } from '../components/Icon.tsx';
import { SkeletonRows } from '../components/Skeleton.tsx';
import {
    MAX_DOWNLOAD_BYTES, canManageDownloads, deleteDownload, downloadUrl, downloadsState, loadDownloads, uploadDownload, type DownloadRow
} from '../../features/downloads.ts';

const size = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

function UploadForm() {
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [busy, setBusy] = useState(false);
    return (
        <form className="downloads-upload" onSubmit={async e => {
            e.preventDefault();
            if (!file) return;
            setBusy(true);
            if (await uploadDownload(file, title, desc)) { setFile(null); setTitle(''); setDesc(''); }
            setBusy(false);
        }}>
            <h2>Upload a file</h2>
            <p className="downloads-help">Staff only. Everyone can download what you put here. Up to {size(MAX_DOWNLOAD_BYTES)} a file.</p>
            <input type="file" aria-label="File" onChange={e => { const f = e.target.files?.[0] || null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }} />
            <input type="text" value={title} maxLength={120} placeholder="Title" aria-label="Title" onChange={e => setTitle(e.target.value)} />
            <textarea rows={3} value={desc} maxLength={2000} placeholder="What it is, and how to use it" aria-label="Description" onChange={e => setDesc(e.target.value)} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!file || busy}><Icon name="arrow-up-tray" size={14} /> {busy ? 'Uploading…' : 'Upload'}</button>
        </form>
    );
}

function Row({ row, manage }: { row: DownloadRow; manage: boolean }) {
    return (
        <article className="download-row">
            <span className="download-icon"><Icon name="document" size={22} /></span>
            <span className="download-text">
                <strong>{row.title}</strong>
                {row.description && <span className="download-desc">{row.description}</span>}
                <small>{row.file_name} · {size(row.size)} · {new Date(row.created_at).toLocaleDateString()}</small>
            </span>
            <button type="button" className="btn btn-primary btn-sm" onClick={async () => { const a = document.createElement('a'); a.href = await downloadUrl(row); a.rel = 'noopener'; a.click(); }}>
                <Icon name="arrow-down-tray" size={14} /> Download
            </button>
            {manage && <button type="button" className="btn btn-secondary btn-sm" aria-label={`Delete ${row.title}`} onClick={() => deleteDownload(row)}><Icon name="trash-2" size={14} /></button>}
        </article>
    );
}

export function DownloadsPage() {
    useStore();
    useEffect(() => { loadDownloads(); }, []);
    const d = downloadsState();
    const manage = canManageDownloads();
    return (
        <div className="downloads-page">
            <header className="page-header">
                <div className="page-heading">
                    <h1 className="page-title">Downloads</h1>
                    <p className="toolbox-sub">Files from the Woogidex team.</p>
                </div>
            </header>
            {manage && <UploadForm />}
            {d.error && <p className="downloads-help">{d.error}</p>}
            {!d.loaded && d.loading && <SkeletonRows count={3} label="Loading downloads" />}
            {d.loaded && !d.items.length && <p className="downloads-help">Nothing to download yet.</p>}
            <div className="downloads-list">{d.items.map(r => <Row key={r.id} row={r} manage={manage} />)}</div>
        </div>
    );
}
