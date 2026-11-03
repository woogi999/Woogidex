// A real Supabase on this machine, in Docker, with the live database's
// schema and no live data. For work that the mock backend cannot do
// (row-level rules, triggers, database functions, Realtime).
//
// The migrations in woogidex-backend cannot build a database from zero (the
// first tables were made before migrations were kept), so the local database
// starts from a schema dump of the live one instead:
//
//   woogidex-backend/local/supabase/config.toml        copy of supabase/config.toml
//   woogidex-backend/local/supabase/migrations/<v>_baseline.sql   the dump
//
// woogidex-backend/local/ is in that repo's .gitignore: a dump is a snapshot
// for this machine, not history.
//
// Run from woogidex-core (or the parent folder: npm run local-db -- <command>):
//   node scripts/local-db.mjs setup    first time, and to take a fresh schema dump
//   node scripts/local-db.mjs start    start it, print its address
//   node scripts/local-db.mjs stop     stop it (the data stays)
//   node scripts/local-db.mjs reset    empty it: the schema again, no rows
//
// Needs Docker Desktop running and the Supabase CLI. "setup" also needs
// "supabase login" one time (it opens the browser).
//
// Edge functions do not run locally: sign in with an email address, not a
// username (a username goes through the login-with-identifier function).

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(root, '..', 'woogidex-backend');
const workdir = resolve(backend, 'local');
const migrations = resolve(workdir, 'supabase', 'migrations');
const PROJECT_REF = 'qstbascfeolkyxtrqqwv';

function cli(args, opts = {}) {
    try {
        // shown as it runs, except where the output is read (status)
        return execFileSync('supabase', args, { cwd: backend, encoding: 'utf8', stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    } catch (e) {
        if (e.code === 'ENOENT') fail('The Supabase CLI is not installed. Install it: scoop install supabase (Windows) or brew install supabase/tap/supabase.');
        throw e;
    }
}

function fail(message) {
    console.error(`[local-db] ${message}`);
    process.exit(1);
}

function needDocker() {
    try { execFileSync('docker', ['info'], { stdio: 'ignore' }); }
    catch { fail('Docker is not running. Start Docker Desktop, wait for it to say "Engine running", then try again.'); }
}

function hasBaseline() {
    return existsSync(migrations) && readdirSync(migrations).some(f => f.endsWith('_baseline.sql'));
}

/** Copies the live config, with a local project id, so the containers do not clash with another project. */
function writeConfig() {
    mkdirSync(migrations, { recursive: true });
    const config = readFileSync(resolve(backend, 'supabase', 'config.toml'), 'utf8')
        .replace(/^project_id\s*=.*$/m, 'project_id = "woogidex-local"');
    writeFileSync(resolve(workdir, 'supabase', 'config.toml'), config);
}

export function setup() {
    needDocker();
    if (!existsSync(resolve(backend, 'supabase', 'config.toml'))) fail(`woogidex-backend is missing at ${backend}. Run npm run sync first.`);
    writeConfig();
    // link once; the CLI keeps it in supabase/.temp (ignored by git)
    if (!existsSync(resolve(backend, 'supabase', '.temp', 'project-ref'))) {
        console.log('[local-db] linking to the live project (read only: the dump never writes to it)');
        try { cli(['link', '--project-ref', PROJECT_REF]); }
        catch { fail('Linking failed. Run "supabase login" one time, then run setup again.'); }
    }
    const file = resolve(migrations, '20000101000000_baseline.sql');
    console.log('[local-db] dumping the live schema (no data)');
    cli(['db', 'dump', '--linked', '--file', file]);
    console.log(`[local-db] baseline written: ${file}`);
    console.log('[local-db] next: node scripts/local-db.mjs reset (or start) to build the local database from it');
}

/** Starts the local stack and returns its address and public key. */
export function start() {
    needDocker();
    if (!hasBaseline()) fail('There is no schema dump yet. Run: npm run local-db -- setup');
    writeConfig();
    console.log('[local-db] starting Supabase in Docker (the first start downloads the images)');
    cli(['start', '--workdir', workdir]);
    const status = JSON.parse(cli(['status', '--workdir', workdir, '-o', 'json'], { capture: true }));
    const url = status.API_URL;
    const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
    if (!url || !key) fail('Supabase started, but "supabase status" gave no API URL or key.');
    return { url, key, studio: status.STUDIO_URL };
}

export function stop() { cli(['stop', '--workdir', workdir]); }

export function reset() {
    needDocker();
    if (!hasBaseline()) fail('There is no schema dump yet. Run: npm run local-db -- setup');
    writeConfig();
    cli(['db', 'reset', '--local', '--workdir', workdir]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const command = process.argv[2];
    if (command === 'setup') setup();
    else if (command === 'start') { const s = start(); console.log(`[local-db] API ${s.url}  Studio ${s.studio}`); }
    else if (command === 'stop') stop();
    else if (command === 'reset') reset();
    else fail('Use: node scripts/local-db.mjs setup | start | stop | reset');
}
