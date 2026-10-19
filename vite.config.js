import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

// The woogidex.xyz site: Woogidex Core (at ./core, see scripts/link-core.mjs)
// with this repo's files on top. A file this repo has wins; anything it does
// not have comes from Core at the same path, so js/features/auth.ts imports
// '../core/app.ts' and gets Core's. The build itself is Core's
// (core/vite.shared.js).

const here = import.meta.dirname;
const core = resolve(here, 'core');
const { woogidexConfig } = await import(pathToFileURL(resolve(core, 'vite.shared.js')).href);

export default defineConfig(woogidexConfig({
    react,
    loadEnv,
    root: here,
    core,
    host: resolve(here, 'js/host.ts'),
    inputs: { admin: resolve(here, 'admin.html') },
    // /sb is the same-origin Supabase proxy (the Worker, in woogidex-backend);
    // the dev server stands in for it locally
    supabase: 'https://qstbascfeolkyxtrqqwv.supabase.co',
    dedupe: ['@supabase/supabase-js']
}));
