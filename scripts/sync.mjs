// Gets both Woogidex repos up to date, side by side:
//
//   <parent>/Woogidex      (public, this repo: the site)
//   <parent>/Woogidex-DB   (private: the Worker and Supabase)
//
// A repo that is missing gets cloned. A repo that is there gets
// "git pull --ff-only" on its current branch. A repo with uncommitted
// changes is skipped, so the script never mixes your work with a merge.
//
// Run: npm run sync

import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const parent = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repos = ['Woogidex', 'Woogidex-DB'];

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

let failed = false;
for (const name of repos) {
    const dir = resolve(parent, name);
    try {
        if (!existsSync(resolve(dir, '.git'))) {
            execFileSync('git', ['clone', `https://github.com/woogi999/${name}.git`, dir], { stdio: 'inherit' });
            console.log(`${name}: cloned`);
            continue;
        }
        if (git(dir, 'status', '--porcelain')) {
            console.log(`${name}: SKIPPED, it has uncommitted changes. Commit or stash them, then run again.`);
            failed = true;
            continue;
        }
        const before = git(dir, 'rev-parse', '--short', 'HEAD');
        git(dir, 'pull', '--ff-only');
        const after = git(dir, 'rev-parse', '--short', 'HEAD');
        console.log(`${name}: ${before === after ? `up to date (${after})` : `${before} -> ${after}`} on ${git(dir, 'branch', '--show-current')}`);
    } catch (e) {
        console.log(`${name}: FAILED. ${(e.stderr || e.message).toString().trim()}`);
        failed = true;
    }
}
process.exit(failed ? 1 : 0);
