// Runs or builds the whole site from the three repos, in one command.
//
//   npm run site                         dev server, live backend
//   npm run site -- --backend=mock       dev server, local mock backend
//   npm run site -- build                production build into dist/, then
//                                        serves it (vite preview)
//   npm run site -- build --no-serve     production build only
//   npm run site -- --sync               pull all three repos first
//   npm run site -- --check              typecheck before it starts
//
// What it does, in order:
//   1. Makes sure woogidex-core and woogidex-backend sit next to this repo.
//      A missing one is cloned. --sync also pulls the ones that are there
//      (scripts/sync.mjs, which skips a repo with uncommitted changes).
//   2. Links Core at ./core (scripts/link-core.mjs).
//   3. Installs packages when node_modules is missing (npm ci).
//   4. Picks the backend that /sb goes to:
//        live  https://qstbascfeolkyxtrqqwv.supabase.co. Real accounts and
//              real data: what you do there is live.
//        mock  scripts/mock-backend.mjs on 127.0.0.1. Any username and
//              password signs in. Nothing leaves this machine.
//        local a real Supabase in Docker with the live schema and no live
//              data (scripts/local-db.mjs; run its setup one time first).
//        <url> any other Supabase project, for example a local one.
//   5. Starts the dev server, or builds and serves dist/.
//
// The Worker (woogidex-backend/worker) does not run here: its link previews,
// /sheets and TURN need Cloudflare and its secrets. The dev server stands in
// for its /sb proxy.

import { existsSync } from 'fs';
import { spawn, execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parent = resolve(root, '..');
const LIVE = 'https://qstbascfeolkyxtrqqwv.supabase.co';

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => {
    const hit = args.find(a => a.startsWith(`--${name}=`));
    if (hit) return hit.slice(name.length + 3);
    const at = args.indexOf(`--${name}`);
    return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : fallback;
};
const mode = args.includes('build') ? 'build' : 'dev';
const backend = option('backend', 'live');
const mockPort = Number(option('mock-port', 54321));

if (flag('help') || flag('h')) {
    console.log(readUsage());
    process.exit(0);
}

// Tools run through node itself, never through a shell, so no argument is ever parsed as a command.
const run = (cmd, cmdArgs, opts = {}) => execFileSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', ...opts });
const tool = (pkg, file) => resolve(root, 'node_modules', pkg, file);
const vite = (...a) => [tool('vite', 'bin/vite.js'), ...a];

// ---- 1. the repos ----
const missing = ['woogidex-core', 'woogidex-backend'].filter(name => !existsSync(resolve(parent, name, '.git')));
if (flag('sync') || missing.length) {
    if (missing.length) console.log(`[site] getting ${missing.join(' and ')}`);
    try { run(process.execPath, [resolve(root, 'scripts/sync.mjs')]); }
    catch { console.warn('[site] sync did not finish cleanly (see above); going on with what is here'); }
}

// ---- 2. Core at ./core ----
run(process.execPath, [resolve(root, 'scripts/link-core.mjs')]);

// ---- 3. packages ----
if (!existsSync(resolve(root, 'node_modules'))) {
    console.log('[site] installing packages');
    // npm_execpath is npm's own script when this runs through "npm run site"
    if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, 'ci']);
    else run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], { shell: process.platform === 'win32' });
}

// ---- 4. the backend ----
let supabase = LIVE;
const children = [];
if (backend === 'mock') {
    const mock = spawn(process.execPath, [resolve(root, 'scripts/mock-backend.mjs'), '--port', String(mockPort)], { cwd: root, stdio: 'inherit' });
    children.push(mock);
    // without its backend the site only shows errors: stop everything and say why
    mock.on('exit', code => {
        if (code === null) return;   // stopped by stopAll()
        console.error(`[site] the mock backend stopped (exit ${code}). Is port ${mockPort} in use? Try --mock-port <another port>.`);
        stopAll();
        process.exit(1);
    });
    supabase = `http://127.0.0.1:${mockPort}`;
} else if (backend === 'local') {
    // a real Supabase in Docker with the live schema (scripts/local-db.mjs)
    const { start: startLocal } = await import('./local-db.mjs');
    const local = startLocal();
    supabase = local.url.replace(/\/+$/, '');
    process.env.WOOGIDEX_SUPABASE_KEY = local.key;
    console.log(`[site] local Supabase Studio: ${local.studio}`);
} else if (backend !== 'live') {
    if (!/^https?:\/\/[^\s/]+/.test(backend)) {
        console.error(`[site] --backend must be live, mock, local or a URL, not "${backend}"`);
        process.exit(1);
    }
    supabase = backend.replace(/\/+$/, '');
}
console.log(`[site] backend: ${backend === 'live' ? `live (${LIVE}). Real accounts and real data.` : supabase}`);
const env = { ...process.env, WOOGIDEX_SUPABASE: supabase };

// ---- 5. check, then dev or build ----
if (flag('check')) {
    run(process.execPath, [tool('typescript', 'bin/tsc'), '--noEmit'], { env });
    console.log('[site] typecheck passed');
}

function start(cmd, cmdArgs) {
    const child = spawn(cmd, cmdArgs, { cwd: root, stdio: 'inherit', env });
    children.push(child);
    child.on('exit', code => { stopAll(); process.exit(code ?? 0); });
}
function stopAll() { for (const c of children) if (!c.killed) c.kill(); }
process.on('SIGINT', () => { stopAll(); process.exit(130); });
process.on('SIGTERM', () => { stopAll(); process.exit(143); });

if (mode === 'build') {
    run(process.execPath, vite('build'), { env });
    console.log(`[site] built into ${resolve(root, 'dist')}`);
    if (flag('no-serve')) { stopAll(); process.exit(0); }
    start(process.execPath, vite('preview', '--port', String(Number(option('port', 4173)) || 4173)));
} else {
    start(process.execPath, vite('--port', String(Number(option('port', 5173)) || 5173)));
}

function readUsage() {
    return `npm run site -- [build] [--backend=live|mock|<url>] [--sync] [--check] [--no-serve] [--port N] [--mock-port N]

  build            production build into dist/, then serve it (vite preview)
  --backend=live   the live Supabase (default). Real accounts and data.
  --backend=mock   a local mock backend (scripts/mock-backend.mjs). Any login works.
  --backend=local  Supabase in Docker with the live schema (npm run local-db -- setup first)
  --backend=<url>  another Supabase project URL
  --sync           pull all three repos first
  --check          run the typecheck first
  --no-serve       with build: stop after the build`;
}
