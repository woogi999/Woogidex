// Downloads (/downloads): files staff put up for everyone, like a game's
// patch or a pack of sprites. Staff with the "manage_downloads" permission
// upload and delete them. The database and the storage bucket check that
// permission again (Woogidex-DB 20261123150000_post_tier_lists_and_downloads).
// The files are public: anyone with the link downloads them.

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';
import { log } from '../core/log.ts';
import { confirmDialog } from '../core/confirm-dialog.ts';

export interface DownloadRow { id: string; title: string; description: string; path: string; file_name: string; size: number; mime: string; created_at: string; }

const BUCKET = 'downloads';
export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

const ds: { items: DownloadRow[]; loading: boolean; loaded: boolean; error: string } = { items: [], loading: false, loaded: false, error: '' };
export const downloadsState = () => ds;

/** Whether you may upload and delete downloads (the database checks again). */
export const canManageDownloads = () => !!state.user?.permissions?.manage_downloads;

export async function loadDownloads(force = false) {
    if (ds.loading || (ds.loaded && !force)) return;
    ds.loading = true;
    ds.error = '';
    notify();
    try {
        const client = await api.getClient();
        const { data, error } = await client.from('site_downloads').select('id, title, description, path, file_name, size, mime, created_at')
            .order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        ds.items = (data || []) as DownloadRow[];
        ds.loaded = true;
    } catch (e: any) {
        log.warn('DOWNLOADS', 'Could not load downloads', e);
        ds.error = /site_downloads/.test(String(e?.message)) ? 'Downloads aren’t switched on yet.' : 'Couldn’t load the downloads.';
    } finally {
        ds.loading = false;
        notify();
    }
}

/** A public link that downloads the file under its own name. */
export async function downloadUrl(row: DownloadRow): Promise<string> {
    const client = await api.getClient();
    return client.storage.from(BUCKET).getPublicUrl(row.path, { download: row.file_name }).data.publicUrl;
}

/** A file name that is safe in a storage path: letters, numbers and . _ - ( ) and spaces. */
const safeName = (name: string) => (String(name).replace(/[^A-Za-z0-9._ ()-]+/g, '_').replace(/^[._ ]+/, '').slice(0, 120) || 'file');

export async function uploadDownload(file: File, title: string, description: string): Promise<boolean> {
    if (!canManageDownloads()) { api.showToast?.('You need the manage downloads permission.', 'error'); return false; }
    if (!file || !file.size) { api.showToast?.('Pick a file.', 'warning'); return false; }
    if (file.size > MAX_DOWNLOAD_BYTES) { api.showToast?.('Files can be up to 50 MB.', 'warning'); return false; }
    const name = safeName(file.name);
    const path = `${crypto.randomUUID()}/${name}`;
    const client = await api.getClient();
    try {
        const { error: upError } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (upError) throw upError;
        const { error } = await client.from('site_downloads').insert({
            title: title.trim().slice(0, 120) || name, description: description.trim().slice(0, 2000), path, file_name: name,
            size: file.size, mime: (file.type || 'application/octet-stream').slice(0, 120), created_by: state.user!.id
        });
        if (error) { await client.storage.from(BUCKET).remove([path]); throw error; }
        api.showToast?.(`Uploaded ${name}.`, 'success');
        await loadDownloads(true);
        return true;
    } catch (e: any) {
        log.error('DOWNLOADS', 'Upload failed', e);
        api.showToast?.(e?.message || 'The upload failed.', 'error');
        return false;
    }
}

export async function deleteDownload(row: DownloadRow) {
    if (!await confirmDialog({ title: `Delete “${row.title}”?`, message: 'The file is gone for everyone, and its link stops working.', confirmLabel: 'Delete', danger: true })) return;
    try {
        const client = await api.getClient();
        const { error } = await client.from('site_downloads').delete().eq('id', row.id);
        if (error) throw error;
        await client.storage.from(BUCKET).remove([row.path]);
        await loadDownloads(true);
    } catch (e: any) {
        api.showToast?.(e?.message || 'Couldn’t delete it.', 'error');
    }
}
