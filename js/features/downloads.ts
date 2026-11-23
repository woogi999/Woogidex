// Files staff share, like a game's patch or a pack of sprites. There is no
// downloads page: a file goes out in a post. Staff with the
// "manage_downloads" permission see "Attach a file" in the post composer;
// the file goes to the public "downloads" bucket, a row goes in
// site_downloads, and the post points at it (community_posts.download_id).
// The database and the storage bucket check the permission again
// (Woogidex-DB 20261123150000_post_tier_lists_and_downloads). The files are
// public: anyone with the post downloads them.

import { api, state } from '../core/app.ts';
import { log } from '../core/log.ts';

export interface DownloadRow { id: string; title: string; description: string; path: string; file_name: string; size: number; mime: string; created_at: string; }

const BUCKET = 'downloads';
export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
export const DOWNLOAD_FIELDS = 'id, title, description, path, file_name, size, mime, created_at';

/** Whether you may attach a file to a post (the database checks again). */
export const canManageDownloads = () => !!state.user?.permissions?.manage_downloads;

/** A public link that downloads the file under its own name. */
export async function downloadUrl(row: DownloadRow): Promise<string> {
    const client = await api.getClient();
    return client.storage.from(BUCKET).getPublicUrl(row.path, { download: row.file_name }).data.publicUrl;
}

/** 1.2 MB, 340 KB... */
export function sizeLabel(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A file name that is safe in a storage path: letters, numbers and . _ - ( ) and spaces. */
const safeName = (name: string) => (String(name).replace(/[^A-Za-z0-9._ ()-]+/g, '_').replace(/^[._ ]+/, '').slice(0, 120) || 'file');

/**
 * Uploads a file for a post.
 * @returns its row, or null (a toast says why)
 */
export async function uploadDownload(file: File, title = ''): Promise<DownloadRow | null> {
    if (!canManageDownloads()) { api.showToast?.('You need the downloads permission.', 'error'); return null; }
    if (!file || !file.size) { api.showToast?.('Pick a file.', 'warning'); return null; }
    if (file.size > MAX_DOWNLOAD_BYTES) { api.showToast?.('Files can be up to 50 MB.', 'warning'); return null; }
    const name = safeName(file.name);
    const path = `${crypto.randomUUID()}/${name}`;
    const client = await api.getClient();
    try {
        const { error: upError } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (upError) throw upError;
        const { data, error } = await client.from('site_downloads').insert({
            title: title.trim().slice(0, 120) || name, description: '', path, file_name: name,
            size: file.size, mime: (file.type || 'application/octet-stream').slice(0, 120), created_by: state.user!.id
        }).select(DOWNLOAD_FIELDS).single();
        if (error) { await client.storage.from(BUCKET).remove([path]); throw error; }
        return data as DownloadRow;
    } catch (e: any) {
        log.error('DOWNLOADS', 'Upload failed', e);
        api.showToast?.(e?.message || 'The upload failed.', 'error');
        return null;
    }
}

/** Takes back a file that never made it into a post (the composer was cleared). */
export async function discardDownload(row: DownloadRow) {
    try {
        const client = await api.getClient();
        await client.from('site_downloads').delete().eq('id', row.id);
        await client.storage.from(BUCKET).remove([row.path]);
    } catch { /* an orphan file harms nobody; staff can clean it later */ }
}
