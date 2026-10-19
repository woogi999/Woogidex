// Puts Woogidex Core at ./core, where the build and TypeScript look for it.
//
//   - ./core already there (a clone, a link, or CI's checkout): nothing to do
//   - WOOGIDEX_CORE set, or ../woogidex-core next to this repo: links to it,
//     so edits to Core show up here straight away
//   - otherwise: clones github.com/woogi999/woogidex-core
//
// ./core is in .gitignore: Core is its own repo, not part of this one.

import { existsSync, symlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'core');

if (existsSync(resolve(target, 'vite.shared.js'))) process.exit(0);
if (existsSync(target)) {
    console.error(`./core exists but is not Woogidex Core (no vite.shared.js). Move it away and run "npm run core" again.`);
    process.exit(1);
}

const local = process.env.WOOGIDEX_CORE ? resolve(process.env.WOOGIDEX_CORE) : resolve(root, '..', 'woogidex-core');
if (existsSync(resolve(local, 'vite.shared.js'))) {
    // a junction on Windows needs no admin rights; elsewhere it is a plain symlink
    symlinkSync(local, target, process.platform === 'win32' ? 'junction' : 'dir');
    console.log(`Linked ./core to ${local}`);
} else {
    execFileSync('git', ['clone', '--depth', '1', 'https://github.com/woogi999/woogidex-core.git', target], { stdio: 'inherit' });
}
