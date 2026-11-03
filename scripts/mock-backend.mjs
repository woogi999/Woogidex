// A stand-in for Supabase, for working on the site without the live
// database. It answers the three APIs the site uses, on one port:
//
//   /auth/v1/*                       sign up, sign in, sessions (any password works)
//   /functions/v1/login-with-identifier   sign in by username
//   /rest/v1/<table>, /rest/v1/rpc/<fn>   tables as plain JSON lists, with the
//                                    PostgREST filters the site uses
//
// Everything else (storage, other edge functions, Realtime) answers with an
// error, so those features fail as they would offline.
//
// It is for local work only. There are no row-level rules: every account
// can read and change everything. It listens on 127.0.0.1 only.
//
// The data is kept in node_modules/.cache/woogidex-mock/db.json between runs.
// Delete that file to start empty.
//
// Run: node scripts/mock-backend.mjs [--port 54321]
// (npm run site -- --backend=mock starts it for you)

import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = resolve(root, 'node_modules/.cache/woogidex-mock/db.json');
const portArg = process.argv.indexOf('--port');
const PORT = Number(portArg > 0 ? process.argv[portArg + 1] : process.env.MOCK_BACKEND_PORT) || 54321;
const MAX_BODY = 25 * 1024 * 1024;

// ==================== the data ====================

/** @type {{ tables: Record<string, any[]>, users: any[] }} */
let db = { tables: {}, users: [] };
try { if (existsSync(dbFile)) db = JSON.parse(readFileSync(dbFile, 'utf8')); } catch { console.warn('[mock] db.json could not be read; starting empty'); }
db.tables ||= {};
db.users ||= [];

let saveTimer = null;
function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        mkdirSync(dirname(dbFile), { recursive: true });
        writeFileSync(dbFile, JSON.stringify(db));
    }, 200);
}
const table = name => (db.tables[name] ||= []);

// ==================== auth ====================

const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');

