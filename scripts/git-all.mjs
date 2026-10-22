#!/usr/bin/env node
// Runs one git command in all three repos: woogidex-core, woogidex-web and
// woogidex-backend, one after the other. It is for the workspace folder
// (the folder that holds the three repos), which is not a repo itself:
//
//   node woogidex-web/scripts/git-all.mjs status
//   node woogidex-web/scripts/git-all.mjs commit -am "Fix the table view"
//   node woogidex-web/scripts/git-all.mjs push
//
// A shell function named git calls this script when you are in the
// workspace folder (see README.md, "Git in all three repos"). Anywhere else,
// git stays plain git.
//
// The arguments go to git as a list, never through a shell. A repo that
// fails (for example "nothing to commit") does not stop the others. The exit
// code is 1 when any repo failed.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPOS = ['woogidex-core', 'woogidex-web', 'woogidex-backend'];
const args = process.argv.slice(2);

if (!args.length) {
    console.log('Usage: git <command> [arguments]   (runs in woogidex-core, woogidex-web and woogidex-backend)');
    process.exit(0);
}

const results = [];
for (const repo of REPOS) {
    const dir = join(WORKSPACE, repo);
    if (!existsSync(join(dir, '.git'))) {
        console.log(`\n== ${repo}: not found, skipped`);
        results.push([repo, 'skipped']);
        continue;
    }
    console.log(`\n== ${repo}`);
    // git.exe on Windows, so a shell function named git cannot call itself
    const run = spawnSync(process.platform === 'win32' ? 'git.exe' : 'git', args, { cwd: dir, stdio: 'inherit' });
    if (run.error) {
        console.error(`git did not start: ${run.error.message}`);
        process.exit(1);
    }
    results.push([repo, run.status === 0 ? 'ok' : `failed (exit ${run.status})`]);
}

console.log(`\n${results.map(([repo, result]) => `${repo}: ${result}`).join('   ')}`);
process.exit(results.some(([, result]) => result.startsWith('failed')) ? 1 : 0);
