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

const config = woogidexConfig({
    react,
    loadEnv,
    root: here,
    core,
    host: resolve(here, 'js/host.ts'),
    inputs: { admin: resolve(here, 'admin.html') },
    // /sb is the same-origin Supabase proxy (the Worker, in woogidex-backend);
    // the dev server stands in for it locally. scripts/site.mjs sets
    // WOOGIDEX_SUPABASE to point it at the mock backend or another project.
    supabase: process.env.WOOGIDEX_SUPABASE || 'https://qstbascfeolkyxtrqqwv.supabase.co',
    dedupe: ['@supabase/supabase-js']
});

// A local Supabase (scripts/local-db.mjs) has its own public key. The site
// always sends the live one, so the dev proxy swaps it on the way through:
// the apikey header, an Authorization that carries the key (signed out), and
// Realtime's ?apikey=. A signed-in user's own token passes unchanged.
const localKey = process.env.WOOGIDEX_SUPABASE_KEY;
if (localKey) {
    // dev and preview share one proxy object: wrap it one time
    for (const proxy of new Set([config.server?.proxy?.['/sb'], config.preview?.proxy?.['/sb']])) {
        if (!proxy) continue;
        const rewrite = proxy.rewrite;
        proxy.rewrite = path => rewrite(path).replace(/([?&]apikey=)[^&]*/, `$1${encodeURIComponent(localKey)}`);
        proxy.configure = server => server.on('proxyReq', req => {
            if (req.getHeader('apikey')) req.setHeader('apikey', localKey);
            if (/^Bearer sb_publishable_/i.test(String(req.getHeader('authorization') || ''))) req.setHeader('authorization', `Bearer ${localKey}`);
        });
    }
}

export default defineConfig(config);