/** A JWT-shaped token. supabase-js reads its claims, but nothing checks the signature here. */
function accessToken(user) {
    const now = Math.floor(Date.now() / 1000);
    return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 })}.mock`;
}

function session(user) {
    const refresh = randomUUID();
    user.refresh = refresh;
    save();
    return {
        access_token: accessToken(user), refresh_token: refresh, token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: publicUser(user)
    };
}

function publicUser(u) {
    return {
        id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
        email_confirmed_at: u.created_at, confirmed_at: u.created_at, created_at: u.created_at, updated_at: u.created_at,
        app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.metadata || {},
        identities: [{ id: u.id, user_id: u.id, provider: 'email', identity_data: { email: u.email, sub: u.id } }]
    };
}

/** The mock account for a username or an email, made the first time it is asked for. */
function account(identifier, metadata = {}) {
    const id = String(identifier || '').trim().toLowerCase();
    if (!id) return null;
    const email = id.includes('@') ? id : `${id}@mock.local`;
    let user = db.users.find(u => u.email === email);
    if (!user) {
        const username = (metadata.username || email.split('@')[0]).replace(/[^a-z0-9_]/gi, '').slice(0, 20) || 'mockuser';
        user = { id: randomUUID(), email, created_at: new Date().toISOString(), metadata: { ...metadata, username } };
        db.users.push(user);
        table('profiles').push({ id: user.id, username, display_name: metadata.display_name || username, role: 'user', display_badges: [], username_history: [], created_at: user.created_at });
        save();
        console.log(`[mock] new account: ${username}`);
    }
    return user;
}

function userFromRequest(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = token.split('.')[1];
    if (!payload) return null;
    try {
        const { sub } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return db.users.find(u => u.id === sub) || null;
    } catch { return null; }
}

function handleAuth(req, res, path, query, body) {
    if (path === '/auth/v1/settings') return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
    if (path === '/auth/v1/signup' && req.method === 'POST') {
        const user = account(body?.email, body?.data || {});
        return user ? send(res, 200, session(user)) : send(res, 400, { error: 'invalid_request', msg: 'An email is required.' });
    }
    if (path === '/auth/v1/token' && req.method === 'POST') {
        if (query.get('grant_type') === 'refresh_token') {
            const user = db.users.find(u => u.refresh && u.refresh === body?.refresh_token);
            return user ? send(res, 200, session(user)) : send(res, 400, { error: 'invalid_grant', error_description: 'Refresh token not found' });
        }
        const user = account(body?.email);
        return user ? send(res, 200, session(user)) : send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    if (path === '/auth/v1/user') {
        const user = userFromRequest(req);
        if (!user) return send(res, 401, { code: 401, msg: 'Not signed in' });
        if (req.method === 'PUT') {
            if (body?.data) user.metadata = { ...user.metadata, ...body.data };
            if (body?.email) user.email = String(body.email).toLowerCase();
            save();
        }
        return send(res, 200, publicUser(user));
    }
    if (path === '/auth/v1/logout') return send(res, 204);
    if (path === '/auth/v1/recover') return send(res, 200, {});
    return send(res, 404, { msg: `The mock backend has no ${path}` });
}

// ==================== tables ====================

/** One PostgREST filter value, as text in the URL, against a row's value. */
function matches(value, op, raw) {
    const text = value === null || value === undefined ? null : typeof value === 'object' ? JSON.stringify(value) : String(value);
    switch (op) {
        case 'eq': return text === raw;
        case 'neq': return text !== raw;
        case 'gt': return Number(value) > Number(raw) || (isNaN(Number(raw)) && String(value) > raw);
        case 'gte': return Number(value) >= Number(raw) || (isNaN(Number(raw)) && String(value) >= raw);
        case 'lt': return Number(value) < Number(raw) || (isNaN(Number(raw)) && String(value) < raw);
        case 'lte': return Number(value) <= Number(raw) || (isNaN(Number(raw)) && String(value) <= raw);
        case 'is': return raw === 'null' ? value === null || value === undefined : String(value) === raw;
        case 'in': return raw.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(text ?? '');
        case 'like': case 'ilike': {
            const re = new RegExp('^' + raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', op === 'ilike' ? 'i' : '');
            return re.test(text ?? '');
        }
        case 'cs': return Array.isArray(value) && raw.replace(/^\{|\}$/g, '').split(',').every(x => value.map(String).includes(x));
        default: return true;
    }
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function filterRows(rows, query) {
    let out = rows;
    for (const [key, val] of query) {
        if (RESERVED.has(key)) continue;
        if (key === 'or' || key === 'and') continue;   // not modelled: every row passes
        const m = /^(not\.)?(\w+)\.(.*)$/s.exec(val);
        if (!m) continue;
        const [, not, op, raw] = m;
        out = out.filter(r => (not ? !matches(r[key], op, raw) : matches(r[key], op, raw)));
    }
    const order = query.get('order');
    if (order) {
        const [col, dir = 'asc'] = order.split(',')[0].split('.');
        out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    return out;
}

function handleRest(req, res, path, query, body) {
    const name = decodeURIComponent(path.slice('/rest/v1/'.length));
    if (name.startsWith('rpc/')) return send(res, 200, rpc(name.slice(4), body || Object.fromEntries(query), req));
    if (!/^\w+$/.test(name)) return send(res, 404, { message: 'Unknown table' });
    const rows = table(name);
    const prefer = String(req.headers.prefer || '');
    const one = String(req.headers.accept || '').includes('vnd.pgrst.object');
    const user = userFromRequest(req);

    if (req.method === 'GET' || req.method === 'HEAD') {
        const found = filterRows(rows, query);
        const offset = Number(query.get('offset')) || 0;
        const limit = query.has('limit') ? Number(query.get('limit')) : found.length;
        const page = found.slice(offset, offset + limit);
        const headers = prefer.includes('count=') ? { 'Content-Range': `${offset}-${offset + page.length - 1}/${found.length}` } : {};
        if (one) return page.length === 1 ? send(res, 200, page[0], headers) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
        return send(res, 200, req.method === 'HEAD' ? undefined : page, headers);
    }
    if (req.method === 'POST') {
        const now = new Date().toISOString();
        const incoming = (Array.isArray(body) ? body : [body]).filter(Boolean).map(r => ({
            id: randomUUID(), created_at: now, published_at: now, ...(user ? { user_id: user.id } : {}), ...r
        }));
        const upsert = prefer.includes('resolution=merge-duplicates');
        for (const r of incoming) {
            const at = upsert ? rows.findIndex(x => x.id === r.id) : -1;
            if (at >= 0) rows[at] = { ...rows[at], ...r }; else rows.push(r);
        }
        save();
        return prefer.includes('return=representation') ? send(res, 201, one ? incoming[0] : incoming) : send(res, 201);
    }
    if (req.method === 'PATCH') {
        const hit = filterRows(rows, query);
        hit.forEach(r => Object.assign(r, body || {}));
        save();
        return prefer.includes('return=representation') ? send(res, 200, one ? hit[0] ?? null : hit) : send(res, 204);
    }
    if (req.method === 'DELETE') {
        const hit = new Set(filterRows(rows, query));
        db.tables[name] = rows.filter(r => !hit.has(r));
        save();
        return prefer.includes('return=representation') ? send(res, 200, [...hit]) : send(res, 204);
    }
    return send(res, 405, { message: 'Method not allowed' });
}

// Database functions. The few the site needs an answer of a set shape from
// are here; any other one answers null, as a function with no result would.
function rpc(fn, args, req) {
    switch (fn) {
        case 'my_limits':
            return { community_uploads: -1, publish_cooldown_seconds: 0, cloud_items: -1, cloud_bytes: -1, cloud_regions: -1, auto_backup: false };
        case 'community_feed':
        case 'community_search':
            return table('published_mons').slice(-50).reverse();
        case 'community_mon_detail':
            return table('published_mons').find(r => r.id === args.p_id) || null;
        case 'open_mon_detail':
            return table('published_mons').find(r => r.id === args.p_id && r.is_open) || null;
        case 'community_mon_artwork':
        case 'community_mon_images':
            // masking is an obfuscation of the live site; here the detail row already holds the plain images
            return [];
        case 'increment_published_mon_view':
            return null;
        default:
            if (/^(get|list|search|my)_/.test(fn) || /_(list|feed|rows)$/.test(fn)) return [];
            return null;
    }
}

// ==================== edge functions ====================

function handleFunctions(req, res, path, body) {
    if (path === '/functions/v1/login-with-identifier') {
        const user = account(body?.identifier);
        return user ? send(res, 200, { ok: true, session: session(user) }) : send(res, 200, { ok: false, error: 'Invalid username or password.' });
    }
    if (path === '/functions/v1/record-auth-event') return send(res, 200, { ok: true, allowed: true });
    return send(res, 501, { error: `The mock backend has no edge function ${path.slice('/functions/v1/'.length)}.` });
}

// ==================== the server ====================

function send(res, status, data, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(data === undefined ? undefined : JSON.stringify(data));
}

// The site reaches the mock through the dev server's /sb proxy, never from a
// page, so there are no CORS headers: another tab cannot read or change this
// data. The Host check refuses a page that points its own name at 127.0.0.1.
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

const server = createServer((req, res) => {
    if (!LOCAL_HOST.test(String(req.headers.host || ''))) return send(res, 403, { message: 'The mock backend answers local requests only.' });
    const chunks = [];
    let size = 0;
    req.on('data', c => {
        size += c.length;
        if (size > MAX_BODY) { send(res, 413, { message: 'Request too large' }); req.destroy(); return; }
        chunks.push(c);
    });
    req.on('end', () => {
        if (res.writableEnded) return;
        const url = new URL(req.url, 'http://mock');
        let body = null;
        const text = Buffer.concat(chunks).toString();
        if (text) { try { body = JSON.parse(text); } catch { body = null; } }
        try {
            if (url.pathname.startsWith('/auth/v1/')) return handleAuth(req, res, url.pathname, url.searchParams, body);
            if (url.pathname.startsWith('/rest/v1/')) return handleRest(req, res, url.pathname, url.searchParams, body);
            if (url.pathname.startsWith('/functions/v1/')) return handleFunctions(req, res, url.pathname, body);
            send(res, 501, { message: `The mock backend has no ${url.pathname.split('/').slice(0, 3).join('/')}` });
        } catch (e) {
            console.error('[mock]', e);
            send(res, 500, { message: String(e?.message || e) });
        }
    });
});
// Realtime is a WebSocket: refused, so live updates simply do not arrive
server.on('upgrade', (_req, socket) => socket.destroy());
server.listen(PORT, '127.0.0.1', () => console.log(`[mock] Supabase stand-in on http://127.0.0.1:${PORT} (data: ${dbFile})`));
